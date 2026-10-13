/** Downward travel shrinks the overview selection; upward travel expands it. */
export function minimapDragZoom(
  startingPxPerBar: number,
  startingClientY: number,
  clientY: number,
  minPxPerBar: number,
  maxPxPerBar: number
): number {
  const downwardPixels = clientY - startingClientY
  return Math.max(
    minPxPerBar,
    Math.min(maxPxPerBar, startingPxPerBar * Math.exp(downwardPixels / 100))
  )
}

export interface MinimapViewport {
  pxPerBar: number
  scrollX: number
}

interface EdgeDragInput {
  bars: number
  viewportWidth: number
  minPxPerBar: number
  maxPxPerBar: number
  startingPxPerBar: number
  startingScrollX: number
  deltaBars: number
}

/**
 * Drag the left edge of the overview frame: the right edge stays pinned in bars.
 * Shrinking the frame zooms in; expanding it zooms out.
 */
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
    Math.max(0, rightBar - maxViewportBars),
    Math.min(rightBar - minViewportBars, requestedLeftBar)
  )
  const newViewportBars = Math.max(minViewportBars, rightBar - clampedLeftBar)
  const pxPerBar = clamp(viewportWidth / newViewportBars, minPxPerBar, maxPxPerBar)
  const maxScrollX = Math.max(0, bars * pxPerBar - viewportWidth)
  const scrollX = Math.max(0, Math.min(maxScrollX, clampedLeftBar * pxPerBar))
  return { pxPerBar, scrollX }
}

/**
 * Drag the right edge of the overview frame: the left edge stays pinned in bars.
 * Shrinking the frame zooms in; expanding it zooms out.
 */
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
  const maxScrollX = Math.max(0, bars * pxPerBar - viewportWidth)
  const scrollX = Math.max(0, Math.min(maxScrollX, leftBar * pxPerBar))
  return { pxPerBar, scrollX }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
