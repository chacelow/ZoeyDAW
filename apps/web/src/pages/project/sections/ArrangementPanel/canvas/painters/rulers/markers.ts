import { MARKER_RULER_HEIGHT } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { GridTokens } from "../grid"

export function paintMarkers(
  ctx: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, pxPerBar, scrollX } = scene.viewport
  ctx.fillStyle = tokens.ruler
  ctx.fillRect(0, 0, width, MARKER_RULER_HEIGHT)
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif"
  ctx.textBaseline = "middle"
  ctx.fillStyle = tokens.primary
  for (const marker of scene.markers) {
    const x = (marker.bar - 1) * pxPerBar - scrollX
    if (x < -8 || x > width + 8) continue
    ctx.beginPath()
    ctx.moveTo(x, MARKER_RULER_HEIGHT - 6)
    ctx.lineTo(x + 6, MARKER_RULER_HEIGHT - 2)
    ctx.lineTo(x, MARKER_RULER_HEIGHT - 2)
    ctx.closePath()
    ctx.fill()
    if (scene.targetSelection.kind === "marker" && scene.targetSelection.id === marker.id) {
      ctx.strokeStyle = tokens.primary
      ctx.beginPath()
      ctx.moveTo(x, 1)
      ctx.lineTo(x, MARKER_RULER_HEIGHT - 1)
      ctx.stroke()
    }
    ctx.fillText(marker.label, x + 7, MARKER_RULER_HEIGHT / 2)
  }
}
