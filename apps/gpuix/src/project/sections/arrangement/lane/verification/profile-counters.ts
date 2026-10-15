import type { PeakReader } from "@/project/model/backend"

const rowRenders = new Map<string, number>()
const clipRenders = new Map<string, Map<string, number>>()
const peakReads = new Map<string, { calls: number; duplicateQueries: number; pixels: number }>()
const previousPeakQueries = new Map<string, string>()

export function recordRowRender(trackId: string): void {
  rowRenders.set(trackId, (rowRenders.get(trackId) ?? 0) + 1)
}

export function recordClipRender(trackId: string, clipId: string): void {
  let clips = clipRenders.get(trackId)
  if (!clips) {
    clips = new Map()
    clipRenders.set(trackId, clips)
  }
  clips.set(clipId, (clips.get(clipId) ?? 0) + 1)
}

export function profilePeakRead(
  clipId: string,
  reader: PeakReader,
  sourceId: string,
  startBar: number,
  endBar: number,
  pixels: number,
  contentOffsetBars: number
): Float32Array {
  const query = JSON.stringify([sourceId, startBar, endBar, pixels, contentOffsetBars])
  const entry = peakReads.get(clipId) ?? { calls: 0, duplicateQueries: 0, pixels: 0 }
  entry.calls++
  entry.pixels += pixels
  if (previousPeakQueries.get(clipId) === query) entry.duplicateQueries++
  previousPeakQueries.set(clipId, query)
  peakReads.set(clipId, entry)
  return reader(sourceId, startBar, endBar, pixels, contentOffsetBars)
}

export function takeProfileCounters() {
  const snapshot = {
    laneRows: Object.fromEntries(rowRenders),
    clipCards: Object.fromEntries(
      [...clipRenders].map(([trackId, clips]) => [trackId, Object.fromEntries(clips)])
    ),
    peakReads: Object.fromEntries(peakReads),
  }
  rowRenders.clear()
  clipRenders.clear()
  peakReads.clear()
  return snapshot
}
