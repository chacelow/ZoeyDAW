import { useTheme } from "../../../shared/theme/ThemeProvider"
import { sx, sv } from "../../../shared/theme/style"
import type { Props } from "@gpuix/react"
import type { ReactNode } from "react"

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
  const metrics = theme.control
  const appearance = sv({
    base: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
      minWidth: 0,
      minHeight: metrics["--spacing-control-track"],
      gap: metrics["--spacing-control-track-gap"],
      paddingLeft: metrics["--spacing-control-track-pad"],
      paddingRight: metrics["--spacing-control-track-pad"],
      fontSize: metrics["--text-control-track"],
      color: theme.colors.foreground,
      backgroundColor: theme.colors.muted,
      cursor: "pointer",
      userSelect: "none",
      hover: { backgroundColor: theme.colors.secondary },
      focusVisible: { borderColor: theme.colors.ring },
      borderWidth: 1,
      borderColor: "transparent",
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
          hover: { backgroundColor: theme.colors.muted },
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
      {trailing ? (
        <div style={{ flexShrink: 0, marginLeft: metrics["--spacing-control-track-gap"] }}>
          {trailing}
        </div>
      ) : null}
    </div>
  )
}
