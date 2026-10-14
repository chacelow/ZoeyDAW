import { isClip, serializeClip } from "./persistence"
import { clipWindow } from "./clip-window"
import type { Clip, Track } from "./types"

export const CLIP_CLIPBOARD_TYPE = "application/x-zoeymind-clips+json"
export interface ClipClipboardItem {
  trackOffset: number
  barOffset: number
  clip: Clip
}
export interface ClipClipboard {
  kind: "clips"
  version: 1
  items: ClipClipboardItem[]
}

export function collectClips(
  tracks: readonly Track[],
  ids: readonly string[],
  range?: { startBar: number; endBar: number; trackIds: readonly string[] }
): ClipClipboard | null {
  const selected = new Set(ids)
  const lanes = tracks.filter(track => track.kind === "audio" || track.kind === "midi")
  const items = lanes.flatMap((track, trackIndex) =>
    track.clips
      .filter(clip => selected.has(clip.id) && (!range || range.trackIds.includes(track.id)))
      .flatMap(clip => {
        const visible = range ? clipWindow(clip, range.startBar, range.endBar) : clip
        return visible
          ? [{ trackOffset: trackIndex, barOffset: visible.startBar, clip: serializeClip(visible) }]
          : []
      })
  )
  if (!items.length) {
    return null
  }
  const minTrack = Math.min(...items.map(item => item.trackOffset))
  const minBar = Math.min(...items.map(item => item.barOffset))
  return {
    kind: "clips",
    version: 1,
    items: items.map(item => ({
      ...item,
      trackOffset: item.trackOffset - minTrack,
      barOffset: item.barOffset - minBar,
    })),
  }
}

export function parseClipClipboard(raw: string): ClipClipboard | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("kind" in value) ||
    value.kind !== "clips" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("items" in value) ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
    value.items.length > 10_000
  ) {
    return null
  }
  const items: ClipClipboardItem[] = []
  const ids = new Set<string>()
  for (const item of value.items) {
    if (
      !item ||
      typeof item !== "object" ||
      !("trackOffset" in item) ||
      !("barOffset" in item) ||
      !("clip" in item) ||
      typeof item.trackOffset !== "number" ||
      !Number.isSafeInteger(item.trackOffset) ||
      item.trackOffset < 0 ||
      typeof item.barOffset !== "number" ||
      !Number.isFinite(item.barOffset) ||
      item.barOffset < 0 ||
      !isClip(item.clip) ||
      ids.has(item.clip.id)
    ) {
      return null
    }
    ids.add(item.clip.id)
    items.push({
      trackOffset: item.trackOffset,
      barOffset: item.barOffset,
      clip: serializeClip(item.clip),
    })
  }
  return items.every(item => item.trackOffset !== 0) || items.every(item => item.barOffset !== 0)
    ? null
    : { kind: "clips", version: 1, items }
}
