import type { AudioClip, Clip } from "../model/types"
import { acceptsClip } from "../model/types"
import { moveClipAutomation } from "../model/clip-automation"
import { cloneClip, createClip, mapClips, uniqueId } from "../model/reducers"
import {
  clampFadeCurve,
  clampFadeCurvePosition,
  clampFadeIntervals,
  fadeWindow,
} from "../model/fades"
import { MIN_CLIP_LENGTH_BARS } from "../model/grid"
import { editClip, get, session, tracks, updateTrack } from "./context"
import { mockWaveformPeaks } from "./fixtures"

/** Collapse floating-point drift from chained bar arithmetic back to an exact zero. */
function snapNearZero(value: number): number {
  return Math.abs(value) < 1e-9 ? 0 : value
}

export const clipActions = {
  createClip(trackId: string, kind: Clip["kind"], startBar: number, lengthBars: number) {
    const target = get().document.tracks.find(track => track.id === trackId)
    if (
      !target ||
      !acceptsClip(target.kind, kind) ||
      !Number.isFinite(startBar) ||
      !Number.isFinite(lengthBars)
    )
      return
    const clip = createClip(kind, startBar, lengthBars)
    updateTrack(trackId, {
      clips: [
        ...target.clips,
        clip.kind === "audio"
          ? { ...clip, waveformPeaks: mockWaveformPeaks(clip.samplePath, 0, clip.lengthBars) }
          : clip,
      ],
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
          "samplePath" in patch ||
          "waveformPeaks" in patch) &&
          clip.kind !== "audio")
      )
        return clip
      if (clip.kind === "audio" && patch.kind !== "midi" && patch.kind !== "pattern") {
        const next: AudioClip = { ...clip, ...structuredClone(patch), id: clip.id, kind: "audio" }
        if (
          ("fadeInBars" in patch && patch.fadeInBars === undefined) ||
          ("fadeOutBars" in patch && patch.fadeOutBars === undefined) ||
          ("fadeInOffsetBars" in patch && patch.fadeInOffsetBars === undefined) ||
          ("fadeOutOffsetBars" in patch && patch.fadeOutOffsetBars === undefined) ||
          ("fadeInCurve" in patch && patch.fadeInCurve === undefined) ||
          ("fadeOutCurve" in patch && patch.fadeOutCurve === undefined)
        )
          return clip
        const touched = [
          "fadeInBars",
          "fadeOutBars",
          "fadeInOffsetBars",
          "fadeOutOffsetBars",
        ] as const
        for (const field of touched) {
          if (field in patch) {
            const value = next[field]
            if (value === undefined || !Number.isFinite(value)) return clip
            next[field] = Math.max(0, value)
          }
        }
        const available = Math.max(
          0,
          clip.lengthBars - (next.fadeInOffsetBars ?? 0) - (next.fadeOutOffsetBars ?? 0)
        )
        if ("fadeInBars" in patch && !("fadeOutBars" in patch))
          next.fadeInBars = Math.min(
            next.fadeInBars ?? 0,
            Math.max(0, available - (clip.fadeOutBars ?? 0))
          )
        if ("fadeOutBars" in patch && !("fadeInBars" in patch))
          next.fadeOutBars = Math.min(
            next.fadeOutBars ?? 0,
            Math.max(0, available - (clip.fadeInBars ?? 0))
          )
        if ("fadeInCurve" in patch && patch.fadeInCurve !== undefined) {
          if (!Number.isFinite(patch.fadeInCurve)) return clip
          next.fadeInCurve = clampFadeCurve(patch.fadeInCurve)
        }
        if ("fadeOutCurve" in patch && patch.fadeOutCurve !== undefined) {
          if (!Number.isFinite(patch.fadeOutCurve)) return clip
          next.fadeOutCurve = clampFadeCurve(patch.fadeOutCurve)
        }
        if ("fadeInCurvePosition" in patch && patch.fadeInCurvePosition !== undefined) {
          if (!Number.isFinite(patch.fadeInCurvePosition)) return clip
          next.fadeInCurvePosition = clampFadeCurvePosition(patch.fadeInCurvePosition)
        }
        if ("fadeOutCurvePosition" in patch && patch.fadeOutCurvePosition !== undefined) {
          if (!Number.isFinite(patch.fadeOutCurvePosition)) return clip
          next.fadeOutCurvePosition = clampFadeCurvePosition(patch.fadeOutCurvePosition)
        }
        return touched.some(field => field in patch) ? clampFadeIntervals(next) : next
      }
      if (clip.kind === "midi" && patch.kind !== "audio" && patch.kind !== "pattern")
        return { ...clip, ...structuredClone(patch), id: clip.id, kind: "midi" }
      if (clip.kind === "pattern" && patch.kind !== "audio" && patch.kind !== "midi")
        return { ...clip, ...structuredClone(patch), id: clip.id, kind: "pattern" }
      return clip
    })
  },
  moveClips(ids: string[], targetTrackId: string, deltaBars: number, copy = false) {
    const source = get().document.tracks
    const lanes = source.filter(track => track.kind === "audio" || track.kind === "midi")
    const selected = new Set(ids)
    const anchor = source.find(track => track.clips.some(clip => clip.id === ids[0]))
    const anchorIndex = lanes.findIndex(track => track.id === anchor?.id)
    const targetIndex = lanes.findIndex(track => track.id === targetTrackId)
    if (anchorIndex < 0 || targetIndex < 0 || !Number.isFinite(deltaBars)) return
    const destinations = new Map<string, string>()
    for (const track of source) {
      const chosen = track.clips.filter(clip => selected.has(clip.id))
      if (!chosen.length) continue
      const destination =
        lanes[lanes.findIndex(lane => lane.id === track.id) + targetIndex - anchorIndex]
      if (!destination || chosen.some(clip => !acceptsClip(destination.kind, clip.kind))) return
      destinations.set(track.id, destination.id)
    }
    if (!destinations.size) return
    const earliestBar = Math.min(
      ...source.flatMap(track =>
        track.clips.filter(clip => selected.has(clip.id)).map(clip => clip.startBar)
      )
    )
    const effectiveDelta = Math.max(1 - earliestBar, deltaBars)
    const additions = new Map<string, Clip[]>()
    const copied: string[] = []
    for (const track of source) {
      const destinationId = destinations.get(track.id)
      if (!destinationId) continue
      const moved = track.clips
        .filter(clip => selected.has(clip.id))
        .map(clip => ({
          ...structuredClone(clip),
          id: copy ? uniqueId("clip") : clip.id,
          startBar: clip.startBar + effectiveDelta,
        }))
      additions.set(destinationId, [...(additions.get(destinationId) ?? []), ...moved])
      if (copy) copied.push(...moved.map(clip => clip.id))
    }
    const projected = source.map(track => ({
      ...track,
      clips: [
        ...track.clips.filter(clip => copy || !selected.has(clip.id)),
        ...(additions.get(track.id) ?? []),
      ],
    }))
    tracks(
      get().workspace.automationMode
        ? moveClipAutomation(source, projected, selected, destinations, effectiveDelta, copy)
        : projected
    )
    if (copy) session({ selectedClipIds: copied })
  },
  resizeClip(id: string, edge: "left" | "right", bar: number) {
    if (!Number.isFinite(bar)) return
    editClip(id, clip => {
      if (edge === "right") {
        const lengthBars = Math.max(MIN_CLIP_LENGTH_BARS, bar - clip.startBar)
        if (lengthBars === clip.lengthBars) return clip
        if (clip.kind === "audio")
          return clampFadeIntervals({
            ...clip,
            lengthBars,
            waveformPeaks: mockWaveformPeaks(
              clip.samplePath,
              clip.sourceOffsetBars ?? 0,
              lengthBars
            ),
          })
        return { ...clip, lengthBars }
      }
      const startBar = Math.max(
        1,
        Math.min(bar, clip.startBar + clip.lengthBars - MIN_CLIP_LENGTH_BARS)
      )
      if (startBar === clip.startBar) return clip
      const trimmed = startBar - clip.startBar
      const lengthBars = clip.startBar + clip.lengthBars - startBar
      const sourceOffsetBars = snapNearZero((clip.sourceOffsetBars ?? 0) + trimmed)
      if (clip.kind === "audio")
        return clampFadeIntervals({
          ...clip,
          startBar,
          lengthBars,
          sourceOffsetBars,
          waveformPeaks: mockWaveformPeaks(clip.samplePath, sourceOffsetBars, lengthBars),
        })
      return {
        ...clip,
        startBar,
        lengthBars,
        sourceOffsetBars,
      }
    })
  },
  deleteClips(ids: string[]) {
    const source = get().document.tracks
    if (source.some(track => track.clips.some(clip => ids.includes(clip.id))))
      tracks(mapClips(source, ids, () => null))
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
    if (copied.length) session({ selectedClipIds: copied })
  },
  splitClips(ids: string[], bar: number) {
    if (!Number.isFinite(bar)) return
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
              {
                ...clip,
                lengthBars: leftLength,
                waveformPeaks: mockWaveformPeaks(
                  clip.samplePath,
                  clip.sourceOffsetBars ?? 0,
                  leftLength
                ),
                ...leftFades,
              },
              {
                ...right,
                sourceOffsetBars: rightOffset,
                waveformPeaks: mockWaveformPeaks(clip.samplePath, rightOffset, right.lengthBars),
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
    session({ editingClipId: id })
  },
}
