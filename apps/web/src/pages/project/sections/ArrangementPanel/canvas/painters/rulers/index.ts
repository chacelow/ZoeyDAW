import { paintMarkers } from "./markers"
import { paintLoopRuler } from "./loop"
import { paintTimeRuler } from "./time"
import type { GridTokens } from "../grid"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"

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
  paintMarkers(context, scene, tokens)
  paintLoopRuler(context, scene, tokens)
  paintTimeRuler(context, scene, tokens)
}
