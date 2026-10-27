import { clipSourceCoordinate, projectTempoSections } from "@zoeydaw/project-core/tempo-map"
import { useCallback, useState, type Dispatch, type SetStateAction } from "react"
import type { AudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import type { AudioClipContent, MediaSource } from "@zoeydaw/project-core/types"

import { clipSourceProjection } from "@/pages/project/adapters/backend/clip-waveform"
import { useProjectState } from "@/pages/project/adapters"

export interface SourceView {
  readonly start: number
  readonly span: number
}

export interface SourceViewport {
  readonly view: SourceView
  readonly setView: Dispatch<SetStateAction<SourceView>>
  readonly zoom: (factor: number, anchor?: number) => void
  readonly pan: (delta: number) => void
  readonly fit: () => void
  readonly minimum: number
  readonly extent: number
  readonly rangeSpan: number
}

export function useSourceViewport(
  clip: AudioClipContent,
  settings: AudioClipSettings,
  bpm: number,
  numerator: number,
  denominator: number,
  source?: MediaSource
) {
  const { origin } = clipSourceProjection(clip, bpm)
  const tempoTracks = useProjectState(state => state.document.tracks)
  const sourceEnd = clipSourceCoordinate(
    clip,
    {
      bpm,
      numerator,
      denominator,
      tempo: projectTempoSections(tempoTracks, { bpm, numerator, denominator }),
    },
    clip.lengthBars
  )
  const secondsPerSourceBar = ((60 / settings.sourceBpm) * numerator * 4) / denominator
  const mediaEnd =
    source && source.location.kind !== "fixture" && source.sampleRate > 0
      ? source.frames / source.sampleRate / secondsPerSourceBar
      : 0
  const rangeStart = Math.min(0, origin, settings.loopStartBars, settings.startMarkerBars)
  const rangeSpan =
    Math.max(
      sourceEnd,
      mediaEnd,
      settings.loopStartBars + settings.loopLengthBars,
      settings.endMarkerBars
    ) - rangeStart
  const [view, setView] = useState<SourceView>({ start: rangeStart, span: rangeSpan })
  const minimum = Math.min(0, rangeStart)
  const extent = Math.max(
    sourceEnd,
    mediaEnd,
    settings.loopStartBars + settings.loopLengthBars,
    settings.endMarkerBars,
    view.start + view.span
  )
  const zoom = useCallback(
    (factor: number, anchor = 0.5) => {
      setView(previous => {
        const span = Math.max(
          1 / 16_384,
          Math.min(Math.max(1, rangeSpan * 4), previous.span / factor)
        )
        return { start: Math.max(minimum, previous.start + (previous.span - span) * anchor), span }
      })
    },
    [rangeSpan, minimum]
  )
  const pan = useCallback(
    (delta: number) =>
      setView(previous => ({ ...previous, start: Math.max(minimum, previous.start + delta) })),
    [minimum]
  )
  const fit = useCallback(
    () => setView({ start: rangeStart, span: rangeSpan }),
    [rangeStart, rangeSpan]
  )
  return { view, setView, zoom, pan, fit, minimum, extent, rangeSpan }
}
