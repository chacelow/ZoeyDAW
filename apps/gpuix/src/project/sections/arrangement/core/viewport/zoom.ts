import type { TrackGeometry } from "@/project/layout"
import { gridZoomLimit } from "@/project/model/grid"
import type { Track } from "@/project/model/types"
import { maxTrackScrollY } from "../layout"

export interface MinimapViewport {
  pxPerBar: number
  scrollX: number
}

export interface EdgeDragInput {
  bars: number
  viewportWidth: number
  minPxPerBar: number
  maxPxPerBar: number
  startingPxPerBar: number
  startingScrollX: number
  deltaBars: number
}

export function minimapDragZoom(
  startingPxPerBar: number,
  startingClientY: number,
  clientY: number,
  minPxPerBar: number,
  maxPxPerBar: number
): number {
  const downwardPixels = clientY - startingClientY
  return clamp(startingPxPerBar * Math.exp(-downwardPixels / 100), minPxPerBar, maxPxPerBar)
}

export function minimapDragLeftEdge({
  bars,
  viewportWidth,
  minPxPerBar,
  maxPxPerBar,
  startingPxPerBar,
  startingScrollX,
  deltaBars,
}: EdgeDragInput): MinimapViewport {
  const originalLeftBar = startingScrollX / startingPxPerBar
  const rightBar = originalLeftBar + viewportWidth / startingPxPerBar
  const minViewportBars = viewportWidth / maxPxPerBar
  const maxViewportBars = Math.min(bars, viewportWidth / minPxPerBar)
  const requestedLeftBar = originalLeftBar + deltaBars
  const clampedLeftBar = Math.max(
    0,
    rightBar - maxViewportBars,
    Math.min(rightBar - minViewportBars, requestedLeftBar)
  )
  const newViewportBars = Math.max(minViewportBars, rightBar - clampedLeftBar)
  const pxPerBar = clamp(viewportWidth / newViewportBars, minPxPerBar, maxPxPerBar)
  return {
    pxPerBar,
    scrollX: clampScrollX(clampedLeftBar * pxPerBar, bars, pxPerBar, viewportWidth),
  }
}

export function minimapDragRightEdge({
  bars,
  viewportWidth,
  minPxPerBar,
  maxPxPerBar,
  startingPxPerBar,
  startingScrollX,
  deltaBars,
}: EdgeDragInput): MinimapViewport {
  const leftBar = startingScrollX / startingPxPerBar
  const originalRightBar = leftBar + viewportWidth / startingPxPerBar
  const minViewportBars = viewportWidth / maxPxPerBar
  const maxViewportBars = Math.min(bars - leftBar, viewportWidth / minPxPerBar)
  const requestedRightBar = originalRightBar + deltaBars
  const clampedRightBar = Math.max(
    leftBar + minViewportBars,
    Math.min(leftBar + maxViewportBars, requestedRightBar)
  )
  const newViewportBars = Math.max(minViewportBars, clampedRightBar - leftBar)
  const pxPerBar = clamp(viewportWidth / newViewportBars, minPxPerBar, maxPxPerBar)
  return { pxPerBar, scrollX: clampScrollX(leftBar * pxPerBar, bars, pxPerBar, viewportWidth) }
}

export interface ZoomAnchorInput extends MinimapViewport {
  bars: number
  viewportWidth: number
  minPxPerBar: number
  maxPxPerBar: number
  anchorX: number
}

export function zoomAtAnchor({
  bars,
  viewportWidth,
  minPxPerBar,
  maxPxPerBar,
  pxPerBar,
  scrollX,
  anchorX,
  nextPxPerBar,
}: ZoomAnchorInput & { nextPxPerBar: number }): MinimapViewport {
  const offset = clamp(anchorX, 0, viewportWidth)
  const anchorBar = 1 + (scrollX + offset) / pxPerBar
  const next = clamp(nextPxPerBar, minPxPerBar, maxPxPerBar)
  return {
    pxPerBar: next,
    scrollX: clampScrollX((anchorBar - 1) * next - offset, bars, next, viewportWidth),
  }
}

export function wheelZoom(input: ZoomAnchorInput & { deltaY: number }): MinimapViewport {
  return zoomAtAnchor({ ...input, nextPxPerBar: input.pxPerBar * Math.exp(-input.deltaY / 260) })
}

export function stepZoom(
  input: Omit<ZoomAnchorInput, "anchorX"> & { direction: -1 | 1 }
): MinimapViewport {
  return zoomAtAnchor({
    ...input,
    anchorX: input.viewportWidth / 2,
    nextPxPerBar: input.pxPerBar * (input.direction > 0 ? 1.25 : 0.8),
  })
}

export interface TimelineViewportInput {
  bars: number
  containerWidth: number
  bodyHeight: number
  numerator: number
  denominator: number
  tracks: readonly Track[]
  geometry: TrackGeometry
  storedPxPerBar: number
  storedScrollX: number
  storedScrollY: number
}

export interface TimelineViewport extends MinimapViewport {
  bodyHeight: number
  timeViewportWidth: number
  timelineWidth: number
  minPxPerBar: number
  maxPxPerBar: number
  scrollY: number
}

export function clampTimelineViewport({
  bars,
  containerWidth,
  bodyHeight,
  numerator,
  denominator,
  tracks,
  geometry,
  storedPxPerBar,
  storedScrollX,
  storedScrollY,
}: TimelineViewportInput): TimelineViewport {
  const timeViewportWidth = Math.max(0, containerWidth - geometry.controlsWidth)
  const minPxPerBar = timeViewportWidth > 0 ? timeViewportWidth / bars : 1
  const maxPxPerBar = Math.max(minPxPerBar, gridZoomLimit(numerator, denominator))
  const pxPerBar = clamp(storedPxPerBar || minPxPerBar, minPxPerBar, maxPxPerBar)
  return {
    bodyHeight,
    timeViewportWidth,
    timelineWidth: bars * pxPerBar,
    minPxPerBar,
    maxPxPerBar,
    pxPerBar,
    scrollX: clampScrollX(storedScrollX || 0, bars, pxPerBar, timeViewportWidth),
    scrollY:
      bodyHeight > 0
        ? clamp(storedScrollY || 0, 0, maxTrackScrollY(tracks, bodyHeight, geometry))
        : Math.max(0, storedScrollY || 0),
  }
}

export interface PanViewportInput extends MinimapViewport {
  bars: number
  width: number
  height: number
  tracks: readonly Track[]
  geometry: TrackGeometry
  scrollY: number
  deltaX: number
  deltaY: number
  shiftKey: boolean
}

export function panViewport({
  bars,
  width,
  height,
  tracks,
  geometry,
  pxPerBar,
  scrollX,
  scrollY,
  deltaX,
  deltaY,
  shiftKey,
}: PanViewportInput): { scrollX: number; scrollY: number } {
  const dx = shiftKey ? deltaY + deltaX : deltaX
  const dy = shiftKey ? 0 : deltaY
  return {
    scrollX: clampScrollX(scrollX + dx, bars, pxPerBar, width),
    scrollY: clamp(scrollY + dy, 0, maxTrackScrollY(tracks, height, geometry)),
  }
}

export interface FollowViewportInput extends MinimapViewport {
  bars: number
  viewportWidth: number
  transportBar: number
  follow: boolean
  playing: boolean
  now: number
  manualPanUntil: number
}

export function followViewport({
  bars,
  viewportWidth,
  transportBar,
  pxPerBar,
  scrollX,
  follow,
  playing,
  now,
  manualPanUntil,
}: FollowViewportInput): number {
  if (!follow || !playing || viewportWidth <= 0 || now < manualPanUntil) {
    return scrollX
  }
  const pixel = (transportBar - 1) * pxPerBar
  if (pixel < scrollX || pixel >= scrollX + viewportWidth / 2) {
    return clampScrollX(pixel - viewportWidth / 2, bars, pxPerBar, viewportWidth)
  }
  return scrollX
}

export function clampScrollX(
  scrollX: number,
  bars: number,
  pxPerBar: number,
  viewportWidth: number
): number {
  return clamp(scrollX, 0, Math.max(0, bars * pxPerBar - viewportWidth))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
