import { memo, useMemo } from "react"
import { PeakColumns } from "@/shared/waveform/PeakColumns"
import type { PeakReader } from "@/project/model/backend"
import { useTheme } from "@/shared/theme/ThemeProvider"

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
  const theme = useTheme()
  const pixels = Math.ceil(width)
  const peaks = useMemo(
    () =>
      sourceId && pixels > 0 && height > 0
        ? readPeaks(sourceId, startBar, endBar, pixels, contentOffsetBars)
        : EMPTY_PEAKS,
    [sourceId, startBar, endBar, pixels, contentOffsetBars, height, readPeaks]
  )
  return (
    <PeakColumns
      testId={`waveform-${id}`}
      peaks={peaks}
      pixels={pixels}
      width={width}
      height={height}
      top={top}
      color={color}
      opacity={opacity}
      inset={theme.project.arrangementWaveformInset}
    />
  )
})
