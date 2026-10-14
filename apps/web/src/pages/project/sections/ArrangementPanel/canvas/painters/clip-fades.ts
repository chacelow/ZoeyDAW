import { fadeHandleX, FADE_HANDLE_PX } from "../clip-geometry"
import type { ClipVisualGeometry, FadeVisual } from "../clip-geometry"
import type { TokenSet } from "../tokens"

export function paintFade(
  context: CanvasRenderingContext2D,
  fade: FadeVisual,
  geometry: ClipVisualGeometry,
  tokens: TokenSet
): void {
  const { start, end, segments, curve } = fade
  const top = geometry.bodyHeight ? geometry.bodyTop : geometry.top
  const height = geometry.bodyHeight || geometry.height
  if (fade.active) {
    context.beginPath()
    context.moveTo(start.x, start.y)
    for (const { control1: a, control2: b, end: point } of segments) {
      context.bezierCurveTo(a.x, a.y, b.x, b.y, point.x, point.y)
    }
    context.lineTo(end.x, top)
    context.lineTo(start.x, top)
    context.closePath()
    context.fillStyle = tokens["--arrangement-fade-mask"]
    context.globalAlpha = 1
    context.fill()
    if (fade.edge === "in" && start.x > geometry.left) {
      context.fillRect(geometry.left, top, start.x - geometry.left, height)
    }
    if (fade.edge === "out" && end.x < geometry.left + geometry.width) {
      context.fillRect(end.x, top, geometry.left + geometry.width - end.x, height)
    }
    context.globalAlpha = 1
    if (!fade.handlesVisible) {
      return
    }
    context.beginPath()
    context.moveTo(start.x, start.y)
    for (const { control1: a, control2: b, end: point } of segments) {
      context.bezierCurveTo(a.x, a.y, b.x, b.y, point.x, point.y)
    }
    context.strokeStyle = tokens["--arrangement-clip-ink"]
    context.lineWidth = 1.2
    context.stroke()
  }
  if (!fade.handlesVisible) {
    return
  }
  context.fillStyle = tokens["--arrangement-clip-paper"]
  context.strokeStyle = tokens["--arrangement-clip-ink"]
  context.lineWidth = 1
  const peak = fade.edge === "in" ? end : start
  const quiet = fade.edge === "in" ? start : end
  paintEndpoint(context, geometry, peak)
  context.fillRect(Math.round(fadeHandleX(geometry, quiet.x)) - 1, Math.round(quiet.y) - 2, 2, 4)
  if (end.x - start.x < FADE_HANDLE_PX * 2) {
    return
  }
  context.beginPath()
  context.arc(curve.x, curve.y, 3, 0, Math.PI * 2)
  context.fill()
  context.stroke()
}

function paintEndpoint(
  context: CanvasRenderingContext2D,
  geometry: ClipVisualGeometry,
  point: FadeVisual["start"]
): void {
  const left = Math.round(fadeHandleX(geometry, point.x)) - 3
  const top = Math.round(point.y) - 3
  context.fillRect(left, top, 6, 6)
  context.strokeRect(left + 0.5, top + 0.5, 5, 5)
}
