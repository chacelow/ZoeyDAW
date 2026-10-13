import { acceptsClip, type Track } from "@/pages/project/model/types"
import { moveClipAutomation } from "@/pages/project/model/clip-automation"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import { barAtX, snappedBar } from "../coordinates"
import {
  layoutTrackRows,
  arrangementBodyTop,
  arrangementBodyBottom,
  pinnedTrackHeight,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"

export function createMoveGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  track: Track,
  clipId: string,
  ids: string[]
): CanvasGesture {
  const source = context.getState().document.tracks
  const anchor = track.clips.find(clip => clip.id === clipId)!
  const chosen = new Set(ids)
  const minBar = Math.min(
    ...source.flatMap(lane =>
      lane.clips.filter(clip => chosen.has(clip.id)).map(clip => clip.startBar)
    )
  )
  const offset = barAtX(context, pointer.x) - anchor.startBar
  let candidate = { targetId: track.id, delta: 0, copy: pointer.altKey }
  let valid = true
  let moved = false
  const preview = (next: typeof candidate): boolean => {
    const lanes = source.filter(lane => lane.kind === "audio" || lane.kind === "midi")
    const from = lanes.findIndex(lane => lane.id === track.id)
    const to = lanes.findIndex(lane => lane.id === next.targetId)
    const additions = new Map<string, Track["clips"]>()
    const destinations = new Map<string, string>()
    for (const lane of source) {
      const clips = lane.clips.filter(clip => chosen.has(clip.id))
      if (!clips.length) continue
      const destination = lanes[lanes.findIndex(candidate => candidate.id === lane.id) + to - from]
      if (!destination || clips.some(clip => !acceptsClip(destination.kind, clip.kind)))
        return false
      destinations.set(lane.id, destination.id)
      additions.set(destination.id, [
        ...(additions.get(destination.id) ?? []),
        ...clips.map(clip => ({ ...clip, startBar: clip.startBar + next.delta })),
      ])
    }
    candidate = next
    valid = true
    context.scene.setClipDrag({ source, ids: chosen })
    const projected = source.map(lane => {
      const inserted = additions.get(lane.id) ?? []
      if (!inserted.length && (next.copy || !lane.clips.some(clip => chosen.has(clip.id))))
        return lane
      return {
        ...lane,
        clips: [
          ...lane.clips.filter(clip => next.copy || !chosen.has(clip.id)),
          ...inserted.map(clip => ({ ...clip, id: `preview-${clip.id}` })),
        ],
      }
    })
    context.scene.setPreviewTracks(
      context.getState().workspace.automationMode
        ? moveClipAutomation(source, projected, chosen, destinations, next.delta, next.copy)
        : projected
    )
    return true
  }
  return {
    get cursor(): CanvasGesture["cursor"] {
      return valid ? "grabbing" : "not-allowed"
    },
    autoScroll: "both",
    commitOnInterrupt: true,
    move(next) {
      moved = true
      const scene = context.scene.get()
      const rows = layoutTrackRows(scene)
      const pinnedTop =
        arrangementBodyBottom(scene.viewport.height) - pinnedTrackHeight(scene.tracks)
      const row = rows.find(
        row =>
          next.y >= row.top &&
          next.y < row.top + row.height &&
          next.y >= arrangementBodyTop() &&
          (row.track.kind === "return" || row.track.kind === "main"
            ? next.y >= pinnedTop
            : next.y < pinnedTop)
      )
      if (!row || (row.track.kind !== "audio" && row.track.kind !== "midi")) {
        valid = false
        return
      }
      const nextCandidate = {
        targetId: row.track.id,
        delta: Math.max(
          1 - minBar,
          snappedBar(context, barAtX(context, next.x) - offset) - anchor.startBar
        ),
        copy: next.altKey,
      }
      if (nextCandidate.delta === 0 && nextCandidate.targetId === track.id && !nextCandidate.copy) {
        candidate = nextCandidate
        valid = true
        context.scene.setPreviewTracks(null)
        context.scene.setClipDrag(null)
        return
      }
      valid = preview(nextCandidate)
    },
    finish(cancelled) {
      if (
        !cancelled &&
        moved &&
        (candidate.copy || candidate.delta !== 0 || candidate.targetId !== track.id)
      ) {
        context.actions.beginEdit()
        context.actions.moveClips(ids, candidate.targetId, candidate.delta, candidate.copy)
        context.actions.endEdit()
        context.actions.setInsertionPoint({
          trackId: candidate.targetId,
          bar: anchor.startBar + candidate.delta,
        })
      }
      context.scene.setPreviewTracks(null)
      context.scene.setClipDrag(null)
    },
  }
}
