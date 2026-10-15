import type { PeakReader } from "@/project/model/backend"

const rowRenders = new Map<string, number>()
const clipRenders = new Map<string, number>()
const contentRenders = new Map<string, number>()
const clipMounts = new Map<string, number>()
const clipUnmounts = new Map<string, number>()
const peakReads = new Map<string, { calls: number; duplicateQueries: number; pixels: number }>()
const previousPeakQueries = new Map<string, string>()
const previousInputs = new Map<string, Readonly<Record<string, unknown>>>()
const changedInputs = new Map<string, number>()

export function recordRowRender(trackId: string): void {
  rowRenders.set(trackId, (rowRenders.get(trackId) ?? 0) + 1)
}

export function recordClipRender(clipId: string): void {
  clipRenders.set(clipId, (clipRenders.get(clipId) ?? 0) + 1)
}

export function recordClipContentRender(clipId: string): void {
  contentRenders.set(clipId, (contentRenders.get(clipId) ?? 0) + 1)
}

export function recordClipInputs(clipId: string, inputs: Readonly<Record<string, unknown>>): void {
  const previous = previousInputs.get(clipId)
  if (previous)
    for (const key of Object.keys(inputs)) {
      if (!Object.is(previous[key], inputs[key]))
        changedInputs.set(key, (changedInputs.get(key) ?? 0) + 1)
    }
  previousInputs.set(clipId, inputs)
}

export function recordClipMount(clipId: string): void {
  clipMounts.set(clipId, (clipMounts.get(clipId) ?? 0) + 1)
}

export function recordClipUnmount(clipId: string): void {
  clipUnmounts.set(clipId, (clipUnmounts.get(clipId) ?? 0) + 1)
  previousInputs.delete(clipId)
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
    clipCards: Object.fromEntries(clipRenders),
    clipContents: Object.fromEntries(contentRenders),
    clipMounts: Object.fromEntries(clipMounts),
    clipUnmounts: Object.fromEntries(clipUnmounts),
    changedInputs: Object.fromEntries(changedInputs),
    peakReads: Object.fromEntries(peakReads),
  }
  rowRenders.clear()
  clipRenders.clear()
  contentRenders.clear()
  clipMounts.clear()
  clipUnmounts.clear()
  changedInputs.clear()
  peakReads.clear()
  return snapshot
}
