import type { AudioClip } from "@/project/model/types"
import { beginFadeDrag, moveFadeDrag } from "@/project/sections/arrangement/core/clip/fade"
import { clipVisualGeometry } from "@/project/sections/arrangement/core/clip-geometry"
import { clipRect, layoutTrackRows } from "@/project/sections/arrangement/core/layout"
import { beginTracksPreview } from "../project-preview"
import type { LaneContext, LaneGesture, LanePointer } from "../types"

export function createFadeGesture(
  context: LaneContext,
  pointer: LanePointer,
  clip: AudioClip,
  edge: "in" | "out",
  handle: "length" | "curve"
): LaneGesture | null {
  const tracks = context.getState().document.tracks
  const owner = tracks.find(track => track.clips.some(item => item.id === clip.id))
  const scene = context.scene.get()
  const row = layoutTrackRows(scene).find(item => item.track.id === owner?.id)
  if (!row || !owner) return null
  const geometry = clipVisualGeometry(
    clipRect(clip, row, scene.viewport.pxPerBar, scene.viewport.scrollX),
    clip,
    owner,
    true
  )
  let drag = beginFadeDrag(
    clip,
    edge,
    handle,
    pointer,
    scene.viewport.pxPerBar,
    geometry.bodyHeight
  )
  let patch: Partial<AudioClip> | null = null
  const preview = beginTracksPreview(context)
  return {
    cursor: handle === "curve" ? "move" : "ew-resize",
    autoScroll: false,
    move(next) {
      const result = moveFadeDrag(drag, next, context.scene.get().viewport.pxPerBar)
      drag = result.state
      patch = result.patch
      preview.update(
        patch
          ? tracks.map(track =>
              track.id === owner.id
                ? {
                    ...track,
                    clips: track.clips.map(item =>
                      item.id === clip.id ? { ...clip, ...patch } : item
                    ),
                  }
                : track
            )
          : tracks
      )
    },
    finish(cancelled) {
      preview.finish(cancelled || patch === null)
    },
  }
}
