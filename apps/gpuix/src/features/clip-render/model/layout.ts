import type { ClipBase } from "../../../shared/model/types"

export const PX_PER_BAR = 24
export const MIN_CLIP_LENGTH_BARS = 0.5
/** Clamp bound for drag/resize math; the demo timeline never scrolls past it. */
export const TOTAL_BARS = 256

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export interface VisibleRange {
  startBar: number
  endBar: number
}

/** Whether a Clip's bar range intersects the visible window at all. */
export function isClipVisible(
  clip: Pick<ClipBase, "startBar" | "lengthBars">,
  range: VisibleRange
): boolean {
  return clip.startBar + clip.lengthBars >= range.startBar && clip.startBar <= range.endBar
}
