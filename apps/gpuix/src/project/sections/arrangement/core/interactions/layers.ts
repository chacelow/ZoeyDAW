import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { hitTest } from "../hit-test"
import { arrangementBodyTop } from "../layout"
import type { ArrangementScene } from "../scene"
import type { Point } from "./types"

export function interactionLayer(
  scene: ArrangementScene,
  pointer: Point,
  automationMode: boolean
): "ruler" | "clip" | "automation" {
  if (pointer.y < arrangementBodyTop(scene.geometry.arrangement)) return "ruler"
  if (!automationMode) return "clip"
  return hitTest(scene, pointer.x, pointer.y, true)?.kind === "clip-title" ? "clip" : "automation"
}

export function dragStarted(
  origin: Point,
  current: Point,
  policy: ArrangementPolicy["pointer"]
): boolean {
  return Math.hypot(current.x - origin.x, current.y - origin.y) >= policy.dragThresholdPixels
}
