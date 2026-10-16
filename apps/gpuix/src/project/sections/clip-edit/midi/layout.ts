import { NOTE_GRID_BEATS } from "./geometry"
import type { MidiNote } from "@/project/model/types"

/** Source interval shown by a MIDI clip, in retained-source beats. */
export interface SourceWindow {
  readonly sourceOffsetBeats: number
  readonly totalBeats: number
}

/** Pixel geometry of the scrollable note area; scroll offsets are content pixels from the top-left. */
export interface RollGeometry {
  readonly pitches: readonly number[]
  readonly rowHeight: number
  /** Content width covering the whole source window. */
  readonly width: number
  readonly scrollX: number
  readonly scrollY: number
  /** Measured viewport size. */
  readonly viewWidth: number
  readonly viewHeight: number
  readonly window: SourceWindow
}

export interface NoteRect {
  readonly index: number
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export type RollHit =
  | { readonly kind: "note"; readonly index: number; readonly edge: boolean }
  | { readonly kind: "empty" }

export function beatToX(beat: number, roll: RollGeometry): number {
  return ((beat - roll.window.sourceOffsetBeats) / roll.window.totalBeats) * roll.width
}

export function xToBeat(x: number, roll: RollGeometry): number {
  return roll.window.sourceOffsetBeats + (x / Math.max(1, roll.width)) * roll.window.totalBeats
}

/** Row under a content y, clamped to the first and last pitch rows. */
export function pitchAt(y: number, roll: Pick<RollGeometry, "pitches" | "rowHeight">): number {
  const row = Math.max(0, Math.min(roll.pitches.length - 1, Math.floor(y / roll.rowHeight)))
  return roll.pitches[row] ?? 60
}

/** First and one-past-last row intersecting the viewport. */
export function visibleRows(roll: RollGeometry): { first: number; end: number } {
  const first = Math.max(0, Math.floor(roll.scrollY / roll.rowHeight))
  const end = Math.min(
    roll.pitches.length,
    Math.ceil((roll.scrollY + roll.viewHeight) / roll.rowHeight)
  )
  return { first, end: Math.max(first, end) }
}

/**
Content rectangles of notes that intersect both the source window and the viewport. Offscreen notes
get no rectangle, so the view never mounts a node for them.
*/
export function visibleNoteRects(notes: readonly MidiNote[], roll: RollGeometry): NoteRect[] {
  const rows = new Map(roll.pitches.map((pitch, row) => [pitch, row]))
  const { sourceOffsetBeats, totalBeats } = roll.window
  const rects: NoteRect[] = []
  for (const [index, note] of notes.entries()) {
    const row = rows.get(note.pitch)
    if (row === undefined) continue
    const start = Math.max(note.startBeat, sourceOffsetBeats)
    const end = Math.min(note.startBeat + note.lengthBeats, sourceOffsetBeats + totalBeats)
    if (end <= start) continue
    const left = beatToX(start, roll)
    const width = beatToX(end, roll) - left
    const top = row * roll.rowHeight
    if (
      left + width <= roll.scrollX ||
      left >= roll.scrollX + roll.viewWidth ||
      top + roll.rowHeight <= roll.scrollY ||
      top >= roll.scrollY + roll.viewHeight
    )
      continue
    rects.push({ index, left, top, width, height: roll.rowHeight })
  }
  return rects
}

/**
Topmost note under a content point; later notes paint above earlier ones. The resize edge is the
right part of a note, never more than a third of it so short notes stay movable.
*/
export function hitNote(
  notes: readonly MidiNote[],
  roll: RollGeometry,
  x: number,
  y: number,
  edgeWidth: number
): RollHit {
  const rects = visibleNoteRects(notes, roll)
  for (let item = rects.length - 1; item >= 0; item--) {
    const rect = rects[item]
    if (!rect) continue
    if (x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height)
      return {
        kind: "note",
        index: rect.index,
        edge: x >= rect.left + rect.width - Math.min(edgeWidth, rect.width / 3),
      }
  }
  return { kind: "empty" }
}

/** Notes intersecting a content rectangle; the marquee ignores the viewport so scrolling keeps hits. */
export function marqueeHits(
  notes: readonly MidiNote[],
  roll: Pick<RollGeometry, "pitches" | "rowHeight" | "width" | "window">,
  box: { left: number; top: number; right: number; bottom: number }
): number[] {
  const rows = new Map(roll.pitches.map((pitch, row) => [pitch, row]))
  const { sourceOffsetBeats, totalBeats } = roll.window
  return notes.flatMap((note, index) => {
    const row = rows.get(note.pitch)
    if (
      row === undefined ||
      note.startBeat >= sourceOffsetBeats + totalBeats ||
      note.startBeat + note.lengthBeats <= sourceOffsetBeats
    )
      return []
    const left = ((note.startBeat - sourceOffsetBeats) / totalBeats) * roll.width
    const right = left + (note.lengthBeats / totalBeats) * roll.width
    const top = row * roll.rowHeight
    return left < box.right &&
      right > box.left &&
      top < box.bottom &&
      top + roll.rowHeight > box.top
      ? [index]
      : []
  })
}

/** Cell index relative to the first absolute-grid cell intersecting the source window. */
export function cellAt(x: number, roll: Pick<RollGeometry, "width" | "window">): number {
  const beat =
    roll.window.sourceOffsetBeats +
    (Math.max(0, Math.min(roll.width, x)) / Math.max(1, roll.width)) * roll.window.totalBeats
  return (
    Math.floor(beat / NOTE_GRID_BEATS) - Math.floor(roll.window.sourceOffsetBeats / NOTE_GRID_BEATS)
  )
}

/** Keep scroll offsets inside the content. */
export function clampScroll(
  scrollX: number,
  scrollY: number,
  roll: Pick<RollGeometry, "width" | "viewWidth" | "viewHeight" | "rowHeight" | "pitches">
): { scrollX: number; scrollY: number } {
  return {
    scrollX: Math.max(0, Math.min(Math.max(0, roll.width - roll.viewWidth), scrollX)),
    scrollY: Math.max(
      0,
      Math.min(Math.max(0, roll.pitches.length * roll.rowHeight - roll.viewHeight), scrollY)
    ),
  }
}

export interface RollLine {
  readonly x: number
  /** 2 = bar, 1 = beat, 0 = finer grid cell. */
  readonly level: 0 | 1 | 2
}

/**
Vertical lines inside the viewport. The finest drawn step is the note grid, coarsened to beats and
then whole bars while a step would be narrower than `minCellPx`.
*/
export function rollGridLines(
  roll: Pick<RollGeometry, "width" | "scrollX" | "viewWidth" | "window">,
  numerator: number,
  minCellPx: number
): RollLine[] {
  const { sourceOffsetBeats, totalBeats } = roll.window
  const beatPx = roll.width / totalBeats
  if (!(beatPx > 0)) return []
  let step = NOTE_GRID_BEATS
  if (step * beatPx < minCellPx) step = 1
  while (step * beatPx < minCellPx) step = step < numerator ? numerator : step * 2
  const firstBeat = sourceOffsetBeats + (roll.scrollX / roll.width) * totalBeats
  const lastBeat = Math.min(
    sourceOffsetBeats + totalBeats,
    sourceOffsetBeats + ((roll.scrollX + roll.viewWidth) / roll.width) * totalBeats
  )
  const lines: RollLine[] = []
  for (let beat = Math.ceil(firstBeat / step) * step; beat <= lastBeat; beat += step) {
    // This tolerance only absorbs floating-point grid arithmetic, not a display threshold.
    const bar = Math.abs(beat / numerator - Math.round(beat / numerator)) < 1e-9
    const whole = Math.abs(beat - Math.round(beat)) < 1e-9
    lines.push({
      x: ((beat - sourceOffsetBeats) / totalBeats) * roll.width,
      level: bar ? 2 : whole ? 1 : 0,
    })
  }
  return lines
}
