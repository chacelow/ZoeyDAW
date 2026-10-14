import { MARKER_RULER_HEIGHT } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { GridTokens } from "../grid"

export function paintMarkers(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, pxPerBar, scrollX } = scene.viewport
  context.fillStyle = tokens.ruler
  context.fillRect(0, 0, width, MARKER_RULER_HEIGHT)
  context.font = "10px ui-sans-serif, system-ui, sans-serif"
  context.textBaseline = "middle"
  context.fillStyle = tokens.primary
  for (const marker of scene.markers) {
    const x = (marker.bar - 1) * pxPerBar - scrollX
    if (x < -8 || x > width + 8) {
      continue
    }
    context.beginPath()
    context.moveTo(x, MARKER_RULER_HEIGHT - 6)
    context.lineTo(x + 6, MARKER_RULER_HEIGHT - 2)
    context.lineTo(x, MARKER_RULER_HEIGHT - 2)
    context.closePath()
    context.fill()
    if (scene.targetSelection.kind === "marker" && scene.targetSelection.id === marker.id) {
      context.strokeStyle = tokens.primary
      context.beginPath()
      context.moveTo(x, 1)
      context.lineTo(x, MARKER_RULER_HEIGHT - 1)
      context.stroke()
    }
    context.fillText(marker.label, x + 7, MARKER_RULER_HEIGHT / 2)
  }
}
