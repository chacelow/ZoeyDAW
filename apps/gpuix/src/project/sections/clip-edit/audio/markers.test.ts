import { expect, test } from "bun:test"
import { defaultAudioClipSettings, getAudioClipSettings } from "@/project/model/audio-editor"
import { fadeControls } from "@/project/model/fades"
import { MIN_CLIP_LENGTH_BARS } from "@/project/model/grid"
import type { AudioClip } from "@/project/model/types"
import { markerKeyStep, markerPatch, markerPosition } from "./markers"
import type { MarkerKind } from "./markers"

const BPM = 120
const clip: AudioClip = {
  id: "markers",
  kind: "audio",
  samplePath: "sample.wav",
  startBar: 23,
  sourceOffsetBars: 1,
  lengthBars: 4,
  gainDb: -3,
  fadeInOffsetBars: 0.25,
  fadeInBars: 0.5,
  fadeOutOffsetBars: 0.25,
  fadeOutBars: 0.5,
  audioSettings: {
    ...defaultAudioClipSettings(BPM, { sourceOffsetBars: 1, lengthBars: 4 }),
    startMarkerBars: 1.25,
    endMarkerBars: 4.5,
    loopStartBars: 0.5,
    loopLengthBars: 3.5,
  },
}

function samples(seed: number) {
  let state = seed
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function edited(kind: MarkerKind, value: number): AudioClip {
  const patch = markerPatch(clip, kind, value, BPM)
  if (!patch) throw new Error(`Missing patch for ${kind}`)
  return { ...clip, ...patch }
}

test("each marker exposes its source position, including retained-offset fade handles", () => {
  expect(
    (["start", "end", "loopStart", "loopEnd", "fadeIn", "fadeOut"] as const).map(kind =>
      markerPosition(clip, kind, BPM)
    )
  ).toEqual([1.25, 4.5, 0.5, 4, 1.75, 4.25])
  expect(markerKeyStep(4, 4, false)).toBe(1 / 16)
  expect(markerKeyStep(4, 4, true)).toBe(1 / 64)
  expect(markerKeyStep(3, 8, false)).toBe(1 / 6)
})

test("fixed-seed edits bound each marker and leave placement, the other window, and fades independent", () => {
  const random = samples(0xace51)
  const kinds: readonly MarkerKind[] = ["start", "end", "loopStart", "loopEnd", "fadeIn", "fadeOut"]
  const original = getAudioClipSettings(clip, BPM)
  for (const kind of kinds) {
    for (let index = 0; index < 128; index++) {
      const value = random() * 24 - 10
      const result = edited(kind, value)
      const settings = getAudioClipSettings(result, BPM)
      expect(result.startBar).toBe(clip.startBar)
      expect(result.lengthBars).toBe(clip.lengthBars)
      expect(result.sourceOffsetBars).toBe(clip.sourceOffsetBars)
      expect(result.samplePath).toBe(clip.samplePath)
      if (kind === "start" || kind === "end") {
        expect(settings.loopStartBars).toBe(original.loopStartBars)
        expect(settings.loopLengthBars).toBe(original.loopLengthBars)
        expect(settings.startMarkerBars).toBeGreaterThanOrEqual(0)
        expect(settings.endMarkerBars - settings.startMarkerBars).toBeGreaterThanOrEqual(
          MIN_CLIP_LENGTH_BARS - 1e-12
        )
        expect(settings[kind === "start" ? "endMarkerBars" : "startMarkerBars"]).toBe(
          original[kind === "start" ? "endMarkerBars" : "startMarkerBars"]
        )
        expect(markerPosition(result, kind, BPM)).toBeCloseTo(
          kind === "start"
            ? Math.max(0, Math.min(original.endMarkerBars - MIN_CLIP_LENGTH_BARS, value))
            : Math.max(original.startMarkerBars + MIN_CLIP_LENGTH_BARS, value),
          10
        )
      } else if (kind === "loopStart" || kind === "loopEnd") {
        expect(settings.startMarkerBars).toBe(original.startMarkerBars)
        expect(settings.endMarkerBars).toBe(original.endMarkerBars)
        expect(settings.loopStartBars).toBeGreaterThanOrEqual(0)
        expect(settings.loopLengthBars).toBeGreaterThanOrEqual(MIN_CLIP_LENGTH_BARS - 1e-12)
        expect(settings.loopStartBars + settings.loopLengthBars).toBeGreaterThanOrEqual(
          settings.loopStartBars + MIN_CLIP_LENGTH_BARS - 1e-12
        )
        if (kind === "loopStart")
          expect(settings.loopStartBars + settings.loopLengthBars).toBeCloseTo(4, 10)
        else expect(settings.loopStartBars).toBe(original.loopStartBars)
        expect(markerPosition(result, kind, BPM)).toBeCloseTo(
          kind === "loopStart"
            ? Math.max(0, Math.min(4 - MIN_CLIP_LENGTH_BARS, value))
            : Math.max(original.loopStartBars + MIN_CLIP_LENGTH_BARS, value),
          10
        )
      } else {
        expect(settings).toEqual(original)
        expect(markerPosition(result, kind, BPM)).toBeCloseTo(
          (clip.sourceOffsetBars ?? 0) +
            (kind === "fadeIn"
              ? Math.max(0.25, Math.min(3.25, value - 1))
              : Math.min(3.75, Math.max(0.75, value - 1))),
          10
        )
      }
      if (kind !== "fadeIn") {
        expect(result.fadeInBars).toBe(clip.fadeInBars)
        expect(result.fadeInOffsetBars).toBe(clip.fadeInOffsetBars)
      }
      if (kind !== "fadeOut") {
        expect(result.fadeOutBars).toBe(clip.fadeOutBars)
        expect(result.fadeOutOffsetBars).toBe(clip.fadeOutOffsetBars)
      }
      const incoming = fadeControls(result, "in")
      const outgoing = fadeControls(result, "out")
      expect(incoming.start).toBeGreaterThanOrEqual(0)
      expect(incoming.end).toBeLessThanOrEqual(outgoing.start + 1e-12)
      expect(outgoing.end).toBeLessThanOrEqual(clip.lengthBars)
      expect(markerPosition(result, kind, BPM)).toBeGreaterThanOrEqual(
        kind === "fadeIn" || kind === "fadeOut" ? (clip.sourceOffsetBars ?? 0) : 0
      )
    }
  }
  expect(markerPosition(edited("start", -20), "start", BPM)).toBe(0)
  expect(markerPosition(edited("end", -20), "end", BPM)).toBeCloseTo(
    original.startMarkerBars + MIN_CLIP_LENGTH_BARS,
    10
  )
  expect(markerPosition(edited("loopStart", 20), "loopStart", BPM)).toBeCloseTo(
    4 - MIN_CLIP_LENGTH_BARS,
    10
  )
  expect(markerPosition(edited("loopEnd", -20), "loopEnd", BPM)).toBeCloseTo(
    original.loopStartBars + MIN_CLIP_LENGTH_BARS,
    10
  )
  expect(markerPosition(edited("fadeIn", 20), "fadeIn", BPM)).toBe(4.25)
  expect(markerPosition(edited("fadeOut", -20), "fadeOut", BPM)).toBe(1.75)
})
