import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import type { Props, PublicInstance } from "@gpuix/react"
import type { RefObject } from "react"

export interface LabelProps extends Props {
  disabled?: boolean
  controlRef?: RefObject<PublicInstance | null>
}

export function Label({
  disabled = false,
  controlRef,
  style,
  children,
  onClick,
  onKeyDown,
  ...props
}: LabelProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const variants = sv({
    base: {
      color: theme.colors.foreground,
      fontSize: theme.control["--text-control-track"],
      alignItems: "center",
    },
    variants: { disabled: { true: { opacity: 0.5 }, false: {} } },
  })
  const activate = () => {
    if (!disabled && controlRef?.current) renderer?.focusElement?.(controlRef.current.id)
  }
  if (!controlRef && !onClick && !onKeyDown)
    return (
      <text {...props} style={sx(variants({ disabled: disabled ? "true" : "false" }), style)}>
        {children}
      </text>
    )
  return (
    <div
      {...props}
      role="button"
      tabIndex={0}
      aria-label={props["aria-label"] ?? (typeof children === "string" ? children : undefined)}
      aria-disabled={disabled}
      style={sx(variants({ disabled: disabled ? "true" : "false" }), style)}
      onClick={event => {
        if (!disabled) {
          activate()
          onClick?.(event)
        }
      }}
      onKeyDown={event => {
        if (!disabled && (event.key === "enter" || event.key === "space" || event.key === " ")) {
          activate()
          onClick?.(event)
        }
        onKeyDown?.(event)
      }}
    >
      {children}
    </div>
  )
}
