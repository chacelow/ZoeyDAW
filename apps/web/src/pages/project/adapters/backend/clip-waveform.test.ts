import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { expect, it } from "vitest"
import { createMockDocument } from "@zoeydaw/project-runtime/testing"
import { getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { nativeClipWaveform } from "./clip-waveform"
import { envelopeFadeGain, samplePeakEnvelope } from "@zoeydaw/project-core/waveform"
import type { MediaSource } from "@zoeydaw/project-core/media"

it("projects whole-file reverse and wraps source positions before a nonzero loop start", () => {
  const clip = createMockDocument(DEFAULT_TRACK_HEIGHT)
    .tracks.flatMap(track => track.clips)
    .find(item => item.kind === "audio")
  if (!clip || clip.kind !== "audio") throw new Error("Missing audio fixture")
  const source = {
    id: "source",
    name: "take.wav",
    sha256: "a".repeat(64),
    byteLength: 16,
    frames: 384000,
    sampleRate: 48000,
    channels: 1,
    location: { kind: "external", path: "/waveform-test/take.wav" },
  } satisfies MediaSource
  const peaks = [0.1, 0.2, 0.3, 0.4]
  const audio = {
    ...clip,
    sourceId: source.id,
    sourceOffsetBars: 0,
    lengthBars: 1,
    audioSettings: {
      ...getAudioClipSettings(clip, 120),
      sourceBpm: 120,
      loop: false,
      reverse: true,
      startMarkerBars: 0,
      endMarkerBars: 1,
    },
  }
  const reversed = nativeClipWaveform(audio, [source], 120, 4, 4)
  if (!reversed) throw new Error("Missing source envelope")
  expect(samplePeakEnvelope({ ...reversed, peaks }, reversed.origin, reversed.origin + 0.5)).toBe(
    0.4
  )
  audio.audioSettings = {
    ...audio.audioSettings,
    reverse: false,
    loop: true,
    loopStartBars: 2,
    loopLengthBars: 1,
  }
  const looped = nativeClipWaveform(audio, [source], 120, 4, 4)
  if (!looped) throw new Error("Missing loop envelope")
  expect(samplePeakEnvelope({ ...looped, peaks }, looped.origin, looped.origin + 0.5)).toBe(0.3)
  audio.audioSettings = { ...audio.audioSettings, loop: false, warp: false, sourceBpm: 60 }
  const originalSpeed = nativeClipWaveform(audio, [source], 120, 4, 4)
  expect(originalSpeed?.rate).toBe(0.5)
  expect(originalSpeed?.span).toBe(2)
  audio.audioSettings = { ...audio.audioSettings, warp: true }
  expect(nativeClipWaveform(audio, [source], 120, 4, 4)?.rate).toBe(1)
})

it("maps clip-local fades through the original-speed source rate", () => {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const clip = document.tracks.flatMap(track => track.clips).find(item => item.kind === "audio")
  if (!clip || clip.kind !== "audio") throw new Error("Missing audio fixture")
  const source: MediaSource = {
    id: "fade-source",
    name: "voice.wav",
    sha256: "a".repeat(64),
    byteLength: 384000,
    frames: 384000,
    sampleRate: 48000,
    channels: 1,
    location: { kind: "external", path: "/voice.wav" },
  }
  const audio = {
    ...clip,
    sourceId: source.id,
    sourceOffsetBars: 0,
    lengthBars: 2,
    fadeInBars: 0.5,
    fadeInOffsetBars: 0,
    fadeInCurve: 0,
    fadeInCurvePosition: 0.5,
    fadeOutBars: 0,
    audioSettings: {
      ...getAudioClipSettings(clip, 120),
      sourceBpm: 120,
      warp: false,
      startMarkerBars: 0,
      endMarkerBars: 4,
    },
  }
  const envelope = nativeClipWaveform(audio, [source], 60, 4, 4)
  if (!envelope) throw new Error("Missing envelope")
  expect(envelope.rate).toBe(2)
  expect(envelopeFadeGain(envelope, 0.25 * envelope.rate)).toBeCloseTo(0.5)
})
