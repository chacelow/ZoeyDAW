import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import { stopTextShortcutPropagation } from "../keyboard"
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
  onKeyDown,
  readOnly,
  style,
  ...props
}: InputProps) {
  const theme = useTheme()
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
      keyboardFocusDim: false,
      focusVisible: {
        outlineWidth: 1,
        outlineColor: theme.colors.ring,
        outlineOffset: -1,
      },
    },
    variants: {
      state: {
        default: {},
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
          state: invalid ? "invalid" : "default",
          disabled: disabled ? "true" : "false",
        }),
        style
      )}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (!disabled && !readOnly) stopTextShortcutPropagation(event)
      }}
      onChange={event => {
        if (disabled || readOnly) return
        if (event.value !== undefined) onValueChange?.(event.value)
        onChange?.(event)
      }}
    />
  )
}
