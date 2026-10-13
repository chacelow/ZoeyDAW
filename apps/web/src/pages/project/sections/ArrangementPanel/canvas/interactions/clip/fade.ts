import type { AudioClip, Track } from "@/pages/project/model/types"
import {
  clampFadeCurve,
  DEFAULT_FADE_CURVE,
  FADE_CURVE_VERTICAL_SCALE,
  fadeControls,
} from "@/pages/project/model/fades"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import { clipRect, layoutTrackRows } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import {
  clipVisualGeometry,
  FADE_HANDLE_PX,
} from "@/pages/project/sections/ArrangementPanel/canvas/clip-geometry"

export function createFadeGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  clip: AudioClip,
  tracks: readonly Track[],
  edge: "in" | "out",
  handle: "length" | "curve"
): CanvasGesture {
  const original = fadeControls(clip, edge)
  const other = fadeControls(clip, edge === "in" ? "out" : "in")
  const owner = tracks.find(track => track.clips.some(item => item.id === clip.id))
  const curveKey = edge === "in" ? "fadeInCurve" : "fadeOutCurve"
  const originalCurve = clip[curveKey] ?? DEFAULT_FADE_CURVE
  const positionKey = edge === "in" ? "fadeInCurvePosition" : "fadeOutCurvePosition"
  const originalPosition = clip[positionKey] ?? 0.5
  const scene = context.scene.get()
  const row =
    handle === "curve"
      ? layoutTrackRows(scene).find(item => item.track.id === owner?.id)
      : undefined
  const height = row
    ? clipVisualGeometry(
        clipRect(clip, row, scene.viewport.pxPerBar, scene.viewport.scrollX),
        clip,
        row.track,
        true
      ).bodyHeight
    : 64
  let curve = originalCurve
  const width = Math.max(1, (original.end - original.start) * scene.viewport.pxPerBar)
  const gap = Math.min(0.5, Math.max(0.1, FADE_HANDLE_PX / width))
  let position = originalPosition
  let lastX = pointer.x
  let lastY = pointer.y
  let patch: Partial<AudioClip> | null = null
  return {
    cursor: handle === "curve" ? "move" : "ew-resize",
    autoScroll: false,
    commitOnInterrupt: true,
    move(next) {
      if (handle === "curve") {
        curve = clampFadeCurve(
          curve +
            ((edge === "in" ? -1 : 1) * (next.y - lastY)) /
              (Math.max(1, height) * FADE_CURVE_VERTICAL_SCALE)
        )
        lastY = next.y
        position = Math.max(gap, Math.min(1 - gap, position + (next.x - lastX) / width))
        lastX = next.x
        patch =
          curve === originalCurve && position === originalPosition
            ? null
            : { [curveKey]: curve, [positionKey]: position }
      } else {
        const delta = (next.x - pointer.x) / context.scene.get().viewport.pxPerBar
        if (edge === "in") {
          const end = Math.max(original.start, Math.min(other.start, original.end + delta))
          patch = end === original.end ? null : { fadeInBars: end - original.start }
        } else {
          const start = Math.max(other.end, Math.min(original.end, original.start + delta))
          patch = start === original.start ? null : { fadeOutBars: original.end - start }
        }
      }
      context.scene.setPreviewTracks(
        patch && owner
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
          : null
      )
    },
    finish(cancelled) {
      if (!cancelled && patch) {
        context.actions.beginEdit()
        context.actions.updateClip(clip.id, patch)
        context.actions.endEdit()
      }
      context.scene.setPreviewTracks(null)
    },
  }
}
