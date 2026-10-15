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

export interface ThemeModeSetting {
  get(): string | null
  set(value: ThemeMode): void
}

export interface ThemeModeStore {
  getMode(): ThemeMode
  /** False while the last write failed; the mode then lives in memory only. */
  isPersisted(): boolean
  setMode(mode: ThemeMode): void
  subscribe(listener: () => void): () => void
}

/**
 * Owns the selected theme mode. Reads and writes go through the settings port; a failing
 * port (Rust rejects the unknown `themeMode` field until H1 merges) keeps the choice in
 * memory instead of throwing into the application root.
 */
export function createThemeModeStore(setting: ThemeModeSetting): ThemeModeStore {
  let persisted = true
  let mode = DEFAULT_THEME_MODE
  try {
    const stored = setting.get()
    if (isThemeMode(stored)) mode = stored
  } catch {
    persisted = false
  }
  const listeners = new Set<() => void>()
  return {
    getMode: () => mode,
    isPersisted: () => persisted,
    setMode(next) {
      if (next === mode && persisted) return
      mode = next
      try {
        setting.set(next)
        persisted = true
      } catch {
        persisted = false
      }
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
