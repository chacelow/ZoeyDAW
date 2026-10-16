import {
  audioLoopWindow,
  audioSourceWindow,
  getAudioClipSettings,
} from "@/project/model/audio-editor"
import { fadeControls } from "@/project/model/fades"
import { MIN_CLIP_LENGTH_BARS } from "@/project/model/grid"
import type { AudioClip } from "@/project/model/types"

export type MarkerKind = "start" | "end" | "loopStart" | "loopEnd" | "fadeIn" | "fadeOut"

export function markerPosition(clip: AudioClip, kind: MarkerKind, bpm: number): number {
  const settings = getAudioClipSettings(clip, bpm)
  const offset = clip.sourceOffsetBars ?? 0
  switch (kind) {
    case "start":
      return settings.startMarkerBars
    case "end":
      return settings.endMarkerBars
    case "loopStart":
      return settings.loopStartBars
    case "loopEnd":
      return settings.loopStartBars + settings.loopLengthBars
    case "fadeIn":
      return offset + fadeControls(clip, "in").end
    case "fadeOut":
      return offset + fadeControls(clip, "out").start
  }
}

export function markerPatch(
  baseline: AudioClip,
  kind: MarkerKind,
  value: number,
  bpm: number
): Partial<AudioClip> | null {
  const settings = getAudioClipSettings(baseline, bpm)
  if (kind === "loopStart" || kind === "loopEnd") {
    const loopEnd = settings.loopStartBars + settings.loopLengthBars
    const loopStart =
      kind === "loopStart"
        ? Math.max(0, Math.min(loopEnd - MIN_CLIP_LENGTH_BARS, value))
        : settings.loopStartBars
    const length =
      kind === "loopEnd" ? Math.max(MIN_CLIP_LENGTH_BARS, value - loopStart) : loopEnd - loopStart
    return { audioSettings: audioLoopWindow(settings, loopStart, length) }
  }
  if (kind === "start" || kind === "end") {
    return audioSourceWindow(
      baseline,
      kind === "start"
        ? Math.max(0, Math.min(settings.endMarkerBars - MIN_CLIP_LENGTH_BARS, value))
        : settings.startMarkerBars,
      kind === "end"
        ? Math.max(settings.startMarkerBars + MIN_CLIP_LENGTH_BARS, value)
        : settings.endMarkerBars,
      bpm
    )
  }
  const offset = baseline.sourceOffsetBars ?? 0
  const inFade = fadeControls(baseline, "in")
  const outFade = fadeControls(baseline, "out")
  return kind === "fadeIn"
    ? { fadeInBars: Math.max(0, Math.min(outFade.start, value - offset) - inFade.start) }
    : { fadeOutBars: Math.max(0, outFade.end - Math.max(inFade.end, value - offset)) }
}

export function markerKeyStep(numerator: number, denominator: number, fine: boolean): number {
  return denominator / (numerator * 16) / (fine ? 4 : 1)
}
