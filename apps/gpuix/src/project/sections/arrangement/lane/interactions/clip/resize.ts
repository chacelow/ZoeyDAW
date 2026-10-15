import { projectClipResize } from "@/project/model/clip-edits"
import { snapBar } from "@/project/model/grid-geometry"
import type { Clip } from "@/project/model/types"
import { automationBar } from "@/project/sections/arrangement/core/automation/geometry"
import { beginTracksPreview } from "../project-preview"
import type { LaneContext, LaneGesture, LanePointer } from "../types"

export function createResizeGesture(
  context: LaneContext,
  pointer: LanePointer,
  clip: Clip,
  edge: "left" | "right"
): LaneGesture | null {
  const { tracks } = context.getState().document
  const current = tracks.flatMap(track => track.clips).find(item => item.id === clip.id)
  if (!current) return null
  clip = current
  const preview = beginTracksPreview(context)
  const original = edge === "left" ? clip.startBar : clip.startBar + clip.lengthBars
  const grabOffset = automationBar(context.scene.get(), pointer.x) - original
  return {
    cursor: "ew-resize",
    autoScroll: "horizontal",
    move(next) {
      const scene = context.scene.get()
      const bar = snapBar(
        automationBar(scene, next.x) - grabOffset,
        context.getState().workspace.snap,
        scene.gridPlan.cellBars,
        scene.bars + 1,
        next.shiftKey
      )
      const resized = projectClipResize(clip, edge, bar)
      context.scene.setClipResize({ id: clip.id, edge })
      preview.update(
        tracks.map(track =>
          track.clips.some(item => item.id === clip.id)
            ? { ...track, clips: track.clips.map(item => (item.id === clip.id ? resized : item)) }
            : track
        )
      )
    },
    finish(cancelled) {
      preview.finish(cancelled)
      if (!cancelled) {
        const owner = context
          .getState()
          .document.tracks.find(track => track.clips.some(item => item.id === clip.id))
        const resized = owner?.clips.find(item => item.id === clip.id)
        if (owner && resized)
          context.actions.setInsertionPoint({ trackId: owner.id, bar: resized.startBar })
      }
      context.scene.setClipResize(null)
    },
  }
}
