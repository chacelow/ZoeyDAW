import type { StyleDesc } from "@gpuix/react"
import type { Theme } from "@/shared/theme/ThemeProvider"

export function dividerChrome(theme: Theme, dragging = false): StyleDesc {
  const highlight = theme.colors.ring
  return {
    backgroundColor: dragging ? highlight : theme.colors.card,
    hover: { backgroundColor: highlight },
    active: { backgroundColor: highlight },
    userSelect: "none",
    flexShrink: 0,
    focusVisible: {
      outlineWidth: theme.design.shape.focusRingWidth,
      outlineColor: highlight,
      outlineOffset: -theme.design.shape.focusRingWidth,
    },
  }
}
