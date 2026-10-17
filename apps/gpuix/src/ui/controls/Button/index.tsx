import { consumeKey } from "@/shared/keyboard"
import { cloneElement, isValidElement, useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sv, sx } from "@/shared/theme/style"
import { controlChrome } from "../chrome"
import { IconSlot } from "../IconSlot"
import { useInfoBinding } from "../ControlEnvironment"
import { TruncatedText } from "../TruncatedText"
import { useMeasuredTextWidth } from "../useMeasuredTextWidth"
import { snapControlWidth } from "../grid"
import type { Props } from "@gpuix/react"
import type { ReactNode } from "react"
import type { ControlSize } from "../chrome"
import type { IconSlotProps } from "../IconSlot"

export interface ButtonProps extends Omit<Props, "onChange" | "highlight"> {
  readonly label?: string
  readonly disabled?: boolean
  readonly active?: boolean
  readonly highlight?: boolean
  readonly iconOnly?: boolean
  readonly activeFilled?: boolean
  readonly reducedMotion?: boolean
  readonly variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
  readonly size?: ControlSize
  readonly tone?: "neutral" | "solo" | "arm" | "activator"
  readonly onActiveChange?: (active: boolean) => void
  readonly icon?: ReactNode
}

export function Button({
  label,
  disabled = false,
  active = false,
  highlight = true,
  iconOnly = false,
  activeFilled = false,
  reducedMotion = false,
  variant = "default",
  tone = "neutral",
  size = "default",
  role = "button",
  tabIndex = 0,
  onActiveChange,
  icon,
  children,
  style,
  onClick,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  onFocus,
  onBlur,
  ref,
  ...props
}: ButtonProps) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const theme = useTheme()
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const text =
    typeof children === "string" || typeof children === "number"
      ? String(children).replace(/\r?\n/g, " ")
      : undefined
  const textStyle = {
    fontSize: style?.fontSize ?? metrics["--text-control-track"],
    fontFamily: style?.fontFamily,
    fontWeight: style?.fontWeight,
    lineHeight: style?.lineHeight,
  }
  const measurement = useMeasuredTextWidth(!iconOnly && text !== undefined ? [text] : [], textStyle)
  const padding =
    (style?.paddingLeft ?? style?.padding ?? metrics["--spacing-control-track-pad"]) +
    (style?.paddingRight ?? style?.padding ?? metrics["--spacing-control-track-pad"])
  const border =
    (style?.borderLeftWidth ?? style?.borderWidth ?? theme.design.shape.controlBorderWidth) +
    (style?.borderRightWidth ?? style?.borderWidth ?? theme.design.shape.controlBorderWidth)
  const iconWidth = icon
    ? metrics["--spacing-control-icon-slot"] + (style?.gap ?? metrics["--spacing-control-gap"])
    : 0
  const intrinsicWidth = snapControlWidth(
    measurement.width + iconWidth + padding + border,
    theme.control["--spacing-control-track"]
  )
  const info = useInfoBinding({ type: "button" })
  const name = label ?? props["aria-label"] ?? (typeof children === "string" ? children : undefined)
  const activeDestructive = active && variant === "destructive"
  const destructiveBackground = activeDestructive ? theme.colors.destructiveActive : undefined
  const destructiveHighlight =
    activeDestructive && highlight && !disabled
      ? theme.colors.destructiveHighlight
      : destructiveBackground
  const toneFill =
    tone === "solo"
      ? theme.colors.soloActive
      : tone === "arm"
        ? theme.colors.armActive
        : tone === "activator"
          ? theme.colors.activatorActive
          : undefined
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
  const baseStyle = sx(
    controlChrome(
      theme,
      size
    )({
      active: active ? "on" : "off",
      highlight: highlight ? "on" : "off",
      disabled: disabled ? "on" : "off",
      iconOnly: iconOnly ? "on" : "off",
    }),
    !iconOnly && text !== undefined && { width: intrinsicWidth, minWidth: 0, flexShrink: 1 },
    !active && appearances({ variant }),
    iconOnly && variant !== "outline" && { borderWidth: 0 },
    activeDestructive && {
      backgroundColor: destructiveBackground,
      color: theme.colors.destructive,
      hover: { backgroundColor: destructiveHighlight, color: theme.colors.destructive },
      active: { backgroundColor: destructiveHighlight, color: theme.colors.destructive },
      focusVisible: {
        borderColor: theme.colors.destructiveFocusBorder,
        outlineWidth: theme.design.shape.focusRingWidth,
        outlineColor: theme.colors.destructiveFocusOutline,
        outlineOffset: -theme.design.shape.focusRingWidth,
      },
    },
    active &&
      toneFill !== undefined && {
        backgroundColor: toneFill,
        color: theme.colors.primaryForeground,
        hover: { backgroundColor: toneFill, color: theme.colors.primaryForeground },
        active: { backgroundColor: toneFill, color: theme.colors.primaryForeground },
      }
  )
  const disabledPaint = disabled
    ? {
        backgroundColor: baseStyle.backgroundColor,
        color: baseStyle.color,
        borderColor: baseStyle.borderColor,
      }
    : undefined
  const iconSlotProps = { size, interactive: true, hovered: hovered && !disabled, filled: activeFilled && (active || pressed), reducedMotion }
  const iconContent = icon ?? (iconOnly ? children : null)
  const iconSlot = iconContent == null ? null : isValidElement<IconSlotProps>(iconContent) && iconContent.type === IconSlot
    ? cloneElement(iconContent, iconSlotProps)
    : <IconSlot {...iconSlotProps}>{iconContent}</IconSlot>
  return (
    <div
      {...props}
      ref={ref}
      role={role}
      tabIndex={disabled ? -1 : tabIndex}
      aria-disabled={disabled}
      aria-pressed={onActiveChange ? active : undefined}
      aria-label={name}
      style={sx(
        baseStyle,
        disabled && { hover: disabledPaint, active: disabledPaint },
        style,
        !iconOnly && text !== undefined && style?.width === "auto" && { width: intrinsicWidth }
      )}
      onClick={activate}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (!event.defaultPrevented && event.key === "enter" && !disabled) {
          activate(event)
          consumeKey(event, "handled")
        }
      }}
      onMouseDown={event => {
        if (!disabled) setPressed(true)
        onMouseDown?.(event)
      }}
      onMouseUp={event => {
        setPressed(false)
        onMouseUp?.(event)
      }}
      onMouseEnter={event => {
        setHovered(!disabled)
        info.onMouseEnter()
        onMouseEnter?.(event)
      }}
      onMouseLeave={event => {
        setHovered(false)
        setPressed(false)
        info.onMouseLeave()
        onMouseLeave?.(event)
      }}
      onFocus={event => {
        info.onFocus()
        onFocus?.(event)
      }}
      onBlur={event => {
        info.onBlur()
        setPressed(false)
        onBlur?.(event)
      }}
    >
      {measurement.sampleNodes}
      {iconSlot}
      {iconOnly ? null : text !== undefined ? (
        <TruncatedText hovered={hovered} style={{ ...textStyle, flexGrow: 0, textAlign: "center" }}>
          {text}
        </TruncatedText>
      ) : (
        children
      )}
    </div>
  )
}
