import { clampAutomationCurve, clampAutomationValue } from "@/pages/project/model/automation-curve"
import { snapBar } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
import { beginProjectPreview, finishProjectPreview } from "../project-preview"
import { automationBar, automationSegmentValue } from "./geometry"
import { previewAutomation } from "./preview"
import type { AutomationPoint } from "@/pages/project/model/types"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import type { AutomationRow } from "./geometry"

export function segmentGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  row: AutomationRow,
  from: AutomationPoint,
  to: AutomationPoint,
  near: boolean
): CanvasGesture {
  beginProjectPreview(context)
  const source = row.lane?.points ?? []
  let isChanged = false
  let next = [...source]
  return {
    cursor: pointer.altKey ? "ns-resize" : "grabbing",
    autoScroll: false,
    move(current) {
      isChanged = true
      const delta = ((pointer.y - current.y) / row.valueHeight) * (current.shiftKey ? 0.1 : 1)
      next = pointer.altKey
        ? source.map(point =>
            point.id === from.id
              ? { ...point, curve: clampAutomationCurve((point.curve ?? 0) + delta * 4) }
              : point
          )
        : source.map(point =>
            point.id === from.id || point.id === to.id
              ? { ...point, value: clampAutomationValue(point.value + delta) }
              : point
          )
      previewAutomation(context, row.track.id, row.laneId, next)
    },
    finish(cancelled) {
      finishProjectPreview(context, cancelled || !isChanged)
      if (cancelled) {
        return
      }
      if (!isChanged && !pointer.altKey && !near) {
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
