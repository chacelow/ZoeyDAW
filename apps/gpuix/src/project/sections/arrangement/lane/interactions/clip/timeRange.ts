import { snapBar } from "@/project/model/grid-geometry"
import { automationBar } from "@/project/sections/arrangement/core/automation/geometry"
import {
  committedTimeRange,
  timeRangeSelection,
} from "@/project/sections/arrangement/core/clip/timeRange"
import type { LaneContext, LaneGesture, LanePointer } from "../types"

export function createTimeRangeGesture(
  context: LaneContext,
  pointer: LanePointer,
  trackId: string
): LaneGesture {
  const previous = context.getState().session.timeSelection
  const scene = context.scene.get()
  const startBar = snapBar(
    automationBar(scene, pointer.x),
    context.getState().workspace.snap,
    scene.gridPlan.cellBars,
    scene.bars + 1,
    pointer.shiftKey
  )
  let selection = { startBar, endBar: startBar, trackIds: [trackId] }
  return {
    cursor: "default",
    autoScroll: "both",
    move(next) {
      selection = timeRangeSelection(
        context.scene.get(),
        startBar,
        trackId,
        selection.trackIds,
        next,
        context.getState().workspace.snap && !next.shiftKey,
        context.getState().workspace.automationMode
      )
      context.scene.setTimeSelection(selection)
    },
    finish(cancelled) {
      if (cancelled) {
        context.scene.setTimeSelection(previous)
        return
      }
      const committed = committedTimeRange(selection)
      context.actions.setTimeSelection(committed)
      context.actions.setInsertionPoint({ trackId, bar: selection.startBar })
    },
  }
}
