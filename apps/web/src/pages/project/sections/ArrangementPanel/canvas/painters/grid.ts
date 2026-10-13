/** Grid background, subdivisions, and track-local time selection. Rulers paint separately. */
import type { ArrangementScene } from "../scene"
import {
  BAR_RULER_HEIGHT,
  TIME_RULER_HEIGHT,
  layoutTrackRows,
  isPinnedTrack,
  pinnedTrackHeight,
} from "../layout"
import { paintRulers } from "./rulers"
import { numberedRulerPlan } from "./rulers/loop"

export { BAR_RULER_HEIGHT, TIME_RULER_HEIGHT }

export interface GridTokens {
  foreground: string
  mutedForeground: string
  surface: string
  surfaceAlt: string
  ruler: string
  line: string
  gridBar: string
  gridMinor: string
  gridMajor: string
  primary: string
}

export function paintGrid(
  ctx: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { viewport, bars } = scene
  const { width, height, pxPerBar, scrollX, dpr } = viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) return

  const gridTop = BAR_RULER_HEIGHT
  const gridBottom = Math.max(gridTop, height - TIME_RULER_HEIGHT)
  const gridHeight = gridBottom - gridTop
  const rows = layoutTrackRows(scene)
  const pinnedTop = gridBottom - pinnedTrackHeight(scene.tracks)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const visibleStartBar = Math.max(1, 1 + scrollX / pxPerBar)
  const visibleEndBar = Math.min(bars + 1, visibleStartBar + width / pxPerBar + 1)

  // 1. Alternating per-bar background (bar 1 light, bar 2 alt, bar 3 light, ...).
  ctx.fillStyle = tokens.surface
  ctx.fillRect(0, gridTop, width, gridHeight)
  ctx.fillStyle = tokens.surfaceAlt
  const firstBar = Math.floor(visibleStartBar)
  const lastBar = Math.ceil(visibleEndBar)
  for (let bar = firstBar; bar < lastBar && pxPerBar >= 2; bar++) {
    if (bar % 2 !== 0) continue // bar 1=light, bar 2=alt; alt when bar is even
    const left = Math.round((bar - 1) * pxPerBar - scrollX)
    const right = Math.round(bar * pxPerBar - scrollX)
    const w = right - left
    if (w <= 0) continue
    ctx.fillRect(left, gridTop, w, gridHeight)
  }

  paintTimeGrid(ctx, scene, tokens.gridMinor, tokens.gridMajor, gridTop, gridBottom, 0, width)

  paintRulers(ctx, scene, tokens)
  ctx.fillStyle = tokens.primary
  ctx.globalAlpha = 0.08
  for (const row of rows) {
    if (!scene.selectedTrackIds.has(row.track.id)) continue
    const top = Math.max(gridTop, row.top, isPinnedTrack(row.track) ? pinnedTop : gridTop)
    const bottom = Math.min(row.top + row.height, isPinnedTrack(row.track) ? gridBottom : pinnedTop)
    if (bottom > top) ctx.fillRect(0, top, width, bottom - top)
  }
  ctx.globalAlpha = 1

  // Time selection belongs to its originating tracks, not the whole canvas.
  const sel = scene.timeSelection
  if (sel && sel.endBar > sel.startBar && sel.trackIds.length) {
    const x0 = (sel.startBar - 1) * pxPerBar - scrollX
    const x1 = (sel.endBar - 1) * pxPerBar - scrollX
    const clampedX0 = Math.max(0, x0)
    const clampedX1 = Math.min(width, x1)
    if (clampedX1 > clampedX0) {
      const selectedIds = new Set(sel.trackIds)
      for (const row of rows) {
        if (!selectedIds.has(row.track.id)) continue
        const top = Math.max(gridTop, row.top, isPinnedTrack(row.track) ? pinnedTop : gridTop)
        const bottom = Math.min(
          row.top + row.height,
          isPinnedTrack(row.track) ? gridBottom : pinnedTop
        )
        if (bottom <= top) continue
        ctx.fillStyle = tokens.primary
        ctx.globalAlpha = 0.14
        ctx.fillRect(clampedX0, top, clampedX1 - clampedX0, bottom - top)
        ctx.strokeStyle = tokens.primary
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.moveTo(x0 + 0.5, top)
        ctx.lineTo(x0 + 0.5, bottom)
        ctx.moveTo(x1 - 0.5, top)
        ctx.lineTo(x1 - 0.5, bottom)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
  }
}

export function paintTimeGrid(
  ctx: CanvasRenderingContext2D,
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
  ctx.save()
  ctx.lineWidth = 1
  if (cellPx >= 2) {
    const firstCell = Math.max(0, Math.ceil((scrollX + left) / cellPx))
    const lastCell = Math.min(
      Math.floor(scene.bars / cellBars),
      Math.floor((scrollX + right) / cellPx)
    )
    ctx.beginPath()
    ctx.strokeStyle = minor
    ctx.globalAlpha = 0.55 * opacity
    for (let cell = firstCell; cell <= lastCell; cell++) {
      const offset = cell * cellBars
      if (Math.abs(offset / majorBars - Math.round(offset / majorBars)) < 1e-8) continue
      const x = Math.round(cell * cellPx - scrollX) + 0.5
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
    }
    ctx.stroke()
  }
  const firstMajor = Math.max(0, Math.ceil((scrollX + left) / majorPx))
  const lastMajor = Math.min(
    Math.floor(scene.bars / majorBars),
    Math.floor((scrollX + right) / majorPx)
  )
  ctx.beginPath()
  ctx.strokeStyle = major
  ctx.globalAlpha = opacity
  for (let tick = firstMajor; tick <= lastMajor; tick++) {
    const x = Math.round(tick * majorPx - scrollX) + 0.5
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
  }
  ctx.stroke()
  ctx.restore()
}
