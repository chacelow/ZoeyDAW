import { expect, it } from "bun:test"
import { createMockDocument, createMockWorkspace } from "../adapters/fixtures"
import { parseProject, stringifyProject } from "./persistence"

it("normalizes missing MIDI note IDs without collisions and preserves them across snapshots", () => {
  const document = createMockDocument()
  const clip = document.tracks.find(track => track.id === "trager")!.clips[0]
  if (clip.kind !== "midi") throw new Error("Expected MIDI fixture")
  clip.notes = [
    { pitch: 60, startBeat: 0, lengthBeats: 1, velocity: 100 },
    { id: "snapshot-note-0", pitch: 61, startBeat: 1, lengthBeats: 1, velocity: 90 },
    { pitch: 62, startBeat: 2, lengthBeats: 1, velocity: 80 },
    { id: "kept", pitch: 63, startBeat: 3, lengthBeats: 1, velocity: 70 },
  ]
  const parsed = parseProject(
    JSON.stringify({ version: 2, document, workspace: createMockWorkspace() })
  )
  const restored = parsed.document.tracks.find(track => track.id === "trager")!.clips[0]
  if (restored.kind !== "midi") throw new Error("Expected restored MIDI clip")
  expect(restored.notes.every(note => typeof note.id === "string")).toBe(true)
  expect(new Set(restored.notes.map(note => note.id)).size).toBe(restored.notes.length)
  expect(restored.notes[1]).toEqual(clip.notes[1])
  expect(restored.notes[3]).toEqual(clip.notes[3])
  expect(
    restored.notes.map(({ pitch, startBeat, lengthBeats, velocity }) => ({
      pitch,
      startBeat,
      lengthBeats,
      velocity,
    }))
  ).toEqual(
    clip.notes.map(({ pitch, startBeat, lengthBeats, velocity }) => ({
      pitch,
      startBeat,
      lengthBeats,
      velocity,
    }))
  )
  const reparsed = parseProject(stringifyProject(parsed.document, parsed.workspace))
  expect(reparsed.document.tracks.find(track => track.id === "trager")!.clips[0]).toEqual(restored)
  expect(clip.notes[0].id).toBeUndefined()
})
