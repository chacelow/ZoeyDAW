import { describe, expect, it } from "vitest"
import { createTestDocument, createTestWorkspace } from "./test-fixtures"
import { parseProject, stringifyProject } from "./persistence"
import { ensurePatternReferences, resolveMidiClip, withPatternNotes } from "./patterns"
import type { PatternClip } from "./types"

function sharedDocument() {
  const document = createTestDocument()
  const track = document.tracks.find(track => track.kind === "midi")
  if (!track) throw new Error("Missing MIDI fixture")
  const first: PatternClip = {
    id: "first",
    kind: "pattern",
    patternId: "shared",
    startBar: 1,
    lengthBars: 2,
  }
  const second: PatternClip = { ...first, id: "second", startBar: 5, sourceOffsetBars: 0.25 }
  track.clips = [first, second]
  return { document: ensurePatternReferences(document), first, second }
}

describe("shared Pattern content", () => {
  it("updates shared notes without changing either placement and roundtrips references", () => {
    const { document, first, second } = sharedDocument()
    const notes = [{ pitch: 72, startBeat: 0.5, lengthBeats: 1, velocity: 93 }]
    const edited = withPatternNotes(document, "shared", notes, 4)
    expect(document.patterns[0].notes).toEqual([])
    expect(resolveMidiClip(first, edited.patterns)).toMatchObject({
      notes,
      loopBars: 4,
      startBar: 1,
    })
    expect(resolveMidiClip(second, edited.patterns)).toMatchObject({
      notes,
      loopBars: 4,
      startBar: 5,
      sourceOffsetBars: 0.25,
    })
    const restored = parseProject(stringifyProject(edited, createTestWorkspace())).document
    expect(restored.patterns).toEqual(edited.patterns)
    expect(
      restored.tracks
        .flatMap(track => track.clips)
        .filter(clip => clip.kind === "pattern")
        .map(clip => clip.patternId)
    ).toEqual(["shared", "shared"])
    notes[0].pitch = 20
    expect(edited.patterns[0].notes[0].pitch).toBe(72)
  })

  it("migrates legacy rhythms and preserves conflicting same-ID content", () => {
    const document = createTestDocument()
    const track = document.tracks.find(track => track.kind === "midi")
    if (!track) throw new Error("Missing MIDI fixture")
    const legacy = {
      ...document,
      patterns: undefined,
      tracks: document.tracks.map(item =>
        item === track
          ? {
              ...item,
              clips: [
                {
                  id: "a",
                  kind: "pattern",
                  patternId: "old",
                  startBar: 1,
                  lengthBars: 1,
                  steps: [true, false, true, false],
                },
                {
                  id: "b",
                  kind: "pattern",
                  patternId: "old",
                  startBar: 2,
                  lengthBars: 1,
                  steps: [false, true, false, false],
                },
              ],
            }
          : item
      ),
    }
    const restored = parseProject(
      JSON.stringify({ version: 3, document: legacy, workspace: createTestWorkspace() })
    ).document
    expect(restored.patterns.map(pattern => pattern.notes.map(note => note.startBeat))).toEqual([
      [0, 0.5],
      [0.25],
    ])
    expect(new Set(restored.patterns.map(pattern => pattern.id)).size).toBe(2)
    expect(restored.patterns[0]).toMatchObject({
      loopBars: 0.25,
      notes: [
        { pitch: 60, velocity: 100 },
        { pitch: 60, velocity: 100 },
      ],
    })
    expect(stringifyProject(restored, createTestWorkspace())).not.toContain('"steps"')
  })

  it("rejects missing references, duplicate IDs, invalid notes and loop lengths", () => {
    const { document } = sharedDocument()
    for (const patterns of [
      [],
      [...document.patterns, ...document.patterns],
      [{ id: "shared", loopBars: 0, notes: [] }],
      [
        {
          id: "shared",
          loopBars: 1,
          notes: [{ pitch: 128, startBeat: 0, lengthBeats: 1, velocity: 100 }],
        },
      ],
    ]) {
      expect(() =>
        parseProject(
          JSON.stringify({
            version: 4,
            document: { ...document, patterns },
            workspace: createTestWorkspace(),
          })
        )
      ).toThrow()
    }
  })
})
