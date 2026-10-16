import { afterEach, expect, it } from "bun:test"
import { projectActions, useProjectState } from "@/project/adapters"
import type { MidiNote } from "@/project/model/types"
import { MIDI_ID, mount, notes, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
afterEach(() => {
  view?.unmount()
  view = undefined
})

function open(selection: MidiNote[]) {
  seed(clips => {
    const clip = clips.find(item => item.id === MIDI_ID)
    if (!clip || clip.kind !== "midi") throw new Error("Missing MIDI clip")
    clip.notes = selection
  })
  view = mount()
  return view
}

function fields(selection: readonly MidiNote[], offset = 0) {
  return selection.map(note => ({
    pitch: note.pitch,
    startBeat: note.startBeat + offset,
    lengthBeats: note.lengthBeats,
    velocity: note.velocity,
  }))
}

const selections = [
  { name: "2049 notes", count: 2049, idPadding: "" },
  { name: "a payload over 250000 characters", count: 1024, idPadding: "n".repeat(256) },
]

for (const selection of selections) {
  for (const operation of ["copy", "cut"]) {
    it(`${operation} and paste roundtrip ${selection.name} without losing musical fields`, () => {
      const source: MidiNote[] = Array.from({ length: selection.count }, (_, index) => ({
        id: `large-${index}-${selection.idPadding}`,
        pitch: 48 + (index % 25),
        startBeat: 2 + (index % 12) / 4,
        lengthBeats: (1 + (index % 4)) / 4,
        velocity: 1 + (index % 127),
      }))
      const h = open(source)
      h.key("midi-grid", `cmd-a cmd-${operation === "copy" ? "c" : "x"}`)
      const payload = h.clipboard.text
      expect(payload).not.toBeNull()
      if (selection.idPadding) expect(payload?.length).toBeGreaterThan(250_000)
      else expect(source).toHaveLength(2049)
      expect(notes()).toEqual(operation === "copy" ? source : [])

      h.key("midi-grid", "cmd-v")
      const retained = operation === "copy" ? source.length : 0
      expect(notes()).toHaveLength(retained + source.length)
      expect(notes().slice(0, retained)).toEqual(source.slice(0, retained))
      const pasted = notes().slice(retained)
      expect(fields(pasted)).toEqual(fields(source, 0.25))
      expect(new Set(notes().map(note => note.id)).size).toBe(notes().length)
      const originalIds = new Set(source.map(note => note.id))
      expect(pasted.every(note => note.id && !originalIds.has(note.id))).toBe(true)

      projectActions.undo()
      expect(notes()).toEqual(operation === "copy" ? source : [])
      if (operation === "cut") {
        projectActions.undo()
        expect(notes()).toEqual(source)
      }
      expect(useProjectState.getState().session.canUndo).toBe(false)
    })
  }
}

it("rejects malformed clipboard notes atomically without changing the clip or history", () => {
  const source: MidiNote[] = [
    { id: "original", pitch: 60, startBeat: 3, lengthBeats: 1, velocity: 80 },
  ]
  const h = open(source)
  const valid = { pitch: 64, startBeat: 2, lengthBeats: 0.5, velocity: 100 }
  const invalid = [
    null,
    {},
    { ...valid, pitch: -1 },
    { ...valid, pitch: 128 },
    { ...valid, pitch: 60.5 },
    { ...valid, startBeat: -1 },
    { ...valid, startBeat: "2" },
    { ...valid, lengthBeats: 0 },
    { ...valid, lengthBeats: -1 },
    { ...valid, lengthBeats: null },
    { ...valid, velocity: 0 },
    { ...valid, velocity: 128 },
    { ...valid, velocity: 80.5 },
    { ...valid, id: 123 },
  ]
  const envelope = (entries: unknown[]) =>
    JSON.stringify({ type: "application/x-zoeymind-midi-notes+json", version: 1, notes: entries })
  const payloads = [
    "ordinary text",
    "{",
    envelope([]),
    JSON.stringify({ type: "foreign", version: 1, notes: [valid] }),
    JSON.stringify({ type: "application/x-zoeymind-midi-notes+json", version: 2, notes: [valid] }),
    ...invalid.map(note => envelope([valid, note])),
    envelope([valid, valid]).replace('"startBeat":2', '"startBeat":1e400'),
    envelope([valid, valid]).replace('"lengthBeats":0.5', '"lengthBeats":1e400'),
  ]
  for (const payload of payloads) {
    h.clipboard.text = payload
    h.key("midi-grid", "cmd-v")
    expect(notes()).toEqual(source)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  }
})
