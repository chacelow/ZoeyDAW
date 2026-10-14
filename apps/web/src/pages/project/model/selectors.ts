import { MIN_TIMELINE_BARS } from "./types"
import type { DocumentState } from "./types"

/**
Round the last occupied bar up with a full 16-bar region for editing room.
*/
export function growTimelineBars(baseBars: number, throughBar: number): number {
  if (!Number.isFinite(throughBar) || throughBar <= 1) {
    return Math.max(MIN_TIMELINE_BARS, baseBars)
  }
  const rounded = Math.ceil((throughBar - 1) / 16) * 16 + 16
  return Math.max(MIN_TIMELINE_BARS, baseBars, Number.isFinite(rounded) ? rounded : throughBar)
}

export function timelineBars(document: DocumentState): number {
  let throughBar = document.transport.loop.endBar
  for (const marker of document.markers) {
    throughBar = Math.max(throughBar, marker.bar)
  }
  for (const track of document.tracks) {
    for (const clip of track.clips) {
      throughBar = Math.max(throughBar, clip.startBar + clip.lengthBars)
    }
    for (const lane of track.automation) {
      for (const point of lane.points) {
        throughBar = Math.max(throughBar, point.bar)
      }
    }
  }
  return growTimelineBars(MIN_TIMELINE_BARS, throughBar)
}
