import { acceptsClip } from "@zoeydaw/project-core/types"
import { isAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import {
  insertClips,
  projectClipMove,
  projectClipResize,
  replaceClip,
} from "@zoeydaw/project-core/clip-edits"
import { clipWindow } from "@zoeydaw/project-core/clip-window"
import { cloneClip, createClip, mapClips, uniqueId } from "@zoeydaw/project-core/reducers"
import {
  clampFadeCurve,
  clampFadeCurvePosition,
  clampFadeIntervals,
} from "@zoeydaw/project-core/fades"
import { resolveMidiClip, withPatternNotes } from "@zoeydaw/project-core/patterns"
import { document, editClip, get, session, tracks, updateTrack } from "./context"
import { withWaveformPreview } from "@zoeydaw/project-runtime/visuals"
import { locateClip } from "@zoeydaw/project-core/clip-content"
import { putClipSlot } from "@zoeydaw/project-core/launcher"
import type { AudioClipContent, Clip, ClipContent } from "@zoeydaw/project-core/types"

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
      clips: insertClips(
        target.clips,
        [clip.kind === "audio" ? withWaveformPreview(clip, get().document.media) : clip],
        () => uniqueId("clip"),
        get().document.transport.bpm
      ),
    })
    return clip.id
  },
  updateClip(id: string, patch: Partial<Clip>) {
    if (
      "sourceId" in patch &&
      patch.sourceId !== null &&
      !get().document.media.some(source => source.id === patch.sourceId)
    ) {
      return
    }
    function apply(clip: Clip): Clip
    function apply(clip: ClipContent): ClipContent
    function apply(clip: ClipContent): ClipContent {
      if (
        ("notes" in patch && clip.kind === "audio") ||
        (("gainDb" in patch ||
          "fadeInBars" in patch ||
          "fadeOutBars" in patch ||
          "fadeInOffsetBars" in patch ||
          "fadeOutOffsetBars" in patch ||
          "fadeInCurve" in patch ||
          "fadeOutCurve" in patch ||
          "sourceId" in patch ||
          "waveformPeaks" in patch) &&
          clip.kind !== "audio")
      ) {
        return clip
      }
      if (clip.kind === "audio" && patch.kind !== "midi" && patch.kind !== "pattern") {
        const next: AudioClipContent = {
          ...clip,
          ...structuredClone(patch),
          id: clip.id,
          kind: "audio",
        }
        if (next.audioSettings?.warp) {
          next.sourceTempo = undefined
        }
        if (next.audioSettings && !isAudioClipSettings(next.audioSettings)) return clip
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
      if (clip.kind === "pattern" && patch.kind !== "audio" && patch.kind !== "midi") {
        const placement = structuredClone(patch)
        if ("notes" in placement) delete placement.notes
        if ("loopBars" in placement) delete placement.loopBars
        return { ...clip, ...placement, id: clip.id, kind: "pattern" }
      }
      return clip
    }
    const state = get().document
    const location = locateClip(state.tracks, id)
    const clip = location?.clip
    if (location && clip?.kind === "pattern" && ("notes" in patch || "loopBars" in patch)) {
      const nextClip = apply(clip)
      if (nextClip === clip) return
      const source = resolveMidiClip(clip, state.patterns)
      const next = withPatternNotes(
        state,
        clip.patternId,
        "notes" in patch && patch.notes ? structuredClone(patch.notes) : source.notes,
        "loopBars" in patch ? patch.loopBars : undefined
      )
      if (location.kind === "launcher")
        document(putClipSlot(next, location.track.id, location.sceneId, nextClip))
      else
        document({
          ...next,
          tracks: replaceClip(
            next.tracks,
            apply(location.clip),
            () => uniqueId("clip"),
            state.transport.bpm
          ),
        })
      return
    }
    if (location?.kind === "launcher") {
      if ("startBar" in patch) return
      document(putClipSlot(state, location.track.id, location.sceneId, apply(location.clip)))
      return
    }
    editClip(id, apply)
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
      },
      get().document.transport.bpm
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
    editClip(id, clip => {
      const next = projectClipResize(clip, edge, bar, get().document.transport.bpm)
      return next !== clip && next.kind === "audio"
        ? withWaveformPreview(next, get().document.media)
        : next
    })
  },
  deleteClips(ids: string[]) {
    const source = get().document.tracks
    const selected = new Set(ids)
    if (
      source.some(
        track =>
          track.clips.some(clip => selected.has(clip.id)) ||
          track.clipSlots?.some(slot => selected.has(slot.clip.id))
      )
    ) {
      tracks(
        mapClips(source, ids, () => null).map(track =>
          track.clipSlots?.some(slot => selected.has(slot.clip.id))
            ? { ...track, clipSlots: track.clipSlots.filter(slot => !selected.has(slot.clip.id)) }
            : track
        )
      )
    }
    session({ selectedClipIds: [] })
  },
  duplicateClips(ids: string[]) {
    const source = get().document.tracks
    const selected = new Set(ids)
    const anchor = source.find(track => track.clips.some(clip => clip.id === ids[0]))
    const clips = source.flatMap(track => track.clips.filter(clip => selected.has(clip.id)))
    if (!anchor || !clips.length) return
    const start = Math.min(...clips.map(clip => clip.startBar))
    const end = Math.max(...clips.map(clip => clip.startBar + clip.lengthBars))
    clipActions.moveClips(ids, anchor.id, end - start, true)
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
          const bpm = get().document.transport.bpm
          const left = clipWindow(clip, clip.startBar, bar, bpm)
          const right = clipWindow(cloneClip(clip), bar, clip.startBar + clip.lengthBars, bpm)
          return [left, right].flatMap(piece =>
            piece
              ? [piece.kind === "audio" ? withWaveformPreview(piece, get().document.media) : piece]
              : []
          )
        }),
      }))
    )
  },
  setEditingClip(id: string | null) {
    const current = get().session
    if (id && !locateClip(get().document.tracks, id)) return
    session({
      editingClipId: id,
      ...(id && { selectedClipIds: [id] }),
      clipEditorRequest: current.clipEditorRequest + 1,
    })
  },
}
