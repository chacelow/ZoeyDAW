import type { ThemePreset, ThemeStyleProps } from "./theme-presets"

const flatChrome: ThemeStyleProps = {
  radius: "4px",
  "shadow-opacity": "0",
}

type SidebarPalette = ThemeStyleProps &
  Record<
    | "card"
    | "card-foreground"
    | "primary"
    | "primary-foreground"
    | "accent"
    | "accent-foreground"
    | "border"
    | "ring",
    string
  >

function withSidebar(colors: SidebarPalette): ThemeStyleProps {
  return {
    ...flatChrome,
    ...colors,
    sidebar: colors.card,
    "sidebar-foreground": colors["card-foreground"],
    "sidebar-primary": colors.primary,
    "sidebar-primary-foreground": colors["primary-foreground"],
    "sidebar-accent": colors.accent,
    "sidebar-accent-foreground": colors["accent-foreground"],
    "sidebar-border": colors.border,
    "sidebar-ring": colors.ring,
  }
}

export const BUILTIN_THEME_PRESETS: ThemePreset[] = [
  {
    id: "vscode-modern",
    label: "VS Code Modern (Dark / Light)",
    preview: ["#FFFFFF", "#005FB8", "#E8E8E8"],
    styles: {
      light: withSidebar({
        background: "#FFFFFF",
        foreground: "#3B3B3B",
        card: "#F8F8F8",
        "card-foreground": "#3B3B3B",
        popover: "#FFFFFF",
        "popover-foreground": "#3B3B3B",
        primary: "#005FB8",
        "primary-foreground": "#FFFFFF",
        secondary: "#E5E5E5",
        "secondary-foreground": "#3B3B3B",
        muted: "#F8F8F8",
        "muted-foreground": "#616161",
        accent: "#E8E8E8",
        "accent-foreground": "#000000",
        destructive: "#F85149",
        "destructive-foreground": "#FFFFFF",
        success: "#2EA043",
        border: "#E5E5E5",
        input: "#CECECE",
        ring: "#005FB8",
        "chart-1": "#0063D3",
        "chart-2": "#388A34",
        "chart-3": "#BF8803",
        "chart-4": "#652D90",
        "chart-5": "#D18616",
      }),
      dark: withSidebar({
        background: "#1F1F1F",
        foreground: "#CCCCCC",
        card: "#181818",
        "card-foreground": "#CCCCCC",
        popover: "#1F1F1F",
        "popover-foreground": "#CCCCCC",
        primary: "#0078D4",
        "primary-foreground": "#FFFFFF",
        secondary: "#2A2D2E",
        "secondary-foreground": "#CCCCCC",
        muted: "#181818",
        "muted-foreground": "#9D9D9D",
        accent: "#04395E",
        "accent-foreground": "#FFFFFF",
        destructive: "#F85149",
        "destructive-foreground": "#FFFFFF",
        success: "#2EA043",
        border: "#2B2B2B",
        input: "#3C3C3C",
        ring: "#0078D4",
        "chart-1": "#59A4F9",
        "chart-2": "#89D185",
        "chart-3": "#CCA700",
        "chart-4": "#B180D7",
        "chart-5": "#D18616",
      }),
    },
  },
  {
    id: "vscode-plus",
    label: "VS Code Dark+ / Light+",
    preview: ["#FFFFFF", "#007ACC", "#0060C0"],
    styles: {
      light: withSidebar({
        background: "#FFFFFF",
        foreground: "#000000",
        card: "#F3F3F3",
        "card-foreground": "#616161",
        popover: "#FFFFFF",
        "popover-foreground": "#616161",
        primary: "#007ACC",
        "primary-foreground": "#FFFFFF",
        secondary: "#E8E8E8",
        "secondary-foreground": "#616161",
        muted: "#ECECEC",
        "muted-foreground": "#717171",
        accent: "#0060C0",
        "accent-foreground": "#FFFFFF",
        destructive: "#A1260D",
        "destructive-foreground": "#FFFFFF",
        success: "#388A34",
        border: "#80808059",
        input: "#CECECE",
        ring: "#0090F1",
        "chart-1": "#0063D3",
        "chart-2": "#388A34",
        "chart-3": "#BF8803",
        "chart-4": "#652D90",
        "chart-5": "#D18616",
      }),
      dark: withSidebar({
        background: "#1E1E1E",
        foreground: "#D4D4D4",
        card: "#252526",
        "card-foreground": "#CCCCCC",
        popover: "#252526",
        "popover-foreground": "#CCCCCC",
        primary: "#0E639C",
        "primary-foreground": "#FFFFFF",
        secondary: "#2A2D2E",
        "secondary-foreground": "#CCCCCC",
        muted: "#2D2D2D",
        "muted-foreground": "#CCCCCCB3",
        accent: "#04395E",
        "accent-foreground": "#FFFFFF",
        destructive: "#F48771",
        "destructive-foreground": "#FFFFFF",
        success: "#89D185",
        border: "#80808059",
        input: "#3C3C3C",
        ring: "#007FD4",
        "chart-1": "#59A4F9",
        "chart-2": "#89D185",
        "chart-3": "#CCA700",
        "chart-4": "#B180D7",
        "chart-5": "#D18616",
      }),
    },
  },
]
