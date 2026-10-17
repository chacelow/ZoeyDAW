import { consumeKey } from "@/shared/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { useInfoBinding } from "../ControlEnvironment"
import { isActivationKey } from "../RadioGroup/keyboard"
import { snapControlWidth } from "../grid"
import type { Props } from "@gpuix/react"
import type { ControlSize } from "../chrome"

export interface SwitchProps extends Omit<Props, "children"> {
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
  readonly label: string
  readonly description?: string
  readonly disabled?: boolean
  readonly size?: ControlSize
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  size = "default",
  style,
  ...props
}: SwitchProps) {
  const theme = useTheme()
  const info = useInfoBinding({ type: "switch", description })
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const height = snapControlWidth(
    metrics["--spacing-control-track"],
    theme.control["--spacing-control-track"]
  )
  const width = height * Math.ceil(theme.design.switch.widthRatio)
  const border = theme.design.shape.controlBorderWidth
  const inset = theme.design.switch.thumbInset
  const thumb = height - border * 2 - inset * 2
  const travel = width - border * 2 - inset * 2 - thumb
  const toggle = () => {
    if (!disabled) onCheckedChange(!checked)
  }
  return (
    <div
      {...props}
      role="switch"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-checked={checked}
      aria-disabled={disabled}
      style={sx(
        {
          position: "relative",
          flexShrink: 0,
          width,
          height,
          borderWidth: border,
          borderRadius: height,
          borderColor: checked ? theme.colors.primary : theme.colors.border,
          backgroundColor: checked ? theme.colors.primary : theme.colors.muted,
          opacity: disabled ? theme.design.states.disabledOpacity : 1,
          cursor: disabled ? theme.design.cursors.disabled : theme.design.cursors.action,
          keyboardFocusDim: false,
          focusVisible: disabled
            ? undefined
            : {
                outlineWidth: theme.design.shape.focusRingWidth,
                outlineColor: theme.colors.ring,
                outlineOffset: theme.design.shape.focusRingWidth,
              },
        },
        style
      )}
      onClick={toggle}
      onKeyDown={event => {
        if (disabled || !isActivationKey(event)) return
        consumeKey(event, "handled")
        if (!event.isHeld) toggle()
      }}
      onMouseEnter={info.onMouseEnter}
      onMouseLeave={info.onMouseLeave}
      onFocus={info.onFocus}
      onBlur={info.onBlur}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: inset,
          left: inset + (checked ? travel : 0),
          width: thumb,
          height: thumb,
          borderRadius: thumb,
          backgroundColor: checked ? theme.colors.primaryForeground : theme.colors.mutedForeground,
          pointerEvents: "none",
        }}
      />
    </div>
  )
}
