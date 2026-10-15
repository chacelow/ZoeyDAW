import { Icon } from "@/ui/controls/Icon"
import { useTheme } from "@/shared/theme/ThemeProvider"
import type { MetronomePhase } from "./metronome"

export function MetronomeIndicator({
  phase,
  enabled,
  reducedMotion,
}: {
  readonly phase: MetronomePhase
  readonly enabled: boolean
  readonly reducedMotion: boolean
}) {
  const theme = useTheme()
  const size = theme.transportControl["--spacing-control-icon"]
  const dotSize = theme.transportControl["--spacing-control-gap"]
  const color = enabled ? theme.colors.primaryForeground : theme.colors.foreground
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        width: size,
        height: size,
        left: reducedMotion ? 0 : phase.swing * theme.transportControl["--spacing-control-gap"],
      }}
    >
      <Icon name="Metronome" size={size} color={color} />
      <div style={{ position: "absolute", left: 0, top: 0 }}>
        <Icon name="Circle" size={dotSize} color={color} filled={phase.side < 0} />
      </div>
      <div style={{ position: "absolute", right: 0, top: 0 }}>
        <Icon name="Circle" size={dotSize} color={color} filled={phase.side > 0} />
      </div>
    </div>
  )
}
