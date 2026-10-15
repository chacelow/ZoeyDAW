import { acceptsClip } from "../model/types"
import { projectClipMove, projectClipResize } from "../model/clip-edits"
import { cloneClip, createClip, mapClips, uniqueId } from "../model/reducers"
import {
  clampFadeCurve,
  clampFadeCurvePosition,
  clampFadeIntervals,
  fadeWindow,
} from "../model/fades"
import { editClip, get, session, tracks, updateTrack } from "./context"
import type { AudioClip, Clip } from "../model/types"

export const clipActions = {
  createClip(trackId: string, kind: Clip["kind"], startBar: number, lengthBars: number) {
    const target = get().document.tracks.find(track => track.id === trackId)
    if (
      !target ||
      !acceptsClip(target.kind, kind) ||
      !Number.isFinite(startBar) ||
      !Number.isFinite(lengthBars)
    ) {
      return
    }
    const clip = createClip(kind, startBar, lengthBars)
    updateTrack(trackId, {
      clips: [...target.clips, clip],
    })
  },
  updateClip(id: string, patch: Partial<Clip>) {
    editClip(id, clip => {
      if (
        ("notes" in patch && clip.kind !== "midi") ||
        ("steps" in patch && clip.kind !== "pattern") ||
        (("gainDb" in patch ||
          "fadeInBars" in patch ||
          "fadeOutBars" in patch ||
          "fadeInOffsetBars" in patch ||
          "fadeOutOffsetBars" in patch ||
          "fadeInCurve" in patch ||
          "fadeOutCurve" in patch ||
          "samplePath" in patch) &&
          clip.kind !== "audio")
      ) {
        return clip
      }
      if (clip.kind === "audio" && patch.kind !== "midi" && patch.kind !== "pattern") {
        const next: AudioClip = { ...clip, ...structuredClone(patch), id: clip.id, kind: "audio" }
        if (
          ("fadeInBars" in patch && patch.fadeInBars === undefined) ||
          ("fadeOutBars" in patch && patch.fadeOutBars === undefined) ||
          ("fadeInOffsetBars" in patch && patch.fadeInOffsetBars === undefined) ||
          ("fadeOutOffsetBars" in patch && patch.fadeOutOffsetBars === undefined) ||
          ("fadeInCurve" in patch && patch.fadeInCurve === undefined) ||
          ("fadeOutCurve" in patch && patch.fadeOutCurve === undefined)
        ) {
          return clip
        }
        const touched = [
          "fadeInBars",
          "fadeOutBars",
          "fadeInOffsetBars",
          "fadeOutOffsetBars",
        ] as const
        for (const field of touched) {
          if (!Object.hasOwn(patch, field)) {
            continue
          }

          const value = next[field]
          if (value === undefined || !Number.isFinite(value)) {
            return clip
          }
          next[field] = Math.max(0, value)
        }
        const available = Math.max(
          0,
          clip.lengthBars - (next.fadeInOffsetBars ?? 0) - (next.fadeOutOffsetBars ?? 0)
        )
        if ("fadeInBars" in patch && !("fadeOutBars" in patch)) {
          next.fadeInBars = Math.min(
            next.fadeInBars ?? 0,
            Math.max(0, available - (clip.fadeOutBars ?? 0))
          )
        }
        if ("fadeOutBars" in patch && !("fadeInBars" in patch)) {
          next.fadeOutBars = Math.min(
            next.fadeOutBars ?? 0,
            Math.max(0, available - (clip.fadeInBars ?? 0))
          )
        }
        if ("fadeInCurve" in patch && patch.fadeInCurve !== undefined) {
          if (!Number.isFinite(patch.fadeInCurve)) {
            return clip
          }
          next.fadeInCurve = clampFadeCurve(patch.fadeInCurve)
        }
        if ("fadeOutCurve" in patch && patch.fadeOutCurve !== undefined) {
          if (!Number.isFinite(patch.fadeOutCurve)) {
            return clip
          }
          next.fadeOutCurve = clampFadeCurve(patch.fadeOutCurve)
        }
        if ("fadeInCurvePosition" in patch && patch.fadeInCurvePosition !== undefined) {
          if (!Number.isFinite(patch.fadeInCurvePosition)) {
            return clip
          }
          next.fadeInCurvePosition = clampFadeCurvePosition(patch.fadeInCurvePosition)
        }
        if ("fadeOutCurvePosition" in patch && patch.fadeOutCurvePosition !== undefined) {
          if (!Number.isFinite(patch.fadeOutCurvePosition)) {
            return clip
          }
          next.fadeOutCurvePosition = clampFadeCurvePosition(patch.fadeOutCurvePosition)
        }
        return touched.some(field => Object.hasOwn(patch, field)) ? clampFadeIntervals(next) : next
      }
      if (clip.kind === "midi" && patch.kind !== "audio" && patch.kind !== "pattern") {
        return { ...clip, ...structuredClone(patch), id: clip.id, kind: "midi" }
      }
      return clip.kind === "pattern" && patch.kind !== "audio" && patch.kind !== "midi"
        ? { ...clip, ...structuredClone(patch), id: clip.id, kind: "pattern" }
        : clip
    })
  },
  moveClips(ids: string[], targetTrackId: string, deltaBars: number, copy = false) {
    const plan = projectClipMove(
      get().document.tracks,
      ids,
      targetTrackId,
      deltaBars,
      copy,
      get().workspace.automationMode,
      {
        clip: () => uniqueId("clip"),
        automation: key => uniqueId(key.startsWith("lane:") ? "lane" : "point"),
      }
    )
    if (!plan) {
      return
    }
    tracks(plan.tracks)
    if (copy) {
      session({ selectedClipIds: plan.selectedIds })
    }
  },
  resizeClip(id: string, edge: "left" | "right", bar: number) {
    editClip(id, clip => projectClipResize(clip, edge, bar))
  },
  deleteClips(ids: string[]) {
    const source = get().document.tracks
    if (source.some(track => track.clips.some(clip => ids.includes(clip.id)))) {
      tracks(mapClips(source, ids, () => null))
    }
    session({ selectedClipIds: [] })
  },
  duplicateClips(ids: string[]) {
    const selected = new Set(ids)
    const copied: string[] = []
    tracks(
      get().document.tracks.map(track => ({
        ...track,
        clips: track.clips.flatMap(clip => {
          if (!selected.has(clip.id)) return [clip]
          const duplicate = { ...cloneClip(clip), startBar: clip.startBar + clip.lengthBars }
          copied.push(duplicate.id)
          return [clip, duplicate]
        }),
      }))
    )
    if (copied.length) {
      session({ selectedClipIds: copied })
    }
  },
  splitClips(ids: string[], bar: number) {
    if (!Number.isFinite(bar)) {
      return
    }
    const chosen = new Set(ids)
    tracks(
      get().document.tracks.map(track => ({
        ...track,
        clips: track.clips.flatMap(clip => {
          if (
            !chosen.has(clip.id) ||
            bar <= clip.startBar ||
            bar >= clip.startBar + clip.lengthBars
          )
            return [clip]
          const leftLength = bar - clip.startBar
          const right = {
            ...cloneClip(clip),
            startBar: bar,
            lengthBars: clip.lengthBars - leftLength,
          }
          if (clip.kind === "audio" && right.kind === "audio") {
            const rightOffset = (clip.sourceOffsetBars ?? 0) + leftLength
            const leftFades = fadeWindow(clip, 0, leftLength)
            const rightFades = fadeWindow(clip, leftLength, right.lengthBars)
            return [
              { ...clip, lengthBars: leftLength, ...leftFades },
              {
                ...right,
                sourceOffsetBars: rightOffset,
                ...rightFades,
              },
            ]
          }
          return [
            { ...clip, lengthBars: leftLength },
            { ...right, sourceOffsetBars: (clip.sourceOffsetBars ?? 0) + leftLength },
          ]
        }),
      }))
    )
  },
  setEditingClip(id: string | null) {
    const current = get().session
    if (id && !get().document.tracks.some(track => track.clips.some(clip => clip.id === id))) return
    session({
      editingClipId: id,
      ...(id && { selectedClipIds: [id] }),
      clipEditorRequest: current.clipEditorRequest + 1,
    })
  },
}
