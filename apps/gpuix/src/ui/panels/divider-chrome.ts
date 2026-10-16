import type { StyleDesc } from "@gpuix/react"
import type { Theme } from "@/shared/theme/ThemeProvider"

/**
 * Shared chrome for every panel divider. Pointer hover and press paint nothing (user 2026-10-16):
 * the resize cursor alone signals the draggable hit area. Keyboard focus keeps its ring because a
 * focused divider has no cursor to show it.
 */
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
