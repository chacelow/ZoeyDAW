import { clampAutomationCurve, clampAutomationValue } from "@/pages/project/model/automation-curve"
import type { AutomationPoint } from "@/pages/project/model/types"
import { snapBar } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import { automationBar, automationSegmentValue, type AutomationRow } from "./geometry"
import { previewAutomation } from "./preview"

export function segmentGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  row: AutomationRow,
  from: AutomationPoint,
  to: AutomationPoint,
  near: boolean
): CanvasGesture {
  const source = row.lane?.points ?? []
  let changed = false
  let next = [...source]
  return {
    cursor: pointer.altKey ? "ns-resize" : "grabbing",
    autoScroll: false,
    move(current) {
      changed = true
      const delta = ((pointer.y - current.y) / row.valueHeight) * (current.shiftKey ? 0.1 : 1)
      if (pointer.altKey)
        next = source.map(point =>
          point.id === from.id
            ? { ...point, curve: clampAutomationCurve((point.curve ?? 0) + delta * 4) }
            : point
        )
      else
        next = source.map(point =>
          point.id === from.id || point.id === to.id
            ? { ...point, value: clampAutomationValue(point.value + delta) }
            : point
        )
      previewAutomation(context, row.track.id, row.laneId, next)
    },
    finish(cancelled) {
      context.scene.setPreviewTracks(null)
      if (cancelled) return
      if (changed) context.actions.replaceAutomationPoints(row.track.id, row.laneId, next)
      else if (!pointer.altKey && !near) {
        const state = context.getState()
        const bar = snapBar(
          automationBar(context.scene.get(), pointer.x),
          state.workspace.snap,
          context.scene.get().gridPlan.cellBars,
          context.scene.get().bars + 1,
          pointer.metaKey
        )
        context.actions.setAutomationPoint(row.track.id, row.laneId, {
          bar,
          value: automationSegmentValue(from, to, bar),
        })
      }
    },
  }
}
