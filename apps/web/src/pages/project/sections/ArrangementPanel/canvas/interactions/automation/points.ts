import { clampAutomationValue } from "@/pages/project/model/automation-curve"
import { snapBar } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
import { beginProjectPreview, finishProjectPreview } from "../project-preview"
import { automationBar } from "./geometry"
import { previewAutomation, sortedPoints } from "./preview"
import type { AutomationRow } from "./geometry"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import type { AutomationPoint } from "@/pages/project/model/types"

export function pointGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  row: AutomationRow,
  point: AutomationPoint
): CanvasGesture {
  beginProjectPreview(context)
  const source = row.lane?.points ?? []
  const selection = context.scene.get().targetSelection
  const existing =
    selection.kind === "automation" &&
    selection.trackId === row.track.id &&
    selection.laneId === row.laneId
      ? selection.pointIds
      : []
  const ids = pointer.shiftKey
    ? existing.includes(point.id)
      ? existing.filter(id => id !== point.id)
      : [...existing, point.id]
    : existing.includes(point.id)
      ? [...existing]
      : [point.id]
  context.scene.setTargetSelection(
    ids.length
      ? { kind: "automation", trackId: row.track.id, laneId: row.laneId, pointIds: ids }
      : { kind: "none" }
  )
  const originBar = automationBar(context.scene.get(), pointer.x)
  let isMoved = false
  let next: AutomationPoint[] = [...source]
  return {
    cursor: "grabbing",
    autoScroll: "horizontal",
    move(current) {
      if (!ids.length) {
        return
      }
      isMoved = true
      const state = context.getState()
      const rawDelta = automationBar(context.scene.get(), current.x) - originBar
      const valueDelta = ((pointer.y - current.y) / row.valueHeight) * (current.shiftKey ? 0.1 : 1)
      const moving = new Set(ids)
      const minBar = Math.min(...source.filter(item => moving.has(item.id)).map(item => item.bar))
      const maxBar = Math.max(...source.filter(item => moving.has(item.id)).map(item => item.bar))
      const snapped = snapBar(
        Math.max(1, minBar + rawDelta),
        state.workspace.snap,
        context.scene.get().gridPlan.cellBars,
        context.scene.get().bars + 1,
        current.altKey || current.metaKey
      )
      const delta = Math.min(context.scene.get().bars + 1 - maxBar, snapped - minBar)
      const edited = source
        .filter(item => moving.has(item.id))
        .map(item => {
          return {
            ...item,
            bar: item.bar + delta,
            value: clampAutomationValue(item.value + valueDelta),
          }
        })
      next = sortedPoints([
        ...source.filter(
          item =>
            !moving.has(item.id) &&
            edited.every(other => !(Math.abs(item.bar - other.bar) < 0.000001))
        ),
        ...edited,
      ])
      previewAutomation(context, row.track.id, row.laneId, next)
    },
    finish(cancelled) {
      finishProjectPreview(context, cancelled || !isMoved)
      if (!(!cancelled && !isMoved && !pointer.shiftKey && ids.length === 1)) {
        return
      }

      context.actions.deleteAutomationPoint(row.track.id, row.laneId, point.id)
      context.scene.setTargetSelection({ kind: "none" })
    },
  }
}
