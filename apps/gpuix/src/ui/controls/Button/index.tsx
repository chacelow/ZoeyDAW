import { useTheme } from "@/shared/theme/ThemeProvider"
import { sv, sx } from "@/shared/theme/style"
import { controlChrome } from "../chrome"
import { IconSlot } from "../IconSlot"
import { useInfoBinding } from "../ControlEnvironment"
import type { Props } from "@gpuix/react"
import type { ReactNode } from "react"
import type { ControlSize } from "../chrome"

export interface ButtonProps extends Omit<Props, "onChange" | "highlight"> {
  readonly label?: string
  readonly disabled?: boolean
  readonly active?: boolean
  readonly highlight?: boolean
  readonly iconOnly?: boolean
  readonly variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
  readonly size?: ControlSize
  readonly onActiveChange?: (active: boolean) => void
  readonly icon?: ReactNode
}

export function Button({
  label,
  disabled = false,
  active = false,
  highlight = true,
  iconOnly = false,
  variant = "default",
  size = "default",
  onActiveChange,
  icon,
  children,
  style,
  onClick,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ref,
  ...props
}: ButtonProps) {
  const theme = useTheme()
  const info = useInfoBinding({ type: "button" })
  const name = label ?? props["aria-label"] ?? (typeof children === "string" ? children : undefined)
  const appearances = sv({
    variants: {
      variant: {
        default: {},
        outline: { backgroundColor: theme.colors.background },
        secondary: { backgroundColor: theme.colors.secondary },
        ghost: { backgroundColor: "transparent", borderColor: "transparent" },
        destructive: { color: theme.colors.destructive },
        link: {
          backgroundColor: "transparent",
          borderColor: "transparent",
          color: theme.colors.primary,
          textDecoration: "underline",
        },
      },
    },
  })
  const activate = (event: Parameters<NonNullable<Props["onClick"]>>[0]) => {
    if (disabled) return
    onActiveChange?.(!active)
    onClick?.(event)
  }
  return (
    <div
      {...props}
      ref={ref}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      aria-pressed={onActiveChange ? active : undefined}
      aria-label={onActiveChange && name ? `${name} (${active ? "on" : "off"})` : name}
      style={sx(
        controlChrome(
          theme,
          size
        )({
          active: active ? "on" : "off",
          highlight: highlight ? "on" : "off",
          disabled: disabled ? "on" : "off",
          iconOnly: iconOnly ? "on" : "off",
        }),
        !active && appearances({ variant }),
        style
      )}
      onClick={activate}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (!event.defaultPrevented && event.key === "enter") activate(event)
      }}
      onMouseEnter={event => {
        info.onMouseEnter()
        onMouseEnter?.(event)
      }}
      onMouseLeave={event => {
        info.onMouseLeave()
        onMouseLeave?.(event)
      }}
      onFocus={event => {
        info.onFocus()
        onFocus?.(event)
      }}
      onBlur={event => {
        info.onBlur()
        onBlur?.(event)
      }}
    >
      {icon ? <IconSlot size={size}>{icon}</IconSlot> : null}
      {typeof children === "string" || typeof children === "number" ? (
        <text>{children}</text>
      ) : (
        children
      )}
    </div>
  )
}
