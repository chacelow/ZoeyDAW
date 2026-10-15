import { afterEach, beforeEach, expect, it } from "bun:test"
import { projectActions } from "@/project/adapters"
import { MIDI_ID, mount, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

function gridWheel(h: Harness, dx: number, dy: number, modifiers?: string) {
  const grid = h.bounds("midi-grid")
  h.root.renderer.nativeSimulateScrollWheel(
    grid.x + grid.width / 2,
    grid.y + grid.height / 2,
    dx,
    dy,
    modifiers
  )
}

it("keeps the source-window tail in bounds when a horizontally scrolled roll narrows", () => {
  projectActions.updateClip(MIDI_ID, {
    notes: [{ id: "tail", pitch: 64, startBeat: 5.5, lengthBeats: 0.5, velocity: 80 }],
  })
  const size = { width: 900, height: 360 }
  const h = (view = mount(MIDI_ID, size))
  const before = h.bounds("midi-grid")
  gridWheel(h, 0, 120, "cmd")
  gridWheel(h, 0, -before.width * 4, "shift")
  const tail = h.bounds("midi-note-tail")
  expect(tail.x).toBeLessThan(before.x + before.width)

  size.width = 620
  h.render()
  h.root.renderer.flush()
  h.root.renderer.dispatchNativeEvents()
  h.root.renderer.flush()

  const grid = h.bounds("midi-grid")
  expect(grid.width).toBeLessThan(before.width)
  const resizedTail = h.bounds("midi-note-tail")
  expect(resizedTail.x + resizedTail.width).toBeGreaterThan(grid.x)
  expect(resizedTail.x).toBeLessThan(grid.x + grid.width)
  expect(resizedTail.x + resizedTail.width).toBeLessThanOrEqual(grid.x + grid.width + 1)
})

it("clamps a folded scroll after removing all but one source pitch", () => {
  const pitches = Array.from({ length: 64 }, (_, index) => 48 + index)
  projectActions.updateClip(MIDI_ID, {
    notes: pitches.map(pitch => ({
      id: `pitch-${pitch}`,
      pitch,
      startBeat: 3,
      lengthBeats: 1,
      velocity: 80,
    })),
  })
  const h = (view = mount())
  const fold = h.root.renderer.findByText("Fold")
  if (!fold) throw new Error("Missing Fold")
  const foldBounds = h.root.renderer.getElementBounds(fold.id)
  if (!foldBounds) throw new Error("Missing Fold bounds")
  h.root.renderer.nativeSimulateClick(foldBounds.x + 2, foldBounds.y + 2)
  gridWheel(h, 0, -10_000)
  expect(h.root.renderer.findByTestId("midi-key-48")).toBeTruthy()
  expect(h.root.renderer.findByTestId("midi-key-111")).toBeUndefined()

  projectActions.updateClip(MIDI_ID, {
    notes: [{ id: "pitch-111", pitch: 111, startBeat: 3, lengthBeats: 1, velocity: 80 }],
  })
  const grid = h.bounds("midi-grid")
  const note = h.bounds("midi-note-pitch-111")
  const key = h.bounds("midi-key-111")
  expect(note.y + note.height).toBeGreaterThan(grid.y)
  expect(note.y).toBeLessThan(grid.y + grid.height)
  expect(key.y + key.height).toBeGreaterThan(grid.y)
  expect(key.y).toBeLessThan(grid.y + grid.height)
})
