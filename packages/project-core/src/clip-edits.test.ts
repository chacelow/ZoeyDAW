import { describe, expect, it } from "vitest"
import { createTestDocument } from "./test-fixtures"
import { projectClipMove, projectClipResize } from "./clip-edits"
import type { ClipMoveIdentity } from "./clip-edits"
import type { Clip, Track } from "./types"

function stableIdentity(): ClipMoveIdentity {
  return {
    clip: sourceId => `copy:${sourceId}`,
    automation: key => `copy:${key}`,
  }
}

function audioTrack(tracks: readonly Track[]): Track {
  const track = tracks.find(candidate => candidate.id === "3-audio")
  if (!track) {
    throw new Error("Missing fixture audio track")
  }
  return track
}

function audioClip(tracks: readonly Track[]): Clip {
  const clip = audioTrack(tracks).clips.find(candidate => candidate.id === "audio-1")
  if (!clip) {
    throw new Error("Missing fixture audio clip")
  }
  return clip
}

describe("pure clip edit projections", () => {
  it("rejects incompatible multiselection before changing any track or allocating identities", () => {
    const source = createTestDocument().tracks
    const before = structuredClone(source)
    const identity: ClipMoveIdentity = {
      clip: () => {
        throw new Error("identity allocated before validation")
      },
      automation: () => {
        throw new Error("automation allocated before validation")
      },
    }
    expect(
      projectClipMove(source, ["trager-1", "audio-1"], "4-midi", 2, true, true, identity)
    ).toBeNull()
    expect(projectClipMove(source, ["audio-1"], "4-midi", 2, false, false, identity)).toBeNull()
    expect(source).toEqual(before)
  })

  it("keeps the clicked anchor first even when document track order differs", () => {
    const source = createTestDocument().tracks
    let nextId = 0
    const plan = projectClipMove(source, ["audio-1", "trager-1"], "3-audio", 2, true, false, {
      clip: id => `${id}:${++nextId}`,
      automation: id => id,
    })!
    const copiedAudio = audioTrack(plan.tracks).clips.find(clip => clip.id !== "audio-1")!
    expect(plan.selectedIds[0]).toBe(copiedAudio.id)
    expect(
      plan.selectedIds.map(
        id => plan.tracks.find(track => track.clips.some(clip => clip.id === id))?.kind
      )
    ).toEqual(["audio", "midi"])
    expect(copiedAudio.startBar).toBe(3)
  })

  it("clamps all selected clips and automation using the same effective left delta", () => {
    const source = createTestDocument().tracks
    const audio = audioClip(source)
    audio.startBar = 4
    audioTrack(source).automation[0].points = [
      { id: "head", bar: 4, value: 0.25 },
      { id: "end", bar: 20, value: 0.5 },
    ]
    const plan = projectClipMove(source, [audio.id], "3-audio", -8, false, true, stableIdentity())
    expect(plan).not.toBeNull()
    expect(plan?.deltaBars).toBe(-3)
    expect(audioClip(plan!.tracks).startBar).toBe(1)
    expect(audioTrack(plan!.tracks).automation[0].points).toEqual([
      { id: "head", bar: 1, value: 0.25 },
      { id: "end", bar: 20, value: 0.5 },
    ])
    expect(audioClip(source).startBar).toBe(4)
    expect(audioTrack(source).automation[0].points[0].bar).toBe(4)
  })

  it("projects a copy and its automation to stable IDs over repeated previews, retaining sources and half-open membership", () => {
    const source = createTestDocument().tracks
    const track = audioTrack(source)
    track.automation[0].points = [
      { id: "start", bar: 1, value: 0.25, curve: -0.2 },
      { id: "inside", bar: 9, value: 0.75 },
      { id: "end", bar: 17, value: 0.5 },
    ]
    const identity = stableIdentity()
    const first = projectClipMove(source, ["audio-1"], track.id, 2, true, true, identity)!
    const second = projectClipMove(source, ["audio-1"], track.id, 4, true, true, identity)!
    expect(first.selectedIds).toEqual(["copy:audio-1"])
    expect(second.selectedIds).toEqual(first.selectedIds)
    expect(audioTrack(first.tracks).clips.map(clip => [clip.id, clip.startBar])).toEqual([
      ["audio-1", 1],
      ["copy:audio-1", 3],
    ])
    const firstPoints = audioTrack(first.tracks).automation[0].points
    expect(firstPoints).toContainEqual({
      id: "copy:point:3-audio:3-audio-volume:start",
      bar: 3,
      value: 0.25,
      curve: -0.2,
    })
    expect(firstPoints).toContainEqual({
      id: "copy:point:3-audio:3-audio-volume:inside",
      bar: 11,
      value: 0.75,
    })
    expect(firstPoints).toContainEqual({ id: "end", bar: 17, value: 0.5 })
    expect(firstPoints).not.toContainEqual(
      expect.objectContaining({ id: "copy:point:3-audio:3-audio-volume:end" })
    )
    expect(audioTrack(second.tracks).automation[0].points.map(point => point.id)).toContain(
      "copy:point:3-audio:3-audio-volume:start"
    )
    expect(track.clips).toHaveLength(1)
    expect(track.automation[0].points).toHaveLength(3)
  })

  it("preserves multitrack lane offsets and selection IDs on a copied move", () => {
    const source = createTestDocument().tracks
    const second = source.find(track => track.id === "sidechain")
    if (!second) {
      throw new Error("Missing second MIDI lane")
    }
    second.clips.push({ id: "second", kind: "midi", startBar: 5, lengthBars: 2, notes: [] })
    const destination = structuredClone(second)
    destination.id = "last-midi"
    destination.clips = []
    source.push(destination)
    const plan = projectClipMove(
      source,
      ["trager-1", "second"],
      "4-midi",
      2,
      true,
      false,
      stableIdentity()
    )!
    expect(plan.selectedIds).toEqual(["copy:trager-1", "copy:second"])
    expect(plan.tracks.find(track => track.id === "4-midi")!.clips).toContainEqual(
      expect.objectContaining({ id: "copy:trager-1", startBar: 3 })
    )
    expect(plan.tracks.find(track => track.id === "last-midi")!.clips).toContainEqual(
      expect.objectContaining({ id: "copy:second", startBar: 7 })
    )
    expect(second.clips).toHaveLength(1)
  })

  it("creates stable destination lane identities and keeps automation untouched when disabled", () => {
    const source = createTestDocument().tracks
    const destination = structuredClone(audioTrack(source))
    destination.id = "other-audio"
    destination.clips = []
    destination.automation = []
    source.push(destination)
    const identity = stableIdentity()
    const first = projectClipMove(source, ["audio-1"], destination.id, 4, true, true, identity)!
    const second = projectClipMove(source, ["audio-1"], destination.id, 5, true, true, identity)!
    const lanes = first.tracks.find(track => track.id === destination.id)!.automation
    expect(lanes.map(lane => lane.target)).toEqual([
      { kind: "mixer", parameter: "volume" },
      { kind: "mixer", parameter: "pan" },
    ])
    expect(new Set(lanes.map(lane => lane.id)).size).toBe(lanes.length)
    expect(
      second.tracks.find(track => track.id === destination.id)!.automation.map(lane => lane.id)
    ).toEqual(lanes.map(lane => lane.id))
    const withoutAutomation = projectClipMove(
      source,
      ["audio-1"],
      destination.id,
      4,
      false,
      false,
      identity
    )!
    expect(withoutAutomation.tracks.find(track => track.id === destination.id)!.automation).toEqual(
      []
    )
    expect(withoutAutomation.tracks.find(track => track.id === "3-audio")!.automation).toEqual(
      audioTrack(source).automation
    )
  })

  it("keeps authored MIDI and pattern source cycles while resizing either edge", () => {
    const source = createTestDocument().tracks
    const midi = source.find(track => track.id === "trager")?.clips[0]
    if (!midi || midi.kind !== "midi") {
      throw new Error("Missing fixture MIDI clip")
    }
    const shifted = { ...midi, startBar: 9 }
    const extended = projectClipResize(shifted, "left", 7)
    expect(extended).toMatchObject({
      startBar: 7,
      lengthBars: 10,
      sourceOffsetBars: -2,
      loopBars: 8,
    })
    expect(projectClipResize(extended, "right", 33)).toMatchObject({ lengthBars: 26, loopBars: 8 })
    const pattern: Clip = {
      id: "pattern",
      kind: "pattern",
      patternId: "pattern-1",
      startBar: 8,
      lengthBars: 1,
    }
    expect(projectClipResize(pattern, "left", 5)).toMatchObject({
      startBar: 5,
      lengthBars: 4,
      sourceOffsetBars: -3,
      patternId: "pattern-1",
    })
  })

  it("clamps audio extension at its source start and keeps fade intervals within the visible clip", () => {
    const original = audioClip(createTestDocument().tracks)
    if (original.kind !== "audio") {
      throw new Error("Fixture clip must be audio")
    }
    const moved = { ...original, startBar: 10, sourceOffsetBars: 2, fadeInBars: 9, fadeOutBars: 9 }
    const extended = projectClipResize(moved, "left", -100)
    expect(extended).toMatchObject({ startBar: 8, lengthBars: 18, sourceOffsetBars: 0 })
    expect(extended).toHaveProperty("waveformPeaks", moved.waveformPeaks)
    expect(projectClipResize(moved, "left", 7)).toEqual(extended)
    expect(projectClipResize({ ...moved, sourceOffsetBars: 0 }, "left", 1).startBar).toBe(10)
    expect(projectClipResize(extended, "right", 9)).toMatchObject({
      lengthBars: 1,
      fadeInBars: 1,
      fadeOutBars: 0,
    })
    const trimmed = projectClipResize(original, "left", 1.2)
    expect(trimmed.sourceOffsetBars).toBeCloseTo(0.2)
    expect(projectClipResize({ ...trimmed, startBar: 2 }, "left", 1.8).sourceOffsetBars).toBe(0)
    expect(projectClipResize(original, "left", -100)).toBe(original)
    expect(projectClipResize(original, "right", NaN)).toBe(original)
  })
})
