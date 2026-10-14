import { visibleTracks } from "@/pages/project/model/types"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  maxTrackScrollY,
  pinnedTrackHeight,
} from "../layout"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "./types"

export function createAutoScroll(
  context: InteractionContext,
  onScroll: (pointer: CanvasPointer) => void
) {
  let frame = 0
  let last = 0
  let pointer: CanvasPointer | null = null
  let element: HTMLElement | null = null
  let axis: Exclude<CanvasGesture["autoScroll"], false> = "both"
  function tick(now: number) {
    frame = 0
    if (!pointer || !element) {
      return
    }
    const scene = context.scene.get()
    const rect = element.getBoundingClientRect()
    const x = pointer.clientX - rect.left
    const y = pointer.clientY - rect.top
    const edge = 42
    const xSpeed =
      x < edge
        ? -Math.min(1, (edge - x) / edge)
        : x > scene.viewport.width - edge
          ? Math.min(1, (x - scene.viewport.width + edge) / edge)
          : 0
    const tracks = visibleTracks(context.getState().document.tracks)
    const bottom = arrangementBodyBottom(scene.viewport.height) - pinnedTrackHeight(tracks)
    const top = arrangementBodyTop()
    const ySpeed =
      axis === "horizontal" || bottom <= top || y >= bottom
        ? 0
        : y < top + edge
          ? -Math.min(1, (top + edge - y) / edge)
          : y > bottom - edge
            ? Math.min(1, (y - bottom + edge) / edge)
            : 0
    const elapsed = Math.min(48, now - (last || now))
    last = now
    const xMax = Math.max(0, scene.bars * scene.viewport.pxPerBar - scene.viewport.width)
    const nextX = Math.min(xMax, Math.max(0, scene.viewport.scrollX + xSpeed * elapsed * 0.75))
    const nextY = Math.min(
      maxTrackScrollY(tracks, scene.viewport.height),
      Math.max(0, scene.viewport.scrollY + ySpeed * elapsed * 0.6)
    )
    if (nextX !== scene.viewport.scrollX || nextY !== scene.viewport.scrollY) {
      context.scene.setViewport({ ...scene.viewport, scrollX: nextX, scrollY: nextY })
      context.actions.setViewport({ scrollX: nextX, scrollY: nextY })
      onScroll({ ...pointer, x, y })
    }
    frame = requestAnimationFrame(tick)
  }
  return {
    start(
      host: HTMLElement,
      next: CanvasPointer,
      mode: Exclude<CanvasGesture["autoScroll"], false>
    ) {
      element = host
      pointer = next
      axis = mode
      last = 0
      if (!frame) {
        frame = requestAnimationFrame(tick)
      }
    },
    update(next: CanvasPointer) {
      pointer = next
    },
    stop() {
      pointer = null
      element = null
      last = 0
      if (frame) {
        cancelAnimationFrame(frame)
      }
      frame = 0
    },
  }
}
