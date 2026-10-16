import { ALL_PITCHES } from "./geometry"
import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"
import type { MidiNote } from "@/project/model/types"
import type { SourceWindow } from "./layout"

/** Shared metric bounds that a viewport solve needs; supplied from `PROJECT_METRICS` by the caller. */
export interface RowLimits {
  readonly minRowHeight: number
  readonly maxRowHeight: number
}

/** Fold shows only pitches that hold notes, highest first; an empty clip keeps the C3 row. */
export function rollPitches(
  notes: readonly MidiNote[],
  fold: boolean,
  initialPitch = PREFERENCE_DEFAULTS.midi.initialPitch
): readonly number[] {
  if (!fold) return ALL_PITCHES
  const pitches = [...new Set(notes.map(note => note.pitch))].sort((a, b) => b - a)
  return pitches.length ? pitches : [initialPitch]
}

/**
Fits the rows holding notes inside the source window, with one spare row above and below, into the
measured height, then centers them. Without notes the C3 row is centered at the largest row height.
*/
export function fitRows(
  notes: readonly MidiNote[],
  pitches: readonly number[],
  window: SourceWindow,
  viewHeight: number,
  limits: RowLimits,
  initialPitch = PREFERENCE_DEFAULTS.midi.initialPitch
): { rowHeight: number; scrollY: number } {
  const rowOf = new Map(pitches.map((pitch, row) => [pitch, row]))
  const rows = notes.flatMap(note => {
    const row = rowOf.get(note.pitch)
    return row !== undefined &&
      note.startBeat < window.sourceOffsetBeats + window.totalBeats &&
      note.startBeat + note.lengthBeats > window.sourceOffsetBeats
      ? [row]
      : []
  })
  const firstRow = rows.length ? Math.min(...rows) : Math.max(0, pitches.indexOf(initialPitch))
  const lastRow = rows.length ? Math.max(...rows) : firstRow
  const rowHeight =
    viewHeight > 0
      ? Math.max(
          limits.minRowHeight,
          Math.min(limits.maxRowHeight, Math.floor(viewHeight / (lastRow - firstRow + 3)))
        )
      : limits.maxRowHeight
  const center = ((firstRow + lastRow + 1) / 2) * rowHeight
  const maxScroll = Math.max(0, pitches.length * rowHeight - viewHeight)
  return { rowHeight, scrollY: Math.max(0, Math.min(maxScroll, center - viewHeight / 2)) }
}

/** Rescale a scroll offset so the content point at the viewport center stays centered. */
export function rescaleScroll(
  scroll: number,
  viewSize: number,
  previousSize: number,
  nextSize: number
): number {
  if (previousSize <= 0) return 0
  return Math.max(0, ((scroll + viewSize / 2) * nextSize) / previousSize - viewSize / 2)
}
