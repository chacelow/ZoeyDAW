import { PREFERENCE_DEFAULTS } from "../defaults/preferences"
import type { MidiNote } from "./types"

/**
The clip's right edge is exclusive, even when rounding to the nearest grid cell.
*/
export function midiInsertionBeat(
  {
    horizontalRatio,
    sourceOffsetBeats,
    totalBeats,
  }: {
    horizontalRatio: number
    sourceOffsetBeats: number
    totalBeats: number
  },
  policy = PREFERENCE_DEFAULTS.midi
): number {
  const gridBeats = policy.noteGridBeats
  const firstGridCell = Math.max(0, Math.floor(sourceOffsetBeats / gridBeats))
  const lastGridCell = Math.max(
    firstGridCell,
    Math.ceil((sourceOffsetBeats + totalBeats) / gridBeats) - 1
  )
  const target = sourceOffsetBeats + horizontalRatio * totalBeats
  const gridCell = Math.max(firstGridCell, Math.min(lastGridCell, Math.round(target / gridBeats)))
  return gridCell * gridBeats
}

/**
Keep a partially visible note's original position available while moving it.
*/
export function moveMidiNote(
  {
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
  },
  policy = PREFERENCE_DEFAULTS.midi
): MidiNote {
  const visibleStep = Math.min(policy.noteGridBeats, note.lengthBeats, totalBeats)
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
