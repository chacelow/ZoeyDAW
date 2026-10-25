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
let activeSourceKey: string | null = null
let cancellation = Promise.resolve()
let cancellingKey: string | null = null

function cancelUnusedRange(): void {
  queueMicrotask(() => {
    const key = activeKey
    if (
      !key ||
      cancellingKey === key ||
      Array.from(demands.values()).some(items =>
        Array.from(items.values()).some(item => item.sourceKey === activeSourceKey)
      )
    )
      return
    cancellingKey = key
    cancellation = cancellation.then(() => cancelNativeWaveformRanges()).catch(() => {})
  })
}

export function sourceWaveformKey(source: MediaSource): string {
  return `${source.id}/${source.sha256}/${source.location.kind === "fixture" ? source.location.uri : source.location.path}`
}

export function browserWaveformMetadataRequest(path: string): SourceWaveformRangeRequest {
  return {
    sourceKey: `browser/${path}`,
    request: { path, startFrame: 0, frameCount: 1, columns: 1, framesPerBin: 1 },
  }
}

export function primeBrowserWaveformSource(source: MediaSource): boolean {
  if (source.location.kind !== "external" || !source.sha256) return false
  const browserKey = `browser/${source.location.path}`
  const sourceKey = sourceWaveformKey(source)
  const entries = useWaveformRanges.getState().entries
  let next: Map<string, RangeEntry> | null = null
  let ready = false
  for (const entry of entries.values()) {
    if (entry.kind !== "ready" || entry.range.sourceKey !== browserKey) continue
    const data = entry.range.data
    if (
      data.totalFrames !== source.frames ||
      data.sampleRate !== source.sampleRate ||
      data.channels.length !== source.channels
    )
      continue
    if (data.frameCount > 1) ready = true
    const key = waveformRangeRequestKey({
      sourceKey,
      request: {
        path: source.location.path,
        startFrame: data.startFrame,
        frameCount: data.frameCount,
        framesPerBin: data.kind === "samples" ? 1 : data.framesPerBin,
        columns:
          data.kind === "samples" ? Math.ceil(data.frameCount / 2) : data.channels[0].min.length,
      },
    })
    if (entries.get(key)?.kind === "ready") continue
    next ??= new Map(entries)
    next.set(key, { kind: "ready", range: { sourceKey, data } })
  }
  if (next) {
    const wanted = new Set(Array.from(demands.values()).flatMap(items => Array.from(items.keys())))
    for (const [key, entry] of next) {
      if (next.size <= 64) break
      if (!wanted.has(key) && !(entry.kind === "ready" && entry.range.sourceKey === sourceKey))
        next.delete(key)
    }
    useWaveformRanges.setState({ entries: next })
  }
  return ready
}

export function browserWaveformSourcePending(source: MediaSource): boolean {
  if (!nativeAudio.available() || source.location.kind !== "external") return false
  const sourceKey = sourceWaveformKey(source)
  const browserKey = `browser/${source.location.path}`
  const entries = useWaveformRanges.getState().entries
  for (const requests of demands.values()) {
    for (const [key, request] of requests) {
      if (request.sourceKey !== sourceKey && request.sourceKey !== browserKey) continue
      const entry = entries.get(key)
      if (!entry || entry.kind === "loading") return true
    }
  }
  return false
}

export function waveformRangeRequests(
  source: MediaSource,
  envelope: PeakEnvelope,
  from: number,
  through: number,
  columns: number,
  alignedChunks = false
): SourceWaveformRangeRequest[] {
  if (source.location.kind === "fixture" || columns <= 0) return []
  const path = source.location.path
  const samplesPerPixel = (((through - from) / envelope.span) * source.frames) / columns
  const requests = new Map<string, SourceWaveformRangeRequest>()
  for (const [start, end] of sourceWaveformIntervals(envelope, from, through)) {
    for (const planned of waveformRangePlan(
      source.frames,
      start * source.frames,
      end * source.frames,
      samplesPerPixel
    )) {
      const chunkFrames = planned.framesPerBin === 1 ? 8192 : planned.framesPerBin * 4096
      const first = alignedChunks
        ? Math.floor(planned.startFrame / chunkFrames) * chunkFrames
        : planned.startFrame
      const endFrame = planned.startFrame + planned.frameCount
      for (let frame = first; frame < endFrame; frame += chunkFrames) {
        const frameCount = alignedChunks
          ? Math.min(chunkFrames, source.frames - frame)
          : planned.frameCount
        const item = {
          sourceKey: sourceWaveformKey(source),
          request: {
            path,
            startFrame: frame,
            frameCount,
            framesPerBin: planned.framesPerBin,
            columns: Math.ceil(
              frameCount / (planned.framesPerBin === 1 ? 2 : planned.framesPerBin)
            ),
          },
        }
        requests.set(waveformRangeRequestKey(item), item)
      }
    }
  }
  return Array.from(requests.values())
}

export function waveformOverviewRequest(source: MediaSource): SourceWaveformRangeRequest[] {
  if (source.location.kind === "fixture" || source.frames <= 0) return []
  const framesPerBin = Math.max(2, 2 ** Math.ceil(Math.log2(source.frames / 4096)))
  return [
    {
      sourceKey: sourceWaveformKey(source),
      request: {
        path: source.location.path,
        startFrame: 0,
        frameCount: source.frames,
        framesPerBin,
        columns: Math.ceil(source.frames / framesPerBin),
      },
    },
  ]
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
      activeSourceKey = sourceKey
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
      activeSourceKey = null
      cancellingKey = null
      const next = new Map(useWaveformRanges.getState().entries).set(key, entry)
      const wanted = new Set(
        Array.from(demands.values()).flatMap(items => Array.from(items.keys()))
      )
      if (canceled || (!wanted.has(key) && entry.kind !== "ready")) next.delete(key)
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
  const browserKey =
    source.location.kind === "external" && source.sha256 ? `browser/${source.location.path}` : null
  return Array.from(useWaveformRanges.getState().entries.values())
    .flatMap(entry => {
      if (entry.kind !== "ready") return []
      if (entry.range.sourceKey === key) return [entry.range]
      const data = entry.range.data
      return entry.range.sourceKey === browserKey &&
        data.totalFrames === source.frames &&
        data.sampleRate === source.sampleRate &&
        data.channels.length === source.channels
        ? [{ sourceKey: key, data }]
        : []
    })
    .sort((left, right) => {
      const leftBins =
        left.data.kind === "samples" ? left.data.frameCount : left.data.channels[0].min.length
      const rightBins =
        right.data.kind === "samples" ? right.data.frameCount : right.data.channels[0].min.length
      return left.data.frameCount / leftBins - right.data.frameCount / rightBins
    })
}
