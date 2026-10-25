import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  browserWaveformMetadataRequest,
  releaseWaveformRangeDemand,
  setWaveformRangeDemand,
  useWaveformRanges,
  waveformRangeRequestKey,
} from "@/pages/project/adapters/backend/waveform-ranges"
import type { SourceWaveformRangeRequest } from "@/pages/project/adapters/backend/waveform-ranges"
import { browserAudioDrag } from "@/pages/project/adapters/browser"
import type { WaveformRange } from "@zoeydaw/project-core/waveform-range"
import { waveformRangePlan } from "@zoeydaw/project-core/waveform-range"

export interface BrowserPreviewWaveformData {
  readonly ranges: readonly WaveformRange[]
  readonly totalFrames: number
  readonly durationSeconds: number
}

export function useBrowserPreviewWaveform(path: string | undefined) {
  const owner = useId()
  const entries = useWaveformRanges(state => state.entries)
  const surface = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const metadataRequest = useMemo<SourceWaveformRangeRequest | null>(
    () => (path ? browserWaveformMetadataRequest(path) : null),
    [path]
  )
  const metadataEntry = metadataRequest
    ? entries.get(waveformRangeRequestKey(metadataRequest))
    : undefined
  const metadata = metadataEntry?.kind === "ready" ? metadataEntry.range.data : null
  const requests = useMemo<readonly SourceWaveformRangeRequest[]>(() => {
    if (!metadataRequest || !metadata || width <= 0) return []
    return waveformRangePlan(
      metadata.totalFrames,
      0,
      metadata.totalFrames,
      metadata.totalFrames / width
    ).map(request => ({
      sourceKey: metadataRequest.sourceKey,
      request: { ...request, path: metadataRequest.request.path },
    }))
  }, [metadataRequest, metadata, width])
  useLayoutEffect(() => {
    const node = surface.current
    if (!node) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    setWaveformRangeDemand(owner, metadataRequest ? [metadataRequest, ...requests] : [])
  }, [owner, metadataRequest, requests])
  useEffect(() => () => releaseWaveformRangeDemand(owner), [owner])
  const durationSeconds = metadata ? metadata.totalFrames / metadata.sampleRate : 0
  useEffect(() => {
    browserAudioDrag.setPreviewMetadata(path && metadata ? { path, durationSeconds } : null)
    return () => browserAudioDrag.setPreviewMetadata(null)
  }, [path, metadata, durationSeconds])
  const data = useMemo<BrowserPreviewWaveformData | null>(() => {
    if (!metadata || requests.length === 0) return null
    const ranges: WaveformRange[] = []
    for (const request of requests) {
      const entry = entries.get(waveformRangeRequestKey(request))
      if (entry?.kind !== "ready") return null
      ranges.push(entry.range.data)
    }
    return { ranges, totalFrames: metadata.totalFrames, durationSeconds }
  }, [metadata, requests, entries, durationSeconds])
  const failedEntry = [
    metadataEntry,
    ...requests.map(request => entries.get(waveformRangeRequestKey(request))),
  ].find(entry => entry?.kind === "error")
  const error = failedEntry?.kind === "error" ? failedEntry.message : null

  return { surface, width, data, error }
}
