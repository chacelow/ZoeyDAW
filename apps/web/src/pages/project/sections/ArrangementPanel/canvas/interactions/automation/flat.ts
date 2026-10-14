import { snapBar } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
import { automationBar } from "./geometry"
import type { AutomationRow } from "./geometry"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"

/**
A click on the held head/tail or untouched default line materializes one breakpoint.
*/
export function flatLineGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  row: AutomationRow,
  value: number
): CanvasGesture {
  let isMoved = false
  return {
    cursor: "default",
    autoScroll: false,
    move() {
      isMoved = true
    },
    finish(cancelled) {
      if (cancelled || isMoved) {
        return
      }
      const state = context.getState()
      const bar = snapBar(
        automationBar(context.scene.get(), pointer.x),
        state.workspace.snap,
        context.scene.get().gridPlan.cellBars,
        context.scene.get().bars + 1,
        pointer.altKey || pointer.metaKey
      )
      context.actions.setAutomationPoint(row.track.id, row.laneId, { bar, value })
    },
  }
}
