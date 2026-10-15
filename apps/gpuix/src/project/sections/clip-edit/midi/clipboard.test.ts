import { expect, it } from "bun:test"
import { parseNotes, serializeNotes } from "./clipboard"

it("round-trips selected source notes without trusting copied IDs", () => {
  const notes = [{ id: "existing", pitch: 60, startBeat: 1.25, lengthBeats: 0.5, velocity: 82 }]
  expect(parseNotes(serializeNotes(notes))).toEqual([
    { pitch: 60, startBeat: 1.25, lengthBeats: 0.5, velocity: 82 },
  ])
})

it("rejects unrelated clipboard text and invalid note geometry", () => {
  expect(parseNotes("ordinary copied text")).toBeNull()
  expect(
    parseNotes(
      JSON.stringify({
        type: "zoeydaw-clips",
        version: 1,
        notes: [{ pitch: 60, startBeat: 1, lengthBeats: 1, velocity: 100 }],
      })
    )
  ).toBeNull()
  expect(
    parseNotes(
      JSON.stringify({
        type: "application/x-zoeymind-midi-notes+json",
        version: 1,
        notes: [{ pitch: 60, startBeat: -1, lengthBeats: 0, velocity: 200 }],
      })
    )
  ).toBeNull()
})
