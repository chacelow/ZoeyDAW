import { useEffect, useMemo } from "react"
import type { AudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import type { AudioClipContent, DocumentState } from "@zoeydaw/project-core/types"
import { findMediaSource } from "@zoeydaw/project-core/media"
import { peakEnvelopePath } from "@zoeydaw/project-core/waveform"
import {
  signedWaveformPaths,
  type WaveformChannelPath,
} from "@zoeydaw/project-core/signed-waveform"
import { useProjectState } from "@/pages/project/adapters"
import {
  cachedWaveformRanges,
  releaseWaveformRangeDemand,
  setWaveformRangeDemand,
  useWaveformRanges,
  waveformRangeRequests,
} from "@/pages/project/adapters/backend/waveform-ranges"
import type { SourceViewport } from "../useSourceViewport"
import type { WaveformDimensions } from "./useWaveformDimensions"

export interface WaveformData {
  readonly sourceName: string | undefined
  readonly realSource: boolean
  readonly hasPeaks: boolean
  readonly secondsPerBar: number
  readonly overviewSpan: number
  readonly wavePath: string
  readonly overviewPath: string
  readonly signedPaths: readonly WaveformChannelPath[]
  readonly overviewSignedPaths: readonly WaveformChannelPath[]
}

export function useWaveformData({
  clip,
  transport,
  settings,
  viewport: { view, minimum, extent },
  dimensions: { width, waveHeight, overviewHeight },
}: {
  clip: AudioClipContent
  transport: DocumentState["transport"]
  settings: AudioClipSettings
  viewport: Pick<SourceViewport, "view" | "minimum" | "extent">
  dimensions: Pick<WaveformDimensions, "width" | "waveHeight" | "overviewHeight">
}) {
  const source = useProjectState(state => findMediaSource(state.document.media, clip.sourceId))
  useWaveformRanges(state => state.entries)
  const peaks = source?.location.kind === "fixture" ? clip.waveformPeaks : undefined
  const gain = 10 ** (clip.gainDb / 20)
  const secondsPerBar =
    ((60 / settings.sourceBpm) * transport.numerator * 4) / transport.denominator
  const realSource = source && source.location.kind !== "fixture" ? source : null
  const waveformStart = realSource ? 0 : (clip.sourceOffsetBars ?? 0)
  const waveformSpan = realSource
    ? realSource.frames / realSource.sampleRate / secondsPerBar
    : clip.lengthBars
  const overviewSpan = Math.max(1 / 16_384, extent - minimum)
  const sourceEnvelope = useMemo(
    () => ({
      peaks: peaks ?? [],
      start: waveformStart,
      span: waveformSpan,
      reverse: settings.reverse,
      gain,
    }),
    [peaks, waveformStart, waveformSpan, settings.reverse, gain]
  )
  const [wavePath, overviewPath] = useMemo<[string, string]>(() => {
    if (!peaks?.length) return ["", ""]
    return [
      peakEnvelopePath(sourceEnvelope, view.start, view.start + view.span, width, 46),
      peakEnvelopePath(sourceEnvelope, minimum, minimum + overviewSpan, width, 45),
    ]
  }, [peaks, sourceEnvelope, view.start, view.span, width, minimum, overviewSpan])

  useEffect(() => {
    const owner = `audio-editor/${clip.id}`
    if (realSource)
      setWaveformRangeDemand(owner, [
        ...waveformRangeRequests(
          realSource,
          sourceEnvelope,
          view.start,
          view.start + view.span,
          width
        ),
        ...waveformRangeRequests(
          realSource,
          sourceEnvelope,
          minimum,
          minimum + overviewSpan,
          width
        ),
      ])
    return () => releaseWaveformRangeDemand(owner)
  }, [realSource, sourceEnvelope, view.start, view.span, width, minimum, overviewSpan, clip.id])

  const ranges = realSource ? cachedWaveformRanges(realSource).map(range => range.data) : []
  const signedPaths = realSource
    ? signedWaveformPaths(
        sourceEnvelope,
        ranges,
        realSource.frames,
        view.start,
        view.start + view.span,
        width,
        waveHeight
      )
    : []
  const overviewSignedPaths = realSource
    ? signedWaveformPaths(
        sourceEnvelope,
        ranges,
        realSource.frames,
        minimum,
        minimum + overviewSpan,
        width,
        overviewHeight
      )
    : []

  return {
    sourceName: source?.name,
    realSource: realSource !== null,
    hasPeaks: !!peaks?.length,
    secondsPerBar,
    overviewSpan,
    wavePath,
    overviewPath,
    signedPaths,
    overviewSignedPaths,
  }
}
