import { afterEach, beforeEach, expect, it } from "bun:test"
import { projectActions } from "@/project/adapters"
import { MIDI_ID, mount, notes, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => {
  seed(clips => {
    const clip = clips.find(item => item.id === MIDI_ID)
    if (clip?.kind !== "midi") throw new Error("Missing MIDI source")
    clip.sourceOffsetBars = 0.1
    clip.notes = []
  })
})
afterEach(() => {
  view?.unmount()
  view = undefined
  projectActions.setDrawModeOverride(null)
})

it("brushes source-zero cells through a freely trimmed window and quantization leaves them aligned", () => {
  projectActions.setDrawModeOverride(true)
  const h = (view = mount())
  const grid = h.bounds("midi-grid")
  const key = h.bounds("midi-key-60")
  const y = key.y + key.height / 2
  const x = grid.x + 1
  const end = grid.x + (0.4 / 4) * grid.width + 1
  h.root.renderer.nativeSimulateMouseDown(x, y)
  h.root.renderer.nativeSimulateMouseMove(end, y, 0)
  h.root.renderer.nativeSimulateMouseUp(end, y)
  expect(notes().map(note => note.startBeat)).toEqual([0.25, 0.5, 0.75])
  h.key("midi-grid", "cmd-a cmd-u")
  expect(notes().map(note => note.startBeat)).toEqual([0.25, 0.5, 0.75])
  h.root.renderer.nativeSimulateMouseDown(x, y)
  h.root.renderer.nativeSimulateMouseMove(grid.x + (0.15 / 4) * grid.width + 1, y, 0)
  h.root.renderer.nativeSimulateMouseUp(grid.x + (0.15 / 4) * grid.width + 1, y)
  expect(notes().map(note => note.startBeat)).toEqual([0.75])
  projectActions.undo()
  expect(notes().map(note => note.startBeat)).toEqual([0.25, 0.5, 0.75])
})
