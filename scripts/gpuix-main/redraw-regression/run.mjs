import { realpathSync, writeSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const { dirname, join, resolve } = path

const usage = `Background production GpuixRenderer redraw regression (macOS only).

GPUIX_NATIVE_ENTRY=/absolute/isolated/vendor/packages/native/index.js \\
  bun scripts/gpuix-main/redraw-regression/run.mjs

Defaults to this worktree's .gpuix-main native loader and pins its adjacent .node.
Requires the real release binary with test-support and profiler. Forced WASI is
rejected. Opens a hidden nonactivating production window (focus:false/show:false);
no foreground activation, input, desktop control, or visible-frame prerequisite.
N=1/64/512 denotes synchronous upload calls, each replacing 16384 rectangles.
No event pumping occurs from init through all production measurements.
The same module's TestGpuixRenderer supplies an equivalent explicit offscreen
draw reference through flush(); its native draw samples remain separately labeled.
Production upload p90 for N=64 and N=512 must be below 25% of median native
reference draw cost (at least 4x cheaper), in addition to zero native frame growth.
Exit 0: both assertions pass. Exit 42: production synchronous native draw growth.
Exit 1: setup, offscreen instrumentation, timing ratio, or cleanup failure.
JSON goes to stdout; redirect outside git for evidence. --help prints this text.`

if (process.argv.includes("--help")) {
  console.log(usage)
  process.exit(0)
}

const rectangles = 16384
const maxUploadDrawRatio = 0.25
let renderer
let reference
let result
let exitCode = 1
const errors = []
const cleanup = {
  offscreenHostReleased: false,
  productionWindowClosed: false,
  eventPumpsAfterClose: 0,
  platformTaskRelease: "process.exit",
}
const hostBatch = JSON.stringify([
  ["createElement", 1, "quad-batch"],
  ["setStyle", 1, { width: 320, height: 180, color: "#285C8C" }],
  ["setRoot", 1],
])

function stats(source) {
  const value = source.getDebugFrameOverlayStats()
  if (
    !Number.isSafeInteger(value.frames) ||
    value.frames < 0 ||
    !Number.isSafeInteger(value.samples)
  ) {
    throw new Error(`Invalid native draw statistics: ${JSON.stringify(value)}`)
  }
  return value
}

function timing(values) {
  const ordered = [...values].sort((a, b) => a - b)
  return {
    totalMs: values.reduce((sum, value) => sum + value, 0),
    p50Ms: ordered[Math.ceil(ordered.length * 0.5) - 1],
    p90Ms: ordered[Math.ceil(ordered.length * 0.9) - 1],
    maxMs: ordered.at(-1),
  }
}

try {
  if (process.platform !== "darwin")
    throw new Error("Requires macOS's same-thread embedded GPUI event loop")
  const nativeEntry = realpathSync(
    resolve(
      process.env.GPUIX_NATIVE_ENTRY ||
        fileURLToPath(new URL("../../../.gpuix-main/packages/native/index.js", import.meta.url))
    )
  )
  const nativeBinary = realpathSync(
    join(dirname(nativeEntry), `gpuix-native.darwin-${process.arch}.node`)
  )
  if (["true", "error"].includes(process.env.NAPI_RS_FORCE_WASI) || process.env.NAPI_RS_WASI_FLAVOR)
    throw new Error("Forced WASI is incompatible with this native regression")
  process.env.NAPI_RS_NATIVE_LIBRARY_PATH = nativeBinary
  const { GpuixRenderer, TestGpuixRenderer } = await import(pathToFileURL(nativeEntry).href)
  renderer = new GpuixRenderer()
  console.error("F7 redraw regression starting")
  renderer.init({
    title: "F7 background redraw regression",
    width: 320,
    height: 180,
    focus: false,
    show: false,
  })
  if (!renderer.requiresTick())
    throw new Error("Requires the embedded same-thread production renderer")
  renderer.applyBatch(hostBatch)
  const quads = new Float32Array(rectangles * 4)
  for (let index = 0; index < rectangles; index++) {
    quads[index * 4] = (index % 128) * 2.5
    quads[index * 4 + 1] = Math.floor(index / 128) * 1.4
    quads[index * 4 + 2] = 2
    quads[index * 4 + 3] = 1
  }
  renderer.setQuads(1, quads)
  const productionInitial = stats(renderer)
  const batches = []
  const plans = [1, 64, 512].map(calls => ({ calls, uploadMs: new Array(calls) }))
  // Keep every production burst on this JS stack, without tick, await, or a frame prerequisite.
  for (const { calls, uploadMs } of plans) {
    const before = stats(renderer)
    for (let call = 0; call < calls; call++) {
      quads[0] = call % 2
      const started = performance.now()
      renderer.setQuads(1, quads)
      uploadMs[call] = performance.now() - started
    }
    const after = stats(renderer)
    batches.push({
      calls,
      before,
      after,
      synchronousDraws: after.frames - before.frames,
      uploadMs,
      upload: timing(uploadMs),
    })
  }
  const synchronousDrawGrowth = batches.some(batch => batch.synchronousDraws !== 0)
  result = {
    kind: "gpuix-production-redraw-regression",
    nativeEntry,
    nativeBinary,
    rectanglesPerCall: rectangles,
    production: {
      source: "GpuixRenderer",
      window: { focus: false, show: false },
      initial: productionInitial,
      eventPumpsDuringMeasurement: 0,
    },
    batches,
    synchronousDrawGrowth,
    timingScope:
      "Production setQuads CPU/FFI wall time; separate TestGpuixRenderer.flush CPU wall time and native CPU draw duration. Neither is GPU completion or a production presentation measurement.",
  }

  reference = new TestGpuixRenderer(320, 180)
  reference.applyBatch(hostBatch)
  for (let warmup = 0; warmup < 4; warmup++) {
    reference.setQuads(1, quads)
    reference.flush()
  }
  const referenceSamples = []
  for (let sample = 0; sample < 16; sample++) {
    quads[0] = sample % 2
    reference.setQuads(1, quads)
    const before = stats(reference)
    const started = performance.now()
    reference.flush()
    const flushMs = performance.now() - started
    const after = stats(reference)
    if (
      after.frames <= before.frames ||
      !Number.isFinite(after.currentMs) ||
      after.currentMs <= 0
    ) {
      throw new Error(
        `Explicit offscreen flush produced no measured native draw: ${JSON.stringify({ before, after })}`
      )
    }
    referenceSamples.push({
      flushMs,
      nativeDrawMs: after.currentMs,
      nativeDraws: after.frames - before.frames,
    })
  }
  const nativeDraw = timing(referenceSamples.map(sample => sample.nativeDrawMs))
  const ratios = batches
    .filter(batch => batch.calls >= 64)
    .map(batch => ({
      calls: batch.calls,
      uploadP90Ms: batch.upload.p90Ms,
      referenceNativeDrawMedianMs: nativeDraw.p50Ms,
      ratio: batch.upload.p90Ms / nativeDraw.p50Ms,
    }))
  const timingPassed = ratios.every(sample => sample.ratio < maxUploadDrawRatio)
  result.offscreenReference = {
    source: "TestGpuixRenderer.flush",
    rectanglesPerCall: rectangles,
    samples: referenceSamples,
    nativeDraw,
    flush: timing(referenceSamples.map(sample => sample.flushMs)),
  }
  result.timingAssertion = { maxUploadDrawRatio, ratios, passed: timingPassed }
  exitCode = synchronousDrawGrowth ? 42 : timingPassed ? 0 : 1
  if (!synchronousDrawGrowth && !timingPassed)
    errors.push(
      "Production upload p90 is not at least 4x cheaper than equivalent explicit offscreen native draw"
    )
} catch (error) {
  errors.push(error.stack || String(error))
} finally {
  if (reference) {
    try {
      reference.applyBatch('[["destroyElement",1]]')
      reference.flush()
      cleanup.offscreenHostReleased = reference.getRetainedElementCount() === 0
      if (!cleanup.offscreenHostReleased) errors.push("Offscreen reference retained host leaked")
    } catch (error) {
      errors.push(`Offscreen cleanup: ${error.stack || String(error)}`)
    } finally {
      reference.dispose()
    }
  }
  if (renderer?.isInitialized()) {
    try {
      renderer.closeWindow()
      cleanup.productionWindowClosed = true
    } catch (error) {
      errors.push(`Production cleanup: ${error.stack || String(error)}`)
    }
  }
}

if (errors.length) exitCode = 1
writeSync(1, `${JSON.stringify({ ...result, cleanup, exitCode, errors })}\n`)
process.exit(exitCode)
