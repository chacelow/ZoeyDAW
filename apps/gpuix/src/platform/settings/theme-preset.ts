import { createSettingStorage } from "./index"

/**
 * `themePreset` in the user settings file. `platform` cannot see the preset
 * list (`shared/theme`), so the composition root passes `isThemePresetId`
 * and the Default id.
 *
 * `get()` never writes: an id that is no longer listed (renamed, removed, or a
 * pre-preset value) reads as `null` so the caller falls back to Default.
 * Other settings writes copy the stored value forward unchanged, so the
 * composition root calls `repair()` once at startup to replace a stale id
 * with Default on disk.
 */
export function createThemePresetSetting<Id extends string>(
  isPresetId: (value: string) => value is Id,
  defaultId: Id,
  options: { configDir?: string } = {}
) {
  const storage = createSettingStorage("themePreset", options)
  return {
    get(): Id | null {
      const stored = storage.get()
      return stored !== null && isPresetId(stored) ? stored : null
    },
    set(id: Id): void {
      storage.set(id)
    },
    /** Writes Default over a stored id that is not listed; returns whether it wrote. */
    repair(): boolean {
      const stored = storage.get()
      if (stored === null || isPresetId(stored)) return false
      storage.set(defaultId)
      return true
    },
  }
}
