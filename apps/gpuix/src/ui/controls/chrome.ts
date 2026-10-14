import { sv } from "../../shared/theme/style"
import { colorMix } from "../../shared/theme/color-mix"
import type { Theme } from "../../shared/theme/ThemeProvider"

export type ControlSize = "default" | "transport"

export function controlChrome(theme: Theme, size: ControlSize = "default") {
  const metrics = size === "transport" ? theme.transportControl : theme.control
  return sv({
    base: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      flexShrink: 0,
      height: metrics["--spacing-control-track"],
      gap: metrics["--spacing-control-gap"],
      paddingLeft: metrics["--spacing-control-track-pad"],
      paddingRight: metrics["--spacing-control-track-pad"],
      borderRadius: 3,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.muted,
      color: theme.colors.foreground,
      fontSize: metrics["--text-control-track"],
      cursor: "pointer",
      userSelect: "none",
      keyboardFocusDim: false,
      focusVisible: {
        outlineWidth: 1,
        outlineColor: theme.colors.ring,
        outlineOffset: -1,
      },
    },
    variants: {
      highlight: {
        on: {
          hover: { backgroundColor: colorMix(theme.colors.muted, 90, theme.colors.foreground) },
          active: { backgroundColor: colorMix(theme.colors.muted, 74, theme.colors.foreground) },
        },
        off: {},
      },
      active: {
        on: {
          backgroundColor: theme.colors.primary,
          color: theme.colors.primaryForeground,
          hover: { backgroundColor: theme.colors.primary, color: theme.colors.primaryForeground },
          active: { backgroundColor: theme.colors.primary, color: theme.colors.primaryForeground },
        },
        off: {},
      },
      dragging: {
        on: { backgroundColor: colorMix(theme.colors.muted, 82, theme.colors.foreground) },
        off: {},
      },
      disabled: {
        on: {
          opacity: 0.5,
          cursor: "not-allowed",
          hover: { backgroundColor: theme.colors.muted },
          active: { backgroundColor: theme.colors.muted },
        },
        off: {},
      },
      iconOnly: {
        on: { width: metrics["--spacing-control-track"], paddingLeft: 0, paddingRight: 0 },
        off: {},
      },
    },
    defaultVariants: {
      highlight: "on",
      active: "off",
      dragging: "off",
      disabled: "off",
      iconOnly: "off",
    },
  })
}
