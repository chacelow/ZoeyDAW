import { uniqueId } from "@/pages/project/model/reducers"
import { projectClipMove } from "@/pages/project/model/clip-edits"
import {
  layoutTrackRows,
  arrangementBodyTop,
  arrangementBodyBottom,
  pinnedTrackHeight,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { barAtX, snappedBar } from "../coordinates"
import { beginProjectPreview, finishProjectPreview, setTracksPreview } from "../project-preview"
import type { ClipMoveIdentity, ClipMovePlan } from "@/pages/project/model/clip-edits"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import type { Track } from "@/pages/project/model/types"

export function createMoveGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  track: Track,
  clipId: string,
  ids: string[]
): CanvasGesture | null {
  beginProjectPreview(context)
  const source = context.getState().document.tracks
  const anchor = source.find(item => item.id === track.id)?.clips.find(clip => clip.id === clipId)
  if (!anchor) {
    finishProjectPreview(context, true)
    return null
  }
  const offset = barAtX(context, pointer.x) - anchor.startBar
  const clipIds = new Map<string, string>()
  const automationIds = new Map<string, string>()
  const identity: ClipMoveIdentity = {
    clip(id) {
      let copy = clipIds.get(id)
      if (!copy) {
        copy = uniqueId("clip")
        clipIds.set(id, copy)
      }
      return copy
    },
    automation(key) {
      let copy = automationIds.get(key)
      if (!copy) {
        copy = uniqueId("automation")
        automationIds.set(key, copy)
      }
      return copy
    },
  }
  let lastPlan: ClipMovePlan | null = null
  let lastCopy = pointer.altKey
  let isValid = true
  return {
    get cursor(): CanvasGesture["cursor"] {
      return isValid ? "grabbing" : "not-allowed"
    },
    autoScroll: "both",
    commitOnInterrupt: true,
    move(next) {
      const scene = context.scene.get()
      const pinnedTop =
        arrangementBodyBottom(scene.viewport.height) - pinnedTrackHeight(scene.tracks)
      const row = layoutTrackRows(scene).find(row => {
        return (
          next.y >= row.top &&
          next.y < row.top + row.height &&
          next.y >= arrangementBodyTop() &&
          (row.track.kind === "return" || row.track.kind === "main"
            ? next.y >= pinnedTop
            : next.y < pinnedTop)
        )
      })
      if (!row || (row.track.kind !== "audio" && row.track.kind !== "midi")) {
        isValid = false
        return
      }
      const delta = snappedBar(context, barAtX(context, next.x) - offset) - anchor.startBar
      if (
        lastPlan?.targetTrackId === row.track.id &&
        lastPlan.deltaBars === delta &&
        lastCopy === next.altKey
      ) {
        isValid = true
        return
      }
      const plan = projectClipMove(
        source,
        ids,
        row.track.id,
        delta,
        next.altKey,
        context.getState().workspace.automationMode,
        identity
      )
      if (!plan) {
        isValid = false
        return
      }
      isValid = true
      lastCopy = next.altKey
      if (!next.altKey && plan.deltaBars === 0 && plan.targetTrackId === track.id) {
        lastPlan = null
        setTracksPreview(context, source)
        context.scene.setClipDrag(null)
        return
      }
      lastPlan = plan
      context.scene.setClipDrag({ source, ids: new Set(plan.selectedIds) })
      setTracksPreview(context, plan.tracks)
    },
    finish(cancelled) {
      const plan = lastPlan
      finishProjectPreview(context, cancelled || plan === null)
      context.scene.setClipDrag(null)
      if (cancelled || !plan) {
        return
      }
      context.actions.selectClips(plan.selectedIds)
      const selected = context.getState().session.selectedClipIds
      context.scene.setSelection(new Set(selected))
      const selectedId = selected[0]
      const owner = context
        .getState()
        .document.tracks.find(track => track.clips.some(clip => clip.id === selectedId))
      const clip = owner?.clips.find(clip => clip.id === selectedId)
      if (!(owner && clip)) {
        return
      }

      context.actions.setInsertionPoint({ trackId: owner.id, bar: clip.startBar })
      context.scene.setTargetSelection({ kind: "clip", id: clip.id, phase: "selected" })
    },
  }
}
