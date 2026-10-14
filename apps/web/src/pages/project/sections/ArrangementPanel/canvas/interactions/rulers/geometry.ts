import { MIN_CLIP_LENGTH_BARS } from "@/pages/project/model/grid"
import { snapBar } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
import {
  BAR_RULER_HEIGHT,
  MARKER_RULER_HEIGHT,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { LoopRegion, Marker } from "@/pages/project/model/types"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { CanvasPointer } from "../types"

export type RulerHit =
  | { kind: "marker"; marker: Marker }
  | { kind: "loop"; edge: "start" | "end" | "body" }
  | { kind: "bar" }

export function barAt(scene: ArrangementScene, x: number): number {
  return 1 + (x + scene.viewport.scrollX) / scene.viewport.pxPerBar
}

export function rulerBar(
  scene: ArrangementScene,
  x: number,
  snap: boolean,
  bypass = false
): number {
  return snapBar(barAt(scene, x), snap, scene.gridPlan.cellBars, scene.bars + 1, bypass)
}

export function rulerHit(scene: ArrangementScene, pointer: CanvasPointer): RulerHit | null {
  const { x, y } = pointer
  const { width, pxPerBar, scrollX } = scene.viewport
  if (x < 0 || x > width || y < 0 || y >= BAR_RULER_HEIGHT || pxPerBar <= 0) {
    return null
  }
  if (y < MARKER_RULER_HEIGHT) {
    let nearest: Marker | null = null
    let distance = 9
    for (const marker of scene.markers) {
      const delta = Math.abs(x - ((marker.bar - 1) * pxPerBar - scrollX))
      if (!(delta < distance)) {
        continue
      }

      nearest = marker
      distance = delta
    }
    return nearest ? { kind: "marker", marker: nearest } : { kind: "bar" }
  }
  const { loop } = scene
  if (!loop.enabled) {
    return { kind: "bar" }
  }
  const left = (loop.startBar - 1) * pxPerBar - scrollX
  const right = (loop.endBar - 1) * pxPerBar - scrollX
  if (Math.abs(x - left) <= 5) {
    return { kind: "loop", edge: "start" }
  }
  if (Math.abs(x - right) <= 5) {
    return { kind: "loop", edge: "end" }
  }
  return x > left && x < right ? { kind: "loop", edge: "body" } : { kind: "bar" }
}

export function movedLoop(
  loop: LoopRegion,
  edge: "start" | "end" | "body",
  delta: number,
  end: number
): LoopRegion {
  const length = loop.endBar - loop.startBar
  if (edge === "body") {
    const startBar = Math.max(1, Math.min(end - length, loop.startBar + delta))
    return { ...loop, startBar, endBar: startBar + length }
  }
  if (edge === "start") {
    return {
      ...loop,
      startBar: Math.min(loop.endBar - MIN_CLIP_LENGTH_BARS, Math.max(1, loop.startBar + delta)),
    }
  }
  return {
    ...loop,
    endBar: Math.max(loop.startBar + MIN_CLIP_LENGTH_BARS, Math.min(end, loop.endBar + delta)),
  }
}
