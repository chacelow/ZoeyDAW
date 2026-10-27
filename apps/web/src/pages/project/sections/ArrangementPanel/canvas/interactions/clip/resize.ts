import { projectClipResize, replaceClip } from "@zoeydaw/project-core/clip-edits"
import { uniqueId } from "@zoeydaw/project-core/reducers"
import { barAtX, snappedBar } from "../coordinates"
import { beginProjectPreview, finishProjectPreview, setTracksPreview } from "../project-preview"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import type { Clip } from "@zoeydaw/project-core/types"

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
  const fragmentIds = new Map<string, string>()
  const fragmentId = (key: string) => {
    const existing = fragmentIds.get(key)
    if (existing) return existing
    const id = uniqueId("clip")
    fragmentIds.set(key, id)
    return id
  }
  let bar = original
  return {
    cursor: edge === "left" ? "brace-left" : "brace-right",
    autoScroll: "horizontal",
    commitOnInterrupt: true,
    move(next) {
      context.scene.setClipResize({ id: clip.id, edge })
      const requested = snappedBar(context, barAtX(context, next.x) - grabOffset)
      const minLeft = original - Math.max(0, clip.sourceOffsetBars ?? 0)
      const raw =
        clip.kind === "audio"
          ? edge === "left"
            ? Math.max(minLeft, requested)
            : Math.min(original, requested)
          : requested
      const bpm = context.getState().document.transport.bpm
      const preview = projectClipResize(clip, edge, raw, bpm)
      bar = edge === "left" ? preview.startBar : preview.startBar + preview.lengthBars
      if (bar === original) {
        setTracksPreview(context, tracks)
        return
      }
      setTracksPreview(context, replaceClip(tracks, preview, fragmentId, bpm))
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
