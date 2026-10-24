import {
  BAR_RULER_HEIGHT,
  LOOP_RULER_HEIGHT,
  MARKER_RULER_HEIGHT,
  PATTERN_RULER_HEIGHT,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { GridTokens } from "../grid"

/**
Locator band: an empty strip by default. Each locator draws a flag plus a guide
line down to the grid, and deliberately has no triangle at the bottom ruler.
*/
export function paintMarkers(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, pxPerBar, scrollX } = scene.viewport
  const top = PATTERN_RULER_HEIGHT + LOOP_RULER_HEIGHT
  context.font = "10px ui-sans-serif, system-ui, sans-serif"
  context.textBaseline = "middle"
  context.fillStyle = tokens.guide
  for (const marker of scene.markers) {
    const x = (marker.bar - 1) * pxPerBar - scrollX
    if (x < -8 || x > width + 8) {
      continue
    }
    context.beginPath()
    context.moveTo(x, top + 2)
    context.lineTo(x + 6, top + 6)
    context.lineTo(x, top + 10)
    context.closePath()
    context.fill()
    context.fillText(marker.label, x + 7, top + MARKER_RULER_HEIGHT / 2)
  }
  context.strokeStyle = tokens.line
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(0, BAR_RULER_HEIGHT + 0.5)
  context.lineTo(width, BAR_RULER_HEIGHT + 0.5)
  context.stroke()
  context.lineWidth = 1
}
