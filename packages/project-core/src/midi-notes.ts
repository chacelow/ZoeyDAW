import type { MidiNote } from "./types"

const NOTE_GRID_BEATS = 0.25

/**
The clip's right edge is exclusive, even when rounding to the nearest grid cell.
*/
export function midiInsertionBeat({
  horizontalRatio,
  sourceOffsetBeats,
  totalBeats,
}: {
  horizontalRatio: number
  sourceOffsetBeats: number
  totalBeats: number
}): number {
  const lastGridCell = Math.max(0, Math.ceil(totalBeats / NOTE_GRID_BEATS) - 1)
  const gridCell = Math.max(
    0,
    Math.min(lastGridCell, Math.round((horizontalRatio * totalBeats) / NOTE_GRID_BEATS))
  )
  return sourceOffsetBeats + gridCell * NOTE_GRID_BEATS
}

/**
Keep a partially visible note's original position available while moving it.
*/
export function moveMidiNote({
  note,
  originalStartBeat,
  originalPitch,
  beatDelta,
  pitchDelta,
  sourceOffsetBeats,
  totalBeats,
}: {
  note: MidiNote
  originalStartBeat: number
  originalPitch: number
  beatDelta: number
  pitchDelta: number
  sourceOffsetBeats: number
  totalBeats: number
}): MidiNote {
  const visibleStep = Math.min(NOTE_GRID_BEATS, note.lengthBeats, totalBeats)
  const earliestStart = Math.max(
    0,
    Math.min(originalStartBeat, sourceOffsetBeats - note.lengthBeats + visibleStep)
  )
  const latestStart = Math.max(originalStartBeat, sourceOffsetBeats + totalBeats - visibleStep)
  return {
    ...note,
    startBeat: Math.max(earliestStart, Math.min(latestStart, originalStartBeat + beatDelta)),
    pitch: Math.max(0, Math.min(127, originalPitch + pitchDelta)),
  }
}
