import { describe, expect, it } from "vitest"
import { fadeControls } from "../fades"
import {
  audioSourceWindow,
  audioLoopWindow,
  defaultAudioClipSettings,
  getAudioClipSettings,
  isAudioClipSettings,
  parseAudioMusicalValue,
} from "./index"
import type { AudioClip } from "../types"

const clip: AudioClip = {
  id: "source-window",
  kind: "audio",
  startBar: 8,
  lengthBars: 8,
  sourceOffsetBars: 2,
  sourceId: null,
  gainDb: 0,
  fadeInOffsetBars: 0.25,
  fadeInBars: 2,
  fadeOutOffsetBars: 0.5,
  fadeOutBars: 1.5,
}

describe("audio clip settings", () => {
  it("derives omitted source tempo without authoring or mutating the clip", () => {
    expect(getAudioClipSettings(clip, 87.11)).toEqual({
      warp: true,
      warpMode: "beats",
      sourceBpm: 87.11,
      transpose: 0,
      detune: 0,
      reverse: false,
      loop: true,
      loopStartBars: 2,
      loopLengthBars: 8,
      startMarkerBars: 2,
      endMarkerBars: 10,
    })
    expect(clip.audioSettings).toBeUndefined()
    expect(defaultAudioClipSettings(Number.NaN, clip).sourceBpm).toBe(120)
  })
  it("validates complete finite settings and enum boundaries", () => {
    const settings = defaultAudioClipSettings(120, clip)
    expect(isAudioClipSettings(settings)).toBe(true)
    expect(
      isAudioClipSettings({ ...settings, warpMode: "complex-pro", transpose: -48, detune: 50 })
    ).toBe(true)
    for (const invalid of [
      null,
      {},
      { ...settings, warpMode: "unknown" },
      { ...settings, sourceBpm: Number.NaN },
      { ...settings, sourceBpm: Infinity },
      { ...settings, sourceBpm: 0 },
      { ...settings, sourceBpm: 1000 },
      { ...settings, transpose: 0.5 },
      { ...settings, transpose: 49 },
      { ...settings, detune: -51 },
      { ...settings, loop: 1 },
      { ...settings, loopStartBars: -1 },
      { ...settings, loopLengthBars: 0 },
      { ...settings, loopLengthBars: Infinity },
      { ...settings, loopStartBars: Number.MAX_VALUE, loopLengthBars: Number.MAX_VALUE },
      { ...settings, startMarkerBars: -1 },
      { ...settings, startMarkerBars: Infinity },
      { ...settings, endMarkerBars: 2 },
      { ...settings, endMarkerBars: 1 },
      { ...settings, endMarkerBars: Number.NaN },
    ]) {
      expect(isAudioClipSettings(invalid)).toBe(false)
    }
  })
  it("rejects extra metadata and arrays rather than passing unknown fields across persistence", () => {
    const settings = defaultAudioClipSettings(120, clip)
    expect(isAudioClipSettings({ ...settings, pluginState: { arbitrary: true } })).toBe(false)
    expect(isAudioClipSettings(Object.assign([], settings))).toBe(false)
    const missingMarkers = { ...settings }
    Reflect.deleteProperty(missingMarkers, "startMarkerBars")
    Reflect.deleteProperty(missingMarkers, "endMarkerBars")
    expect(isAudioClipSettings(missingMarkers)).toBe(false)
  })
  it("preserves authored metadata rather than deriving it again from tempo", () => {
    const audioSettings = { ...defaultAudioClipSettings(91, clip), reverse: true, loop: false }
    expect(getAudioClipSettings({ ...clip, audioSettings }, 150)).toBe(audioSettings)
  })
})

describe("independent playback and loop markers", () => {
  it("moves Start from 1.1.1 to 1.2.1 in 4/8 without resizing or slipping Arrangement content", () => {
    const sourceClip = { ...clip, sourceOffsetBars: 0, waveformPeaks: [0.2, 0.8, 0.3] }
    const settings = getAudioClipSettings(sourceClip, 120)
    const start = parseAudioMusicalValue("1.2.1", 4, 8, "position", 0, 100)
    expect(start).toBe(0.25)
    const patch = audioSourceWindow(sourceClip, start, settings.endMarkerBars, 120)
    expect(patch).not.toBeNull()
    const next = { ...sourceClip, ...patch }
    expect(next).toEqual({ ...sourceClip, audioSettings: { ...settings, startMarkerBars: 0.25 } })
    expect(next.startBar).toBe(8)
    expect(next.lengthBars).toBe(8)
    expect(next.sourceOffsetBars).toBe(0)
    expect(next.waveformPeaks).toBe(sourceClip.waveformPeaks)
    expect(fadeControls(next, "in")).toEqual(fadeControls(sourceClip, "in"))
    expect(fadeControls(next, "out")).toEqual(fadeControls(sourceClip, "out"))
    expect(next.audioSettings).toMatchObject({ loopStartBars: 0, loopLengthBars: 8 })
  })
  it("rejects invalid marker pairs atomically instead of clamping one endpoint and authoring the other", () => {
    const original = structuredClone(clip)
    for (const [start, end] of [
      [-1, 10],
      [2, 2],
      [5, 2],
      [Number.NaN, 10],
      [0, Infinity],
    ]) {
      expect(audioSourceWindow(clip, start, end, 120)).toBeNull()
      expect(clip).toEqual(original)
    }
  })
  it("keeps legal fractional markers and does not infer a media-file endpoint", () => {
    const patch = audioSourceWindow(clip, 0.00000001, 200, 87.11)
    expect(patch?.audioSettings).toMatchObject({ startMarkerBars: 0.00000001, endMarkerBars: 200 })
    expect({ ...clip, ...patch }).toMatchObject({ sourceOffsetBars: 2, lengthBars: 8, startBar: 8 })
  })
  it("edits loop position and length independently of playback markers, retained source and fades", () => {
    const settings = getAudioClipSettings(clip, 87.11)
    const audioSettings = audioLoopWindow(settings, 20, 4)
    const next = { ...clip, audioSettings }
    expect(next.sourceOffsetBars).toBe(2)
    expect(next.lengthBars).toBe(8)
    expect(fadeControls(next, "in")).toEqual(fadeControls(clip, "in"))
    expect(fadeControls(next, "out")).toEqual(fadeControls(clip, "out"))
    expect(next.audioSettings).toMatchObject({
      loopStartBars: 20,
      loopLengthBars: 4,
      startMarkerBars: 2,
      endMarkerBars: 10,
      sourceBpm: 87.11,
    })
    expect(clip.audioSettings).toBeUndefined()
  })
  it("preserves authored loop bounds when playback markers move", () => {
    const authored = {
      ...clip,
      audioSettings: audioLoopWindow(getAudioClipSettings(clip, 87.11), 30, 12),
    }
    expect(audioSourceWindow(authored, 0, 1, 120)?.audioSettings).toMatchObject({
      loopStartBars: 30,
      loopLengthBars: 12,
      startMarkerBars: 0,
      endMarkerBars: 1,
      sourceBpm: 87.11,
    })
  })
  it("clamps invalid loop edits safely but preserves fine positive lengths", () => {
    const settings = getAudioClipSettings(clip, 120)
    expect(audioLoopWindow(settings, -10, -5)).toMatchObject({
      loopStartBars: 0,
      loopLengthBars: Number.MIN_VALUE,
    })
    expect(audioLoopWindow(settings, 200, 0.00000001)).toMatchObject({
      loopStartBars: 200,
      loopLengthBars: 0.00000001,
    })
    expect(audioLoopWindow(settings, Number.NaN, Infinity)).toEqual(settings)
    expect(isAudioClipSettings(audioLoopWindow(settings, Number.MAX_VALUE, Number.MAX_VALUE))).toBe(
      true
    )
  })
})
