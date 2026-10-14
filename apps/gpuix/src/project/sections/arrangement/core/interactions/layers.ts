import { hitTest } from "../hit-test"
import { arrangementBodyTop } from "../layout"
import type { ArrangementScene } from "../scene"
import type { Point } from "./types"

export function interactionLayer(
  scene: ArrangementScene,
  pointer: Point,
  automationMode: boolean
): "ruler" | "clip" | "automation" {
  if (pointer.y < arrangementBodyTop()) return "ruler"
  if (!automationMode) return "clip"
  return hitTest(scene, pointer.x, pointer.y, true)?.kind === "clip-title" ? "clip" : "automation"
}

export function dragStarted(origin: Point, current: Point): boolean {
  return Math.hypot(current.x - origin.x, current.y - origin.y) >= 3
}
