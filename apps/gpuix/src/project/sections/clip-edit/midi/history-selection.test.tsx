import { afterEach, beforeEach, expect, it } from "bun:test"
import { projectActions } from "@/project/adapters"
import { MIDI_ID, mount, notes, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

it("keeps the selected note identity when Undo restores an earlier array member", () => {
  const original = notes()
  projectActions.updateClip(MIDI_ID, { notes: original.slice(1) })
  const h = (view = mount())
  h.key("midi-grid", "cmd-a cmd-z")
  expect(notes().map(note => note.id)).toEqual(["retained", "visible"])
  h.key("midi-grid", "up")
  expect(notes().map(note => [note.id, note.pitch])).toEqual([
    ["retained", 72],
    ["visible", 65],
  ])
  h.key("midi-grid", "delete")
  expect(notes().map(note => note.id)).toEqual(["retained"])
})

it("does not transfer selection to a different note when Redo removes its identity", () => {
  const original = notes()
  projectActions.updateClip(MIDI_ID, { notes: original.slice(1) })
  projectActions.undo()
  const h = (view = mount())
  const box = h.bounds("midi-note-retained")
  h.root.renderer.nativeSimulateClick(box.x + 2, box.y + box.height / 2)
  h.key("midi-grid", "cmd-shift-z delete")
  expect(notes().map(note => note.id)).toEqual(["visible"])
})

it("keeps the selected legacy snapshot note after parsing and Undo", () => {
  seed(clips => {
    const clip = clips.find(item => item.id === MIDI_ID)
    if (clip?.kind !== "midi") throw new Error("Missing MIDI seed")
    for (const note of clip.notes) delete note.id
  })
  const original = notes()
  projectActions.updateClip(MIDI_ID, { notes: original.slice(1) })
  const h = (view = mount())
  h.key("midi-grid", "cmd-a cmd-z up")
  expect(notes().map(note => note.pitch)).toEqual([72, 65])
  h.key("midi-grid", "delete")
  expect(notes()).toEqual([original[0]])
})
