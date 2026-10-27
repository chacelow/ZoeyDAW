import { isClip, serializeClip } from "./clip-content"
import { clipWindow } from "./clip-window"
import type { Clip, MidiPattern, Track } from "./types"

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
  patterns: MidiPattern[]
  range?: { lengthBars: number; trackCount: number }
}

export function collectClips(
  tracks: readonly Track[],
  ids: readonly string[],
  range?: { startBar: number; endBar: number; trackIds: readonly string[] },
  bpm = 120,
  patterns: readonly MidiPattern[] = []
): ClipClipboard | null {
  if (range && range.endBar <= range.startBar) return null
  const selected = new Set(ids)
  const lanes = tracks.filter(track => track.kind === "audio" || track.kind === "midi")
  const items = lanes.flatMap((track, trackIndex) =>
    track.clips
      .filter(clip => (range ? range.trackIds.includes(track.id) : selected.has(clip.id)))
      .flatMap(clip => {
        const visible = range ? clipWindow(clip, range.startBar, range.endBar, bpm) : clip
        return visible
          ? [{ trackOffset: trackIndex, barOffset: visible.startBar, clip: serializeClip(visible) }]
          : []
      })
  )
  if (!items.length) {
    return null
  }
  const patternIds = new Set(
    items.flatMap(item => (item.clip.kind === "pattern" ? [item.clip.patternId] : []))
  )
  const copiedPatterns = patterns.filter(pattern => patternIds.has(pattern.id))
  if (copiedPatterns.length !== patternIds.size) {
    return null
  }
  const minTrack = range
    ? lanes.findIndex(track => range.trackIds.includes(track.id))
    : Math.min(...items.map(item => item.trackOffset))
  const minBar = range?.startBar ?? Math.min(...items.map(item => item.barOffset))
  return {
    kind: "clips",
    version: 1,
    patterns: structuredClone(copiedPatterns),
    ...(range && {
      range: {
        lengthBars: range.endBar - range.startBar,
        trackCount:
          lanes.reduce(
            (end, track, index) => (range.trackIds.includes(track.id) ? index + 1 : end),
            0
          ) - minTrack,
      },
    }),
    items: items.map(item => ({
      ...item,
      trackOffset: item.trackOffset - minTrack,
      barOffset: item.barOffset - minBar,
    })),
  }
}

function isClipboardPattern(value: unknown): value is MidiPattern {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    "notes" in value &&
    "loopBars" in value &&
    typeof value.loopBars === "number" &&
    Number.isFinite(value.loopBars) &&
    value.loopBars > 0 &&
    isClip({
      id: value.id,
      kind: "midi",
      startBar: 1,
      lengthBars: 1,
      notes: value.notes,
      loopBars: value.loopBars,
    })
  )
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
  const patterns: MidiPattern[] = []
  const patternIds = new Set<string>()
  if ("patterns" in value) {
    if (!Array.isArray(value.patterns) || value.patterns.length > 10_000) return null
    for (const pattern of value.patterns) {
      if (!isClipboardPattern(pattern) || patternIds.has(pattern.id)) return null
      patternIds.add(pattern.id)
      patterns.push({
        id: pattern.id,
        loopBars: pattern.loopBars,
        notes: pattern.notes.map(note => ({
          pitch: note.pitch,
          startBeat: note.startBeat,
          lengthBeats: note.lengthBeats,
          velocity: note.velocity,
          ...(note.id === undefined ? {} : { id: note.id }),
        })),
      })
    }
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
      ids.has(item.clip.id) ||
      (item.clip.kind === "pattern" && !patternIds.has(item.clip.patternId))
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
  if ("range" in value) {
    const range = value.range
    if (
      !range ||
      typeof range !== "object" ||
      !("lengthBars" in range) ||
      typeof range.lengthBars !== "number" ||
      !Number.isFinite(range.lengthBars) ||
      range.lengthBars <= 0 ||
      !("trackCount" in range) ||
      typeof range.trackCount !== "number" ||
      !Number.isSafeInteger(range.trackCount) ||
      range.trackCount <= 0
    ) {
      return null
    }
    const { lengthBars, trackCount } = range
    if (
      items.some(
        item => item.trackOffset >= trackCount || item.barOffset + item.clip.lengthBars > lengthBars
      )
    )
      return null
    return { kind: "clips", version: 1, items, patterns, range: { lengthBars, trackCount } }
  }
  return { kind: "clips", version: 1, items, patterns }
}
