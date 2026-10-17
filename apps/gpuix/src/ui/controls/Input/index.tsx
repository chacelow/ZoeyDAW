import { useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { colorMix } from "@/shared/theme/color-mix"
import { sx } from "@/shared/theme/style"
import { stopTextShortcutPropagation } from "../keyboard"
import { useTextFocusBinding } from "../ControlEnvironment"
import { IconSlot } from "../IconSlot"
import { Icon } from "../Icon"
import { ToolbarIconButton } from "../ToolbarIconButton"
import type { InputProps as NativeInputProps, PublicInstance } from "@gpuix/react"
import type { ReactNode } from "react"

export type InputVariant = "outline" | "filled" | "ghost" | "borderless" | "underline"
export type InputSize = "default" | "transport" | "small"

interface InputBaseProps extends NativeInputProps {
  disabled?: boolean
  invalid?: boolean
  variant?: InputVariant
  size?: InputSize
  leading?: ReactNode
  trailing?: ReactNode
  onValueChange?: (value: string) => void
}

export type InputProps = InputBaseProps & (
  | { clearable: true; clearLabel: string }
  | { clearable?: false; clearLabel?: never }
)

export function Input({
  disabled = false,
  invalid = false,
  variant = "outline",
  size = "default",
  leading,
  trailing,
  clearable = false,
  clearLabel,
  onValueChange,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  readOnly,
  style,
  ref,
  value,
  ...props
}: InputProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const inputRef = useRef<PublicInstance | null>(null)
  const [uncontrolledValue, setUncontrolledValue] = useState("")
  const textFocus = useTextFocusBinding(!disabled)
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const slotSize = size === "transport" ? "transport" : "default"
  const ghost = variant === "ghost" || variant === "borderless"
  const backgroundColor = ghost || variant === "underline"
    ? "transparent"
    : variant === "filled" ? theme.colors.muted : theme.colors.background
  const padding = size === "small"
    ? metrics["--spacing-control-track-pad"]
    : theme.design.input.paddingInline
  const slotWidth = metrics["--spacing-control-icon-slot"] + metrics["--spacing-control-gap"]
  const showClear = clearable && !readOnly && (value ?? uncontrolledValue).length > 0
  const hasTrailing = Boolean(trailing) || clearable
  const adorned = Boolean(leading) || hasTrailing
  const focusColor = invalid ? theme.colors.destructive : theme.colors.ring
  const inputStyle = sx(
    {
      height: metrics["--spacing-control-track"],
      fontSize: metrics["--text-control-track"],
      color: theme.colors.foreground,
      backgroundColor,
      borderWidth: variant === "outline" ? theme.design.shape.controlBorderWidth : 0,
      borderBottomWidth: variant === "underline" ? theme.design.shape.controlBorderWidth : undefined,
      borderColor: invalid ? theme.colors.destructive : theme.colors.input,
      borderRadius: theme.design.shape.controlRadius,
      paddingLeft: padding + (leading ? slotWidth : 0),
      paddingRight: padding + (trailing ? slotWidth : 0) + (clearable ? slotWidth : 0),
      minWidth: 0,
      keyboardFocusDim: false,
      hover: disabled ? undefined : { backgroundColor: colorMix(theme.colors.muted, theme.design.input.hoverMutedPercent, theme.colors.foreground) },
      outlineWidth: invalid && variant !== "outline" && variant !== "underline"
        ? theme.design.shape.focusRingWidth : 0,
      outlineColor: focusColor,
      outlineOffset: -theme.design.shape.focusRingWidth,
      focusVisible: disabled ? undefined : {
        backgroundColor: ghost ? theme.colors.muted : backgroundColor,
        outlineWidth: theme.design.shape.focusRingWidth,
        outlineColor: focusColor,
        outlineOffset: -theme.design.shape.focusRingWidth,
      },
      opacity: disabled ? theme.design.states.disabledOpacity : 1,
      cursor: disabled ? theme.design.cursors.disabled : readOnly ? theme.design.cursors.default : theme.design.cursors.text,
      pointerEvents: disabled ? "none" : undefined,
    },
    style,
    adorned && { width: "100%" }
  )
  const input = (
    <input
      {...props}
      ref={node => {
        inputRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      value={value ?? (clearable ? uncontrolledValue : undefined)}
      tabIndex={disabled ? -1 : (props.tabIndex ?? 0)}
      autoFocus={disabled ? false : props.autoFocus}
      aria-disabled={disabled}
      aria-invalid={invalid}
      readOnly={disabled || readOnly}
      theme={{ appearance: theme.appearance, bg: backgroundColor, text: theme.colors.foreground, caret: disabled || readOnly ? "transparent" : theme.colors.foreground }}
      style={inputStyle}
      onFocus={event => {
        textFocus.onFocus()
        onFocus?.(event)
      }}
      onBlur={event => {
        textFocus.onBlur()
        onBlur?.(event)
      }}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (!disabled) stopTextShortcutPropagation(event)
      }}
      onChange={event => {
        if (disabled || readOnly) return
        if (event.value !== undefined) {
          if (clearable) setUncontrolledValue(event.value)
          onValueChange?.(event.value)
        }
        onChange?.(event)
      }}
    />
  )
  if (!adorned && !disabled) return input
  return (
    <div style={{ position: "relative", width: style?.width, flexGrow: style?.flexGrow, minWidth: 0, cursor: disabled ? theme.design.cursors.disabled : readOnly ? theme.design.cursors.default : theme.design.cursors.text }}>
      {input}
      {leading ? (
        <IconSlot size={slotSize} style={{ position: "absolute", left: padding, top: 0, height: inputStyle.height }}>
          {leading}
        </IconSlot>
      ) : null}
      {hasTrailing ? (
        <div style={{
          position: "absolute", right: padding, top: 0, height: inputStyle.height,
          display: "flex", alignItems: "center", gap: metrics["--spacing-control-gap"],
          pointerEvents: "none",
        }}>
          {trailing ? <IconSlot size={slotSize}>{trailing}</IconSlot> : null}
          {showClear ? (
            <ToolbarIconButton
              testId={props.testId ? `${props.testId}-clear` : undefined}
              label={clearLabel}
              disabled={disabled}
              size={slotSize}
              icon={<Icon name="X" size={metrics["--spacing-control-icon"]} />}
              onClick={event => {
                if (disabled || readOnly) return
                setUncontrolledValue("")
                onValueChange?.("")
                onChange?.({ ...event, value: "" })
                if (inputRef.current) renderer?.focusElement?.(inputRef.current.id)
              }}
              style={{ width: metrics["--spacing-control-icon-slot"], height: metrics["--spacing-control-icon-slot"], borderWidth: 0 }}
            />
          ) : null}
        </div>
      ) : null}
      {disabled ? <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "auto", cursor: theme.design.cursors.disabled, userSelect: "none" }} /> : null}
    </div>
  )
}

export { InlineEdit } from "./InlineEdit"
export type { InlineEditProps } from "./InlineEdit"
