import type { Clip, Track } from "@/pages/project/model/types"
import { mockWaveformPeaks } from "@/pages/project/adapters/fixtures"
import { clampFadeIntervals } from "@/pages/project/model/fades"
import { MIN_CLIP_LENGTH_BARS } from "@/pages/project/model/grid"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import { barAtX, snappedBar } from "../coordinates"

export function createResizeGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  clip: Clip,
  tracks: readonly Track[],
  edge: "left" | "right"
): CanvasGesture {
  const originalEnd = clip.startBar + clip.lengthBars
  const original = edge === "left" ? clip.startBar : originalEnd
  const grabOffset = barAtX(context, pointer.x) - original
  let bar = original
  return {
    cursor: "ew-resize",
    autoScroll: "horizontal",
    move(next) {
      context.scene.setClipResize({ id: clip.id, edge })
      const minimum = MIN_CLIP_LENGTH_BARS
      const raw = snappedBar(context, barAtX(context, next.x) - grabOffset)
      bar =
        edge === "left"
          ? Math.max(1, Math.min(originalEnd - minimum, raw))
          : Math.max(clip.startBar + minimum, raw)
      if (bar === original) {
        context.scene.setPreviewTracks(null)
        return
      }
      const trimmed = bar - clip.startBar
      const length = edge === "left" ? originalEnd - bar : bar - clip.startBar
      const sourceOffset = (clip.sourceOffsetBars ?? 0) + (edge === "left" ? trimmed : 0)
      const preview: Clip =
        clip.kind === "audio"
          ? clampFadeIntervals({
              ...clip,
              startBar: edge === "left" ? bar : clip.startBar,
              lengthBars: length,
              sourceOffsetBars: sourceOffset,
              waveformPeaks: mockWaveformPeaks(clip.samplePath, sourceOffset, length),
            })
          : edge === "left"
            ? { ...clip, startBar: bar, lengthBars: length, sourceOffsetBars: sourceOffset }
            : { ...clip, lengthBars: length }
      context.scene.setPreviewTracks(
        tracks.map(track =>
          track.clips.some(item => item.id === clip.id)
            ? { ...track, clips: track.clips.map(item => (item.id === clip.id ? preview : item)) }
            : track
        )
      )
    },
    finish(cancelled) {
      if (!cancelled && bar !== original) {
        context.actions.beginEdit()
        context.actions.resizeClip(clip.id, edge, bar)
        context.actions.endEdit()
      }
      if (!cancelled) {
        const owner = context
          .getState()
          .document.tracks.find(track => track.clips.some(item => item.id === clip.id))
        const resized = owner?.clips.find(item => item.id === clip.id)
        if (owner && resized)
          context.actions.setInsertionPoint({ trackId: owner.id, bar: resized.startBar })
      }
      context.scene.setPreviewTracks(null)
      context.scene.setClipResize(null)
    },
  }
}
