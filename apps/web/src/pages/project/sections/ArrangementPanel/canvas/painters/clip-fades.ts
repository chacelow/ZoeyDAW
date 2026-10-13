import {
  fadeHandleX,
  FADE_HANDLE_PX,
  type ClipVisualGeometry,
  type FadeVisual,
} from "../clip-geometry"
import type { TokenSet } from "../tokens"

export function paintFade(
  ctx: CanvasRenderingContext2D,
  fade: FadeVisual,
  geometry: ClipVisualGeometry,
  tokens: TokenSet
): void {
  const { start, end, segments, curve } = fade
  const top = geometry.bodyHeight ? geometry.bodyTop : geometry.top
  const height = geometry.bodyHeight || geometry.height
  if (fade.active) {
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    for (const { control1: a, control2: b, end: point } of segments)
      ctx.bezierCurveTo(a.x, a.y, b.x, b.y, point.x, point.y)
    ctx.lineTo(end.x, top)
    ctx.lineTo(start.x, top)
    ctx.closePath()
    ctx.fillStyle = tokens["--arrangement-fade-mask"]
    ctx.globalAlpha = 1
    ctx.fill()
    if (fade.edge === "in" && start.x > geometry.left)
      ctx.fillRect(geometry.left, top, start.x - geometry.left, height)
    if (fade.edge === "out" && end.x < geometry.left + geometry.width)
      ctx.fillRect(end.x, top, geometry.left + geometry.width - end.x, height)
    ctx.globalAlpha = 1
    if (!fade.handlesVisible) return
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    for (const { control1: a, control2: b, end: point } of segments)
      ctx.bezierCurveTo(a.x, a.y, b.x, b.y, point.x, point.y)
    ctx.strokeStyle = tokens["--arrangement-clip-ink"]
    ctx.lineWidth = 1.2
    ctx.stroke()
  }
  if (!fade.handlesVisible) return
  ctx.fillStyle = tokens["--arrangement-clip-paper"]
  ctx.strokeStyle = tokens["--arrangement-clip-ink"]
  ctx.lineWidth = 1
  const peak = fade.edge === "in" ? end : start
  const quiet = fade.edge === "in" ? start : end
  paintEndpoint(ctx, geometry, peak)
  ctx.fillRect(Math.round(fadeHandleX(geometry, quiet.x)) - 1, Math.round(quiet.y) - 2, 2, 4)
  if (end.x - start.x < FADE_HANDLE_PX * 2) return
  ctx.beginPath()
  ctx.arc(curve.x, curve.y, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

function paintEndpoint(
  ctx: CanvasRenderingContext2D,
  geometry: ClipVisualGeometry,
  point: FadeVisual["start"]
): void {
  const left = Math.round(fadeHandleX(geometry, point.x)) - 3
  const top = Math.round(point.y) - 3
  ctx.fillRect(left, top, 6, 6)
  ctx.strokeRect(left + 0.5, top + 0.5, 5, 5)
}
