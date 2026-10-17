import { Tooltip as NativeTooltip, TooltipTrigger, TooltipContent } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import type { Theme } from "@/shared/theme/ThemeProvider"
import type { StyleDesc } from "@gpuix/react"
import type { ComponentProps, ReactElement, ReactNode } from "react"

export interface TooltipProps {
  readonly children: ReactElement
  readonly content: ReactNode
  readonly side?: ComponentProps<typeof TooltipContent>["side"]
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
}

export function tooltipChrome(theme: Theme): StyleDesc {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: theme.design.menu.inset, borderWidth: theme.design.menu.borderWidth,
    borderColor: theme.colors.border, borderRadius: theme.design.shape.controlRadius,
    backgroundColor: theme.colors.popover, color: theme.colors.popoverForeground,
    fontSize: theme.control["--text-control-track"], maxWidth: theme.design.menu.maxWidth,
  }
}

export function Tooltip({ children, content, side = "top", open, onOpenChange }: TooltipProps) {
  const theme = useTheme()
  return (
    <NativeTooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={theme.design.overlay.sideOffset} collisionPadding={theme.design.overlay.collisionPadding} role="tooltip" style={tooltipChrome(theme)}>{content}</TooltipContent>
    </NativeTooltip>
  )
}
