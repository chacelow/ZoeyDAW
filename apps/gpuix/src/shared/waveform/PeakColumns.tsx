import { memo, useLayoutEffect, useMemo } from "react"
import { sx } from "@/shared/theme/style"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"

const EMPTY_QUADS = new Float32Array(0)

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
  const batch = useQuadBatch()
  const channels = pixels > 0 ? Math.floor(peaks.length / (pixels * 2)) : 0
  const quads = useMemo(() => {
    if (!channels || height <= 0) return EMPTY_QUADS
    const channelHeight = height / channels
    const amplitude = Math.max(0, channelHeight / 2 - inset)
    const values = new Float32Array(pixels * channels * 4)
    for (let index = 0; index < pixels * channels; index++) {
      const pixel = index % pixels
      const channel = Math.floor(index / pixels)
      const minimum = Math.max(-1, Math.min(1, peaks[index * 2] ?? 0))
      const maximum = Math.max(-1, Math.min(1, peaks[index * 2 + 1] ?? 0))
      const offset = index * 4
      values[offset] = pixel
      values[offset + 1] = channel * channelHeight + channelHeight / 2 - maximum * amplitude
      values[offset + 2] = 1
      values[offset + 3] = Math.max(1, (maximum - minimum) * amplitude)
    }
    return values
  }, [peaks, pixels, channels, height, inset])
  useLayoutEffect(() => {
    batch.setQuads(quads)
  }, [batch, quads])
  if (!channels || height <= 0) return null
  return (
    <QuadBatch
      ref={batch.ref}
      testId={testId}
      aria-hidden
      style={sx({
        position: "absolute",
        left: 0,
        top,
        width,
        height,
        color,
        opacity,
        overflow: "hidden",
        pointerEvents: "none",
      })}
    />
  )
})
