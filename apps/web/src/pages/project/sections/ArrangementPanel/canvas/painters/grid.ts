/**
Grid background, subdivisions, and track-local time selection. Rulers paint separately.
*/
import {
  BAR_RULER_HEIGHT,
  PATTERN_RULER_HEIGHT,
  TIME_RULER_HEIGHT,
  layoutTrackRows,
  isPinnedTrack,
  pinnedTopFor,
} from "../layout"
import { paintRulers } from "./rulers"
import { numberedRulerPlan } from "./rulers/loop"
import type { ArrangementScene } from "../scene"

export interface GridTokens {
  foreground: string
  mutedForeground: string
  surface: string
  surfaceAlt: string
  ruler: string
  line: string
  rulerLine: string
  gridBar: string
  gridMinor: string
  gridMajor: string
  guide: string
  primary: string
}

export function paintGrid(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { viewport, bars } = scene
  const { width, height, pxPerBar, scrollX, dpr } = viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) {
    return
  }

  const gridTop = BAR_RULER_HEIGHT
  const gridBottom = Math.max(gridTop, height - TIME_RULER_HEIGHT)
  // The striped background and vertical grid also run behind the loop and
  // locator bands, so the whole ruler area shares one grid backdrop.
  const backdropTop = PATTERN_RULER_HEIGHT
  const backdropHeight = gridBottom - backdropTop
  const rows = layoutTrackRows(scene)
  const pinnedTop = pinnedTopFor(scene.tracks, height, {
    mode: scene.automationMode,
    lanes: scene.automationLanes,
  })

  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)

  const visibleStartBar = Math.max(1, 1 + scrollX / pxPerBar)
  const visibleEndBar = Math.min(bars + 1, visibleStartBar + width / pxPerBar + 1)

  // 1. Alternating per-bar background (bar 1 light, bar 2 alt, bar 3 light, ...).
  context.fillStyle = tokens.surface
  context.fillRect(0, backdropTop, width, backdropHeight)
  context.fillStyle = tokens.surfaceAlt
  const firstBar = Math.floor(visibleStartBar)
  const lastBar = Math.ceil(visibleEndBar)
  if (pxPerBar >= 2) {
    for (let bar = firstBar; bar < lastBar; bar++) {
      if (bar % 2 !== 0) {
        continue
      } // bar 1=light, bar 2=alt; alt when bar is even
      const left = Math.round((bar - 1) * pxPerBar - scrollX)
      const right = Math.round(bar * pxPerBar - scrollX)
      const w = right - left
      if (w <= 0) {
        continue
      }
      context.fillRect(left, backdropTop, w, backdropHeight)
    }
  }

  paintTimeGrid(
    context,
    scene,
    tokens.gridMinor,
    tokens.gridMajor,
    backdropTop,
    gridBottom,
    0,
    width
  )

  paintRulers(context, scene, tokens)
  context.fillStyle = tokens.primary
  context.globalAlpha = 0.08
  for (const row of rows) {
    if (!scene.selectedTrackIds.has(row.track.id)) {
      continue
    }
    const top = Math.max(gridTop, row.top, isPinnedTrack(row.track) ? pinnedTop : gridTop)
    const bottom = Math.min(row.top + row.height, isPinnedTrack(row.track) ? gridBottom : pinnedTop)
    if (bottom > top) {
      context.fillRect(0, top, width, bottom - top)
    }
  }
  context.globalAlpha = 1

  // Time selection belongs to its originating tracks, not the whole canvas.
  // A single clicked position is a degenerate selection: it has no fill but
  // still marks that position with triangles above and below the grid.
  const sel = scene.timeSelection
  if (sel && sel.trackIds.length) {
    const x0 = (sel.startBar - 1) * pxPerBar - scrollX
    const x1 = (sel.endBar - 1) * pxPerBar - scrollX
    const clampedX0 = Math.max(0, x0)
    const clampedX1 = Math.min(width, x1)
    if (sel.endBar > sel.startBar && clampedX1 > clampedX0) {
      const selectedIds = new Set(sel.trackIds)
      for (const row of rows) {
        if (!selectedIds.has(row.track.id)) {
          continue
        }
        const top = Math.max(gridTop, row.top, isPinnedTrack(row.track) ? pinnedTop : gridTop)
        const bottom = Math.min(
          row.top + row.height,
          isPinnedTrack(row.track) ? gridBottom : pinnedTop
        )
        if (bottom <= top) {
          continue
        }
        context.fillStyle = tokens.primary
        context.globalAlpha = sel.emphasis === "subtle" ? 0.07 : 0.14
        context.fillRect(clampedX0, top, clampedX1 - clampedX0, bottom - top)
        context.strokeStyle = tokens.primary
        context.globalAlpha = sel.emphasis === "subtle" ? 0.3 : 0.6
        context.beginPath()
        context.moveTo(x0 + 0.5, top)
        context.lineTo(x0 + 0.5, bottom)
        context.moveTo(x1 - 0.5, top)
        context.lineTo(x1 - 0.5, bottom)
        context.stroke()
      }
      context.globalAlpha = 1
    }
    // Small half-triangles sit outside the grid: the top one above the first
    // row (apex pointing down) and the bottom one below the last row (apex
    // pointing up). A single clicked position therefore shows both halves at
    // the same bar, while a range joins them into a full triangle per edge.
    context.fillStyle = tokens.primary
    context.globalAlpha = 0.85
    const size = 5
    for (const [x, direction] of [
      [x0, -1],
      [x1, 1],
    ] as const) {
      if (x < -size || x > width + size) {
        continue
      }
      const half = (size / 2) * direction
      context.beginPath()
      context.moveTo(x, gridTop)
      context.lineTo(x + half, gridTop - size)
      context.lineTo(x, gridTop - size)
      context.closePath()
      context.fill()
      context.beginPath()
      context.moveTo(x, gridBottom)
      context.lineTo(x + half, gridBottom + size)
      context.lineTo(x, gridBottom + size)
      context.closePath()
      context.fill()
    }
    context.globalAlpha = 1
  }
}

export function paintTimeGrid(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  minor: string,
  major: string,
  top: number,
  bottom: number,
  left: number,
  right: number,
  opacity = 1
): void {
  const { pxPerBar, scrollX } = scene.viewport
  const { stepBars: majorBars } = numberedRulerPlan(pxPerBar, scene.transport.numerator)
  const { cellBars } = scene.gridPlan
  const cellPx = cellBars * pxPerBar
  const majorPx = majorBars * pxPerBar
  context.save()
  if (cellPx >= 2) {
    const firstCell = Math.max(0, Math.ceil((scrollX + left) / cellPx))
    const lastCell = Math.min(
      Math.floor(scene.bars / cellBars),
      Math.floor((scrollX + right) / cellPx)
    )
    context.beginPath()
    context.lineWidth = 1
    context.strokeStyle = minor
    context.globalAlpha = 0.55 * opacity
    for (let cell = firstCell; cell <= lastCell; cell++) {
      const offset = cell * cellBars
      if (Math.abs(offset / majorBars - Math.round(offset / majorBars)) < 1e-8) {
        continue
      }
      const x = Math.round(cell * cellPx - scrollX) + 0.5
      context.moveTo(x, top)
      context.lineTo(x, bottom)
    }
    context.stroke()
  }
  const firstMajor = Math.max(0, Math.ceil((scrollX + left) / majorPx))
  const lastMajor = Math.min(
    Math.floor(scene.bars / majorBars),
    Math.floor((scrollX + right) / majorPx)
  )
  context.beginPath()
  context.lineWidth = 2
  context.strokeStyle = major
  context.globalAlpha = opacity
  for (let tick = firstMajor; tick <= lastMajor; tick++) {
    const x = Math.round(tick * majorPx - scrollX) + 0.5
    context.moveTo(x, top)
    context.lineTo(x, bottom)
  }
  context.stroke()
  context.restore()
}

export { BAR_RULER_HEIGHT, TIME_RULER_HEIGHT } from "../layout"
