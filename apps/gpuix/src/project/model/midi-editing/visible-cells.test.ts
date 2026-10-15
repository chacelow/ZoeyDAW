import { expect, it } from "bun:test"
import { drawCells, eraseCells } from "."
import type { MidiNote } from "../types"

const window = { sourceOffsetBeats: 0.4, totalBeats: 0.2 }
const hiddenLeft: MidiNote = {
  id: "hidden-left",
  pitch: 60,
  startBeat: 0.25,
  lengthBeats: 0.1,
  velocity: 80,
}
const hiddenRight: MidiNote = {
  id: "hidden-right",
  pitch: 60,
  startBeat: 0.65,
  lengthBeats: 0.1,
  velocity: 80,
}

it("erases visible cells without deleting retained notes outside either window boundary", () => {
  const visible: MidiNote = {
    id: "visible",
    pitch: 60,
    startBeat: 0.5,
    lengthBeats: 0.05,
    velocity: 80,
  }
  const erased = eraseCells({
    notes: [hiddenLeft, visible, hiddenRight],
    selection: [],
    firstCell: 0,
    lastCell: 1,
    pitch: 60,
    window,
    erased: new Set(),
  })
  expect(erased.edit.notes).toEqual([hiddenLeft, hiddenRight])
})

for (const [name, cell, hidden, expected] of [
  ["left", 0, hiddenLeft, 0.25],
  ["right", 1, hiddenRight, 0.5],
] as const) {
  it(`does not let the hidden ${name} retained note block painting in the visible half cell`, () => {
    const result = drawCells({
      notes: [hidden],
      selection: [],
      firstCell: cell,
      lastCell: cell,
      pitch: 60,
      window,
      createId: () => "drawn",
    })
    expect(result.notes[0]).toBe(hidden)
    expect(result.notes[1]).toEqual({
      id: "drawn",
      pitch: 60,
      startBeat: expected,
      lengthBeats: 0.25,
      velocity: 100,
    })
  })
}

for (const [name, cell, start] of [
  ["left", 0, 0.35],
  ["right", 1, 0.55],
] as const) {
  it(`does not paint a duplicate over the visible ${name} crossing note`, () => {
    const crossing: MidiNote = {
      id: "crossing",
      pitch: 60,
      startBeat: start,
      lengthBeats: 0.1,
      velocity: 80,
    }
    const result = drawCells({
      notes: [crossing],
      selection: [],
      firstCell: cell,
      lastCell: cell,
      pitch: 60,
      window,
      createId: () => "duplicate",
    })
    expect(result.notes).toEqual([crossing])
  })
}
