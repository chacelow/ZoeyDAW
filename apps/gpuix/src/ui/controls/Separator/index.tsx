import { useTheme } from "../../../shared/theme/ThemeProvider"
import { sx } from "../../../shared/theme/style"
import type { Props } from "@gpuix/react"

export interface SeparatorProps extends Props {
  readonly orientation?: "horizontal" | "vertical"
  readonly decorative?: boolean
}

export function Separator({
  orientation = "horizontal",
  decorative = false,
  style,
  ...props
}: SeparatorProps) {
  const theme = useTheme()
  const vertical = orientation === "vertical"
  return (
    <div
      {...props}
      role={decorative ? "presentation" : "separator"}
      aria-orientation={orientation}
      style={sx(
        { flexShrink: 0, backgroundColor: theme.colors.border },
        vertical ? { width: 1, alignSelf: "stretch" } : { height: 1, width: "100%" },
        style
      )}
    />
  )
}
