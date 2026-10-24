import { createTrack, uniqueId } from "@zoeydaw/project-core/reducers"
import { visibleTracks } from "@zoeydaw/project-core/types"
import { DEFAULT_TRACK_HEIGHT, arrangementViewProjection } from "@/pages/project/layout"
import { projectClipMove } from "@zoeydaw/project-core/clip-edits"
import {
  layoutTrackRowsForViewport,
  dropZoneTop,
  arrangementBodyTop,
  arrangementBodyBottom,
  pinnedTrackHeight,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { barAtX, snappedBar } from "../coordinates"
import { beginProjectPreview, finishProjectPreview, setTracksPreview } from "../project-preview"
import type { ClipMoveIdentity, ClipMovePlan } from "@zoeydaw/project-core/clip-edits"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import type { Track } from "@zoeydaw/project-core/types"

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
  const lanes = source.filter(item => item.kind === "audio" || item.kind === "midi")
  const chosen = new Set(ids)
  const selectedLanes = lanes.flatMap((lane, index) =>
    lane.clips.some(clip => chosen.has(clip.id)) ? [index] : []
  )
  const firstLane = Math.min(...selectedLanes)
  const lastLane = Math.max(...selectedLanes)
  const newTracks = lanes
    .slice(firstLane, lastLane + 1)
    .map(lane =>
      createTrack(lane.kind === "audio" ? "audio" : "midi", source, undefined, DEFAULT_TRACK_HEIGHT)
    )
  const newAnchor = newTracks[lanes.findIndex(lane => lane.id === track.id) - firstLane]
  const extended = [...source]
  const pinnedIndex = extended.findIndex(item => item.kind === "return" || item.kind === "main")
  extended.splice(pinnedIndex === -1 ? extended.length : pinnedIndex, 0, ...newTracks)
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
      const state = context.getState()
      const display = { mode: scene.automationMode, lanes: scene.automationLanes }
      const tracks = visibleTracks(
        arrangementViewProjection(source, state.workspace.arrangementView).tracks
      )
      const pinnedTop =
        arrangementBodyBottom(scene.viewport.height) - pinnedTrackHeight(tracks, display)
      const row = layoutTrackRowsForViewport(
        tracks,
        scene.viewport.scrollY,
        scene.viewport.height,
        display
      ).find(row => {
        return (
          next.y >= row.top &&
          next.y < row.top + row.contentHeight &&
          next.y >= arrangementBodyTop() &&
          (row.track.kind === "return" || row.track.kind === "main"
            ? next.y >= pinnedTop
            : next.y < pinnedTop)
        )
      })
      const emptyTop = Math.max(
        arrangementBodyTop(),
        dropZoneTop(tracks, scene.viewport.scrollY, display)
      )
      const newTrackTarget = !row && next.y >= emptyTop && next.y < pinnedTop
      const targetTrackId = newTrackTarget ? newAnchor?.id : row?.track.id
      if (
        !targetTrackId ||
        (!newTrackTarget && row?.track.kind !== "audio" && row?.track.kind !== "midi")
      ) {
        isValid = false
        return
      }
      const delta = snappedBar(context, barAtX(context, next.x) - offset) - anchor.startBar
      if (
        lastPlan?.targetTrackId === targetTrackId &&
        lastPlan.deltaBars === delta &&
        lastCopy === next.altKey
      ) {
        isValid = true
        return
      }
      const plan = projectClipMove(
        newTrackTarget ? extended : source,
        ids,
        targetTrackId,
        delta,
        next.altKey,
        context.getState().workspace.automationMode,
        identity,
        state.document.transport.bpm
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
      context.scene.setClipDrag({
        source: newTrackTarget ? extended : source,
        ids: new Set(plan.selectedIds),
      })
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
