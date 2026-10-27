import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  mockMeterLevels,
  createMockDocument,
  createMockWorkspace,
  mockWaveformPeaks,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import {
  hydrateProject,
  projectActions,
  serializeProject,
  startProjectRuntime,
  useProjectState,
} from "../adapters"
import { withWaveformPreview } from "@zoeydaw/project-runtime/visuals"
import { clipLabel } from "@zoeydaw/project-core/clip-label"
import { parseProject, stringifyProject } from "@zoeydaw/project-core/persistence"
import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import { getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import type { MediaSource } from "@zoeydaw/project-core/media"
import type { ClipClipboard } from "@zoeydaw/project-core/clip-clipboard"
import { configureProjectBackend } from "../adapters/context"

let releaseRuntime: (() => void) | undefined
afterEach(() => {
  releaseRuntime?.()
  releaseRuntime = undefined
  vi.useRealTimers()
})

beforeEach(() => {
  configureProjectBackend(createMockProjectBackend)
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
})

const findClip = (id: string) =>
  useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(clip => clip.id === id)!

describe("clip source boundaries", () => {
  it("rejects missing media references without replacing the current document", () => {
    const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
    document.media = []
    const before = serializeProject()
    const raw = JSON.stringify({ version: 3, document, workspace: createMockWorkspace() })
    expect(() => parseProject(raw)).toThrow()
    expect(() => hydrateProject(raw)).toThrow()
    expect(serializeProject()).toBe(before)
  })

  it("retains distinct same-named media and projects only used stable IDs", () => {
    const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
    const source: MediaSource = {
      id: "recording-a",
      name: "take.wav",
      sha256: "a".repeat(64),
      byteLength: 4096,
      sampleRate: 48000,
      frames: 1024,
      channels: 2,
      location: { kind: "external", path: "/recordings/first/take.wav" },
    }
    document.media = [
      source,
      {
        ...source,
        id: "recording-b",
        location: { kind: "project", path: "media/11111111-1111-4111-8111-111111111111.wav" },
      },
      { ...source, id: "unused", location: { kind: "external", path: "/unused/take.wav" } },
    ]
    const audio = document.tracks.find(track => track.id === "3-audio")!
    const clip = audio.clips[0]
    if (clip.kind !== "audio") throw new Error("Expected audio fixture")
    audio.clips = [
      { ...clip, sourceId: "recording-a" },
      {
        ...clip,
        id: "second-take",
        startBar: 20,
        sourceId: "recording-b",
      },
    ]
    const restored = parseProject(stringifyProject(document, createMockWorkspace())).document
    expect(restored.media).toEqual(document.media)
    source.location = { kind: "external", path: "/moved/take.wav" }
    const moved = parseProject(stringifyProject(document, createMockWorkspace())).document
    expect(moved.tracks.find(track => track.id === audio.id)?.clips[0]).toMatchObject({
      sourceId: "recording-a",
    })
  })

  it("validates real media fingerprints and metadata at the snapshot boundary", () => {
    const source: MediaSource = {
      id: "real",
      name: "take.wav",
      sha256: "a".repeat(64),
      byteLength: 4096,
      sampleRate: 48000,
      frames: 1024,
      channels: 2,
      location: { kind: "external", path: "/recordings/take.wav" },
    }
    const invalid: Partial<MediaSource>[] = [
      { sha256: "" },
      { sha256: "x".repeat(64) },
      { byteLength: -1 },
      { byteLength: Number.MAX_SAFE_INTEGER + 1 },
      { frames: 0.5 },
      { frames: Number.MAX_SAFE_INTEGER + 1 },
      { sampleRate: 0 },
      { channels: 0 },
      { location: { kind: "external", path: "" } },
      { location: { kind: "external", path: "relative/take.wav" } },
      { location: { kind: "project", path: "media/../take.wav" } },
      { location: { kind: "project", path: "/media/11111111-1111-4111-8111-111111111111.wav" } },
      {
        location: { kind: "project", path: "media/11111111-1111-4111-8111-111111111111.wav/extra" },
      },
      { location: { kind: "external", path: "/take\0.wav" } },
    ]
    for (const patch of invalid) {
      const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
      document.media.push({ ...source, ...patch })
      expect(() =>
        parseProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
      ).toThrow()
    }
    const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
    document.media.push(source)
    expect(
      parseProject(stringifyProject(document, createMockWorkspace())).document.media
    ).toContainEqual(source)
    document.media.push({ ...source })
    expect(() => stringifyProject(document, createMockWorkspace())).toThrow()
  })

  it("resolves opaque fixture identities for labels and waveform regeneration, never paths", () => {
    const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
    const clip = document.tracks.find(track => track.id === "3-audio")!.clips[0]
    if (clip.kind !== "audio") throw new Error("Expected audio fixture")
    const source = document.media[0]
    source.id = "opaque-fixture-id"
    source.name = "Named source.wav"
    const authored = { ...clip, sourceId: source.id }
    expect(clipLabel(authored, document.media)).toBe("Named source.wav")
    expect(withWaveformPreview(authored, document.media).waveformPeaks).toEqual(clip.waveformPeaks)
    const real: MediaSource = {
      ...source,
      sha256: "a".repeat(64),
      byteLength: 16,
      sampleRate: 48000,
      frames: 4,
      channels: 2,
      location: { kind: "external", path: "mock://kick.wav" },
    }
    expect(withWaveformPreview(authored, [real]).waveformPeaks).toBeUndefined()
  })

  it("shares one source identity through split and duplicate, including persistence", () => {
    const media = structuredClone(useProjectState.getState().document.media)
    projectActions.splitClips(["audio-1"], 5)
    const split = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!.clips
    projectActions.moveClips(
      split.map(clip => clip.id),
      "3-audio",
      20,
      true
    )
    hydrateProject(serializeProject())
    const document = useProjectState.getState().document
    const clips = document.tracks.find(track => track.id === "3-audio")!.clips
    expect(clips).toHaveLength(4)
    expect(new Set(clips.map(clip => (clip.kind === "audio" ? clip.sourceId : null)))).toEqual(
      new Set(["mock://kick.wav"])
    )
    expect(document.media).toEqual(media)
  })

  it("keeps split audio warp-capable even when original import had unknown tempo", () => {
    const original = findClip("audio-1")
    if (original.kind !== "audio") throw new Error("Expected audio fixture")
    projectActions.updateClip("audio-1", {
      sourceTempo: "unknown",
      audioSettings: { ...getAudioClipSettings(original, 120), warp: false, sourceBpm: 120 },
    })
    projectActions.splitClips(["audio-1"], 5)
    const pieces = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!.clips
    expect(pieces.length).toBeGreaterThanOrEqual(2)
    for (const piece of pieces) {
      if (piece.kind !== "audio") continue
      expect(piece.sourceTempo).toBeUndefined()
      // Functional Warp action can be enabled on the split piece
      projectActions.updateClip(piece.id, {
        audioSettings: { ...getAudioClipSettings(piece, 120), warp: true },
      })
      const updated = findClip(piece.id)
      expect(updated.kind === "audio" && updated.audioSettings?.warp).toBe(true)
    }
  })

  it("rejects clipboard sources absent from the destination without partial edits", () => {
    const clip = findClip("audio-1")
    if (clip.kind !== "audio") throw new Error("Expected audio fixture")
    const payload: ClipClipboard = {
      kind: "clips",
      version: 1,
      patterns: [],
      items: [
        { trackOffset: 0, barOffset: 0, clip },
        {
          trackOffset: 0,
          barOffset: 20,
          clip: { ...clip, id: "foreign-clip", sourceId: "foreign-media" },
        },
      ],
    }
    const before = serializeProject()
    expect(projectActions.pasteClips("3-audio", 30, payload)).toBe(false)
    expect(serializeProject()).toBe(before)
    projectActions.updateClip(clip.id, { sourceId: "foreign-media" })
    expect(serializeProject()).toBe(before)
  })

  it.each([1, 2])(
    "migrates version %s mock paths but refuses unauthenticated real paths",
    version => {
      const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
      const { media: _media, ...legacy } = document
      const snapshot = {
        version,
        document: {
          ...legacy,
          tracks: legacy.tracks.map(track => ({
            ...track,
            clips: track.clips.map(clip => {
              if (clip.kind !== "audio") return clip
              const { sourceId, ...authored } = clip
              return { ...authored, samplePath: sourceId || "" }
            }),
          })),
        },
        workspace: { ...createMockWorkspace(), gridBars: 1 },
      }
      const restored = parseProject(JSON.stringify(snapshot)).document
      expect(restored.media).toEqual([document.media[0]])
      expect(restored.tracks.find(track => track.id === "3-audio")!.clips[0]).toMatchObject({
        sourceId: "mock://kick.wav",
      })
      const raw = JSON.parse(JSON.stringify(snapshot))
      raw.document.tracks.find(
        (track: { id: string }) => track.id === "3-audio"
      ).clips[0].samplePath = "/missing/recording.wav"
      expect(() => parseProject(JSON.stringify(raw))).toThrow("must be imported")
      raw.document.tracks.find(
        (track: { id: string }) => track.id === "3-audio"
      ).clips[0].samplePath = ""
      const empty = parseProject(JSON.stringify(raw)).document
      expect(empty.media).toEqual([])
      expect(empty.tracks.find(track => track.id === "3-audio")!.clips[0]).toMatchObject({
        sourceId: null,
      })
    }
  )

  it("keeps source-zero audio at its boundary through resize and snapshot roundtrip", () => {
    projectActions.moveClips(["audio-1"], "3-audio", 9)
    projectActions.resizeClip("audio-1", "left", 8)
    expect(findClip("audio-1")).toMatchObject({
      startBar: 10,
      lengthBars: 16,
    })
    const saved = serializeProject()
    hydrateProject(saved)
    expect(findClip("audio-1").startBar).toBe(10)
    projectActions.resizeClip("audio-1", "right", 80)
    expect(findClip("audio-1").lengthBars).toBe(70)
  })
  it.each<[string, number]>([
    ["mock://kick.wav", 16],
    ["mock://untitled.wav", 1],
  ])("repeats %s waveform on its own source cycle", (path, cycle) => {
    const peaks = mockWaveformPeaks(path, -cycle / 4, cycle * 2)!
    const half = peaks.length / 2
    for (let index = 0; index < half; index++) {
      expect(peaks[index]).toBeCloseTo(peaks[index + half])
    }
  })
  it("keeps authored MIDI and Pattern cycles while extending from either edge", () => {
    projectActions.moveClips(["trager-1"], "trager", 8)
    projectActions.resizeClip("trager-1", "left", 7)
    expect(findClip("trager-1")).toMatchObject({
      startBar: 7,
      lengthBars: 10,
      sourceOffsetBars: -2,
      loopBars: 8,
    })
    projectActions.resizeClip("trager-1", "right", 33)
    expect(findClip("trager-1")).toMatchObject({ lengthBars: 26, loopBars: 8 })

    projectActions.createClip("4-midi", "pattern", 8, 1)
    const pattern = useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!
      .clips[0]
    projectActions.resizeClip(pattern.id, "left", 5)
    projectActions.resizeClip(pattern.id, "right", 20)
    expect(findClip(pattern.id)).toMatchObject({
      startBar: 5,
      lengthBars: 15,
      sourceOffsetBars: -3,
      patternId: pattern.kind === "pattern" ? pattern.patternId : "",
    })
    expect(() => hydrateProject(serializeProject())).not.toThrow()
  })

  it("defaults newly created MIDI cycles and rejects nonpositive saved cycles", () => {
    projectActions.createClip("4-midi", "midi", 3, 2)
    const clip = useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!
      .clips[0]
    expect(clip).toMatchObject({ kind: "midi", loopBars: 2 })
    projectActions.resizeClip(clip.id, "right", 12)
    expect(findClip(clip.id)).toMatchObject({ lengthBars: 9, loopBars: 2 })
    const saved = JSON.parse(serializeProject())
    saved.document.tracks.find((track: { id: string }) => track.id === "4-midi").clips[0].loopBars =
      0
    expect(() => hydrateProject(JSON.stringify(saved))).toThrow()
    expect(findClip(clip.id).lengthBars).toBe(9)
  })

  it("preserves MIDI notes when trimming and re-extending the same clip", () => {
    const before = structuredClone(findClip("trager-1"))
    projectActions.resizeClip("trager-1", "left", 2)
    expect(findClip("trager-1")).toMatchObject({
      sourceOffsetBars: 1,
      notes: before.kind === "midi" ? before.notes : [],
    })
    projectActions.resizeClip("trager-1", "left", 1)
    expect(findClip("trager-1")).toMatchObject({
      startBar: 1,
      lengthBars: 8,
      sourceOffsetBars: 0,
      notes: before.kind === "midi" ? before.notes : [],
    })
  })

  it("retains shared Pattern notes through trim, re-extension and split", () => {
    projectActions.createClip("4-midi", "pattern", 1, 4)
    const clip = useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!
      .clips[0]
    const notes = [0, 1, 2, 3].map(startBeat => ({
      pitch: 60,
      velocity: 100,
      startBeat,
      lengthBeats: 0.25,
    }))
    projectActions.updateClip(clip.id, { notes })
    projectActions.resizeClip(clip.id, "left", 2)
    expect(findClip(clip.id)).toMatchObject({ sourceOffsetBars: 1 })
    projectActions.resizeClip(clip.id, "left", 1)
    projectActions.splitClips([clip.id], 3)
    const pieces = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "4-midi")!.clips
    expect(
      pieces.map(piece =>
        piece.kind === "pattern"
          ? resolveMidiClip(piece, useProjectState.getState().document.patterns).notes
          : []
      )
    ).toEqual([notes, notes])
    expect(pieces[1].sourceOffsetBars).toBe(2)
  })

  it("records and meters the visible position in a trimmed MIDI source", () => {
    vi.useFakeTimers({ toFake: ["performance", "setInterval", "clearInterval"] })
    releaseRuntime = startProjectRuntime()
    projectActions.updateClip("trager-1", { notes: [] })
    projectActions.resizeClip("trager-1", "left", 2)
    projectActions.setPosition({ bar: 2, beat: 1, sixteenth: 1 })
    projectActions.togglePlay()
    projectActions.toggleRecording()
    projectActions.noteOn(72)
    projectActions.noteOff(72)
    expect(findClip("trager-1")).toMatchObject({
      notes: [
        { id: expect.any(String), pitch: 72, startBeat: 4, lengthBeats: 0.25, velocity: 100 },
      ],
    })
    expect(mockMeterLevels(useProjectState.getState(), 2, 1000).trager[0]).toBeGreaterThan(-60)
  })

  it("meters MIDI notes again on later authored cycles, including left extension", () => {
    projectActions.moveClips(["trager-1"], "trager", 8)
    projectActions.resizeClip("trager-1", "left", 7)
    projectActions.resizeClip("trager-1", "right", 25)
    projectActions.togglePlay()
    const state = useProjectState.getState()
    expect(mockMeterLevels(state, 9, 1000).trager[0]).toBeGreaterThan(-60)
    expect(mockMeterLevels(state, 17, 1000).trager[0]).toBeGreaterThan(-60)
    expect(mockMeterLevels(state, 10.75, 1000).trager[0]).toBe(-60)
  })

  it("meters shared Pattern notes in the portion extended left of their source", () => {
    projectActions.createClip("4-midi", "pattern", 8, 1)
    const pattern = useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!
      .clips[0]
    projectActions.updateClip(pattern.id, {
      notes: [{ pitch: 60, velocity: 100, startBeat: 0, lengthBeats: 0.25 }],
      loopBars: 0.25,
    })
    projectActions.resizeClip(pattern.id, "left", 7)
    projectActions.togglePlay()
    const state = useProjectState.getState()
    expect(mockMeterLevels(state, 7.25, 1000)["4-midi"][0]).toBeGreaterThan(-60)
    expect(mockMeterLevels(state, 7.3125, 1000)["4-midi"][0]).toBe(-60)
  })

  it("keeps decimal trim/move/re-extension offsets nonnegative", () => {
    projectActions.resizeClip("audio-1", "left", 1.2)
    projectActions.moveClips(["audio-1"], "3-audio", 1)
    projectActions.resizeClip("audio-1", "left", 2)
    const clip = findClip("audio-1")
    expect(clip.sourceOffsetBars ?? 0).toBeGreaterThanOrEqual(0)
    expect(clip.startBar).toBeCloseTo(2)
    const saved = JSON.parse(serializeProject())
    expect(
      saved.document.tracks.find((track: { id: string }) => track.id === "3-audio").clips[0]
        .startBar
    ).toBeCloseTo(2)
  })

  it.each([1.125, 16.75])("keeps fades within both audio pieces when splitting at %s", bar => {
    projectActions.splitClips(["audio-1"], bar)
    const pieces = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!.clips
    for (const piece of pieces) {
      if (piece.kind !== "audio") {
        continue
      }
      expect(
        (piece.fadeInOffsetBars ?? 0) +
          (piece.fadeInBars ?? 0) +
          (piece.fadeOutOffsetBars ?? 0) +
          (piece.fadeOutBars ?? 0)
      ).toBeLessThanOrEqual(piece.lengthBars + Number.EPSILON * Math.max(1, piece.lengthBars))
    }
    const saved = JSON.parse(serializeProject())
    expect(
      saved.document.tracks
        .find((track: { id: string }) => track.id === "3-audio")
        .clips.map((clip: { startBar: number }) => clip.startBar)
    ).toEqual([1, bar])
  })
  it("preserves fade offsets while the left edge clamps and the right edge extends", () => {
    projectActions.updateClip("audio-1", {
      fadeInOffsetBars: 1,
      fadeInBars: 2,
      fadeOutOffsetBars: 2,
      fadeOutBars: 3,
    })
    projectActions.moveClips(["audio-1"], "3-audio", 9)
    projectActions.resizeClip("audio-1", "left", 8)
    projectActions.resizeClip("audio-1", "right", 50)
    expect(findClip("audio-1")).toMatchObject({
      startBar: 10,
      lengthBars: 40,
      fadeInOffsetBars: 1,
      fadeInBars: 2,
      fadeOutOffsetBars: 2,
      fadeOutBars: 3,
    })
  })

  it("keeps fade offsets pinned to their respective edges during resize, then reprojects splits", () => {
    projectActions.updateClip("audio-1", {
      fadeInOffsetBars: 1,
      fadeInBars: 3,
      fadeOutOffsetBars: 2,
      fadeOutBars: 3,
    })
    const original = structuredClone(findClip("audio-1"))
    projectActions.resizeClip("audio-1", "left", 3)
    expect(findClip("audio-1")).toMatchObject({
      fadeInOffsetBars: 1,
      fadeInBars: 3,
      fadeOutOffsetBars: 2,
      fadeOutBars: 3,
    })
    projectActions.resizeClip("audio-1", "right", 7)
    expect(findClip("audio-1")).toMatchObject({
      fadeInOffsetBars: 1,
      fadeInBars: 1,
      fadeOutOffsetBars: 2,
      fadeOutBars: 0,
    })
    projectActions.undo()
    projectActions.undo()
    expect(findClip("audio-1")).toEqual(original)
    projectActions.splitClips(["audio-1"], 5)
    const pieces = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")?.clips
    expect(pieces).toHaveLength(2)
    expect(pieces?.[0]).toMatchObject({ fadeInOffsetBars: 1, fadeInBars: 3, fadeOutBars: 0 })
    expect(pieces?.[1]).toMatchObject({ fadeInBars: 0, fadeOutOffsetBars: 2, fadeOutBars: 3 })
    expect(() => serializeProject()).not.toThrow()
  })
})
