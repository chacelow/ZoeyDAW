import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { clampScrollX, minimapDragZoom } from "./zoom"
import type { MinimapViewport } from "./zoom"

const EDGE_HIT_WIDTH = 6

export interface MinimapGeometry extends MinimapViewport {
  policy: ArrangementPolicy
  bars: number
  viewportWidth: number
  minPxPerBar: number
  maxPxPerBar: number
}

export type MinimapHit = "left" | "right" | "body" | "jump"
export type MinimapDragMode = Exclude<MinimapHit, "jump">

export interface MinimapAnchor {
  mode: MinimapDragMode
  initialScrollX: number
  zoomAnchorRatio: number
}

export function minimapHit(x: number, width: number, geometry: MinimapGeometry): MinimapHit {
  const span = Math.min(geometry.bars, geometry.viewportWidth / geometry.pxPerBar)
  const left = (geometry.scrollX / geometry.pxPerBar / geometry.bars) * width
  const right = left + (span / geometry.bars) * width
  if (x < left - EDGE_HIT_WIDTH || x > right + EDGE_HIT_WIDTH) {
    return "jump"
  }
  if (Math.min(Math.abs(x - left), Math.abs(x - right)) <= EDGE_HIT_WIDTH) {
    return Math.abs(x - left) <= Math.abs(x - right) ? "left" : "right"
  }
  return "body"
}

export function minimapPointerDown({
  x,
  width,
  geometry,
}: {
  x: number
  width: number
  geometry: MinimapGeometry
}): MinimapAnchor | null {
  if (geometry.viewportWidth <= 0 || width <= 0) {
    return null
  }
  const mode = minimapHit(x, width, geometry)
  const pointerPixel = (x / width) * geometry.bars * geometry.pxPerBar
  const initialScrollX =
    mode === "jump"
      ? clampScrollX(
          pointerPixel - geometry.viewportWidth / 2,
          geometry.bars,
          geometry.pxPerBar,
          geometry.viewportWidth
        )
      : geometry.scrollX
  return {
    mode: mode === "jump" ? "body" : mode,
    initialScrollX,
    zoomAnchorRatio: (pointerPixel - initialScrollX) / geometry.viewportWidth,
  }
}

export function minimapDragBody({
  geometry,
  width,
  initialScrollX,
  zoomAnchorRatio,
  deltaX,
  deltaY,
}: {
  geometry: MinimapGeometry
  width: number
  initialScrollX: number
  zoomAnchorRatio: number
  deltaX: number
  deltaY: number
}): MinimapViewport {
  const deltaBars = (deltaX * geometry.bars) / width
  const pxPerBar = minimapDragZoom(
    geometry.pxPerBar,
    0,
    deltaY,
    geometry.minPxPerBar,
    geometry.maxPxPerBar,
    geometry.policy.zoom
  )
  const anchorBar =
    1 +
    (initialScrollX + geometry.viewportWidth * zoomAnchorRatio) / geometry.pxPerBar +
    deltaBars * geometry.policy.zoom.minimapPanScale
  return {
    pxPerBar,
    scrollX: clampScrollX(
      (anchorBar - 1) * pxPerBar - geometry.viewportWidth * zoomAnchorRatio,
      geometry.bars,
      pxPerBar,
      geometry.viewportWidth
    ),
  }
}
