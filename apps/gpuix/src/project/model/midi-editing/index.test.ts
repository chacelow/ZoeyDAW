import { describe, expect, it } from "bun:test"
import {
  deleteNotes,
  drawCells,
  duplicateNotes,
  eraseCells,
  insertNote,
  pasteNotes,
  selectHit,
  selectVisibleNotes,
  setNoteVelocity,
  transformNotes,
} from "."
import type { MidiNote } from "../types"

const window = { sourceOffsetBeats: 2, totalBeats: 4 }
const notes: MidiNote[] = [
  { id: "crossing", pitch: 72, startBeat: 0, lengthBeats: 3, velocity: 90 },
  { id: "inside", pitch: 64, startBeat: 3, lengthBeats: 1, velocity: 80 },
  { id: "outside", pitch: 64, startBeat: 6, lengthBeats: 1, velocity: 60 },
]

describe("MIDI editor transformations", () => {
  it("selects crossing notes but excludes the source window's right boundary", () => {
    expect(selectVisibleNotes(notes, window)).toEqual([0, 1])
    expect(selectHit([0], 1, true)).toEqual([0, 1])
    expect(selectHit([0, 1], 0, true)).toEqual([1])
    expect(selectHit([0, 1], 1, false)).toEqual([0, 1])
  })

  it("keeps hidden source starts intact during pitch moves and resizes", () => {
    const moved = transformNotes({
      notes,
      selection: [0, 9],
      kind: "move",
      beatDelta: 0,
      pitchDelta: 30,
      window,
    })
    expect(moved.notes[0]).toMatchObject({ startBeat: 0, pitch: 102 })
    expect(moved.notes[1]).toBe(notes[1])
    expect(moved.selection).toEqual([0])
    const resized = transformNotes({
      notes,
      selection: [0],
      kind: "resize",
      beatDelta: -10,
      pitchDelta: 4,
      window,
    })
    expect(resized.notes[0]).toMatchObject({ startBeat: 0, lengthBeats: 0.25, pitch: 72 })
  })

  it("duplicates, deletes and pastes using source beats with stable resulting selection", () => {
    const ids = ["new-1", "new-2"]
    const duplicate = duplicateNotes(notes, [0, 2, 99], () => ids.shift() ?? "unexpected")
    expect(duplicate.selection).toEqual([3, 4])
    expect(duplicate.notes.slice(3).map(note => note.startBeat)).toEqual([3, 7])
    expect(deleteNotes(duplicate.notes, duplicate.selection)).toEqual({ notes, selection: [] })
    const paste = pasteNotes(notes, [notes[0]], () => "pasted")
    expect(paste.notes[3]).toMatchObject({ id: "pasted", startBeat: 0.25 })
    expect(paste.selection).toEqual([3])
  })

  it("inserts before the exclusive right edge and adjusts only selected velocities", () => {
    const inserted = insertNote({
      notes,
      horizontalRatio: 1,
      verticalRatio: 0,
      window,
      id: "inserted",
    })
    expect(inserted.notes[3]).toMatchObject({ startBeat: 5.75, pitch: 127 })
    expect(inserted.selection).toEqual([3])
    expect(setNoteVelocity(notes, [0, 2], 110).notes.map(note => note.velocity)).toEqual([
      110, 80, 110,
    ])
  })

  it("draws only uncovered source cells and accumulates erased note indices across cells", () => {
    const ids = ["draw-1", "draw-2"]
    const drawn = drawCells({
      notes,
      selection: [],
      firstCell: -1,
      lastCell: 5,
      pitch: 70,
      window,
      createId: () => ids.shift() ?? "extra",
    })
    expect(drawn.notes.slice(3).map(note => note.startBeat)).toEqual([2, 2.25, 2.5, 2.75, 3, 3.25])
    const covered = drawCells({
      notes,
      selection: [],
      firstCell: 0,
      lastCell: 4,
      pitch: 72,
      window,
      createId: () => "new",
    })
    expect(covered.notes).toHaveLength(4)
    expect(covered.notes[3].startBeat).toBe(3)
    const first = eraseCells({
      notes,
      selection: [],
      firstCell: 0,
      lastCell: 0,
      pitch: 72,
      window,
      erased: new Set<number>(),
    })
    expect(first.edit.notes.map(note => note.id)).toEqual(["inside", "outside"])
    const second = eraseCells({
      notes,
      selection: [],
      firstCell: 4,
      lastCell: 4,
      pitch: 64,
      window,
      erased: first.erased,
    })
    expect(second.edit.notes.map(note => note.id)).toEqual(["outside"])
  })

  it("selects and edits the full pitch domain while retaining hidden source material", () => {
    const extremes: MidiNote[] = [
      { id: "low", pitch: 0, startBeat: 2, lengthBeats: 1, velocity: 1 },
      { id: "high", pitch: 127, startBeat: 3, lengthBeats: 1, velocity: 127 },
      { id: "hidden", pitch: 100, startBeat: 8, lengthBeats: 1, velocity: 100 },
    ]
    expect(selectVisibleNotes(extremes, window)).toEqual([0, 1])
    const down = transformNotes({
      notes: extremes,
      selection: [0, 1],
      kind: "move",
      beatDelta: 0,
      pitchDelta: -12,
      window,
    })
    expect(down.notes.map(note => note.pitch)).toEqual([0, 115, 100])
    expect(down.notes[2]).toBe(extremes[2])
    const up = transformNotes({
      notes: extremes,
      selection: [0, 1],
      kind: "move",
      beatDelta: 0,
      pitchDelta: 12,
      window,
    })
    expect(up.notes.map(note => note.pitch)).toEqual([12, 127, 100])
    const lowest = insertNote({
      notes: extremes,
      horizontalRatio: 0,
      verticalRatio: 1,
      window,
      id: "lowest",
    })
    expect(lowest.notes[3]).toMatchObject({ pitch: 0, startBeat: 2 })
    expect(setNoteVelocity(extremes, [0], 0).notes[0].velocity).toBe(1)
    expect(setNoteVelocity(extremes, [1], 200).notes[1].velocity).toBe(127)
  })
})
