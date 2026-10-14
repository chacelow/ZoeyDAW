/**
 * Renders a peak-sample waveform as vertical bars inside a Clip-sized box.
 * gpuix has no audio engine and no path-drawing `<canvas>` (it is typed in
 * the JSX but unimplemented upstream — see
 * `docs/research/gpuix-rendering-alternatives.md`); a row of host `<div>`
 * bars is the renderer this project's own research settled on for peak
 * data, so that is what this draws.
 */
import { sx } from "../../shared/theme/style"
import { useTheme } from "../../shared/theme/ThemeProvider"
import type { StyleInput } from "../../shared/theme/style"

export interface WaveformViewProps {
  /** Peak magnitudes, one bar each. Values outside 0..1 are clamped. */
  peaks: readonly number[]
  /** Track color used to fill every bar. */
  color: string
  width: number
  height: number
  style?: StyleInput
}

const BAR_GAP_PX = 1
const MIN_BAR_HEIGHT_PX = 2

export function WaveformView({ peaks, color, width, height, style }: WaveformViewProps) {
  const theme = useTheme()
  const barWidth = peaks.length > 0 ? Math.max(1, width / peaks.length - BAR_GAP_PX) : width

  return (
    <div
      style={sx(
        {
          position: "relative",
          width,
          height,
          overflow: "hidden",
          borderRadius: 4,
          borderWidth: theme.project.trackBorder,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.arrangementClipPaper,
        },
        style
      )}
    >
      {peaks.map((peak, index) => {
        const amplitude = Math.max(MIN_BAR_HEIGHT_PX, Math.min(1, Math.abs(peak)) * height)
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: index * (barWidth + BAR_GAP_PX),
              top: (height - amplitude) / 2,
              width: barWidth,
              height: amplitude,
              borderRadius: 1,
              backgroundColor: color,
            }}
          />
        )
      })}
    </div>
  )
}
