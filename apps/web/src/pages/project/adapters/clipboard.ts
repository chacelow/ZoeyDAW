import { acceptsClip } from "../model/types"
import { collectClips, parseClipClipboard } from "../model/clip-clipboard"
import { clipWindow } from "../model/clip-window"
import { cloneClip } from "../model/reducers"
import { clipboardMemory } from "./clipboard-memory"
import { get, session, tracks } from "./context"
import type { ClipClipboard } from "../model/clip-clipboard"
import type { Clip, TimeSelection } from "../model/types"

function copyClips(ids: string[], range?: TimeSelection): ClipClipboard | null {
  const copied = collectClips(get().document.tracks, ids, range)
  if (copied) {
    clipboardMemory.write(JSON.stringify(copied))
  }
  return copied
}

export const clipboardActions = {
  copyClips,
  cutClips(ids: string[], range?: TimeSelection) {
    const copied = copyClips(ids, range)
    if (!copied) {
      return null
    }
    const chosen = new Set(ids)
    tracks(
      get().document.tracks.map(track => ({
        ...track,
        clips: track.clips.flatMap(clip => {
          if (!chosen.has(clip.id) || (range && !range.trackIds.includes(track.id))) return [clip]
          if (!range) return []
          const intersection = clipWindow(clip, range.startBar, range.endBar)
          if (!intersection) return [clip]
          const left = clipWindow(clip, clip.startBar, intersection.startBar)
          const right = clipWindow(
            clip,
            intersection.startBar + intersection.lengthBars,
            clip.startBar + clip.lengthBars
          )
          return [left, right].flatMap(piece =>
            piece ? [{ ...piece, id: !left || piece === left ? clip.id : cloneClip(piece).id }] : []
          )
        }),
      }))
    )
    session({ selectedClipIds: [] })
    return copied
  },
  pasteClips(
    targetTrackId: string,
    startBar: number,
    source: ClipClipboard | null = clipboardActions.getClipClipboard()
  ) {
    if (!source || !Number.isFinite(startBar) || startBar < 1) {
      return false
    }
    const current = get().document.tracks
    const lanes = current.filter(track => track.kind === "audio" || track.kind === "midi")
    const first = lanes.findIndex(track => track.id === targetTrackId)
    if (first === -1 || !source.items.length) {
      return false
    }
    const placements: {
      item: (typeof source.items)[number]
      destination: (typeof lanes)[number]
    }[] = []
    for (const item of source.items) {
      const destination = lanes[first + item.trackOffset]
      if (
        !destination ||
        !acceptsClip(destination.kind, item.clip.kind) ||
        !Number.isFinite(startBar + item.barOffset + item.clip.lengthBars)
      ) {
        return false
      }
      placements.push({ item, destination })
    }
    const additions = new Map<string, Clip[]>()
    const copied: string[] = []
    for (const { item, destination } of placements) {
      const clip = { ...cloneClip(item.clip), startBar: startBar + item.barOffset }
      additions.set(destination.id, [...(additions.get(destination.id) ?? []), clip])
      copied.push(clip.id)
    }
    if (!copied.length) {
      return false
    }
    tracks(
      current.map(track => {
        const added = additions.get(track.id)
        return added ? { ...track, clips: [...track.clips, ...added] } : track
      })
    )
    session({ selectedClipIds: copied })
    return true
  },
  getClipClipboard: () => parseClipClipboard(clipboardMemory.read()),
}
