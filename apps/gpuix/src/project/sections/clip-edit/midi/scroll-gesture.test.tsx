import { afterEach, beforeEach, expect, it } from "bun:test"
import { handleGpuixEvent } from "@gpuix/react"
import { projectActions, useProjectState } from "@/project/adapters"
import { MIDI_ID, mount, notes, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

for (const kind of ["move", "resize"] as const) {
  it(`includes horizontal wheel pan in a note ${kind}, committed as one Undo`, () => {
    projectActions.updateClip(MIDI_ID, {
      sourceOffsetBars: 0,
      notes: [{ id: "drag", pitch: 64, startBeat: 1, lengthBeats: 0.5, velocity: 80 }],
    })
    const h = (view = mount())
    const grid = h.bounds("midi-grid")
    h.root.renderer.nativeSimulateScrollWheel(
      grid.x + grid.width / 2,
      grid.y + grid.height / 2,
      0,
      120,
      "cmd"
    )
    const box = h.bounds("midi-note-drag")
    const x = kind === "resize" ? box.x + box.width - 1 : box.x + 2
    const y = box.y + box.height / 2
    h.root.renderer.nativeSimulateMouseDown(x, y)
    // Zoom doubles content width: one beat is half the visible grid width.
    h.root.renderer.nativeSimulateScrollWheel(x, y, 0, -grid.width / 2, "shift")
    h.root.renderer.nativeSimulateMouseMove(x + 1, y, 0)
    h.root.renderer.nativeSimulateMouseUp(x + 1, y)
    expect(notes()[0]).toMatchObject(
      kind === "move" ? { startBeat: 2, lengthBeats: 0.5 } : { startBeat: 1, lengthBeats: 1.5 }
    )
    projectActions.undo()
    expect(notes()[0]).toMatchObject({ startBeat: 1, lengthBeats: 0.5 })
    expect(useProjectState.getState().session.canUndo).toBe(true)
    projectActions.undo()
    expect(notes().map(note => note.id)).toEqual(["retained", "visible"])
  })
}

it("cancels an active note move before changing time zoom", () => {
  const h = (view = mount())
  const box = h.bounds("midi-note-visible")
  const x = box.x + 2
  const y = box.y + box.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y)
  h.root.renderer.nativeSimulateMouseMove(x + 80, y, 0)
  expect(notes()[1]?.startBeat).not.toBe(3)
  h.root.renderer.nativeSimulateScrollWheel(x, y, 0, 120, "cmd")
  h.root.renderer.nativeSimulateMouseUp(x + 80, y)
  expect(notes()[1]?.startBeat).toBe(3)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("cancels wheel zoom synchronously before an unflushed release can commit the move", () => {
  const h = (view = mount())
  const box = h.bounds("midi-note-visible")
  const grid = h.root.renderer.findByTestId("midi-grid")
  if (!grid) throw new Error("Missing grid")
  const body = h.root.renderer.findByTestId("midi-body")
  if (!body) throw new Error("Missing MIDI wheel owner")
  const x = box.x + 2
  const y = box.y + box.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y)
  h.root.renderer.nativeSimulateMouseMove(x + 80, y, 0)
  expect(notes()[1]?.startBeat).not.toBe(3)
  // Direct dispatch avoids TestRoot's per-native-event flushSync wrapper.
  handleGpuixEvent(
    {
      elementId: body.id,
      eventType: "scroll",
      x,
      y,
      deltaY: 120,
      modifiers: { cmd: true, shift: false, ctrl: false, alt: false },
    },
    h.root.renderer
  )
  handleGpuixEvent(
    { elementId: grid.id, eventType: "mouseUp", x: x + 80, y, button: 0 },
    h.root.renderer
  )
  expect(notes()[1]?.startBeat).toBe(3)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("rolls back an active note move when layout changes its time scale", () => {
  const size = { width: 900, height: 360 }
  const h = (view = mount(MIDI_ID, size))
  const box = h.bounds("midi-note-visible")
  const x = box.x + 2
  const y = box.y + box.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y)
  h.root.renderer.nativeSimulateMouseMove(x + 80, y, 0)
  expect(notes()[1]?.startBeat).not.toBe(3)
  size.width = 620
  h.render()
  h.root.renderer.flush()
  h.root.renderer.dispatchNativeEvents()
  h.root.renderer.flush()
  h.root.renderer.nativeSimulateMouseUp(x + 80, y)
  expect(notes()[1]?.startBeat).toBe(3)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})
