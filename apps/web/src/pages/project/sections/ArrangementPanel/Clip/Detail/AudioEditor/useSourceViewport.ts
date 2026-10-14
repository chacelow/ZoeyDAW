import { useCallback, useState } from "react"
import type { AudioClipSettings } from "@/pages/project/model/audio-editor"
import type { AudioClip } from "@/pages/project/model/types"

export function useSourceViewport(clip: AudioClip, settings: AudioClipSettings) {
  const sourceStart = clip.sourceOffsetBars ?? 0
  const sourceEnd = sourceStart + clip.lengthBars
  const rangeStart = Math.min(sourceStart, settings.loopStartBars, settings.startMarkerBars)
  const rangeSpan =
    Math.max(sourceEnd, settings.loopStartBars + settings.loopLengthBars, settings.endMarkerBars) -
    rangeStart
  const [view, setView] = useState({ start: rangeStart, span: rangeSpan })
  const minimum = Math.min(0, rangeStart)
  const extent = Math.max(
    sourceEnd,
    settings.loopStartBars + settings.loopLengthBars,
    settings.endMarkerBars,
    view.start + view.span,
    clip.lengthBars
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
