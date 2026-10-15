import type { ThemeMode } from "@/platform/settings"
import type { Appearance } from "@/shared/theme/ThemeProvider"

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"]

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

/** Unknown appearance is dark on renderer-free hosts; the native root always supplies a value. */
export function resolveAppearance(mode: ThemeMode, system: Appearance | null): Appearance {
  if (mode === "system") return system ?? "dark"
  return mode
}
