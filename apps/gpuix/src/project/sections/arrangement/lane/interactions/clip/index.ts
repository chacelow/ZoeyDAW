import { acceptsClip, positionToBar } from "../../../../../model/types"
import { snapBar } from "../../../../../model/grid-geometry"
import { automationBar } from "../../../core/automation/geometry"
import { hitTest } from "../../../core/hit-test"
import { createMoveGesture } from "./move"
import { createResizeGesture } from "./resize"
import { createFadeGesture } from "./fade"
import { createTimeRangeGesture } from "./timeRange"
import type { LaneContext, LaneInteraction } from "../types"

export function createClipInteractions(context: LaneContext): LaneInteraction {
  const { scene, actions } = context
  let ownsTarget = false
  return {
    start(pointer) {
      const state = context.getState()
      const hit = hitTest(scene.get(), pointer.x, pointer.y, state.workspace.automationMode)
      if (!hit) {
        actions.selectClips([])
        scene.setSelection(new Set())
        scene.setTargetSelection({ kind: "none" })
        return null
      }
      actions.selectTracks([hit.track.id], "arrangement")
      ownsTarget = true
      if (!("clip" in hit)) {
        actions.selectClips([])
        scene.setSelection(new Set())
        scene.setTargetSelection({ kind: "none" })
        return createTimeRangeGesture(context, pointer, hit.track.id)
      }
      const additive = pointer.shiftKey || pointer.metaKey || pointer.ctrlKey
      const selected = state.session.selectedClipIds
      const next = additive
        ? selected.includes(hit.clip.id)
          ? selected.filter(id => id !== hit.clip.id)
          : [...selected, hit.clip.id]
        : selected.includes(hit.clip.id)
          ? selected
          : [hit.clip.id]
      actions.selectClips(next)
      scene.setSelection(new Set(next))
      scene.setTargetSelection(
        next.includes(hit.clip.id)
          ? { kind: "clip", id: hit.clip.id, phase: "selected" }
          : { kind: "none" }
      )
      if (hit.kind === "clip-title" || hit.kind === "clip-resize") {
        actions.setTimeSelection(null)
        scene.setTimeSelection(null)
        actions.setInsertionPoint({ trackId: hit.track.id, bar: hit.clip.startBar })
      }
      if (hit.kind === "clip-title" && !additive && next.includes(hit.clip.id)) {
        return createMoveGesture(context, pointer, hit.track, hit.clip.id, [
          hit.clip.id,
          ...next.filter(id => id !== hit.clip.id),
        ])
      }
      if (hit.kind === "clip-body" && !additive)
        return createTimeRangeGesture(context, pointer, hit.track.id)
      if (hit.kind === "clip-resize")
        return createResizeGesture(context, pointer, hit.clip, hit.edge)
      return hit.kind === "clip-fade" && hit.clip.kind === "audio"
        ? createFadeGesture(context, pointer, hit.clip, hit.edge, hit.handle)
        : null
    },
    hover(pointer) {
      const hit = hitTest(
        scene.get(),
        pointer.x,
        pointer.y,
        context.getState().workspace.automationMode
      )
      scene.setHover(
        hit && "clip" in hit
          ? {
              id: hit.clip.id,
              region:
                hit.kind === "clip-title"
                  ? "title"
                  : hit.kind === "clip-resize"
                    ? hit.region
                    : "body",
            }
          : null
      )
      return hit?.kind === "clip-resize" || (hit?.kind === "clip-fade" && hit.handle !== "curve")
        ? "ew-resize"
        : hit?.kind === "clip-fade"
          ? "move"
          : hit?.kind === "clip-title"
            ? "grab"
            : "default"
    },
    doubleClick(pointer) {
      const hit = hitTest(
        scene.get(),
        pointer.x,
        pointer.y,
        context.getState().workspace.automationMode
      )
      if (!hit) return false
      if ("clip" in hit) {
        actions.selectClips([hit.clip.id])
        scene.setSelection(new Set([hit.clip.id]))
        scene.setTargetSelection({ kind: "clip", id: hit.clip.id, phase: "selected" })
        ownsTarget = true
        return true
      }
      if (hit.track.kind !== "audio" && hit.track.kind !== "midi") return false
      const current = scene.get()
      actions.createClip(
        hit.track.id,
        hit.track.kind,
        snapBar(
          hit.bar,
          context.getState().workspace.snap,
          current.gridPlan.cellBars,
          current.bars + 1,
          pointer.shiftKey
        ),
        current.gridPlan.cellBars
      )
      const clip = context
        .getState()
        .document.tracks.find(track => track.id === hit.track.id)
        ?.clips.at(-1)
      if (clip) {
        actions.selectClips([clip.id])
        scene.setSelection(new Set([clip.id]))
      }
      return true
    },
    keyDown(event) {
      const state = context.getState()
      const ids = state.session.selectedClipIds
      const command = (event.metaKey || event.ctrlKey) && !event.altKey
      const key = event.key.toLowerCase()
      if (command && key === "a") {
        const all = state.document.tracks.flatMap(track => track.clips.map(clip => clip.id))
        actions.selectClips(all)
        scene.setSelection(new Set(all))
        return true
      }
      if (command && key === "d" && ids.length) {
        actions.beginEdit()
        actions.duplicateClips(ids)
        actions.endEdit()
        scene.setSelection(new Set(context.getState().session.selectedClipIds))
        return true
      }
      if (command && key === "e" && ids.length) {
        const bar =
          state.session.timeSelection?.startBar ??
          positionToBar(state.session.position, state.document.transport.numerator)
        if (
          state.document.tracks.some(track =>
            track.clips.some(
              clip =>
                ids.includes(clip.id) &&
                bar > clip.startBar &&
                bar < clip.startBar + clip.lengthBars
            )
          )
        ) {
          actions.beginEdit()
          actions.splitClips(ids, bar)
          actions.endEdit()
        }
        return true
      }
      if (command && key === "r" && ids.length) {
        scene.setTargetSelection({ kind: "clip", id: ids[0], phase: "renaming" })
        return true
      }
      return false
    },
    contextMenu(pointer) {
      const hit = hitTest(
        scene.get(),
        pointer.x,
        pointer.y,
        context.getState().workspace.automationMode
      )
      if (!hit) return null
      if ("clip" in hit) {
        const selected = context.getState().session.selectedClipIds
        const ids = selected.includes(hit.clip.id) ? selected : [hit.clip.id]
        actions.selectClips(ids)
        scene.setSelection(new Set(ids))
        scene.setTargetSelection({ kind: "clip", id: hit.clip.id, phase: "selected" })
        ownsTarget = true
        return { kind: "clip", clipId: hit.clip.id, clipIds: ids }
      }
      const current = scene.get()
      return acceptsClip(hit.track.kind, "audio") || acceptsClip(hit.track.kind, "midi")
        ? {
            kind: "clip-lane",
            trackId: hit.track.id,
            bar: snapBar(
              automationBar(current, pointer.x),
              context.getState().workspace.snap,
              current.gridPlan.cellBars,
              current.bars + 1,
              pointer.shiftKey
            ),
          }
        : null
    },
    deactivate() {
      scene.setHover(null)
      if (ownsTarget && scene.get().targetSelection.kind === "clip")
        scene.setTargetSelection({ kind: "none" })
      ownsTarget = false
    },
  }
}
