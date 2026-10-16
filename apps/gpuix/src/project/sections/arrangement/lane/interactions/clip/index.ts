import { acceptsClip, positionToBar } from "@/project/model/types"
import { snapBar } from "@/project/model/grid-geometry"
import { automationBar } from "@/project/sections/arrangement/core/automation/geometry"
import { hitTest } from "@/project/sections/arrangement/core/hit-test"
import { createMoveGesture } from "./move"
import { createResizeGesture } from "./resize"
import { createFadeGesture } from "./fade"
import { createTimeRangeGesture } from "./timeRange"
import type { LaneContext, LaneInteraction } from "../types"

export function createClipInteractions(context: LaneContext): LaneInteraction {
  const { scene, actions } = context
  let ownsTarget = false
  function select(ids: string[], clipId: string) {
    actions.selectClips(ids)
    scene.setTargetSelection(
      ids.includes(clipId) ? { kind: "clip", id: clipId, phase: "selected" } : { kind: "none" }
    )
    ownsTarget = true
  }
  function seekToStart(trackId: string, bar: number) {
    actions.setTimeSelection(null)
    actions.setInsertionPoint({ trackId, bar })
  }
  return {
    start(pointer) {
      const state = context.getState()
      const hit = hitTest(scene.get(), pointer.x, pointer.y, state.workspace.automationMode)
      if (!hit) {
        actions.selectClips([])
        scene.setTargetSelection({ kind: "none" })
        return null
      }
      actions.selectTracks([hit.track.id], "arrangement")
      ownsTarget = true
      if (!("clip" in hit)) {
        actions.selectClips([])
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
      select(next, hit.clip.id)
      if (hit.kind === "clip-title" || hit.kind === "clip-resize") {
        seekToStart(hit.track.id, hit.clip.startBar)
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
      if (hit && "clip" in hit) {
        const region =
          hit.kind === "clip-title" ? "title" : hit.kind === "clip-resize" ? hit.region : "body"
        const current = scene.get().hoverClip
        if (current?.id !== hit.clip.id || current.region !== region)
          scene.setHover({ id: hit.clip.id, region })
      } else if (scene.get().hoverClip) scene.setHover(null)
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
        select([hit.clip.id], hit.clip.id)
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
        return true
      }
      if (command && key === "d" && ids.length) {
        actions.beginEdit()
        actions.duplicateClips(ids)
        actions.endEdit()
        return true
      }
      if (command && key === "e" && ids.length) {
        const bar =
          state.session.timeSelection?.startBar ??
          state.session.insertionPoint?.bar ??
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
