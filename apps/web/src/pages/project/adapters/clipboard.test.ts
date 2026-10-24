import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { beforeEach, describe, expect, it } from "vitest"
import { parseClipClipboard } from "@zoeydaw/project-core/clip-clipboard"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { hydrateProject, projectActions, useProjectState } from "./index"
import type { MidiPattern, PatternClip } from "@zoeydaw/project-core/types"

beforeEach(() =>
  hydrateProject(
    JSON.stringify({
      version: 4,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
)

function clips(trackId: string) {
  return useProjectState.getState().document.tracks.find(track => track.id === trackId)?.clips ?? []
}

const sharedPattern: MidiPattern = {
  id: "clipboard-pattern",
  loopBars: 2,
  notes: [{ id: "shared-note", pitch: 64, startBeat: 0.5, lengthBeats: 1.5, velocity: 112 }],
}
const patternClip: PatternClip = {
  id: "clipboard-pattern-clip",
  kind: "pattern",
  patternId: sharedPattern.id,
  startBar: 2,
  lengthBars: 4,
  sourceOffsetBars: 0.25,
}

function hydratePatterns(patterns: MidiPattern[], patternClips: PatternClip[] = []) {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  hydrateProject(
    JSON.stringify({
      version: 4,
      document: {
        ...document,
        patterns,
        tracks: document.tracks.map(track => ({
          ...track,
          clips:
            track.id === "4-midi"
              ? patternClips
              : track.clips.filter(clip => clip.kind !== "pattern"),
        })),
      },
      workspace: createMockWorkspace(),
    })
  )
}

function copySharedPatterns() {
  hydratePatterns(
    [sharedPattern],
    [patternClip, { ...patternClip, id: "clipboard-pattern-second", startBar: 8 }]
  )
  const copied = projectActions.copyClips([patternClip.id, "clipboard-pattern-second"])
  if (!copied) throw new Error("Missing shared pattern clipboard")
  return copied
}

describe("clip clipboard edits", () => {
  it("pastes trimmed audio and MIDI with cloned IDs, lane offsets and one undo entry", () => {
    const audio = clips("3-audio")[0]
    const midi = clips("trager")[0]
    const trimmed = {
      ...audio,
      startBar: audio.startBar + 2,
      lengthBars: audio.lengthBars - 2,
      sourceOffsetBars: 2,
      ...(audio.kind === "audio" && { fadeInBars: 0, fadeOutBars: 0 }),
    }
    const payload = parseClipClipboard(
      JSON.stringify({
        kind: "clips",
        version: 1,
        items: [
          { trackOffset: 0, barOffset: 0, clip: trimmed },
          { trackOffset: 1, barOffset: 3, clip: { ...midi, startBar: 8 } },
        ],
      })
    )
    if (!payload) {
      throw new Error("Invalid clipboard fixture")
    }
    const beforeAudio = clips("3-audio").length
    const beforeMidi = clips("4-midi").length
    projectActions.beginEdit()
    expect(projectActions.pasteClips("3-audio", 21, payload)).toBe(true)
    projectActions.endEdit()
    expect(clips("3-audio")).toHaveLength(beforeAudio + 1)
    expect(clips("4-midi")).toHaveLength(beforeMidi + 1)
    expect(clips("3-audio").at(-1)).toMatchObject({ startBar: 21, sourceOffsetBars: 2 })
    expect(clips("4-midi").at(-1)).toMatchObject({ startBar: 24, kind: "midi" })
    expect(clips("3-audio").at(-1)?.id).not.toBe(audio.id)
    projectActions.undo()
    expect(clips("3-audio")).toHaveLength(beforeAudio)
    expect(clips("4-midi")).toHaveLength(beforeMidi)
  })
  it("rejects incompatible destination atomically and cuts only one document history entry", () => {
    const payload = projectActions.copyClips(["audio-1"])
    if (!payload) {
      throw new Error("Missing audio fixture")
    }
    const midiCount = clips("4-midi").length
    expect(projectActions.pasteClips("4-midi", 15, payload)).toBe(false)
    expect(clips("4-midi")).toHaveLength(midiCount)
    projectActions.beginEdit()
    projectActions.cutClips(["audio-1"])
    projectActions.endEdit()
    expect(clips("3-audio").some(clip => clip.id === "audio-1")).toBe(false)
    projectActions.undo()
    expect(clips("3-audio").some(clip => clip.id === "audio-1")).toBe(true)
  })
  it("imports cross-project notes and loops once with clips in one undoable document write", () => {
    const copied = copySharedPatterns()
    expect(copied.patterns).toEqual([sharedPattern])
    hydratePatterns([])
    const before = useProjectState.getState().document
    expect(projectActions.pasteClips("4-midi", 15)).toBe(true)
    const pasted = useProjectState.getState().document
    expect(pasted.patterns).toEqual([sharedPattern])
    expect(pasted.patterns[0]).not.toBe(copied.patterns[0])
    expect(clips("4-midi")).toMatchObject([
      { kind: "pattern", startBar: 15, patternId: sharedPattern.id, sourceOffsetBars: 0.25 },
      { kind: "pattern", startBar: 21, patternId: sharedPattern.id },
    ])
    expect(clips("4-midi")[0].id).not.toBe(patternClip.id)
    projectActions.undo()
    expect(useProjectState.getState().document).toEqual(before)
    expect(useProjectState.getState().session.canUndo).toBe(false)
    projectActions.redo()
    expect(useProjectState.getState().document).toEqual(pasted)
  })

  it("preserves same-document sharing and reuses same-ID identical content across projects", () => {
    const copied = copySharedPatterns()
    expect(projectActions.pasteClips("4-midi", 15, copied)).toBe(true)
    expect(useProjectState.getState().document.patterns).toEqual([sharedPattern])
    expect(
      clips("4-midi").every(clip => clip.kind === "pattern" && clip.patternId === sharedPattern.id)
    ).toBe(true)
    hydratePatterns([
      {
        notes: sharedPattern.notes.map(note => ({
          velocity: note.velocity,
          lengthBeats: note.lengthBeats,
          startBeat: note.startBeat,
          pitch: note.pitch,
          id: note.id,
        })),
        loopBars: sharedPattern.loopBars,
        id: sharedPattern.id,
      },
    ])
    expect(projectActions.pasteClips("4-midi", 15, copied)).toBe(true)
    expect(useProjectState.getState().document.patterns).toEqual([sharedPattern])
    expect(
      clips("4-midi").every(clip => clip.kind === "pattern" && clip.patternId === sharedPattern.id)
    ).toBe(true)
  })

  it.each(["notes", "loopBars"])(
    "remaps conflicting %s without overwriting destination music",
    conflict => {
      const copied = copySharedPatterns()
      const existing: MidiPattern = {
        ...sharedPattern,
        loopBars: conflict === "loopBars" ? 8 : sharedPattern.loopBars,
        notes: sharedPattern.notes.map(note => ({
          ...note,
          pitch: conflict === "notes" ? 72 : note.pitch,
        })),
      }
      hydratePatterns([existing], [{ ...patternClip, id: "destination-pattern-clip" }])
      const before = useProjectState.getState().document
      expect(projectActions.pasteClips("4-midi", 15, copied)).toBe(true)
      const patterns = useProjectState.getState().document.patterns
      expect(patterns).toHaveLength(2)
      expect(patterns[0]).toEqual(existing)
      const imported = patterns[1]
      expect(imported.id).not.toBe(sharedPattern.id)
      expect(imported).toEqual({ ...sharedPattern, id: imported.id })
      expect(clips("4-midi")[0]).toMatchObject({ patternId: existing.id })
      expect(clips("4-midi").slice(1)).toMatchObject([
        { patternId: imported.id, startBar: 15 },
        { patternId: imported.id, startBar: 21 },
      ])
      expect(copied.patterns).toEqual([sharedPattern])
      expect(
        copied.items.every(
          item => item.clip.kind === "pattern" && item.clip.patternId === sharedPattern.id
        )
      ).toBe(true)
      projectActions.undo()
      expect(useProjectState.getState().document).toEqual(before)
    }
  )

  it("does not import patterns when any placement or shared reference is invalid", () => {
    const copied = copySharedPatterns()
    hydratePatterns([])
    const before = useProjectState.getState()
    expect(projectActions.pasteClips("3-audio", 15, copied)).toBe(false)
    expect(
      projectActions.pasteClips("4-midi", 15, {
        ...copied,
        items: copied.items.map((item, index) => ({ ...item, trackOffset: index ? 10_000 : 0 })),
      })
    ).toBe(false)
    expect(projectActions.pasteClips("4-midi", 15, { ...copied, patterns: [] })).toBe(false)
    expect(useProjectState.getState().document).toBe(before.document)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })

  it("cancels imported patterns and clips together in an active edit", () => {
    const copied = copySharedPatterns()
    hydratePatterns([])
    const before = useProjectState.getState().document
    const token = projectActions.beginEdit()
    expect(projectActions.pasteClips("4-midi", 15, copied)).toBe(true)
    expect(useProjectState.getState().document.patterns).toEqual([sharedPattern])
    projectActions.cancelEdit(token)
    expect(useProjectState.getState().document).toEqual(before)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })
})
