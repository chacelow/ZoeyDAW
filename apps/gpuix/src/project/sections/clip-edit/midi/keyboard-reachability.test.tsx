import { afterEach, beforeEach, expect, it } from "bun:test"
import { projectActions, useProjectState } from "@/project/adapters"
import { mount, notes, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

it("returns pointer-selected piano-row focus to the grid for Delete and undo", () => {
  view = mount()
  const key = view.bounds("midi-key-64")
  const grid = view.root.renderer.findByTestId("midi-grid")
  if (!grid) throw new Error("Missing grid")
  view.root.renderer.nativeSimulateMouseDown(key.x + 4, key.y + key.height / 2)
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([64])
  view.root.renderer.nativeSimulateMouseUp(key.x + 4, key.y + key.height / 2)
  expect(view.root.renderer.getFocusedElementId()).toBe(grid.id)
  view.root.renderer.simulateKeystrokes("delete")
  expect(notes().map(note => note.id)).toEqual(["retained"])
  view.root.renderer.simulateKeystrokes("cmd-z")
  expect(notes().map(note => note.id)).toEqual(["retained", "visible"])
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
})

it("keeps keyboard audition on its key and releases pointer audition outside the key", () => {
  view = mount()
  const keyElement = view.root.renderer.findByTestId("midi-key-64")
  if (!keyElement) throw new Error("Missing key")
  view.root.renderer.nativeSimulateKeyDown(keyElement.id, "enter")
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([64])
  view.root.renderer.nativeSimulateKeyUp(keyElement.id, "enter")
  expect(view.root.renderer.getFocusedElementId()).toBe(keyElement.id)
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
  const key = view.bounds("midi-key-64")
  view.root.renderer.nativeSimulateMouseDown(key.x + 4, key.y + key.height / 2)
  view.root.renderer.nativeSimulateMouseMove(1000, key.y, 0)
  view.root.renderer.nativeSimulateMouseUp(1000, key.y)
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
})

it("edits the focused velocity stem without changing an unselected note", () => {
  view = mount()
  view.key("midi-velocity-visible", "up")
  expect(notes().map(note => note.velocity)).toEqual([90, 81])
  view.key("midi-velocity-visible", "down")
  expect(notes().map(note => note.velocity)).toEqual([90, 80])
  projectActions.undo()
  expect(notes().map(note => note.velocity)).toEqual([90, 81])
  projectActions.undo()
  expect(notes().map(note => note.velocity)).toEqual([90, 80])
})

it("adjusts the selected velocity group and leaves Space for playback", () => {
  view = mount()
  view.key("midi-grid", "cmd-a")
  view.key("midi-velocity-visible", "up")
  expect(notes().map(note => note.velocity)).toEqual([81, 81])
  view.key("midi-velocity-visible", "space")
  expect(notes().map(note => note.velocity)).toEqual([81, 81])
  expect(useProjectState.getState().session.playing).toBe(true)
  expect(view.windowKeys).toEqual(["space"])
  view.key("midi-velocity-visible", "cmd-z")
  expect(notes().map(note => note.velocity)).toEqual([90, 80])
})
