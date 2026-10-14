/** Shared idle/active treatment; Record-arm uses the theme's destructive fill. */
import { useTheme } from "../../../../shared/theme/ThemeProvider"
import { sv, sx } from "../../../../shared/theme/style"
import type { StyleDesc } from "@gpuix/react"
import type { Theme } from "../../../../shared/theme/ThemeProvider"

export interface ToggleButtonProps {
  readonly label: string
  readonly active: boolean
  readonly onToggle: (next: boolean) => void
  readonly disabled?: boolean
  /** Overrides the active-state fill, e.g. destructive for record-arm. */
  readonly activeColor?: string
  readonly testId?: string
}

function toggleButtonVariants(theme: Theme, activeColor: string | undefined) {
  return sv({
    base: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 0,
      height: theme.control["--spacing-control-track"],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.control["--spacing-control-gap"],
      cursor: "pointer",
      userSelect: "none",
      fontSize: theme.control["--text-control-track"],
      fontWeight: 600,
    },
    variants: {
      tone: {
        idle: {
          backgroundColor: theme.colors.muted,
          color: theme.colors.foreground,
          hover: { backgroundColor: theme.colors.arrangementSurfaceSelected },
          active: { backgroundColor: theme.colors.arrangementSurfaceSelected },
        },
        active: {
          backgroundColor: activeColor ?? theme.colors.primary,
          color: theme.colors.primaryForeground,
          hover: { backgroundColor: activeColor ?? theme.colors.primary },
          active: { backgroundColor: activeColor ?? theme.colors.primary },
        },
      },
    },
  })
}

export function ToggleButton({
  label,
  active,
  onToggle,
  disabled = false,
  activeColor,
  testId,
}: ToggleButtonProps) {
  const theme = useTheme()
  const variant = toggleButtonVariants(theme, activeColor)
  const textColor = active ? theme.colors.primaryForeground : theme.colors.foreground
  const disabledStyle: StyleDesc | undefined = disabled
    ? { opacity: 0.5, cursor: "not-allowed" }
    : undefined
  return (
    <div
      role="button"
      aria-label={label}
      aria-pressed={active}
      aria-disabled={disabled}
      tabIndex={0}
      testId={testId}
      style={sx(variant({ tone: active ? "active" : "idle" }), disabledStyle)}
      onClick={() => {
        if (!disabled) {
          onToggle(!active)
        }
      }}
      onKeyDown={event => {
        if (!disabled && !event.isHeld && (event.key === "enter" || event.key === "space")) {
          onToggle(!active)
        }
      }}
    >
      <text style={sx({ color: textColor, pointerEvents: "none" })}>{label}</text>
    </div>
  )
}
