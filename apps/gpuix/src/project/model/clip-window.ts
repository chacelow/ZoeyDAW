import { fadeWindow } from "./fades"
import type { Clip } from "./types"

/**
Keep the retained source timeline when copying only the intersection of a time range.
*/
export function clipWindow(clip: Clip, startBar: number, endBar: number): Clip | null {
  const start = Math.max(clip.startBar, startBar)
  const end = Math.min(clip.startBar + clip.lengthBars, endBar)
  if (start >= end) {
    return null
  }
  const offset = start - clip.startBar
  const length = end - start
  const common = {
    ...clip,
    startBar: start,
    lengthBars: length,
    sourceOffsetBars: (clip.sourceOffsetBars ?? 0) + offset,
  }
  if (clip.kind !== "audio") {
    return common
  }
  const fades = fadeWindow(clip, offset, length)
  return {
    ...clip,
    waveformPeaks: undefined,
    startBar: start,
    lengthBars: length,
    sourceOffsetBars: common.sourceOffsetBars,
    ...fades,
  }
}
