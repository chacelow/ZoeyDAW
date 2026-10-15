import { useMemo } from "react"
import { PeakColumns } from "@/shared/waveform/PeakColumns"
import type { PeakReader } from "@/project/model/backend"
import type { SourceView } from "./source-view"

const EMPTY = new Float32Array(0)

/**
Exact envelope of the visible part of the retained window at one column per pixel, read from the
engine session. The reader takes clip-local one-based bars plus the signed source offset, so the
engine wraps negative or long offsets exactly like playback. Reverse reads the mirrored window range
and flips the columns; gain scales them, as the engine applies it at playback.
*/
export function SourceWaveform({
  sourceId,
  view,
  window,
  width,
  height,
  top,
  gain,
  reverse,
  color,
  readPeaks,
  testId,
}: {
  readonly sourceId: string
  readonly view: SourceView
  /** Retained source window in source bars; peaks are read only inside it. */
  readonly window: { readonly start: number; readonly end: number }
  readonly width: number
  readonly height: number
  readonly top?: number
  readonly gain: number
  readonly reverse: boolean
  readonly color: string
  readonly readPeaks: PeakReader
  readonly testId?: string
}) {
  const from = Math.max(view.start, window.start)
  const to = Math.min(view.start + view.span, window.end)
  const left = Math.round(((from - view.start) / view.span) * width)
  const pixels = Math.max(0, Math.round(((to - view.start) / view.span) * width) - left)
  const peaks = useMemo(() => {
    if (!sourceId || pixels <= 0 || to <= from) return EMPTY
    const length = window.end - window.start
    const [local0, local1] = reverse
      ? [length - (to - window.start), length - (from - window.start)]
      : [from - window.start, to - window.start]
    const raw = readPeaks(sourceId, 1 + local0, 1 + local1, pixels, window.start)
    if (gain === 1 && !reverse) return raw
    const out = new Float32Array(raw.length)
    const channels = Math.floor(raw.length / (pixels * 2))
    for (let channel = 0; channel < channels; channel++)
      for (let pixel = 0; pixel < pixels; pixel++) {
        const source = channel * pixels + (reverse ? pixels - 1 - pixel : pixel)
        const target = channel * pixels + pixel
        out[target * 2] = (raw[source * 2] ?? 0) * gain
        out[target * 2 + 1] = (raw[source * 2 + 1] ?? 0) * gain
      }
    return out
  }, [sourceId, from, to, pixels, gain, reverse, readPeaks, window.start, window.end])
  if (!peaks.length) return null
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: top ?? 0,
        width: pixels,
        height,
        pointerEvents: "none",
      }}
    >
      <PeakColumns
        peaks={peaks}
        pixels={pixels}
        width={pixels}
        height={height}
        color={color}
        testId={testId}
      />
    </div>
  )
}
