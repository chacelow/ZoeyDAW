import { uniqueId } from "@/project/model/reducers"
import { sortedPoints } from "@/project/sections/arrangement/core/automation/points"
import type { LaneContext, LaneKey } from "../types"

export function automationKeyDown(context: LaneContext, event: LaneKey): boolean {
  const selection = context.scene.get().targetSelection
  if (selection.kind !== "automation") return false
  const command = (event.metaKey || event.ctrlKey) && !event.altKey
  const key = event.key.toLowerCase()
  const lane = context
    .getState()
    .document.tracks.find(track => track.id === selection.trackId)
    ?.automation.find(item => item.id === selection.laneId)
  if (command && key === "a") {
    context.scene.setTargetSelection({
      ...selection,
      pointIds: lane?.points.map(point => point.id) ?? [],
    })
    return true
  }
  if (command && key === "d" && selection.pointIds.length) {
    const chosen = lane?.points.filter(point => selection.pointIds.includes(point.id)) ?? []
    const first = chosen[0]
    const last = chosen.at(-1)
    if (!lane || !first || !last) return true
    const width = Math.max(
      context.scene.get().gridPlan.cellBars,
      last.bar - first.bar + context.scene.get().gridPlan.cellBars
    )
    const copies = chosen.map(point => ({
      ...point,
      id: uniqueId("point"),
      bar: point.bar + width,
    }))
    if (copies.some(point => point.bar > context.scene.get().bars + 1)) return true
    context.actions.replaceAutomationPoints(
      selection.trackId,
      selection.laneId,
      sortedPoints([
        ...lane.points.filter(point =>
          copies.every(copy => Math.abs(point.bar - copy.bar) >= 0.000001)
        ),
        ...copies,
      ])
    )
    context.scene.setTargetSelection({ ...selection, pointIds: copies.map(point => point.id) })
    return true
  }
  if (key === "delete" || key === "backspace") {
    context.actions.deleteAutomationPoints(selection.trackId, selection.laneId, selection.pointIds)
    context.scene.setTargetSelection({ kind: "none" })
    return true
  }
  if (key === "escape") {
    context.scene.setTargetSelection({ kind: "none" })
    return true
  }
  return false
}
