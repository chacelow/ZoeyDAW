import { getAudioClipSettings } from "./audio-editor"
import { fadeWindow } from "./fades"
import type { Clip } from "./types"

/**
Keep the retained source timeline when copying only the intersection of a time range.
*/
export function clipWindow(clip: Clip, startBar: number, endBar: number, bpm = 120): Clip | null {
  const start = Math.max(clip.startBar, startBar)
  const end = Math.min(clip.startBar + clip.lengthBars, endBar)
  if (start >= end) {
    return null
  }
  const offset = start - clip.startBar
  const length = end - start
  const common = {
    startBar: start,
    lengthBars: length,
    sourceOffsetBars: (clip.sourceOffsetBars ?? 0) + offset,
  }
  if (clip.kind !== "audio") {
    return clip.kind === "midi"
      ? { ...clip, ...common, loopBars: clip.loopBars ?? clip.lengthBars }
      : { ...clip, ...common }
  }
  const fades = fadeWindow(clip, offset, length)
  return {
    ...clip,
    waveformPeaks: undefined,
    audioSettings: getAudioClipSettings(clip, bpm),
    startBar: start,
    lengthBars: length,
    sourceOffsetBars: common.sourceOffsetBars,
    ...fades,
  }
}
