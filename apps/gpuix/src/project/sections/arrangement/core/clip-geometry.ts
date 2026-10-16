import {
  clampFadeCurvePosition,
  DEFAULT_FADE_CURVE,
  fadeControls,
  fadeCurveProgress,
  fadeBezierSegments,
} from "@/project/model/fades"
import type { FadeBezierSegment } from "@/project/model/fades"
import type { AudioClip, Clip, Track } from "@/project/model/types"
import type { ClipRect } from "./layout"

export const RESIZE_EDGE_PX = 6
export const FADE_HANDLE_PX = 7

export interface FadeVisual {
  edge: "in" | "out"
  start: { x: number; y: number }
  end: { x: number; y: number }
  curve: { x: number; y: number }
  segments: FadeBezierSegment[]
  active: boolean
  handlesVisible: boolean
}

export interface ClipVisualGeometry {
  left: number
  top: number
  width: number
  height: number
  titleHeight: number
  bodyTop: number
  bodyHeight: number
  fades: readonly FadeVisual[]
}

/**
CSS-pixel projection consumed by both the painter and pointer hit test.
*/
export function clipVisualGeometry(
  rect: ClipRect,
  clip: Clip,
  track: Track,
  fadesVisible: boolean
): ClipVisualGeometry {
  const left = Math.round(rect.left)
  const top = Math.round(rect.top + 1)
  const width = Math.max(2, Math.round(rect.width))
  const height = Math.max(4, Math.round(rect.height - 2))
  const titleHeight =
    track.collapsed || height <= rect.trackGeometry.titleHeight + 4
      ? height
      : rect.trackGeometry.titleHeight
  const bodyHeight = height - titleHeight
  const bodyTop = top + titleHeight
  const fades =
    clip.kind === "audio"
      ? [
          fadeVisual(
            clip,
            "in",
            left,
            bodyHeight ? bodyTop : top,
            width,
            bodyHeight || height,
            fadesVisible && bodyHeight > 0
          ),
          fadeVisual(
            clip,
            "out",
            left,
            bodyHeight ? bodyTop : top,
            width,
            bodyHeight || height,
            fadesVisible && bodyHeight > 0
          ),
        ]
      : []
  return { left, top, width, height, titleHeight, bodyTop, bodyHeight, fades }
}

export function fadeHandleX(
  geometry: Pick<ClipVisualGeometry, "left" | "width">,
  x: number
): number {
  const margin = Math.min(3, geometry.width / 2)
  return Math.max(geometry.left + margin, Math.min(geometry.left + geometry.width - margin, x))
}

function fadeVisual(
  clip: AudioClip,
  edge: "in" | "out",
  left: number,
  top: number,
  width: number,
  height: number,
  handlesVisible: boolean
): FadeVisual {
  const position = fadeControls(clip, edge)
  const scale = width / clip.lengthBars
  const x0 = left + position.start * scale
  const x1 = left + position.end * scale
  const y0 = top + (edge === "in" ? height : 0)
  const y1 = top + (edge === "in" ? 0 : height)
  const curve = clip[edge === "in" ? "fadeInCurve" : "fadeOutCurve"] ?? DEFAULT_FADE_CURVE
  const positionY = fadeCurveProgress(curve)
  const midpoint = y0 + (y1 - y0) * positionY
  const positionX = clip[edge === "in" ? "fadeInCurvePosition" : "fadeOutCurvePosition"] ?? 0.5
  const middle = x0 + (x1 - x0) * clampFadeCurvePosition(positionX)
  return {
    edge,
    start: { x: x0, y: y0 },
    end: { x: x1, y: y1 },
    curve: { x: middle, y: midpoint },
    segments: fadeBezierSegments(x0, y0, x1, y1, positionX, curve),
    active: position.end > position.start,
    handlesVisible: handlesVisible && width >= FADE_HANDLE_PX * 2,
  }
}
