import { create } from "zustand"
import {
  cancelNativeWaveformRanges,
  nativeAudio,
  readNativeWaveformRange,
} from "@/shared/native/audio"
import type { WaveformRange, WaveformRangeRequest } from "@zoeydaw/project-core/waveform-range"
import { waveformRangePlan } from "@zoeydaw/project-core/waveform-range"
import { sourceWaveformIntervals } from "@zoeydaw/project-core/waveform-source"
import type { PeakEnvelope } from "@zoeydaw/project-core/waveform"
import type { MediaSource } from "@zoeydaw/project-core/media"

export interface SourceWaveformRangeRequest {
  readonly sourceKey: string
  readonly request: WaveformRangeRequest
}
export interface SourceWaveformRange {
  readonly sourceKey: string
  readonly data: WaveformRange
}
type RangeEntry =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; range: SourceWaveformRange }
export const useWaveformRanges = create<{ entries: ReadonlyMap<string, RangeEntry> }>(() => ({
  entries: new Map(),
}))
const demands = new Map<string, ReadonlyMap<string, SourceWaveformRangeRequest>>()
let running = false
let activeKey: string | null = null
let cancellation = Promise.resolve()
let cancellingKey: string | null = null

function cancelUnusedRange(): void {
  queueMicrotask(() => {
    const key = activeKey
    if (!key || cancellingKey === key || Array.from(demands.values()).some(items => items.has(key)))
      return
    cancellingKey = key
    cancellation = cancellation.then(() => cancelNativeWaveformRanges()).catch(() => {})
  })
}

export function sourceWaveformKey(source: MediaSource): string {
  return `${source.id}/${source.sha256}/${source.location.kind === "fixture" ? source.location.uri : source.location.path}`
}

export function waveformRangeRequests(
  source: MediaSource,
  envelope: PeakEnvelope,
  from: number,
  through: number,
  columns: number
): SourceWaveformRangeRequest[] {
  if (source.location.kind === "fixture" || columns <= 0) return []
  const path = source.location.path
  const samplesPerPixel = (((through - from) / envelope.span) * source.frames) / columns
  return sourceWaveformIntervals(envelope, from, through).flatMap(([start, end]) =>
    waveformRangePlan(
      source.frames,
      start * source.frames,
      end * source.frames,
      samplesPerPixel
    ).map(request => ({
      sourceKey: sourceWaveformKey(source),
      request: { ...request, path },
    }))
  )
}

export function waveformRangeRequestKey({
  sourceKey,
  request,
}: SourceWaveformRangeRequest): string {
  return `${sourceKey}/${request.startFrame}/${request.frameCount}/${request.framesPerBin}`
}

export function setWaveformRangeDemand(
  owner: string,
  requests: readonly SourceWaveformRangeRequest[]
): void {
  if (!nativeAudio.available()) return
  const next = new Map(requests.map(item => [waveformRangeRequestKey(item), item]))
  demands.set(owner, next)
  cancelUnusedRange()
  if (!running) void drainRanges()
}

export function releaseWaveformRangeDemand(owner: string): void {
  demands.delete(owner)
  cancelUnusedRange()
}

async function drainRanges(): Promise<void> {
  running = true
  try {
    while (true) {
      const entries = useWaveformRanges.getState().entries
      const pending = Array.from(demands.values())
        .flatMap(items => Array.from(items))
        .find(([key]) => !entries.has(key))
      if (!pending) return
      const [key, { sourceKey, request }] = pending
      useWaveformRanges.setState({ entries: new Map(entries).set(key, { kind: "loading" }) })
      activeKey = key
      let entry: RangeEntry
      try {
        await cancellation
        entry = {
          kind: "ready",
          range: { sourceKey, data: await readNativeWaveformRange(request) },
        }
      } catch (error) {
        entry = { kind: "error", message: error instanceof Error ? error.message : String(error) }
      }
      const canceled = cancellingKey === key
      activeKey = null
      cancellingKey = null
      const next = new Map(useWaveformRanges.getState().entries).set(key, entry)
      const wanted = new Set(
        Array.from(demands.values()).flatMap(items => Array.from(items.keys()))
      )
      if (canceled || !wanted.has(key)) next.delete(key)
      for (const oldKey of next.keys()) {
        if (next.size <= 64) break
        if (!wanted.has(oldKey)) next.delete(oldKey)
      }
      useWaveformRanges.setState({ entries: next })
    }
  } finally {
    running = false
  }
}

export function cachedWaveformRanges(source: MediaSource): SourceWaveformRange[] {
  const key = sourceWaveformKey(source)
  return Array.from(useWaveformRanges.getState().entries.values())
    .flatMap(entry =>
      entry.kind === "ready" && entry.range.sourceKey === key ? [entry.range] : []
    )
    .sort((left, right) => {
      const leftBins =
        left.data.kind === "samples" ? left.data.frameCount : left.data.channels[0].min.length
      const rightBins =
        right.data.kind === "samples" ? right.data.frameCount : right.data.channels[0].min.length
      return left.data.frameCount / leftBins - right.data.frameCount / rightBins
    })
}
