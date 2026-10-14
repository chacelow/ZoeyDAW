import { memo, useMemo } from "react"
import { sx } from "@/shared/theme/style"
import type { PeakReader } from "@/project/model/backend"

const EMPTY_PEAKS = new Float32Array(0)

export const WaveformPreview = memo(function WaveformPreview({
  id,
  sourceId,
  startBar,
  endBar,
  contentOffsetBars,
  width,
  height,
  top,
  color,
  opacity,
  readPeaks,
}: {
  id: string
  sourceId: string
  startBar: number
  endBar: number
  contentOffsetBars: number
  width: number
  height: number
  top: number
  color: string
  opacity: number
  readPeaks: PeakReader
}) {
  const pixels = Math.ceil(width)
  const peaks = useMemo(
    () =>
      sourceId && pixels > 0 && height > 0
        ? readPeaks(sourceId, startBar, endBar, pixels, contentOffsetBars)
        : EMPTY_PEAKS,
    [sourceId, startBar, endBar, pixels, contentOffsetBars, height, readPeaks]
  )
  const channels = pixels > 0 ? peaks.length / (pixels * 2) : 0
  if (!channels) return null
  return (
    <div
      testId={`waveform-${id}`}
      aria-hidden
      style={sx({
        position: "absolute",
        left: 0,
        top,
        width,
        height,
        overflow: "hidden",
        pointerEvents: "none",
      })}
    >
      {Array.from({ length: pixels * channels }, (_, index) => {
        const pixel = index % pixels
        const channel = Math.floor(index / pixels)
        const channelHeight = height / channels
        const minimum = Math.max(-1, Math.min(1, peaks[index * 2] ?? 0))
        const maximum = Math.max(-1, Math.min(1, peaks[index * 2 + 1] ?? 0))
        return (
          <div
            key={index}
            style={sx({
              position: "absolute",
              left: pixel,
              top: channel * channelHeight + ((1 - maximum) * channelHeight) / 2,
              width: 1,
              height: Math.max(1, ((maximum - minimum) * channelHeight) / 2),
              backgroundColor: color,
              opacity,
              pointerEvents: "none",
            })}
          />
        )
      })}
    </div>
  )
})
