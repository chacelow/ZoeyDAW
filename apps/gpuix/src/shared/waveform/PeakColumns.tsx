import { memo } from "react"
import { sx } from "@/shared/theme/style"

/**
 * Draws backend peak envelopes as one 1px column per pixel and channel.
 * `peaks` is channel-major, then pixel-major `[min, max]` (the `PeakReader` layout);
 * channel count is `peaks.length / (pixels * 2)`. Values are clamped to [-1, 1].
 * `inset` keeps that many pixels clear above and below full scale in every channel
 * (web clip waveform: amplitude = channelHeight / 2 - 1).
 */
export const PeakColumns = memo(function PeakColumns({
  peaks,
  pixels,
  width,
  height,
  top = 0,
  color,
  opacity = 1,
  inset = 0,
  testId,
}: {
  peaks: Float32Array
  pixels: number
  width: number
  height: number
  top?: number
  color: string
  opacity?: number
  inset?: number
  testId?: string
}) {
  const channels = pixels > 0 ? Math.floor(peaks.length / (pixels * 2)) : 0
  if (!channels || height <= 0) return null
  const channelHeight = height / channels
  const amplitude = Math.max(0, channelHeight / 2 - inset)
  return (
    <div
      testId={testId}
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
        const minimum = Math.max(-1, Math.min(1, peaks[index * 2] ?? 0))
        const maximum = Math.max(-1, Math.min(1, peaks[index * 2 + 1] ?? 0))
        return (
          <div
            key={index}
            style={sx({
              position: "absolute",
              left: pixel,
              top: channel * channelHeight + channelHeight / 2 - maximum * amplitude,
              width: 1,
              height: Math.max(1, (maximum - minimum) * amplitude),
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
