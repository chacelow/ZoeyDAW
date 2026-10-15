import { midiInsertionBeat, moveMidiNote } from "../midi-notes"
import type { MidiNote } from "../types"

interface Window {
  sourceOffsetBeats: number
  totalBeats: number
}
interface Edit {
  notes: MidiNote[]
  selection: number[]
}

export function validSelection(notes: MidiNote[], selection: number[]): number[] {
  return selection.filter(index => notes[index] !== undefined)
}

export function selectVisibleNotes(notes: MidiNote[], window: Window): number[] {
  return notes.flatMap((note, index) =>
    note.startBeat < window.sourceOffsetBeats + window.totalBeats &&
    note.startBeat + note.lengthBeats > window.sourceOffsetBeats
      ? [index]
      : []
  )
}

export function selectHit(selection: number[], index: number, extend: boolean): number[] {
  return extend
    ? selection.includes(index)
      ? selection.filter(item => item !== index)
      : [...selection, index]
    : selection.includes(index)
      ? selection
      : [index]
}

export function deleteNotes(notes: MidiNote[], selection: number[]): Edit {
  const indices = new Set(validSelection(notes, selection))
  return { notes: notes.filter((_, index) => !indices.has(index)), selection: [] }
}

export function duplicateNotes(
  notes: MidiNote[],
  selection: number[],
  createId: () => string
): Edit {
  const indices = validSelection(notes, selection)
  return {
    notes: [
      ...notes,
      ...indices.map(index => ({
        ...notes[index],
        id: createId(),
        startBeat: notes[index].startBeat + notes[index].lengthBeats,
      })),
    ],
    selection: indices.map((_, index) => notes.length + index),
  }
}

export function pasteNotes(notes: MidiNote[], copied: MidiNote[], createId: () => string): Edit {
  return {
    notes: [
      ...notes,
      ...copied.map(note => ({ ...note, id: createId(), startBeat: note.startBeat + 0.25 })),
    ],
    selection: copied.map((_, index) => notes.length + index),
  }
}

export function insertNote({
  notes,
  horizontalRatio,
  verticalRatio,
  window,
  id,
}: {
  notes: MidiNote[]
  horizontalRatio: number
  verticalRatio: number
  window: Window
  id: string
}): Edit {
  return {
    notes: [
      ...notes,
      {
        id,
        pitch: Math.max(0, Math.min(127, 127 - Math.floor(verticalRatio * 128))),
        startBeat: midiInsertionBeat({ horizontalRatio, ...window }),
        lengthBeats: 1,
        velocity: 100,
      },
    ],
    selection: [notes.length],
  }
}

export function transformNotes({
  notes,
  selection,
  kind,
  beatDelta,
  pitchDelta,
  window,
}: {
  notes: MidiNote[]
  selection: number[]
  kind: "move" | "resize"
  beatDelta: number
  pitchDelta: number
  window: Window
}): Edit {
  const valid = validSelection(notes, selection)
  const indices = new Set(valid)
  return {
    notes: notes.map((note, index) => {
      if (!indices.has(index)) {
        return note
      }
      if (kind === "resize") {
        return {
          ...note,
          lengthBeats: Math.max(0.25, Math.round((note.lengthBeats + beatDelta) * 4) / 4),
        }
      }
      const moved = moveMidiNote({
        note,
        originalStartBeat: note.startBeat,
        originalPitch: note.pitch,
        beatDelta,
        pitchDelta,
        ...window,
      })
      return moved
    }),
    selection: valid,
  }
}

export function setNoteVelocity(notes: MidiNote[], selection: number[], velocity: number): Edit {
  const valid = validSelection(notes, selection)
  const indices = new Set(valid)
  return {
    notes: notes.map((note, index) =>
      indices.has(index)
        ? { ...note, velocity: Math.max(1, Math.min(127, Math.round(velocity))) }
        : note
    ),
    selection: valid,
  }
}

export function drawCells({
  notes,
  selection,
  firstCell,
  lastCell,
  pitch,
  window,
  createId,
}: {
  notes: MidiNote[]
  selection: number[]
  firstCell: number
  lastCell: number
  pitch: number
  window: Window
  createId: () => string
}): Edit {
  const added: MidiNote[] = []
  const origin = Math.floor(window.sourceOffsetBeats * 4) / 4
  for (let cell = Math.min(firstCell, lastCell); cell <= Math.max(firstCell, lastCell); cell++) {
    const beat = origin + cell / 4
    const visibleStart = Math.max(beat, window.sourceOffsetBeats)
    const visibleEnd = Math.min(beat + 0.25, window.sourceOffsetBeats + window.totalBeats)
    if (
      beat + 0.25 <= window.sourceOffsetBeats ||
      beat >= window.sourceOffsetBeats + window.totalBeats ||
      notes.some(note => {
        return (
          note.pitch === pitch &&
          note.startBeat < visibleEnd &&
          note.startBeat + note.lengthBeats > visibleStart
        )
      })
    ) {
      continue
    }
    added.push({ id: createId(), pitch, startBeat: beat, lengthBeats: 0.25, velocity: 100 })
  }
  return { notes: [...notes, ...added], selection: validSelection(notes, selection) }
}

export function eraseCells({
  notes,
  selection,
  firstCell,
  lastCell,
  pitch,
  window,
  erased,
}: {
  notes: MidiNote[]
  selection: number[]
  firstCell: number
  lastCell: number
  pitch: number
  window: Window
  erased: ReadonlySet<number>
}): { edit: Edit; erased: Set<number> } {
  const next = new Set(erased)
  const low = Math.min(firstCell, lastCell)
  const high = Math.max(firstCell, lastCell)
  const origin = Math.floor(window.sourceOffsetBeats * 4) / 4
  notes.forEach((note, index) => {
    if (
      note.startBeat + note.lengthBeats <= window.sourceOffsetBeats ||
      note.startBeat >= window.sourceOffsetBeats + window.totalBeats
    )
      return
    const startCell = Math.floor((note.startBeat - origin) * 4)
    const endCell = Math.ceil((note.startBeat + note.lengthBeats - origin) * 4) - 1
    if (note.pitch === pitch && startCell <= high && endCell >= low) {
      next.add(index)
    }
  })
  return {
    edit: {
      notes: notes.filter((_, index) => !next.has(index)),
      selection: validSelection(notes, selection),
    },
    erased: next,
  }
}

const GRID_EPSILON = 1e-9

/**
Live's Cmd+U: snap selected note starts to the editor grid, keeping lengths. A start that the
source-window move rules cannot place on any nearby grid line is left where it is.
*/
export function quantizeNotes({
  notes,
  selection,
  gridBeats,
  window,
}: {
  notes: MidiNote[]
  selection: number[]
  gridBeats: number
  window: Window
}): Edit {
  const valid = validSelection(notes, selection)
  if (!(gridBeats > 0) || !Number.isFinite(gridBeats)) {
    return { notes, selection: valid }
  }
  const indices = new Set(valid)
  return {
    notes: notes.map((note, index) => {
      const cells = note.startBeat / gridBeats
      if (!indices.has(index) || Math.abs(cells - Math.round(cells)) < GRID_EPSILON) {
        return note
      }
      for (const cell of new Set([Math.round(cells), Math.ceil(cells), Math.floor(cells)])) {
        const target = cell * gridBeats
        const moved = moveMidiNote({
          note,
          originalStartBeat: note.startBeat,
          originalPitch: note.pitch,
          beatDelta: target - note.startBeat,
          pitchDelta: 0,
          ...window,
        })
        if (moved.startBeat === target) {
          return moved
        }
      }
      return note
    }),
    selection: valid,
  }
}
