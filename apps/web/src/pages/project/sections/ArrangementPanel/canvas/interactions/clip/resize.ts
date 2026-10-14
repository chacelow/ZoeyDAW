import { projectClipResize } from "@/pages/project/model/clip-edits"
import { barAtX, snappedBar } from "../coordinates"
import { beginProjectPreview, finishProjectPreview, setTracksPreview } from "../project-preview"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import type { Clip } from "@/pages/project/model/types"

export function createResizeGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  clip: Clip,
  edge: "left" | "right"
): CanvasGesture | null {
  beginProjectPreview(context)
  const { tracks } = context.getState().document
  const owner = tracks.find(track => track.clips.some(item => item.id === clip.id))
  const current = owner?.clips.find(item => item.id === clip.id)
  if (!current) {
    finishProjectPreview(context, true)
    return null
  }
  clip = current
  const originalEnd = clip.startBar + clip.lengthBars
  const original = edge === "left" ? clip.startBar : originalEnd
  const grabOffset = barAtX(context, pointer.x) - original
  let bar = original
  return {
    cursor: "ew-resize",
    autoScroll: "horizontal",
    move(next) {
      context.scene.setClipResize({ id: clip.id, edge })
      const raw = snappedBar(context, barAtX(context, next.x) - grabOffset)
      const preview = projectClipResize(clip, edge, raw)
      bar = edge === "left" ? preview.startBar : preview.startBar + preview.lengthBars
      if (bar === original) {
        setTracksPreview(context, tracks)
        return
      }
      setTracksPreview(
        context,
        tracks.map(track =>
          track.clips.some(item => item.id === clip.id)
            ? { ...track, clips: track.clips.map(item => (item.id === clip.id ? preview : item)) }
            : track
        )
      )
    },
    finish(cancelled) {
      finishProjectPreview(context, cancelled)
      if (!cancelled) {
        const owner = context
          .getState()
          .document.tracks.find(track => track.clips.some(item => item.id === clip.id))
        const resized = owner?.clips.find(item => item.id === clip.id)
        if (owner && resized) {
          context.actions.setInsertionPoint({ trackId: owner.id, bar: resized.startBar })
        }
      }
      context.scene.setClipResize(null)
    },
  }
}
