import type { StyleDesc } from "@gpuix/react"
import type { Theme } from "@/shared/theme/ThemeProvider"

export function dividerChrome(theme: Theme): StyleDesc {
  return {
    backgroundColor: theme.colors.card,
    userSelect: "none",
    flexShrink: 0,
    focusVisible: {
      outlineWidth: theme.design.shape.focusRingWidth,
      outlineColor: theme.colors.ring,
      outlineOffset: -theme.design.shape.focusRingWidth,
    },
  }
}
