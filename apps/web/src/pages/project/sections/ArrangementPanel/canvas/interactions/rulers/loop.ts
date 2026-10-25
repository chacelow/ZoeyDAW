import { MIN_CLIP_LENGTH_BARS } from "@zoeydaw/project-core/grid"
import { positionToBar } from "@zoeydaw/project-core/types"
import { layoutTrackRows } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { beginProjectPreview, finishProjectPreview, setLoopPreview } from "../project-preview"
import { barAt, movedLoop, rulerBar } from "./geometry"
import type { LoopRegion } from "@zoeydaw/project-core/types"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"

export function loopGesture(
  context: InteractionContext,
  edge: "start" | "end" | "body",
  pointer: CanvasPointer
): CanvasGesture {
  beginProjectPreview(context)
  const original = context.getState().document.transport.loop
  const originBar = barAt(context.scene.get(), pointer.x)
  let preview = original
  context.scene.setTargetSelection({ kind: "loop" })
  // Pressing the brace clears any time selection. A plain click highlights the
  // whole loop span across every track at half strength; once the pointer
  // travels, only the last clicked track stays highlighted.
  context.actions.setTimeSelection(null)
  const allTrackIds = context.getState().document.tracks.map(track => track.id)
  context.scene.setTimeSelection({
    startBar: original.startBar,
    endBar: original.endBar,
    trackIds: allTrackIds,
    emphasis: "subtle",
  })
  let dragged = false
  // Fallback lane when the pointer stays in the ruler band: the track that was
  // clicked last before this gesture.
  const lastClickedTrackId = context.getState().session.selectedTrackIds.at(-1) ?? null
  let releaseTrackId: string | null = lastClickedTrackId
  const highlight = (span: LoopRegion) => {
    context.scene.setTimeSelection({
      startBar: span.startBar,
      endBar: span.endBar,
      trackIds: dragged && releaseTrackId ? [releaseTrackId] : allTrackIds,
      emphasis: "subtle",
    })
  }
  const previousBar = positionToBar(
    context.getState().session.position,
    context.getState().document.transport.numerator
  )
  const previousInsertion = context.getState().session.insertionPoint
  context.actions.seekBar(original.startBar)
  return {
    cursor: edge === "body" ? "grabbing" : edge === "start" ? "brace-left" : "brace-right",
    autoScroll: "horizontal",
    commitOnInterrupt: true,
    move(current) {
      const scene = context.scene.get()
      const delta = barAt(scene, current.x) - originBar
      if (!dragged && Math.abs(current.x - pointer.x) > 2) {
        dragged = true
      }
      if (dragged) {
        const row = layoutTrackRows(scene).find(
          item => current.y >= item.top && current.y < item.top + item.height
        )
        if (row?.track.id) {
          releaseTrackId = row.track.id
        }
      }
      if (edge === "body") {
        const start = rulerBar(
          scene,
          (original.startBar + delta - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX,
          context.getState().workspace.snap,
          current.shiftKey
        )
        preview = movedLoop(original, edge, start - original.startBar, scene.bars + 1)
      } else {
        const anchor = edge === "start" ? original.startBar : original.endBar
        const bar = rulerBar(
          scene,
          (anchor + delta - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX,
          context.getState().workspace.snap,
          current.shiftKey
        )
        preview = movedLoop(original, edge, bar - anchor, scene.bars + 1)
      }
      setLoopPreview(context, preview)
      // The highlight tracks the live brace span, so it follows every drag step
      // instead of freezing at the pressed width. The playback position follows
      // the loop start for the same reason.
      highlight(preview)
      context.actions.seekBar(preview.startBar)
    },
    finish(cancelled) {
      const isChanged = preview.startBar !== original.startBar || preview.endBar !== original.endBar
      finishProjectPreview(context, cancelled || !isChanged)
      if (cancelled) {
        context.actions.restoreSeek(previousBar, previousInsertion)
        return
      }
      if (!isChanged) {
        const selection = {
          startBar: original.startBar,
          endBar: original.endBar,
          trackIds: dragged && releaseTrackId ? [releaseTrackId] : allTrackIds,
          emphasis: "subtle" as const,
        }
        context.actions.setTimeSelection(selection)
        context.scene.setTimeSelection(selection)
      } else {
        const selection = {
          startBar: preview.startBar,
          endBar: preview.endBar,
          trackIds: dragged && releaseTrackId ? [releaseTrackId] : allTrackIds,
          emphasis: "subtle" as const,
        }
        context.actions.setTimeSelection(selection)
        context.scene.setTimeSelection(selection)
      }
    },
  }
}

export function loopFromSelection(context: InteractionContext): boolean {
  const selection = context.scene.get().timeSelection ?? context.getState().session.timeSelection
  if (
    !selection ||
    !Number.isFinite(selection.startBar) ||
    !Number.isFinite(selection.endBar) ||
    selection.endBar <= selection.startBar
  ) {
    return false
  }
  const scene = context.scene.get()
  const startBar = Math.max(1, Math.min(scene.bars + 1 - MIN_CLIP_LENGTH_BARS, selection.startBar))
  const endBar = Math.max(
    startBar + MIN_CLIP_LENGTH_BARS,
    Math.min(scene.bars + 1, selection.endBar)
  )
  const next: LoopRegion = { enabled: true, startBar, endBar }
  context.actions.setLoop(next)
  context.scene.setTargetSelection({ kind: "loop" })
  return true
}
