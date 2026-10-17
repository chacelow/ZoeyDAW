import type { StyleDesc } from "@gpuix/react"
import type { Theme } from "@/shared/theme/ThemeProvider"

export function dividerChrome(theme: Theme, highlighted = false): StyleDesc {
  return {
    backgroundColor: highlighted ? theme.colors.ring : theme.colors.border,
    userSelect: "none",
    flexShrink: 0,
  }
}
