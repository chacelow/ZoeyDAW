import { expect, it } from "bun:test"
import { quantizeNotes } from "."
import type { MidiNote } from "../types"

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 2 ** 32
  }
}

const GRIDS = [1 / 8, 1 / 4, 1 / 3, 1 / 2, 1]

function scenario(next: () => number) {
  const window = { sourceOffsetBeats: Math.floor(next() * 8) / 2, totalBeats: 1 + next() * 15 }
  const notes: MidiNote[] = Array.from({ length: 1 + Math.floor(next() * 12) }, (_, index) => ({
    id: `n${index}`,
    pitch: Math.floor(next() * 128),
    startBeat: window.sourceOffsetBeats - 1 + next() * (window.totalBeats + 2),
    lengthBeats: 0.05 + next() * 3,
    velocity: 1 + Math.floor(next() * 127),
  }))
  for (const note of notes) note.startBeat = Math.max(0, note.startBeat)
  const selection = notes.flatMap((_, index) => (next() < 0.6 ? [index] : []))
  const gridBeats = GRIDS[Math.floor(next() * GRIDS.length)] ?? 0.25
  return { notes, selection, gridBeats, window }
}

it("snaps every movable selected start onto the grid and is idempotent", () => {
  const next = random(20_261_015)
  let snapped = 0
  for (let run = 0; run < 3000; run++) {
    const input = scenario(next)
    const once = quantizeNotes(input)
    const twice = quantizeNotes({ ...input, notes: once.notes })
    expect(twice.notes).toEqual(once.notes)
    const grid = input.gridBeats
    for (const [index, note] of once.notes.entries()) {
      const original = input.notes[index]
      if (!original) throw new Error("Quantize changed the note count")
      expect(note.lengthBeats).toBe(original.lengthBeats)
      expect(note.pitch).toBe(original.pitch)
      if (!input.selection.includes(index)) {
        expect(note).toBe(original)
        continue
      }
      if (note !== original) {
        expect(Math.abs(note.startBeat / grid - Math.round(note.startBeat / grid))).toBeLessThan(
          1e-9
        )
        expect(Math.abs(note.startBeat - original.startBeat)).toBeLessThanOrEqual(
          input.gridBeats + 1e-9
        )
        snapped++
      } else if (Math.abs(note.startBeat / grid - Math.round(note.startBeat / grid)) >= 1e-9) {
        // A start the source-window move rules keep off-grid: neither neighbouring line is reachable.
        expect(original.startBeat + original.lengthBeats).toBeLessThanOrEqual(
          input.window.sourceOffsetBeats + input.gridBeats + 1e-9
        )
      }
    }
  }
  expect(snapped).toBeGreaterThan(1000)
})

it("rounds to the nearest grid line and leaves lengths for Cmd+U", () => {
  const notes: MidiNote[] = [
    { id: "late", pitch: 60, startBeat: 1.1, lengthBeats: 0.3, velocity: 90 },
    { id: "early", pitch: 62, startBeat: 1.9, lengthBeats: 0.7, velocity: 90 },
    { id: "free", pitch: 64, startBeat: 2.6, lengthBeats: 1, velocity: 90 },
  ]
  const result = quantizeNotes({
    notes,
    selection: [0, 1, 7],
    gridBeats: 0.25,
    window: { sourceOffsetBeats: 0, totalBeats: 8 },
  })
  expect(result.notes.map(note => note.startBeat)).toEqual([1, 2, 2.6])
  expect(result.notes.map(note => note.lengthBeats)).toEqual([0.3, 0.7, 1])
  expect(result.selection).toEqual([0, 1])
})
