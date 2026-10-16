/* eslint-disable no-await-in-loop -- Bounded waits observe the independent native UI loop. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { GpuixRenderer } from "@gpuix/native"

if (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true")
  throw new Error("This runtime probe requires Windows Actions and its real UI thread")
function smokeConfiguration() {
  const output = process.env.B2_EVIDENCE_DIR
  const driver = process.env.GPUIX_WINDOWS_SMOKE_DRIVER
  if (!output || !driver || !path.isAbsolute(driver))
    throw new Error("B2_EVIDENCE_DIR and an absolute GPUIX_WINDOWS_SMOKE_DRIVER are required")
  return { output, driver }
}
const { output, driver } = smokeConfiguration()
mkdirSync(output, { recursive: true })

function drive(title: string, action: "query" | "minimize" | "restore" | "close") {
  const result: unknown = JSON.parse(
    execFileSync(driver, [String(process.pid), title, action], {
      encoding: "utf8",
      timeout: 7_000,
      killSignal: "SIGKILL",
      windowsHide: true,
    })
  )
  if (
    typeof result !== "object" ||
    result === null ||
    !("found" in result) ||
    typeof result.found !== "boolean" ||
    !("minimized" in result) ||
    typeof result.minimized !== "boolean"
  )
    throw new Error("The native window driver returned an invalid observation")
  return { found: result.found, minimized: result.minimized }
}

async function until(description: string, ready: () => boolean) {
  const deadline = performance.now() + 10_000
  while (!ready()) {
    assert.ok(performance.now() < deadline, `Timed out: ${description}`)
    await Bun.sleep(10)
  }
}

function stats(renderer: GpuixRenderer) {
  const snapshot = renderer.getDebugFrameOverlayStats()
  if (!("successfulPresents" in snapshot) || typeof snapshot.successfulPresents !== "number")
    throw new Error("Windows native successful-present statistics are required")
  const presents = snapshot.successfulPresents
  assert.ok(Number.isSafeInteger(presents) && presents >= 0)
  assert.ok(Number.isSafeInteger(snapshot.frames) && snapshot.frames >= 0)
  return { presents, draws: snapshot.frames }
}

type SessionEvidence = {
  title: string
  closeMode: "guarded" | "bypass"
  callbacks: number
  previousTimestamp: number
  predicates: { veto: number; staleAllow: number; replacementVeto: number; allow: number }
  observations: { timestamp: number; width: number; height: number }[]
  resume: { stage: string; presents: number; draws: number }[]
  closed: boolean
  failure: string | null
}
const sessions: SessionEvidence[] = []
const ownedTitles = new Set<string>()
const ackHold = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
let postCloseDropCycles = 0
const cleanupFailures: unknown[] = []

async function runSession(index: number, closeMode: SessionEvidence["closeMode"]) {
  const renderer = new GpuixRenderer()
  const title = `zoeydaw Windows lifecycle ${process.pid}-${index}`
  const record: SessionEvidence = {
    title,
    closeMode,
    callbacks: 0,
    previousTimestamp: -1,
    predicates: { veto: 0, staleAllow: 0, replacementVeto: 0, allow: 0 },
    observations: [],
    resume: [],
    closed: false,
    failure: null,
  }
  sessions.push(record)
  ownedTitles.add(title)
  let initialized = false
  let callbackFailure: unknown = null
  let sessionFailure: { error: unknown } | null = null
  const checkCallbacks = () => {
    if (callbackFailure) throw callbackFailure
  }
  try {
    renderer.init({ title, width: 320, height: 200, focus: false })
    initialized = true
    assert.equal(drive(title, "query").found, true)
    renderer.applyBatch(
      JSON.stringify([
        ["createElement", 1, "text"],
        ["setText", 1, "Windows independent UI thread"],
        ["setRoot", 1],
      ])
    )
    renderer.setWindowShouldClose(() => {
      record.predicates.veto++
      return false
    })
    renderer.setAnimationFrameCallback(timestamp => {
      try {
        assert.ok(
          Number.isFinite(timestamp) && timestamp >= record.previousTimestamp,
          "Frame time is not monotonic"
        )
        record.previousTimestamp = timestamp
        const size = renderer.getWindowSize()
        assert.equal(size.width, 320)
        assert.equal(size.height, 200)
        record.observations.push({ timestamp, width: size.width, height: size.height })
        record.callbacks++
        renderer.applyBatch(JSON.stringify([["setText", 1, `Frame ${record.callbacks}`]]))
      } catch (error) {
        callbackFailure = error
      }
    })
    renderer.setAnimationFrameActive(true)
    await until("three real display callbacks", () => {
      checkCallbacks()
      return record.callbacks >= 3
    })
    renderer.setAnimationFrameActive(false)
    renderer.setAnimationFrameCallback(null)
    await Bun.sleep(150)
    const drained = record.callbacks
    await Bun.sleep(150)
    assert.equal(record.callbacks, drained, "Inactive source kept scheduling callbacks")
    assert.ok(stats(renderer).presents > 0, "The real window never presented")

    assert.equal(drive(title, "minimize").minimized, true)
    await Bun.sleep(150)
    let baseline = stats(renderer)
    let resumed = 0
    renderer.setResumeFrameCallback(() => {
      try {
        if (resumed > 0) return
        const beforeCommit = stats(renderer)
        record.resume.push({ stage: "native-resume-before-commit", ...beforeCommit })
        assert.equal(
          beforeCommit.presents,
          baseline.presents,
          "Restored window presented before the native resume JS commit"
        )
        Atomics.wait(ackHold, 0, 0, 150)
        const held = stats(renderer)
        record.resume.push({ stage: "native-resume-ack-pending", ...held })
        assert.equal(
          held.presents,
          baseline.presents,
          "The UI presented while native resume acknowledgement was pending"
        )
        renderer.applyBatch(JSON.stringify([["setText", 1, `Resume committed ${index}`]]))
        const committed = stats(renderer)
        record.resume.push({ stage: "committed-before-ack", ...committed })
        assert.equal(
          committed.presents,
          baseline.presents,
          "The UI presented before the resume callback returned its acknowledgement"
        )
        resumed++
      } catch (error) {
        callbackFailure = error
      }
    })
    stats(renderer)
    await Bun.sleep(150)
    baseline = stats(renderer)
    record.resume.push({ stage: "minimized", ...baseline })
    assert.equal(drive(title, "restore").minimized, false)
    await until("native restore callback and fresh presentation", () => {
      checkCallbacks()
      return resumed > 0 && stats(renderer).presents > baseline.presents
    })
    record.resume.push({ stage: "resumed-after-ack", ...stats(renderer) })
    renderer.setResumeFrameCallback(null)

    if (closeMode === "guarded") {
      drive(title, "close")
      await until("native WM_CLOSE veto", () => record.predicates.veto === 1)
      await Bun.sleep(100)
      assert.equal(renderer.tick(), true, "Vetoed WM_CLOSE removed the window")
      assert.equal(drive(title, "query").found, true)

      renderer.setWindowShouldClose(() => {
        record.predicates.staleAllow++
        renderer.setWindowShouldClose(() => {
          record.predicates.replacementVeto++
          return false
        })
        return true
      })
      stats(renderer)
      drive(title, "close")
      await until("replaced close predicate", () => record.predicates.staleAllow === 1)
      await Bun.sleep(100)
      assert.equal(renderer.tick(), true, "A stale allow response closed the window")
      assert.equal(drive(title, "query").found, true)
      drive(title, "close")
      await until("replacement native close veto", () => record.predicates.replacementVeto === 1)
      await Bun.sleep(100)
      assert.equal(renderer.tick(), true, "The replacement veto was ignored")
      renderer.setWindowShouldClose(() => {
        record.predicates.allow++
        return true
      })
      stats(renderer)
      drive(title, "close")
      await until("allowed WM_CLOSE and UI-thread termination", () => !renderer.tick())
      assert.deepEqual(record.predicates, { veto: 1, staleAllow: 1, replacementVeto: 1, allow: 1 })
    } else {
      renderer.closeWindow()
      await until("confirmed close bypass and UI-thread termination", () => !renderer.tick())
      assert.deepEqual(
        record.predicates,
        { veto: 0, staleAllow: 0, replacementVeto: 0, allow: 0 },
        "Confirmed closeWindow unexpectedly consulted the veto predicate"
      )
    }
    record.closed = true
    assert.equal(drive(title, "query").found, false, "The owned HWND survived close")
    ownedTitles.delete(title)
  } catch (error) {
    record.failure = String(error)
    sessionFailure = { error }
  }
  try {
    if (initialized && renderer.tick()) {
      renderer.setAnimationFrameActive(false)
      renderer.setAnimationFrameCallback(null)
      renderer.setResumeFrameCallback(null)
      renderer.closeWindow()
      await until("failed-session window cleanup", () => !renderer.tick())
    }
    if (initialized) {
      assert.equal(drive(title, "query").found, false, "Cleanup left an owned HWND")
      ownedTitles.delete(title)
    }
  } catch (error) {
    cleanupFailures.push(error)
    sessionFailure ??= { error }
    record.failure ??= String(error)
  }
  if (sessionFailure) throw sessionFailure.error
}

let scenarioFailure: { error: unknown } | null = null
try {
  for (let index = 0; index < 4; index++) {
    await runSession(index, index % 2 === 0 ? "guarded" : "bypass")
    Bun.gc(true)
    postCloseDropCycles++
  }
} catch (error) {
  scenarioFailure = { error }
}
for (const title of ownedTitles) {
  try {
    if (drive(title, "query").found) drive(title, "close")
    await until("remaining owned HWND cleanup", () => !drive(title, "query").found)
  } catch (error) {
    cleanupFailures.push(error)
  }
}
try {
  writeFileSync(
    path.join(output, "runtime.json"),
    JSON.stringify(
      {
        sessions,
        postCloseDropCycles,
        liveRendererDropLeakVerified: false,
        cleanupFailures: cleanupFailures.map(String),
      },
      null,
      2
    )
  )
} catch (error) {
  cleanupFailures.push(error)
}
if (scenarioFailure) throw scenarioFailure.error
if (cleanupFailures.length)
  throw new AggregateError(cleanupFailures, "Native window cleanup failed")
console.log(
  JSON.stringify({ sessions: sessions.length, closed: sessions.every(session => session.closed) })
)
