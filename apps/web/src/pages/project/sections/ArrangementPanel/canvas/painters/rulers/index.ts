import { paintMarkers } from "./markers"
import { paintLoopRuler, paintPatternRuler } from "./loop"
import { paintTimeRuler } from "./time"
import type { GridTokens } from "../grid"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"

/**
Ruler stack, top to bottom: pattern positions, loop region, locators. The time
ruler stays pinned to the canvas bottom.
*/
export function paintRulers(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, height, pxPerBar, dpr } = scene.viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) {
    return
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  paintPatternRuler(context, scene, tokens)
  paintLoopRuler(context, scene, tokens)
  paintMarkers(context, scene, tokens)
  paintTimeRuler(context, scene, tokens)
}
