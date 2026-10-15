import { createSettings } from "@/platform/settings"
import type { ThemeModeSetting } from "./theme-mode"

/**
 * TEMPORARY until H1 adds `themeMode` to `UserSettings` and the Rust `Settings` struct: read
 * and write the field through the untyped settings JSON. Until then Rust rejects the unknown
 * field on write and the theme-mode store falls back to memory. After H1, replace with
 * `createSettingStorage("themeMode")` and delete this file.
 */
export function createThemeModeSetting(options: { configDir?: string } = {}): ThemeModeSetting {
  const settings = createSettings(options)
  return {
    get: () => {
      const value: unknown = Reflect.get(settings.get(), "themeMode")
      return typeof value === "string" ? value : null
    },
    set: mode => settings.set({ ...settings.get(), ...{ themeMode: mode } }),
  }
}
