import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { visibleTracks } from "@/project/model/types"
import type { Track } from "@/project/model/types"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  maxTrackScrollY,
  pinnedTrackHeight,
} from "../layout"
import type { ArrangementGeometry, ArrangementViewport } from "../scene"
import { clampScrollX } from "./zoom"

export function edgeScroll({
  viewport,
  bars,
  tracks,
  pointer,
  axis,
  edge,
  elapsed,
  policy,
  geometry,
}: {
  viewport: ArrangementViewport
  bars: number
  tracks: readonly Track[]
  pointer: { x: number; y: number }
  axis: "horizontal" | "both"
  edge: number
  elapsed: number
  policy: ArrangementPolicy["autoScroll"]
  geometry: ArrangementGeometry
}): { scrollX: number; scrollY: number } {
  const { width, height, pxPerBar, scrollX, scrollY } = viewport
  const { x, y } = pointer
  const xSpeed =
    x < edge
      ? -Math.min(1, (edge - x) / edge)
      : x > width - edge
        ? Math.min(1, (x - width + edge) / edge)
        : 0
  const visible = visibleTracks([...tracks])
  const bottom =
    arrangementBodyBottom(height, geometry.arrangement) - pinnedTrackHeight(visible, geometry.track)
  const top = arrangementBodyTop(geometry.arrangement)
  const ySpeed =
    axis === "horizontal" || bottom <= top || y >= bottom
      ? 0
      : y < top + edge
        ? -Math.min(1, (top + edge - y) / edge)
        : y > bottom - edge
          ? Math.min(1, (y - bottom + edge) / edge)
          : 0
  const duration = Math.min(policy.maxElapsedMs, Math.max(0, elapsed))
  return {
    scrollX: clampScrollX(
      scrollX + xSpeed * duration * policy.horizontalPixelsPerMs,
      bars,
      pxPerBar,
      width
    ),
    scrollY: Math.min(
      maxTrackScrollY(visible, height, geometry),
      Math.max(0, scrollY + ySpeed * duration * policy.verticalPixelsPerMs)
    ),
  }
}
