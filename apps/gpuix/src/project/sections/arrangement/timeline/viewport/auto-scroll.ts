import { projectActions, useProjectState } from "../../../../adapters"
import { visibleTracks } from "../../../../model/types"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  maxTrackScrollY,
  pinnedTrackHeight,
} from "../../core/layout"
import { clampScrollX } from "../../core/viewport/zoom"
import type { SceneStore } from "../../core/scene"
import type { NativeTimelinePointer } from "./coordinates"

export interface TimelineAutoScroll {
  tick: (now: number) => void
  start: (pointer: NativeTimelinePointer, axis: "horizontal" | "both") => void
  update: (pointer: NativeTimelinePointer) => void
  stop: () => void
}

export function createTimelineAutoScroll({
  scene,
  edge,
  onScroll,
}: {
  scene: SceneStore
  edge: number
  onScroll: (pointer: NativeTimelinePointer) => void
}): TimelineAutoScroll {
  let pointer: NativeTimelinePointer | null = null
  let axis: "horizontal" | "both" = "both"
  let last: number | null = null

  function tick(now: number) {
    if (!pointer) return
    const current = scene.get()
    const { width, height, pxPerBar, scrollX, scrollY } = current.viewport
    const x = pointer.x
    const y = pointer.y
    const xSpeed =
      x < edge
        ? -Math.min(1, (edge - x) / edge)
        : x > width - edge
          ? Math.min(1, (x - width + edge) / edge)
          : 0
    const tracks = visibleTracks(useProjectState.getState().document.tracks)
    const bottom = arrangementBodyBottom(height) - pinnedTrackHeight(tracks)
    const top = arrangementBodyTop()
    const ySpeed =
      axis === "horizontal" || bottom <= top || y >= bottom
        ? 0
        : y < top + edge
          ? -Math.min(1, (top + edge - y) / edge)
          : y > bottom - edge
            ? Math.min(1, (y - bottom + edge) / edge)
            : 0
    const elapsed = last === null ? 0 : Math.min(48, Math.max(0, now - last))
    last = now
    const nextX = clampScrollX(scrollX + xSpeed * elapsed * 0.75, current.bars, pxPerBar, width)
    const nextY = Math.min(
      maxTrackScrollY(tracks, height),
      Math.max(0, scrollY + ySpeed * elapsed * 0.6)
    )
    if (nextX === scrollX && nextY === scrollY) return
    projectActions.setViewport({ scrollX: nextX, scrollY: nextY })
    scene.setViewport({ ...current.viewport, scrollX: nextX, scrollY: nextY })
    onScroll(pointer)
  }

  return {
    tick,
    start(next, mode) {
      pointer = next
      axis = mode
      last = null
    },
    update(next) {
      pointer = next
    },
    stop() {
      pointer = null
      last = null
    },
  }
}
