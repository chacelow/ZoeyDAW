import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import type { InputProps as NativeInputProps } from "@gpuix/react"

export interface InputProps extends NativeInputProps {
  disabled?: boolean
  invalid?: boolean
  onValueChange?: (value: string) => void
}

export function Input({
  disabled = false,
  invalid = false,
  onValueChange,
  onChange,
  onFocus,
  onBlur,
  readOnly,
  style,
  ...props
}: InputProps) {
  const theme = useTheme()
  const [focused, setFocused] = useState(false)
  const variants = sv({
    base: {
      height: theme.control["--spacing-control-track"],
      fontSize: theme.control["--text-control-track"],
      color: theme.colors.foreground,
      backgroundColor: theme.colors.background,
      borderWidth: 1,
      borderColor: theme.colors.input,
      borderRadius: 3,
      paddingLeft: 6,
      paddingRight: 6,
      minWidth: 0,
    },
    variants: {
      state: {
        default: {},
        focused: { borderColor: theme.colors.ring },
        invalid: { borderColor: theme.colors.destructive },
      },
      disabled: { true: { opacity: 0.5, cursor: "not-allowed" }, false: {} },
    },
  })
  return (
    <input
      {...props}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      readOnly={disabled || readOnly}
      theme={{
        appearance: theme.appearance,
        bg: theme.colors.background,
        text: theme.colors.foreground,
      }}
      style={sx(
        variants({
          state: invalid ? "invalid" : focused ? "focused" : "default",
          disabled: disabled ? "true" : "false",
        }),
        style
      )}
      onChange={event => {
        if (disabled || readOnly) return
        if (event.value !== undefined) onValueChange?.(event.value)
        onChange?.(event)
      }}
      onFocus={event => {
        setFocused(true)
        onFocus?.(event)
      }}
      onBlur={event => {
        setFocused(false)
        onBlur?.(event)
      }}
    />
  )
}
