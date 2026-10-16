import { expect, it } from "bun:test"
import { ALL_PITCHES } from "./geometry"
import { hitNote, marqueeHits, visibleNoteRects, visibleRows } from "./layout"
import { fitRows, rollPitches } from "./viewport"
import type { MidiNote } from "@/project/model/types"
import type { RollGeometry } from "./layout"

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 2 ** 32
  }
}

function scenario(next: () => number): { notes: MidiNote[]; roll: RollGeometry } {
  const window = {
    sourceOffsetBeats: Math.floor(next() * 8),
    totalBeats: 1 + Math.floor(next() * 16),
  }
  const notes = Array.from({ length: Math.floor(next() * 40) }, (_, index) => ({
    id: `n${index}`,
    pitch: Math.floor(next() * 128),
    startBeat: Math.max(0, window.sourceOffsetBeats - 2 + next() * (window.totalBeats + 4)),
    lengthBeats: 0.25 + next() * 4,
    velocity: 1 + Math.floor(next() * 127),
  }))
  const pitches = rollPitches(notes, next() < 0.3)
  const rowHeight = 6 + Math.floor(next() * 30)
  const viewWidth = 50 + Math.floor(next() * 800)
  const viewHeight = 30 + Math.floor(next() * 400)
  const width = viewWidth * (0.25 + next() * 8)
  return {
    notes,
    roll: {
      pitches,
      rowHeight,
      width,
      scrollX: next() * Math.max(0, width - viewWidth),
      scrollY: next() * Math.max(0, pitches.length * rowHeight - viewHeight),
      viewWidth,
      viewHeight,
      window,
    },
  }
}

it("mounts exactly the notes that intersect both the source window and the viewport", () => {
  const next = random(15_102_026)
  let culled = 0
  for (let run = 0; run < 2000; run++) {
    const { notes, roll } = scenario(next)
    const rects = visibleNoteRects(notes, roll)
    const shown = new Set(rects.map(rect => rect.index))
    for (const rect of rects) {
      expect(rect.left + rect.width).toBeGreaterThan(roll.scrollX)
      expect(rect.left).toBeLessThan(roll.scrollX + roll.viewWidth)
      expect(rect.top + rect.height).toBeGreaterThan(roll.scrollY)
      expect(rect.top).toBeLessThan(roll.scrollY + roll.viewHeight)
      expect(rect.left).toBeGreaterThanOrEqual(-1e-9)
      expect(rect.left + rect.width).toBeLessThanOrEqual(roll.width + 1e-6)
    }
    for (const [index, note] of notes.entries()) {
      if (shown.has(index)) continue
      const row = roll.pitches.indexOf(note.pitch)
      const { sourceOffsetBeats, totalBeats } = roll.window
      const start = Math.max(note.startBeat, sourceOffsetBeats)
      const end = Math.min(note.startBeat + note.lengthBeats, sourceOffsetBeats + totalBeats)
      const left = ((start - sourceOffsetBeats) / totalBeats) * roll.width
      const right = ((end - sourceOffsetBeats) / totalBeats) * roll.width
      const offscreen =
        row === -1 ||
        end <= start ||
        right <= roll.scrollX ||
        left >= roll.scrollX + roll.viewWidth ||
        (row + 1) * roll.rowHeight <= roll.scrollY ||
        row * roll.rowHeight >= roll.scrollY + roll.viewHeight
      expect(offscreen).toBe(true)
      culled++
    }
    const rows = visibleRows(roll)
    expect(rows.first * roll.rowHeight).toBeLessThanOrEqual(roll.scrollY)
    expect(rows.end * roll.rowHeight).toBeGreaterThanOrEqual(
      Math.min(roll.pitches.length * roll.rowHeight, roll.scrollY + roll.viewHeight)
    )
  }
  expect(culled).toBeGreaterThan(1000)
})

it("hits the topmost painted note and its resize edge, and nothing outside notes", () => {
  const next = random(42)
  for (let run = 0; run < 1500; run++) {
    const { notes, roll } = scenario(next)
    const x = roll.scrollX + next() * roll.viewWidth
    const y = roll.scrollY + next() * roll.viewHeight
    const hit = hitNote(notes, roll, x, y, 6)
    const under = visibleNoteRects(notes, roll).filter(
      rect =>
        x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height
    )
    if (!under.length) {
      expect(hit).toEqual({ kind: "empty" })
      continue
    }
    const top = under.at(-1)
    if (hit.kind !== "note" || !top) throw new Error("Expected a note hit")
    expect(hit.index).toBe(top.index)
    expect(hit.edge).toBe(x >= top.left + top.width - Math.min(6, top.width / 3))
  }
})

it("selects every note whose rectangle meets the marquee, wherever the roll is scrolled", () => {
  const next = random(7)
  for (let run = 0; run < 1500; run++) {
    const { notes, roll } = scenario(next)
    const a = { x: next() * roll.width, y: next() * roll.pitches.length * roll.rowHeight }
    const b = { x: next() * roll.width, y: next() * roll.pitches.length * roll.rowHeight }
    const box = {
      left: Math.min(a.x, b.x),
      right: Math.max(a.x, b.x),
      top: Math.min(a.y, b.y),
      bottom: Math.max(a.y, b.y),
    }
    const hits = marqueeHits(notes, roll, box)
    const everything = visibleNoteRects(notes, {
      ...roll,
      scrollX: 0,
      scrollY: 0,
      viewWidth: roll.width,
      viewHeight: roll.pitches.length * roll.rowHeight,
    })
    const expected = everything
      .filter(
        rect =>
          rect.left < box.right &&
          rect.left + rect.width > box.left &&
          rect.top < box.bottom &&
          rect.top + rect.height > box.top
      )
      .map(rect => rect.index)
    for (const index of expected) expect(hits).toContain(index)
  }
})

it("fits C3, E3 and G3 between the ruler and the lane at a row height inside the shared limits", () => {
  const notes = [60, 64, 67].map(pitch => ({ pitch, startBeat: 0, lengthBeats: 1, velocity: 100 }))
  const limits = { minRowHeight: 6, maxRowHeight: 18 }
  const fit = fitRows(notes, ALL_PITCHES, { sourceOffsetBeats: 0, totalBeats: 4 }, 87, limits)
  expect(fit.rowHeight).toBe(8)
  const high = (127 - 67) * fit.rowHeight - fit.scrollY
  const low = (127 - 60 + 1) * fit.rowHeight - fit.scrollY
  expect(high).toBeGreaterThanOrEqual(0)
  expect(low).toBeLessThanOrEqual(87)
  expect((high + low) / 2).toBeCloseTo(87 / 2, 5)
  const outside = fitRows(
    [{ pitch: 100, startBeat: 20, lengthBeats: 1, velocity: 1 }, ...notes],
    ALL_PITCHES,
    { sourceOffsetBeats: 0, totalBeats: 4 },
    87,
    limits
  )
  expect(outside).toEqual(fit)
  const empty = fitRows([], ALL_PITCHES, { sourceOffsetBeats: 0, totalBeats: 4 }, 0, limits)
  expect(empty.rowHeight).toBe(18)
})
