import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Popover, PopoverContent, PopoverTrigger } from "../Popover"
import { useInfoBinding } from "../ControlEnvironment"
import { controlChrome } from "../chrome"
import type { ReactNode } from "react"
import type { Props } from "@gpuix/react"
import type { FloatingAlign, FloatingSide } from "@gpuix/react/floating"
import type { ControlSize } from "../chrome"

export interface PopupButtonProps {
  readonly trigger: ReactNode
  readonly children: ReactNode
  readonly label: string
  readonly description?: string
  readonly disabled?: boolean
  readonly size?: ControlSize
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly side?: FloatingSide
  readonly align?: FloatingAlign
  readonly sideOffset?: number
  readonly style?: Props["style"]
  readonly contentStyle?: Props["style"]
  readonly testId?: string
}

export function PopupButton({
  trigger,
  children,
  label,
  description,
  disabled = false,
  size = "default",
  open: controlledOpen,
  onOpenChange,
  side = "bottom",
  align = "start",
  sideOffset = 4,
  style,
  contentStyle,
  testId,
}: PopupButtonProps) {
  const theme = useTheme()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const info = useInfoBinding({ type: "popup", description })
  return (
    <Popover
      open={open}
      disabled={disabled}
      onOpenChange={next => {
        if (controlledOpen === undefined) setInternalOpen(next)
        onOpenChange?.(next)
      }}
    >
      <PopoverTrigger
        {...info}
        testId={testId}
        aria-label={label}
        disabled={disabled}
        style={sx(
          controlChrome(
            theme,
            size
          )({ active: open ? "on" : "off", disabled: disabled ? "on" : "off" }),
          style
        )}
      >
        {typeof trigger === "string" ? <text>{trigger}</text> : trigger}
      </PopoverTrigger>
      <PopoverContent
        testId={testId ? `${testId}-content` : undefined}
        aria-label={label}
        side={side}
        align={align}
        sideOffset={sideOffset}
        style={contentStyle}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
