import { getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { findMediaSource } from "@zoeydaw/project-core/media"
import type { PeakEnvelope, PeakEnvelopeFade } from "@zoeydaw/project-core/waveform"
import type { AudioClip, MediaSource } from "@zoeydaw/project-core/types"

/** Clip fades in the source-bar coordinates the drawn envelope uses. */
function clipFades(clip: AudioClip, origin: number, rate: number) {
  const fades: PeakEnvelopeFade[] = []
  const offset = origin
  const fadeIn = clip.fadeInBars ?? 0
  const fadeOut = clip.fadeOutBars ?? 0
  if (fadeIn > 0) {
    fades.push({
      start: offset + (clip.fadeInOffsetBars ?? 0) * rate,
      end: offset + ((clip.fadeInOffsetBars ?? 0) + fadeIn) * rate,
      position: clip.fadeInCurvePosition ?? 0.5,
      curve: clip.fadeInCurve ?? 0,
      direction: "in",
    })
  }
  if (fadeOut > 0) {
    const end = offset + (clip.lengthBars - (clip.fadeOutOffsetBars ?? 0)) * rate
    fades.push({
      start: end - fadeOut * rate,
      end,
      position: clip.fadeOutCurvePosition ?? 0.5,
      curve: clip.fadeOutCurve ?? 0,
      direction: "out",
    })
  }
  return fades
}

const EMPTY_PEAKS: readonly number[] = []

export function nativeClipWaveform(
  clip: AudioClip,
  media: readonly MediaSource[],
  bpm: number,
  numerator: number,
  denominator: number
): (PeakEnvelope & { origin: number; rate: number }) | undefined {
  const source = findMediaSource(media, clip.sourceId)
  if (!source) return undefined
  const settings = getAudioClipSettings(clip, bpm)
  const gain = 10 ** (clip.gainDb / 20)
  if (source.location.kind === "fixture") {
    return clip.waveformPeaks?.length
      ? {
          peaks: clip.waveformPeaks,
          start: 0,
          span: clip.lengthBars,
          origin: 0,
          rate: 1,
          gain,
          reverse: settings.reverse,
        }
      : undefined
  }
  const durationSeconds = source.frames / source.sampleRate
  if (durationSeconds <= 0) return undefined
  const secondsPerSourceBar = ((60 / settings.sourceBpm) * numerator * 4) / denominator
  return {
    peaks: EMPTY_PEAKS,
    start: 0,
    span: durationSeconds / secondsPerSourceBar,
    origin: Math.max(clip.sourceOffsetBars ?? 0, settings.startMarkerBars),
    rate: settings.warp ? 1 : settings.sourceBpm / bpm,
    reverse: settings.reverse,
    gain,
    fades: clipFades(
      clip,
      Math.max(clip.sourceOffsetBars ?? 0, settings.startMarkerBars),
      settings.warp ? 1 : settings.sourceBpm / bpm
    ),
    ...(settings.loop
      ? {
          loop: {
            start: settings.loopStartBars,
            end: settings.loopStartBars + settings.loopLengthBars,
          },
        }
      : { window: { start: settings.startMarkerBars, end: settings.endMarkerBars } }),
  }
}
