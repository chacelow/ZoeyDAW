import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { Props } from "@gpuix/react"

export interface BadgeProps extends Props {
  readonly tone?: "neutral" | "accent" | "destructive"
}

export function Badge({ tone = "neutral", children, style, ...props }: BadgeProps) {
  const theme = useTheme()
  const metrics = theme.control
  return (
    <div {...props} style={sx({
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      height: metrics["--spacing-control-track"], minWidth: metrics["--spacing-control-track"],
      paddingLeft: metrics["--spacing-control-track-pad"], paddingRight: metrics["--spacing-control-track-pad"],
      borderRadius: theme.design.shape.controlRadius,
      backgroundColor: tone === "accent" ? theme.colors.primary : tone === "destructive" ? theme.colors.destructive : theme.colors.muted,
      color: tone === "neutral" ? theme.colors.foreground : theme.colors.primaryForeground,
      fontSize: metrics["--text-control-track"], userSelect: "none",
    }, style)}>{children}</div>
  )
}
