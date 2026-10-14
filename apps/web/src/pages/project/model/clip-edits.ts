import { moveClipAutomation } from "./clip-automation"
import { clampFadeIntervals } from "./fades"
import { MIN_CLIP_LENGTH_BARS } from "./grid"
import { acceptsClip } from "./types"
import type { Clip, Track } from "./types"

export interface ClipMoveIdentity {
  clip: (sourceId: string) => string
  automation: (key: string) => string
}

export interface ClipMovePlan {
  tracks: Track[]
  selectedIds: string[]
  deltaBars: number
  targetTrackId: string
}

/**
Project a source window without changing its retained audio, MIDI, or pattern data.
*/
export function projectClipResize(clip: Clip, edge: "left" | "right", bar: number): Clip {
  if (!Number.isFinite(bar)) {
    return clip
  }
  if (edge === "right") {
    const lengthBars = Math.max(MIN_CLIP_LENGTH_BARS, bar - clip.startBar)
    if (lengthBars === clip.lengthBars) {
      return clip
    }
    return clip.kind === "audio"
      ? clampFadeIntervals({ ...clip, lengthBars })
      : { ...clip, lengthBars }
  }
  const startBar = Math.max(
    1,
    Math.min(bar, clip.startBar + clip.lengthBars - MIN_CLIP_LENGTH_BARS)
  )
  if (startBar === clip.startBar) {
    return clip
  }
  const trimmed = startBar - clip.startBar
  const lengthBars = clip.startBar + clip.lengthBars - startBar
  const offset = (clip.sourceOffsetBars ?? 0) + trimmed
  const sourceOffsetBars = Math.abs(offset) < 1e-9 ? 0 : offset
  return clip.kind === "audio"
    ? clampFadeIntervals({ ...clip, startBar, lengthBars, sourceOffsetBars })
    : { ...clip, startBar, lengthBars, sourceOffsetBars }
}

/**
Validate the entire selection before projecting any clip or accompanying automation.
*/
export function projectClipMove(
  source: readonly Track[],
  ids: readonly string[],
  targetTrackId: string,
  deltaBars: number,
  copy: boolean,
  moveAutomation: boolean,
  identity: ClipMoveIdentity
): ClipMovePlan | null {
  const lanes = source.filter(track => track.kind === "audio" || track.kind === "midi")
  const selected = new Set(ids)
  const anchor = source.find(track => track.clips.some(clip => clip.id === ids[0]))
  const anchorIndex = lanes.findIndex(track => track.id === anchor?.id)
  const targetIndex = lanes.findIndex(track => track.id === targetTrackId)
  if (anchorIndex === -1 || targetIndex === -1 || !Number.isFinite(deltaBars)) {
    return null
  }

  const destinations = new Map<string, string>()
  let earliestBar = Infinity
  let matchedIds = 0
  for (const track of source) {
    const chosen = track.clips.filter(clip => selected.has(clip.id))
    if (!chosen.length) {
      continue
    }
    matchedIds += chosen.length
    const fromIndex = lanes.findIndex(lane => lane.id === track.id)
    const destination = lanes[fromIndex + targetIndex - anchorIndex]
    if (!destination || chosen.some(clip => !acceptsClip(destination.kind, clip.kind))) {
      return null
    }
    destinations.set(track.id, destination.id)
    for (const clip of chosen) {
      earliestBar = Math.min(earliestBar, clip.startBar)
    }
  }
  if (!destinations.size || matchedIds !== selected.size) {
    return null
  }
  const effectiveDelta = Math.max(1 - earliestBar, deltaBars)
  const additions = new Map<string, Clip[]>()
  const projectedIds = new Map<string, string>()
  for (const track of source) {
    const destinationId = destinations.get(track.id)
    if (!destinationId) {
      continue
    }
    const moved = track.clips
      .filter(clip => selected.has(clip.id))
      .map(clip => {
        const moved = {
          ...clip,
          id: copy ? identity.clip(clip.id) : clip.id,
          startBar: clip.startBar + effectiveDelta,
        }
        projectedIds.set(clip.id, moved.id)
        return moved
      })
    additions.set(destinationId, [...(additions.get(destinationId) ?? []), ...moved])
  }
  const projected = source.map(track => {
    const inserted = additions.get(track.id)
    if (!inserted && (copy || !destinations.has(track.id))) {
      return track
    }
    return {
      ...track,
      clips: [...track.clips.filter(clip => copy || !selected.has(clip.id)), ...(inserted ?? [])],
    }
  })
  const selectedIds: string[] = []
  for (const id of selected) {
    const projectedId = projectedIds.get(id)
    if (projectedId === undefined) {
      throw new Error(`Missing projected clip identity for ${id}`)
    }
    selectedIds.push(projectedId)
  }
  return {
    tracks: moveAutomation
      ? moveClipAutomation(
          source,
          projected,
          selected,
          destinations,
          effectiveDelta,
          copy,
          identity
        )
      : projected,
    selectedIds,
    deltaBars: effectiveDelta,
    targetTrackId,
  }
}
