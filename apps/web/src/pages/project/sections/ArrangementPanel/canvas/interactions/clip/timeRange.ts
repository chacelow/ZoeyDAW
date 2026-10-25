import { hitTest } from "@/pages/project/sections/ArrangementPanel/canvas/hit-test"
import { layoutTrackRows } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { barAtX, snappedBar } from "../coordinates"
import type { TimeSelection } from "@zoeydaw/project-core/types"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"

export function createTimeRangeGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  trackId: string
): CanvasGesture {
  const previous: TimeSelection | null = context.getState().session.timeSelection
  const previousInsertion = context.getState().session.insertionPoint
  const startBar = snappedBar(context, barAtX(context, pointer.x))
  let endBar = startBar
  let trackIds = [trackId]
  context.actions.setTimeSelection(null)
  context.actions.setInsertionPoint({ trackId, bar: startBar })
  context.scene.setTimeSelection(null)
  context.scene.setPlayback({
    playing: context.getState().session.playing,
    insertionPoint: { trackId, bar: startBar },
  })
  return {
    cursor: "default",
    autoScroll: "both",
    move(next) {
      endBar = snappedBar(context, barAtX(context, next.x))
      const target = hitTest(
        context.scene.get(),
        next.x,
        next.y,
        context.getState().workspace.automationMode
      )
      if (target) {
        const rows = layoutTrackRows(context.scene.get())
        const first = rows.findIndex(row => row.track.id === trackId)
        const last = rows.findIndex(row => row.track.id === target.track.id)
        if (first !== -1 && last !== -1) {
          trackIds = rows
            .slice(Math.min(first, last), Math.max(first, last) + 1)
            .map(row => row.track.id)
        }
      }
      context.scene.setTimeSelection({
        startBar: Math.min(startBar, endBar),
        endBar: Math.max(startBar, endBar),
        trackIds,
      })
    },
    finish(cancelled) {
      if (cancelled) {
        context.actions.setTimeSelection(previous)
        context.actions.setInsertionPoint(previousInsertion)
        context.scene.setTimeSelection(previous)
        context.scene.setPlayback({
          playing: context.getState().session.playing,
          insertionPoint: previousInsertion,
        })
        return
      }
      const selection = {
        startBar: Math.min(startBar, endBar),
        endBar: Math.max(startBar, endBar),
        trackIds,
      }
      context.actions.setTimeSelection(selection)
      context.scene.setTimeSelection(selection)
      context.actions.setInsertionPoint({ trackId, bar: selection.startBar })
      context.scene.setPlayback({
        playing: context.getState().session.playing,
        insertionPoint: { trackId, bar: selection.startBar },
      })
    },
  }
}
