import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const [mode, filename] = process.argv.slice(2)
const hiddenWarmupMs = Number(process.argv[4] ?? 1000)
assert.ok(Number.isFinite(hiddenWarmupMs) && hiddenWarmupMs >= 0, "Invalid hidden warmup")
const cpuWindowMs = Number(process.argv[5] ?? 10_000)
assert.ok(
  Number.isFinite(cpuWindowMs) && cpuWindowMs >= 10_000,
  "CPU window must be at least ten seconds"
)
assert.ok(
  filename && (mode === "frames" || mode === "present"),
  "Usage: node analyse.mjs frames|present <raw-file> [hidden-warmup-ms] [cpu-window-ms]"
)
const lines = readFileSync(filename, "utf8").trim().split("\n")
if (mode === "present") {
  const firstByPhase = new Map()
  for (const line of lines) {
    const [monotonicNs, unixMs, contextJson, scene] = line.split("|")
    if (!contextJson) continue
    const context = JSON.parse(contextJson)
    if (!context.phase?.startsWith("restored-") || firstByPhase.has(context.phase)) continue
    const matched = scene.match(/telemetry\s+(-?\d+)/)
    assert.ok(matched, "Scene has no telemetry identity")
    const sceneSequence = Number(matched[1])
    assert.ok(Number.isFinite(context.sequence), "Missing latest delivered sequence")
    firstByPhase.set(context.phase, {
      phase: context.phase,
      monotonicNs,
      unixMs: Number(unixMs),
      sceneSequence,
      latestDeliveredSequence: context.sequence,
      fresh: sceneSequence === context.sequence,
    })
  }
  assert.ok(firstByPhase.size >= 5, "Need at least five restoration transitions")
  process.stdout.write(`${JSON.stringify([...firstByPhase.values()], null, 2)}\n`)
} else {
  const records = lines.map(line => JSON.parse(line)).filter(record => record.window)
  const phases = ["foreground", "inactive-visible", "occluded", "minimized", "restored", "stopped"]
  const results = phases.map(phase => {
    let samples = records.filter(record => {
      if (record.phase !== phase) return false
      const window = record.window
      if (["foreground", "restored", "stopped"].includes(phase)) return window.isKeyWindow
      if (phase === "inactive-visible") return !window.appIsActive && window.occlusionVisible
      if (phase === "occluded") return !window.occlusionVisible && !window.isMiniaturized
      return window.isMiniaturized
    })
    assert.ok(samples.length, `Missing phase ${phase}`)
    const warmupMs = ["foreground", "inactive-visible"].includes(phase) ? 1000 : hiddenWarmupMs
    const stableAfter = samples[0].ms + warmupMs
    samples = samples.filter(record => record.ms >= stableAfter)
    const first = samples[0]
    const requestedMs = ["foreground", "inactive-visible"].includes(phase) ? cpuWindowMs : 10_000
    const last = samples.find(record => record.ms - first.ms >= requestedMs) ?? samples.at(-1)
    const seconds = (last.ms - first.ms) / 1000
    assert.ok(seconds >= 5, `Phase ${phase} is too short`)
    if (["foreground", "inactive-visible"].includes(phase)) {
      assert.ok(seconds * 1000 >= cpuWindowMs, `CPU phase ${phase} is too short`)
    }
    const cpuDelta = last.cpu.user + last.cpu.system - first.cpu.user - first.cpu.system
    return {
      phase,
      seconds,
      warmupMs,
      window: first.window,
      frames: [first.stats.frames, last.stats.frames],
      callbacks: [first.callbacks, last.callbacks],
      sequence: [first.sequence, last.sequence],
      hz: (last.callbacks - first.callbacks) / seconds,
      cpuPercent: cpuDelta / 10_000 / seconds,
    }
  })
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
}
