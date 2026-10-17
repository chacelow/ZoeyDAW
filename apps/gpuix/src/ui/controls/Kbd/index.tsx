import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { Props } from "@gpuix/react"

export function Kbd({ children, style, ...props }: Props) {
  const theme = useTheme()
  const metrics = theme.control
  return (
    <div {...props} style={sx({
      display: "flex", alignItems: "center", justifyContent: "center",
      height: metrics["--spacing-control-track"], minWidth: metrics["--spacing-control-track"],
      paddingLeft: metrics["--spacing-control-track-pad"], paddingRight: metrics["--spacing-control-track-pad"],
      borderWidth: theme.design.shape.controlBorderWidth, borderColor: theme.colors.border,
      borderRadius: theme.design.shape.controlRadius, backgroundColor: theme.colors.muted,
      color: theme.colors.mutedForeground, fontSize: metrics["--text-control-track"],
      fontFamily: theme.design.typography.numberFontFamily, flexShrink: 0,
    }, style)}>{children}</div>
  )
}
