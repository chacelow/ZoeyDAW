import type { StyleDesc } from "@gpuix/react"
import type { Theme } from "@/shared/theme/ThemeProvider"

/** Shared state layers for every panel divider; hover and pressed reuse the canvas scrollbar tiers. */
export function dividerChrome(theme: Theme, disabled = false): StyleDesc {
  return {
    backgroundColor: theme.colors.card,
    userSelect: "none",
    flexShrink: 0,
    focusVisible: {
      outlineWidth: theme.design.shape.focusRingWidth,
      outlineColor: theme.colors.ring,
      outlineOffset: -theme.design.shape.focusRingWidth,
    },
    ...(disabled
      ? {}
      : {
          hover: { backgroundColor: theme.colors.canvasScrollbarHover },
          active: { backgroundColor: theme.colors.canvasScrollbarActive },
        }),
  }
}
