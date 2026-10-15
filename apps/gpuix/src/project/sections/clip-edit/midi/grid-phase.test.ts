import { expect, it } from "bun:test"
import { drawCells, eraseCells, insertNote, quantizeNotes } from "@/project/model/midi-editing"
import { midiInsertionBeat } from "@/project/model/midi-notes"
import { cellAt, hitNote, rollGridLines, visibleNoteRects } from "./layout"
import type { RollGeometry } from "./layout"

const window = { sourceOffsetBeats: 0.4, totalBeats: 2 }
const roll: RollGeometry = {
  pitches: [60],
  rowHeight: 18,
  width: 400,
  viewWidth: 400,
  viewHeight: 18,
  scrollX: 0,
  scrollY: 0,
  window,
}

it("uses source-zero grid points for insertion, painting, quantizing, erasing and display", () => {
  const painted = drawCells({
    notes: [],
    selection: [],
    firstCell: 0,
    lastCell: 8,
    pitch: 60,
    window,
    createId: () => crypto.randomUUID(),
  }).notes
  expect(painted.map(note => note.startBeat)).toEqual([
    0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25,
  ])
  const inserted = insertNote({
    notes: [],
    horizontalRatio: 0,
    verticalRatio: (127 - 60 + 0.5) / 128,
    window,
    id: "inserted",
  })
  expect(inserted.notes[0]?.startBeat).toBe(0.5)
  const quantized = quantizeNotes({
    notes: painted,
    selection: painted.map((_, index) => index),
    gridBeats: 0.25,
    window,
  })
  expect(quantized.notes).toEqual(painted)
  expect(cellAt(1, roll)).toBe(0)
  expect(cellAt(21, roll)).toBe(1)
  const offGrid = { id: "off-grid", pitch: 60, startBeat: 0.65, lengthBeats: 0.25, velocity: 90 }
  expect(
    quantizeNotes({ notes: [offGrid], selection: [0], gridBeats: 0.25, window }).notes[0]?.startBeat
  ).toBe(0.75)
  const grid = rollGridLines(roll, 4, 8)
  expect(grid.map(line => Math.round((0.4 + line.x / 200) * 100) / 100)).toEqual([
    0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25,
  ])
  const erased = eraseCells({
    notes: painted,
    selection: [],
    firstCell: 1,
    lastCell: 1,
    pitch: 60,
    window,
    erased: new Set(),
  })
  expect(erased.edit.notes.map(note => note.startBeat)).toEqual([
    0.25, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25,
  ])
})

it("paints and hits the left-crossing half cell and erases exactly that cell", () => {
  const painted = drawCells({
    notes: [],
    selection: [],
    firstCell: 0,
    lastCell: 1,
    pitch: 60,
    window,
    createId: () => crypto.randomUUID(),
  }).notes
  const first = visibleNoteRects(painted, roll)[0]
  expect(first).toMatchObject({ index: 0, left: 0 })
  expect(first?.width).toBeCloseTo(20, 5)
  expect(hitNote(painted, roll, 1, 9, 4)).toEqual({ kind: "note", index: 0, edge: false })
  const erased = eraseCells({
    notes: painted,
    selection: [],
    firstCell: 0,
    lastCell: 0,
    pitch: 60,
    window,
    erased: new Set(),
  })
  expect(erased.edit.notes.map(note => note.startBeat)).toEqual([0.5])
})

it("inserts an intersecting grid note even when a tiny window contains no grid start", () => {
  for (const start of [0.01, 0.1, 0.4, 1.01, 3.999]) {
    const span = 0.001
    for (const ratio of [0, 0.5, 1]) {
      const beat = midiInsertionBeat({
        horizontalRatio: ratio,
        sourceOffsetBeats: start,
        totalBeats: span,
      })
      expect(beat * 4).toBeInteger()
      expect(beat).toBeLessThan(start + span)
      expect(beat + 1).toBeGreaterThan(start)
    }
  }
})
