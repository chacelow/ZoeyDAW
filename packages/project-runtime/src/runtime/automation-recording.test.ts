import { afterEach, expect, it, vi } from "vitest"
import { createProjectStore } from "../store"
import { createMockDocument } from "../testing/fixtures"
import { initialWorkspace } from "../state/workspace"
import { createProjectEditing } from "./project-editing"
import { createAutomationRecording } from "./automation-recording"
import { automationValueAt } from "@zoeydaw/project-core/automation-curve"
import type { BackendTelemetry } from "@zoeydaw/project-core/backend"

const target = { kind: "mixer", parameter: "volume" } as const
function setup() {
  const store = createProjectStore({
    document: createMockDocument(108),
    workspace: initialWorkspace(),
  })
  store.setState(state => ({ session: { ...state.session, playing: true } }))
  const submit = vi.fn()
  const editing = createProjectEditing({
    store,
    submit,
    flushRecording() {},
    projectTrackWaveforms: tracks => [...tracks],
    metronomeChanged() {},
  })
  const recorder = createAutomationRecording({ store, editing, ready: () => true })
  const original = [
    { id: "a", bar: 1, value: 0.2 },
    { id: "b", bar: 5, value: 0.8 },
  ]
  store.setState(state => ({
    document: {
      ...state.document,
      tracks: state.document.tracks.map(track =>
        track.id === "3-audio"
          ? { ...track, automation: [{ id: "volume", target, points: original }] }
          : track
      ),
    },
  }))
  const points = () =>
    store.getState().document.tracks.find(track => track.id === "3-audio")!.automation[0].points
  function observe(bar: number, playing = true) {
    const frame: BackendTelemetry = {
      sessionId: "s",
      sequence: bar,
      appliedSequence: 0,
      controlGeneration: "1",
      playing,
      recording: false,
      clock: {
        kind: "sample",
        bar,
        barsPerSecond: 0.5,
        frame: Math.round(bar * 96000),
        sampleRate: 48000,
      },
    }
    recorder.observeAutomation(frame)
  }
  return { store, editing, recorder, observe, points, original, submit }
}
afterEach(() => vi.useRealTimers())

it("Touch overwrites only the held interval, restores the original curve and undoes as one edit", () => {
  const h = setup()
  h.recorder.setAutomationRecordMode("touch")
  h.observe(2)
  const token = h.recorder.beginAutomationGesture("3-audio", target, -27)
  if (!token) throw new Error("Touch did not start")
  h.observe(2.5)
  h.recorder.changeAutomationGesture(token, -60)
  h.observe(3)
  h.recorder.endAutomationGesture(token)
  expect(automationValueAt(h.points(), 2.75, 1)).toBe(0)
  expect(automationValueAt(h.points(), 1.5, 1)).toBeCloseTo(0.275, 5)
  expect(automationValueAt(h.points(), 4, 1)).toBeCloseTo(0.65, 5)
  h.editing.undo()
  expect(h.points()).toEqual(h.original)
  h.editing.redo()
  expect(automationValueAt(h.points(), 2.75, 1)).toBe(0)
})
it("Latch keeps writing after release and restores the original curve when stopped", () => {
  const h = setup()
  h.recorder.setAutomationRecordMode("latch")
  h.observe(2)
  const token = h.recorder.beginAutomationGesture("3-audio", target, -60)
  if (!token) throw new Error("Latch did not start")
  h.observe(2.5)
  h.recorder.endAutomationGesture(token)
  h.observe(3.5)
  h.observe(4, false)
  expect(automationValueAt(h.points(), 3.25, 1)).toBe(0)
  expect(automationValueAt(h.points(), 4.5, 1)).toBeCloseTo(0.725, 5)
  h.editing.undo()
  expect(h.points()).toEqual(h.original)
})
it("rejects stopped or stale observations and cancels owned recording without later resurrection", () => {
  vi.useFakeTimers()
  const h = setup()
  h.recorder.setAutomationRecordMode("touch")
  h.observe(2, false)
  expect(h.recorder.beginAutomationGesture("3-audio", target, -60)).toBeNull()
  h.observe(2)
  vi.advanceTimersByTime(251)
  expect(h.recorder.beginAutomationGesture("3-audio", target, -60)).toBeNull()
  h.observe(2)
  const token = h.recorder.beginAutomationGesture("3-audio", target, -60)
  if (!token) throw new Error("Fresh observation rejected")
  h.recorder.endAutomationGesture(token, true)
  h.observe(3)
  expect(h.points()).toEqual(h.original)
})
it("finishes at a backward jump rather than overwriting the unplayed gap", () => {
  const h = setup()
  h.recorder.setAutomationRecordMode("latch")
  h.observe(3)
  const token = h.recorder.beginAutomationGesture("3-audio", target, -60)
  if (!token) throw new Error("Latch did not start")
  h.observe(3.5)
  h.recorder.endAutomationGesture(token)
  h.observe(2)
  h.observe(2.5)
  expect(automationValueAt(h.points(), 2.5, 1)).toBeCloseTo(0.425, 5)
  expect(automationValueAt(h.points(), 3.25, 1)).toBe(0)
})

it("retains curved playback on both sides of a Touch overwrite", () => {
  const h = setup()
  const original = [
    { id: "a", bar: 1, value: 0.2, curve: 0.75 },
    { id: "b", bar: 5, value: 0.8 },
  ]
  h.store.setState(state => ({
    document: {
      ...state.document,
      tracks: state.document.tracks.map(track =>
        track.id === "3-audio"
          ? { ...track, automation: [{ id: "volume", target, points: original }] }
          : track
      ),
    },
  }))
  h.recorder.setAutomationRecordMode("touch")
  h.observe(2)
  const token = h.recorder.beginAutomationGesture("3-audio", target, -60)
  if (!token) throw new Error("Touch did not start")
  h.observe(3)
  h.recorder.endAutomationGesture(token)
  for (const bar of [1.25, 1.75, 3.25, 4, 4.75])
    expect(automationValueAt(h.points(), bar, 1)).toBeCloseTo(
      automationValueAt(original, bar, 1),
      5
    )
})

it("does not recursively record synchronous preview acknowledgement frames", () => {
  const h = setup()
  h.recorder.setAutomationRecordMode("latch")
  h.observe(2)
  h.submit.mockImplementation(() => h.observe(2.01))
  const token = h.recorder.beginAutomationGesture("3-audio", target, -18)
  if (!token) throw new Error("Latch did not start")
  expect(h.submit).toHaveBeenCalledTimes(1)
  h.recorder.endAutomationGesture(token)
  h.observe(2.5)
  expect(automationValueAt(h.points(), 2.25, 1)).toBeCloseTo(42 / 66)
  h.recorder.finishAutomationRecording()
})

it("requires a fresh observation after a recording lifecycle fence", () => {
  const h = setup()
  h.recorder.setAutomationRecordMode("touch")
  h.observe(2)
  h.recorder.finishAutomationRecording()
  expect(h.recorder.beginAutomationGesture("3-audio", target, -18)).toBeNull()
  h.observe(4)
  expect(h.recorder.beginAutomationGesture("3-audio", target, -18)).not.toBeNull()
  h.recorder.finishAutomationRecording()
})

it("does not mutate a published checkpoint when another sample arrives", () => {
  const h = setup()
  h.recorder.setAutomationRecordMode("touch")
  h.observe(2)
  const token = h.recorder.beginAutomationGesture("3-audio", target, -18)
  if (!token) throw new Error("Touch did not start")
  const captured = h.store.getState().document
  const serialized = JSON.stringify(captured)
  h.observe(2.5)
  expect(JSON.stringify(captured)).toBe(serialized)
  h.recorder.endAutomationGesture(token)
})
