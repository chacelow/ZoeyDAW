import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test"
import {
  hydrateProject,
  projectActions,
  serializeProject,
  startProjectRuntime,
  useProjectState,
} from "../adapters"
import { createMockDocument, createMockWorkspace, mockWaveformPeaks } from "../adapters/fixtures"

let releaseRuntime: (() => void) | undefined
afterEach(() => {
  releaseRuntime?.()
  releaseRuntime = undefined
  jest.useRealTimers()
})

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

const findClip = (id: string) =>
  useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(clip => clip.id === id)!

describe("clip source boundaries", () => {
  it("loops audio when extended left past its source and preserves signed offsets in snapshots", () => {
    projectActions.moveClips(["audio-1"], "3-audio", 9)
    projectActions.resizeClip("audio-1", "left", 8)
    expect(findClip("audio-1")).toMatchObject({
      startBar: 8,
      lengthBars: 18,
      sourceOffsetBars: -2,
    })
    const saved = serializeProject()
    hydrateProject(saved)
    expect(findClip("audio-1")).toMatchObject({ startBar: 8, sourceOffsetBars: -2 })
    projectActions.resizeClip("audio-1", "right", 80)
    expect(findClip("audio-1").lengthBars).toBe(72)
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
      steps: pattern.kind === "pattern" ? pattern.steps : [],
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

  it("retains pattern steps through trim, re-extension and split", () => {
    projectActions.createClip("4-midi", "pattern", 1, 4)
    const clip = useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!
      .clips[0]
    const steps = Array.from({ length: 16 }, (_, index) => index % 4 === 0)
    projectActions.updateClip(clip.id, { steps })
    projectActions.resizeClip(clip.id, "left", 2)
    expect(findClip(clip.id)).toMatchObject({ sourceOffsetBars: 1, steps })
    projectActions.resizeClip(clip.id, "left", 1)
    projectActions.splitClips([clip.id], 3)
    const pieces = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "4-midi")!.clips
    expect(pieces.map(piece => (piece.kind === "pattern" ? piece.steps : []))).toEqual([
      steps,
      steps,
    ])
    expect(pieces[1].sourceOffsetBars).toBe(2)
  })

  it("records the visible position in a trimmed MIDI source", () => {
    jest.useFakeTimers()
    releaseRuntime = startProjectRuntime()
    projectActions.updateClip("trager-1", { notes: [] })
    projectActions.resizeClip("trager-1", "left", 2)
    projectActions.setPosition({ bar: 2, beat: 1, sixteenth: 1 })
    projectActions.togglePlay()
    projectActions.toggleRecording()
    projectActions.noteOn(72)
    projectActions.noteOff(72)
    expect(structuredClone(findClip("trager-1"))).toMatchObject({
      notes: [
        { id: expect.any(String), pitch: 72, startBeat: 4, lengthBeats: 0.25, velocity: 100 },
      ],
    })
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
  it("preserves fade offsets while extending both edges beyond the authored source", () => {
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
      startBar: 8,
      lengthBars: 42,
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
