import { afterEach, beforeEach, expect, it } from "bun:test"
import { projectActions, useProjectState } from "@/project/adapters"
import { mount, notes, seed } from "../harness.test"
import { serializeNotes } from "./clipboard"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

for (const key of [
  "delete",
  "backspace",
  "left",
  "right",
  "up",
  "down",
  "cmd-d",
  "cmd-u",
  "cmd-x",
  "cmd-v",
]) {
  it(`ignores ${key} during a captured move and commits only that move`, () => {
    const h = (view = mount())
    h.clipboard.text = serializeNotes(notes())
    const box = h.bounds("midi-note-visible")
    const step = h.bounds("midi-grid").width / 16
    const x = box.x + 2
    const y = box.y + box.height / 2
    h.root.renderer.nativeSimulateMouseDown(x, y)
    h.root.renderer.nativeSimulateMouseMove(x + step, y, 0)
    const preview = structuredClone(notes())
    expect(preview[1]?.startBeat).toBe(3.25)
    h.key("midi-grid", key)
    expect(notes()).toEqual(preview)
    expect(useProjectState.getState().session.canUndo).toBe(false)
    h.root.renderer.nativeSimulateMouseMove(x + step * 2, y, 0)
    h.root.renderer.nativeSimulateMouseUp(x + step * 2, y)
    expect(notes().map(note => note.startBeat)).toEqual([0, 3.5])
    projectActions.undo()
    expect(notes().map(note => note.startBeat)).toEqual([0, 3])
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })
}

it("still cancels a move with Escape after an ignored destructive key", () => {
  const h = (view = mount())
  const box = h.bounds("midi-note-visible")
  const x = box.x + 2
  const y = box.y + box.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y)
  h.root.renderer.nativeSimulateMouseMove(x + 100, y, 0)
  h.key("midi-grid", "delete escape")
  expect(notes().map(note => note.startBeat)).toEqual([0, 3])
  expect(useProjectState.getState().session.canUndo).toBe(false)
})
