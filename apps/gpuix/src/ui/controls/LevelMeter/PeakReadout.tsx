import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "../Button"
import type { Props } from "@gpuix/react"
import type { LevelMeterChannel } from "."

export function PeakReadout({
  channels,
  minDb,
  label,
  testId,
  style,
}: {
  readonly channels: readonly [LevelMeterChannel, LevelMeterChannel]
  readonly minDb: number
  readonly label?: string
  readonly testId?: string
  readonly style?: Props["style"]
}) {
  const theme = useTheme()
  const geometry = theme.design.editor.meter
  const currentPeak = Math.max(channels[0].peakDb, channels[1].peakDb)
  const [peak, setPeak] = useState(() => ({
    observed: currentPeak,
    maximum: Math.max(currentPeak, channels[0].holdDb, channels[1].holdDb),
  }))
  if (peak.observed !== currentPeak)
    setPeak({ observed: currentPeak, maximum: Math.max(peak.maximum, currentPeak) })
  const maximum = Math.max(peak.maximum, peak.observed === currentPeak ? -Infinity : currentPeak)
  const backgroundColor =
    maximum > geometry.clipDb ? theme.colors.arrangementMeterClip : theme.colors.muted
  const color = maximum > geometry.clipDb ? theme.colors.primaryForeground : theme.colors.foreground
  return (
    <Button
      label={label}
      testId={testId}
      onClick={() => setPeak({ observed: currentPeak, maximum: minDb })}
      style={{
        minWidth: 0,
        padding: 0,
        borderRadius: geometry.readoutRadius,
        backgroundColor,
        color,
        hover: { backgroundColor, color },
        active: { backgroundColor, color },
        fontFamily: theme.design.typography.numberFontFamily,
        fontSize: theme.control["--text-control-track"],
        ...style,
      }}
    >
      {maximum <= minDb ? "−∞" : maximum.toFixed(geometry.readoutDecimals)}
    </Button>
  )
}
