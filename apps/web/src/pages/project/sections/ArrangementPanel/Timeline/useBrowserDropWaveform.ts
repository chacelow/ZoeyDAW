import { secondsAtBar, barAtSeconds } from "@zoeydaw/project-core/tempo-map"
import { useId, useLayoutEffect, useMemo, useSyncExternalStore } from "react"
import {
  browserWaveformMetadataRequest,
  releaseWaveformRangeDemand,
  setWaveformRangeDemand,
  useWaveformRanges,
  waveformRangeRequestKey,
} from "@/pages/project/adapters/backend/waveform-ranges"
import type { SourceWaveformRangeRequest } from "@/pages/project/adapters/backend/waveform-ranges"
import type { BrowserAudioDragSource } from "@/pages/project/adapters/browser"
import type { MediaSource } from "@zoeydaw/project-core/media"
import { waveformRangePlan } from "@zoeydaw/project-core/waveform-range"
import type { WaveformRange } from "@zoeydaw/project-core/waveform-range"
import { arrangementScene } from "../canvas/scene"
import type { BrowserAudioPlacement } from "./browser-audio-placement"

export interface BrowserDropWaveform {
  readonly media: MediaSource | null
  readonly ranges: readonly WaveformRange[]
  readonly durationSeconds: number | null
}

export function useBrowserDropWaveform(
  source: BrowserAudioDragSource | null,
  target: BrowserAudioPlacement | null
): BrowserDropWaveform {
  const owner = useId()
  const entries = useWaveformRanges(state => state.entries)
  const scene = useSyncExternalStore(arrangementScene.subscribe, arrangementScene.get)
  const metadataRequest = useMemo(
    () => (source ? browserWaveformMetadataRequest(source.path) : null),
    [source]
  )
  const metadataEntry = metadataRequest
    ? entries.get(waveformRangeRequestKey(metadataRequest))
    : undefined
  const metadata = metadataEntry?.kind === "ready" ? metadataEntry.range.data : null
  const seedRequests = useMemo<readonly SourceWaveformRangeRequest[]>(() => {
    if (!source) return []
    const sourceKey = `browser/${source.path}`
    return Array.from(useWaveformRanges.getState().entries.values()).flatMap(entry => {
      if (entry.kind !== "ready" || entry.range.sourceKey !== sourceKey) return []
      const data = entry.range.data
      return [
        {
          sourceKey,
          request: {
            path: source.path,
            startFrame: data.startFrame,
            frameCount: data.frameCount,
            framesPerBin: data.kind === "samples" ? 1 : data.framesPerBin,
            columns:
              data.kind === "samples"
                ? Math.ceil(data.frameCount / 2)
                : data.channels[0].min.length,
          },
        },
      ]
    })
  }, [source])
  const requests = useMemo<readonly SourceWaveformRangeRequest[]>(() => {
    if (!source || !metadata || !target) return []
    const width =
      (barAtSeconds(
        scene.transport,
        secondsAtBar(scene.transport, target.startBar) + metadata.totalFrames / metadata.sampleRate
      ) -
        target.startBar) *
      scene.viewport.pxPerBar
    const left = (target.startBar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX
    const firstPixel = Math.max(0, -left)
    const endPixel = Math.min(width, scene.viewport.width - left)
    if (width <= 0 || endPixel <= firstPixel) return []
    const startSeconds = secondsAtBar(scene.transport, target.startBar)
    const frameAtPixel = (pixel: number) =>
      (secondsAtBar(scene.transport, target.startBar + pixel / scene.viewport.pxPerBar) -
        startSeconds) *
      metadata.sampleRate
    const firstFrame = frameAtPixel(firstPixel)
    const endFrame = frameAtPixel(endPixel)
    return waveformRangePlan(
      metadata.totalFrames,
      firstFrame,
      endFrame,
      (endFrame - firstFrame) / (endPixel - firstPixel)
    ).map(request => ({
      sourceKey: `browser/${source.path}`,
      request: { ...request, path: source.path },
    }))
  }, [source, metadata, target, scene.transport, scene.viewport])
  useLayoutEffect(() => {
    setWaveformRangeDemand(
      owner,
      metadataRequest ? [metadataRequest, ...seedRequests, ...requests] : []
    )
  }, [owner, metadataRequest, seedRequests, requests])
  useLayoutEffect(() => () => releaseWaveformRangeDemand(owner), [owner])
  const media = useMemo<MediaSource | null>(() => {
    if (!source || !metadata) return null
    return {
      id: `browser-preview/${source.token}`,
      name: source.name,
      sha256: "",
      byteLength: 0,
      sampleRate: metadata.sampleRate,
      frames: metadata.totalFrames,
      channels: metadata.channels.length,
      location: { kind: "external", path: source.path },
    }
  }, [source, metadata])
  const ranges = useMemo<readonly WaveformRange[]>(() => {
    if (!source || !metadata) return []
    return Array.from(entries.values())
      .flatMap(entry => {
        if (entry.kind !== "ready" || entry.range.sourceKey !== `browser/${source.path}`) return []
        const data = entry.range.data
        return data.totalFrames === metadata.totalFrames && data.sampleRate === metadata.sampleRate
          ? [data]
          : []
      })
      .sort(
        (left, right) =>
          (left.kind === "samples" ? 1 : left.framesPerBin) -
          (right.kind === "samples" ? 1 : right.framesPerBin)
      )
  }, [source, metadata, entries])
  return {
    media,
    ranges,
    durationSeconds: metadata ? metadata.totalFrames / metadata.sampleRate : null,
  }
}
