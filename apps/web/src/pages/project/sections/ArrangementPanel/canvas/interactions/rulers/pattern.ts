import { projectActions } from "@/pages/project/adapters"
import { timelineZoomLimit } from "@zoeydaw/project-core/timeline-zoom"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"

const ZOOM_PER_PIXEL = 0.004

/**
Pattern-ruler gesture: vertical travel zooms the timeline, horizontal travel pans
it. Panning keeps the grabbed bar under the pointer (1:1 follow) instead of
adding a damped delta on top of the anchor, which made the drag feel stiff and
pushed the view the wrong way.
*/
export function patternRulerGesture(
  context: InteractionContext,
  pointer: CanvasPointer
): CanvasGesture {
  const start = context.getState().workspace
  const initial = context.scene.get()
  const anchorX = pointer.x
  const anchorBar = 1 + (anchorX + initial.viewport.scrollX) / initial.viewport.pxPerBar
  let dx = 0
  let dy = 0
  // Deltas come from client coordinates, so the baseline must too: seeding it
  // with canvas-local pointer positions folded the canvas offset into the first
  // move and made the view jump on press.
  let lastX = pointer.clientX
  let lastY = pointer.clientY
  return {
    cursor: "ns-resize",
    autoScroll: false,
    move(current) {
      dx += current.clientX - lastX
      dy += current.clientY - lastY
      lastX = current.clientX
      lastY = current.clientY
      const scene = context.scene.get()
      const { width, pxPerBar } = scene.viewport
      if (width <= 0 || pxPerBar <= 0) {
        return
      }
      const minPxPerBar = width / scene.bars
      const maxPxPerBar = Math.max(minPxPerBar, timelineZoomLimit(scene.transport, scene.media))
      const zoomed = initial.viewport.pxPerBar * Math.exp(-dy * ZOOM_PER_PIXEL)
      const next = Math.max(minPxPerBar, Math.min(maxPxPerBar, zoomed))
      // Bars are one-based: bar b sits at (b - 1) * pxPerBar - scrollX. Dropping
      // the `- 1` shifted the view by exactly one bar on the first frame, which
      // read as a jump before the drag caught up.
      const scrollX = (anchorBar - 1) * next - (anchorX + dx)
      const maxScroll = Math.max(0, scene.bars * next - width)
      projectActions.setViewport({
        pxPerBar: next,
        scrollX: Math.max(0, Math.min(maxScroll, scrollX)),
      })
    },
    finish(cancelled) {
      if (cancelled) {
        projectActions.setViewport({ pxPerBar: start.pxPerBar, scrollX: start.scrollX })
      }
    },
  }
}
