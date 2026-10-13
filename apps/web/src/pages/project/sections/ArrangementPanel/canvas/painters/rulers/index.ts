import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { GridTokens } from "../grid"
import { paintMarkers } from "./markers"
import { paintLoopRuler } from "./loop"
import { paintTimeRuler } from "./time"

export function paintRulers(
  ctx: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, height, pxPerBar, dpr } = scene.viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  paintMarkers(ctx, scene, tokens)
  paintLoopRuler(ctx, scene, tokens)
  paintTimeRuler(ctx, scene, tokens)
}
