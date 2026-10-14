import { projectClipMove } from "../../../../../model/clip-edits"
import type { ClipMoveIdentity, ClipMovePlan } from "../../../../../model/clip-edits"
import { uniqueId } from "../../../../../model/reducers"
import { snapBar } from "../../../../../model/grid-geometry"
import type { Track } from "../../../../../model/types"
import { automationBar } from "../../../core/automation/geometry"
import { hitTest } from "../../../core/hit-test"
import { beginTracksPreview } from "../project-preview"
import type { LaneContext, LaneGesture, LanePointer } from "../types"

export function createMoveGesture(
  context: LaneContext,
  pointer: LanePointer,
  track: Track,
  clipId: string,
  ids: string[]
): LaneGesture | null {
  const source = context.getState().document.tracks
  const anchor = source.find(item => item.id === track.id)?.clips.find(clip => clip.id === clipId)
  if (!anchor) return null
  const preview = beginTracksPreview(context)
  const offset = automationBar(context.scene.get(), pointer.x) - anchor.startBar
  const clipIds = new Map<string, string>()
  const automationIds = new Map<string, string>()
  const identity: ClipMoveIdentity = {
    clip(id) {
      const copy = clipIds.get(id) ?? uniqueId("clip")
      clipIds.set(id, copy)
      return copy
    },
    automation(key) {
      const copy = automationIds.get(key) ?? uniqueId("automation")
      automationIds.set(key, copy)
      return copy
    },
  }
  let lastPlan: ClipMovePlan | null = null
  let lastCopy = pointer.altKey
  let valid = true
  return {
    get cursor() {
      return valid ? "grabbing" : "not-allowed"
    },
    autoScroll: "both",
    commitOnInterrupt: true,
    move(next) {
      const scene = context.scene.get()
      const hit = hitTest(scene, next.x, next.y, context.getState().workspace.automationMode)
      if (!hit || (hit.track.kind !== "audio" && hit.track.kind !== "midi")) {
        valid = false
        return
      }
      const delta =
        snapBar(
          automationBar(scene, next.x) - offset,
          context.getState().workspace.snap,
          scene.gridPlan.cellBars,
          scene.bars + 1,
          next.shiftKey
        ) - anchor.startBar
      if (
        lastPlan?.targetTrackId === hit.track.id &&
        lastPlan.deltaBars === delta &&
        lastCopy === next.altKey
      ) {
        valid = true
        return
      }
      const plan = projectClipMove(
        source,
        ids,
        hit.track.id,
        delta,
        next.altKey,
        context.getState().workspace.automationMode,
        identity
      )
      if (!plan) {
        valid = false
        return
      }
      valid = true
      lastCopy = next.altKey
      if (!next.altKey && plan.deltaBars === 0 && plan.targetTrackId === track.id) {
        lastPlan = null
        preview.update(source)
        context.scene.setClipDrag(null)
        return
      }
      lastPlan = plan
      context.scene.setClipDrag({ source, ids: new Set(plan.selectedIds) })
      preview.update(plan.tracks)
    },
    finish(cancelled) {
      const plan = lastPlan
      preview.finish(cancelled || plan === null)
      context.scene.setClipDrag(null)
      if (cancelled || !plan) return
      context.actions.selectClips(plan.selectedIds)
      context.scene.setSelection(new Set(context.getState().session.selectedClipIds))
      const selectedId = context.getState().session.selectedClipIds[0]
      const owner = context
        .getState()
        .document.tracks.find(item => item.clips.some(clip => clip.id === selectedId))
      const clip = owner?.clips.find(item => item.id === selectedId)
      if (!owner || !clip) return
      context.actions.setInsertionPoint({ trackId: owner.id, bar: clip.startBar })
      context.scene.setTargetSelection({ kind: "clip", id: clip.id, phase: "selected" })
    },
  }
}
