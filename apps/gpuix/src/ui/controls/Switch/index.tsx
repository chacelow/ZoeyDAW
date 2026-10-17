import { motion } from "@gpuix/react"
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
  readonly reducedMotion?: boolean
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  size = "default",
  reducedMotion = false,
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
  const transition = {
    duration: reducedMotion ? 0 : theme.design.motion.switch.duration,
    ease: theme.design.motion.switch.easing,
  }
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
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.muted,
          opacity: disabled ? theme.design.states.disabledOpacity : 1,
          cursor: disabled ? theme.design.cursors.disabled : theme.design.cursors.action,
          userSelect: "none",
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
      <motion.div
        aria-hidden="true"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={transition}
        style={{
          position: "absolute",
          top: -border,
          left: -border,
          width,
          height,
          borderWidth: border,
          borderColor: theme.colors.primary,
          borderRadius: height,
          backgroundColor: theme.colors.primary,
          pointerEvents: "none",
        }}
      />
      <motion.div
        aria-hidden="true"
        initial={false}
        animate={{ left: inset + (checked ? travel : 0) }}
        transition={transition}
        style={{
          position: "absolute",
          top: inset,
          width: thumb,
          height: thumb,
          borderRadius: thumb,
          backgroundColor: theme.colors.mutedForeground,
          pointerEvents: "none",
        }}
      >
        <motion.div
          initial={false}
          animate={{ opacity: checked ? 1 : 0 }}
          transition={transition}
          style={{
            width: thumb,
            height: thumb,
            borderRadius: thumb,
            backgroundColor: theme.colors.primaryForeground,
            pointerEvents: "none",
          }}
        />
      </motion.div>
    </div>
  )
}
