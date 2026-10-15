import type { Appearance } from "@/shared/theme/ThemeProvider"

/** Mirrors H1's `platform/settings` `ThemeMode`; the setting is independent of `themePreset`. */
export type ThemeMode = "light" | "dark" | "system"
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"]
export const DEFAULT_THEME_MODE: ThemeMode = "system"

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

/**
 * Until the native appearance subscription lands (H1), `system` has no reading and resolves
 * to dark, the app's established default appearance.
 */
export function resolveAppearance(mode: ThemeMode, system: Appearance | null): Appearance {
  if (mode === "system") return system ?? "dark"
  return mode
}
