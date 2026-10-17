import { parse } from "culori"
import type { ThemeColors } from "./colors"

export const VSCODE_COLOR_MAPPING = {
  background: ["editor.background"],
  foreground: ["editor.foreground", "foreground"],
  card: ["sideBar.background", "panel.background"],
  cardForeground: ["sideBar.foreground", "foreground"],
  popover: ["menu.background", "editorWidget.background"],
  popoverForeground: ["menu.foreground", "editorWidget.foreground", "foreground"],
  primary: ["button.background", "activityBarBadge.background"],
  primaryForeground: ["button.foreground", "activityBarBadge.foreground"],
  secondary: ["button.secondaryBackground", "list.hoverBackground"],
  secondaryForeground: ["button.secondaryForeground", "foreground"],
  muted: [
    "tab.inactiveBackground",
    "editorGroupHeader.tabsBackground",
    "titleBar.activeBackground",
  ],
  mutedForeground: [
    "tab.inactiveForeground",
    "descriptionForeground",
    "editorLineNumber.foreground",
    "disabledForeground",
  ],
  accent: ["list.activeSelectionBackground", "editor.selectionBackground"],
  accentForeground: ["list.activeSelectionForeground", "editor.selectionForeground"],
  destructive: ["errorForeground", "editorError.foreground"],
  success: ["editorGutter.addedBackground", "charts.green"],
  border: ["panel.border", "sideBar.border", "editorGroup.border", "contrastBorder"],
  input: ["input.border", "dropdown.border"],
  ring: ["focusBorder"],
  chart1: ["charts.blue", "editorInfo.foreground"],
  chart2: ["charts.green"],
  chart3: ["charts.yellow", "editorWarning.foreground"],
  chart4: ["charts.purple"],
  chart5: ["charts.orange"],
  arrangementClipSelected: ["list.activeSelectionBackground", "editor.selectionBackground"],
  arrangementClipPaper: ["editor.background"],
  arrangementMeterClip: ["editorError.foreground", "errorForeground"],
} satisfies Partial<Record<keyof ThemeColors, readonly string[]>>

export function mapVSCodeColors(colors: Record<string, unknown>): Partial<ThemeColors> {
  return Object.fromEntries(
    Object.entries(VSCODE_COLOR_MAPPING).flatMap(([key, candidates]) => {
      for (const candidate of candidates) {
        const value = colors[candidate]
        if (
          typeof value === "string" &&
          /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) &&
          (parse(value)?.alpha ?? 1) > 0
        )
          return [[key, value]]
      }
      return []
    })
  )
}
