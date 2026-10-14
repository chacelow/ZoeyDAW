import { visibleTracks } from "@/pages/project/model/types"
import { MIN_CLIP_LENGTH_BARS } from "@/pages/project/model/grid"
import { beginProjectPreview, finishProjectPreview, setLoopPreview } from "../project-preview"
import { barAt, movedLoop, rulerBar } from "./geometry"
import type { LoopRegion } from "@/pages/project/model/types"
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
  return {
    cursor: edge === "body" ? "grabbing" : "ew-resize",
    autoScroll: "horizontal",
    move(current) {
      const scene = context.scene.get()
      const delta = barAt(scene, current.x) - originBar
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
    },
    finish(cancelled) {
      const isChanged = preview.startBar !== original.startBar || preview.endBar !== original.endBar
      finishProjectPreview(context, cancelled || !isChanged)
      if (cancelled) {
        return
      }
      if (!isChanged && edge === "body") {
        const trackIds = visibleTracks(context.getState().document.tracks)
          .filter(track => track.kind === "audio" || track.kind === "midi")
          .map(track => track.id)
        const selection = { startBar: original.startBar, endBar: original.endBar, trackIds }
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
