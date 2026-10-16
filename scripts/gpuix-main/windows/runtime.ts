/* eslint-disable no-await-in-loop -- Bounded waits observe the independent native UI loop. */
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { GpuixRenderer } from "@gpuix/native"

if (process.platform !== "win32")
  throw new Error("This runtime probe requires the Windows UI thread")
const output = process.env.B2_EVIDENCE_DIR
if (!output) throw new Error("B2_EVIDENCE_DIR must point to an external runtime evidence directory")
mkdirSync(output, { recursive: true })
const renderer = new GpuixRenderer()
const state: {
  callbacks: number
  previousTimestamp: number
  closePredicates: number
  failure: unknown
  initialized: boolean
} = { callbacks: 0, previousTimestamp: -1, closePredicates: 0, failure: null, initialized: false }
const observations: { timestamp: number; width: number; height: number }[] = []
try {
  renderer.init({ title: "zoeydaw Windows frame smoke", width: 320, height: 200, focus: false })
  state.initialized = true
  renderer.applyBatch(
    JSON.stringify([
      ["createElement", 1, "text"],
      ["setText", 1, "Windows independent UI thread"],
      ["setRoot", 1],
    ])
  )
  renderer.setWindowShouldClose(() => {
    state.closePredicates++
    return false
  })
  renderer.setResumeFrameCallback(() => {
    renderer.applyBatch(JSON.stringify([["setText", 1, "Resume committed before present"]]))
  })
  renderer.setAnimationFrameCallback(timestamp => {
    try {
      assert.ok(
        Number.isFinite(timestamp) && timestamp >= state.previousTimestamp,
        "Frame time is not monotonic"
      )
      state.previousTimestamp = timestamp
      // This synchronous UI query must remain safe while the UI awaits only an
      // asynchronous completion command, never a blocking JS callback result.
      const size = renderer.getWindowSize()
      assert.equal(size.width, 320)
      observations.push({ timestamp, width: size.width, height: size.height })
      state.callbacks++
      renderer.applyBatch(JSON.stringify([["setText", 1, `Frame ${state.callbacks}`]]))
    } catch (error) {
      state.failure = error
    }
  })
  renderer.setAnimationFrameActive(true)
  const deadline = performance.now() + 10_000
  while (state.callbacks < 3 && !state.failure && performance.now() < deadline) await Bun.sleep(10)
  if (state.failure) throw state.failure
  assert.ok(state.callbacks >= 3, "The real Windows display loop did not deliver three frames")
  renderer.setAnimationFrameActive(false)
  renderer.setAnimationFrameCallback(null)
  renderer.setResumeFrameCallback(null)
  await Bun.sleep(100)
  const drained = state.callbacks
  await Bun.sleep(100)
  assert.equal(state.callbacks, drained, "Inactive frame source kept scheduling callbacks")
} finally {
  let closed = false
  if (state.initialized) {
    renderer.setAnimationFrameActive(false)
    renderer.setAnimationFrameCallback(null)
    renderer.setResumeFrameCallback(null)
    renderer.closeWindow()
    const deadline = performance.now() + 5_000
    while (renderer.tick() && performance.now() < deadline) await Bun.sleep(10)
    closed = !renderer.tick()
  }
  writeFileSync(
    path.join(output, "runtime.json"),
    JSON.stringify({ ...state, observations, closed }, null, 2)
  )
  assert.equal(
    state.closePredicates,
    0,
    "Confirmed closeWindow unexpectedly consulted the veto predicate"
  )
  if (state.initialized)
    assert.equal(closed, true, "Windows UI loop did not terminate after the last window closed")
}
console.log(
  JSON.stringify({
    callbacks: state.callbacks,
    closed: true,
    closePredicates: state.closePredicates,
  })
)
