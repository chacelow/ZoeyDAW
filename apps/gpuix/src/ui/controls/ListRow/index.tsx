import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import { colorMix } from "@/shared/theme/color-mix"
import type { Props, StyleDesc } from "@gpuix/react"
import type { ReactNode } from "react"
import type { Theme } from "@/shared/theme/ThemeProvider"

export function listRowChrome(theme: Theme) {
  return {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    minWidth: 0,
    minHeight: theme.control["--spacing-control-track"],
    gap: theme.control["--spacing-control-track-gap"],
    paddingLeft: theme.control["--spacing-control-track-pad"],
    paddingRight: theme.control["--spacing-control-track-pad"],
    fontSize: theme.control["--text-control-track"],
    borderWidth: theme.design.shape.controlBorderWidth,
    borderRadius: theme.design.shape.listRowRadius,
    borderColor: "transparent",
  } satisfies StyleDesc
}

export interface ListRowProps extends Props {
  readonly label: string
  readonly selected?: boolean
  readonly disabled?: boolean
  readonly leading?: ReactNode
  readonly trailing?: ReactNode
}

export function ListRow({
  label,
  selected = false,
  disabled = false,
  leading,
  trailing,
  children,
  style,
  onClick,
  onKeyDown,
  ...props
}: ListRowProps) {
  const theme = useTheme()
  const appearance = sv({
    base: {
      ...listRowChrome(theme),
      color: theme.colors.foreground,
      backgroundColor: theme.colors.muted,
      cursor: "pointer",
      userSelect: "none",
      keyboardFocusDim: false,
      hover: { backgroundColor: colorMix(theme.colors.muted, 90, theme.colors.foreground) },
      focusVisible: {
        borderColor: theme.colors.ring,
        outlineWidth: theme.design.shape.focusRingWidth,
        outlineColor: theme.colors.ring,
        outlineOffset: -theme.design.shape.focusRingWidth,
      },
    },
    variants: {
      selected: {
        yes: {
          backgroundColor: theme.colors.primary,
          color: theme.colors.primaryForeground,
          hover: { backgroundColor: theme.colors.primary },
        },
        no: {},
      },
      disabled: {
        yes: {
          opacity: 0.5,
          cursor: "not-allowed",
          hover: { backgroundColor: selected ? theme.colors.primary : theme.colors.muted },
        },
        no: {},
      },
    },
  })
  return (
    <div
      role="option"
      {...props}
      tabIndex={disabled ? -1 : (props.tabIndex ?? 0)}
      aria-label={label}
      aria-selected={selected}
      aria-disabled={disabled}
      style={sx(
        appearance({ selected: selected ? "yes" : "no", disabled: disabled ? "yes" : "no" }),
        style
      )}
      onClick={event => {
        if (!disabled) onClick?.(event)
      }}
      onKeyDown={event => {
        if (disabled) return
        onKeyDown?.(event)
        if (!event.defaultPrevented && event.key === "enter") onClick?.(event)
      }}
    >
      {leading ? <div style={{ flexShrink: 0 }}>{leading}</div> : null}
      <div style={{ flexGrow: 1, minWidth: 0 }}>{children ?? <text>{label}</text>}</div>
      {trailing ? <div style={{ flexShrink: 0 }}>{trailing}</div> : null}
    </div>
  )
}
