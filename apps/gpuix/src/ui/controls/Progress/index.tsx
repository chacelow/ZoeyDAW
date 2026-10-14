import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { Props } from "@gpuix/react"

export interface ProgressProps extends Props {
  readonly value?: number | null
  readonly max?: number
}

export function Progress({ value = null, max = 100, style, testId, ...props }: ProgressProps) {
  const theme = useTheme()
  const upperBound = Number.isFinite(max) && max > 0 ? max : 100
  const determinate = typeof value === "number" && !Number.isNaN(value)
  const clamped = determinate ? Math.min(upperBound, Math.max(0, value)) : 0
  const height = theme.control["--spacing-control-track-gap"]
  return (
    <div
      {...props}
      testId={testId}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={upperBound}
      aria-valuenow={determinate ? clamped : undefined}
      aria-valuetext={
        props["aria-valuetext"] ??
        (determinate ? `${Math.round((clamped / upperBound) * 100)}%` : "Loading")
      }
      style={sx(
        {
          display: "flex",
          width: "100%",
          height,
          flexShrink: 0,
          borderRadius: height,
          overflow: "hidden",
          backgroundColor: theme.colors.muted,
        },
        style
      )}
    >
      <div
        testId={testId ? `${testId}-indicator` : undefined}
        style={{
          height: "100%",
          width: `${determinate ? (clamped / upperBound) * 100 : 30}%`,
          flexShrink: 0,
          backgroundColor: theme.colors.primary,
          opacity: determinate ? 1 : 0.5,
        }}
      />
    </div>
  )
}
