import { describe, expect, it } from "vitest"
import { midiInsertionBeat, moveMidiNote } from "./midi-notes"
import type { MidiNote } from "./types"

const crossingNote: MidiNote = {
  id: "note-1",
  pitch: 60,
  startBeat: 3,
  lengthBeats: 2,
  velocity: 100,
}

describe("MIDI source-window geometry", () => {
  it("inserts at the last valid grid cell rather than the exclusive right edge", () => {
    expect(midiInsertionBeat({ horizontalRatio: 0.99, sourceOffsetBeats: 4, totalBeats: 4 })).toBe(
      7.75
    )
    expect(midiInsertionBeat({ horizontalRatio: 1, sourceOffsetBeats: 4, totalBeats: 4 })).toBe(
      7.75
    )
    expect(midiInsertionBeat({ horizontalRatio: 0, sourceOffsetBeats: 0.4, totalBeats: 0.3 })).toBe(
      0.4
    )
  })

  it("retains a left-crossing note's source start during pitch-only drag", () => {
    expect(
      moveMidiNote({
        note: crossingNote,
        originalStartBeat: 3,
        originalPitch: 60,
        beatDelta: 0,
        pitchDelta: 5,
        sourceOffsetBeats: 4,
        totalBeats: 4,
      })
    ).toEqual({ ...crossingNote, pitch: 65 })
  })

  it("allows horizontal moves of a left-crossing note without pushing its start inside", () => {
    const geometry = {
      note: crossingNote,
      originalStartBeat: 3,
      originalPitch: 60,
      pitchDelta: 0,
      sourceOffsetBeats: 4,
      totalBeats: 4,
    }
    expect(moveMidiNote({ ...geometry, beatDelta: 0.25 }).startBeat).toBe(3.25)
  })

  it("retains a right-crossing note on pitch-only drag and permits an inward move", () => {
    const note = { ...crossingNote, startBeat: 7 }
    const geometry = {
      note,
      originalStartBeat: 7,
      originalPitch: 60,
      pitchDelta: -2,
      sourceOffsetBeats: 4,
      totalBeats: 4,
    }
    expect(moveMidiNote({ ...geometry, beatDelta: 0 })).toEqual({ ...note, pitch: 58 })
    expect(moveMidiNote({ ...geometry, beatDelta: -0.25 }).startBeat).toBe(6.75)
  })

  it("moves partially visible notes outward without hiding their entire source window", () => {
    const geometry = {
      note: crossingNote,
      originalStartBeat: 3,
      originalPitch: 60,
      pitchDelta: 0,
      sourceOffsetBeats: 4,
      totalBeats: 4,
    }
    expect(moveMidiNote({ ...geometry, beatDelta: -0.25 }).startBeat).toBe(2.75)
    const right = { ...crossingNote, startBeat: 7 }
    expect(
      moveMidiNote({ ...geometry, note: right, originalStartBeat: 7, beatDelta: 0.25 }).startBeat
    ).toBe(7.25)
    const covering = { ...crossingNote, startBeat: 0, lengthBeats: 16 }
    expect(
      moveMidiNote({ ...geometry, note: covering, originalStartBeat: 0, beatDelta: 1 }).startBeat
    ).toBe(1)
  })
})
