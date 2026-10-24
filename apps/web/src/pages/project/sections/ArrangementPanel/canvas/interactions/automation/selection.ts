import { automationBar, automationY } from "./geometry"
import type { AutomationRow } from "./geometry"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"

export function marqueeGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  row: AutomationRow
): CanvasGesture {
  let isMoved = false
  const previous = context.scene.get().targetSelection
  const originBar = automationBar(context.scene.get(), pointer.x)
  return {
    cursor: "default",
    autoScroll: "horizontal",
    move(current) {
      isMoved = true
      const last = automationBar(context.scene.get(), current.x)
      const lower = Math.min(pointer.y, current.y)
      const upper = Math.max(pointer.y, current.y)
      const pointIds =
        row.lane?.points
          .filter(point => {
            return (
              point.bar >= Math.min(originBar, last) &&
              point.bar <= Math.max(originBar, last) &&
              automationY(row, point.value) >= lower &&
              automationY(row, point.value) <= upper
            )
          })
          .map(point => point.id) ?? []
      context.scene.setTargetSelection({
        kind: "automation",
        trackId: row.track.id,
        laneId: row.laneId,
        placement: row.placement,
        pointIds,
      })
    },
    finish(cancelled) {
      if (cancelled) {
        context.scene.setTargetSelection(previous)
      } else if (!isMoved) {
        context.scene.setTargetSelection({
          kind: "automation",
          trackId: row.track.id,
          laneId: row.laneId,
          placement: row.placement,
          pointIds: [],
        })
      }
    },
  }
}
