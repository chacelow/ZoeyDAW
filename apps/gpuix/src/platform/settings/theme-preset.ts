import { createSettings } from "./index"

/**
 * `themePreset` in the user settings file. `platform` cannot see the preset
 * list (`shared/theme`), so the composition root passes `isThemePresetId`.
 *
 * Reads never write: an id that is no longer listed (renamed, removed, or a
 * pre-preset value) reads as `null` so the caller falls back to Default, and
 * the stale value is replaced by the next preset write.
 */
export function createThemePresetSetting<Id extends string>(
  isPresetId: (value: string) => value is Id,
  options: { configDir?: string } = {}
) {
  const settings = createSettings(options)
  return {
    get(): Id | null {
      const stored = settings.get().themePreset
      return stored !== undefined && isPresetId(stored) ? stored : null
    },
    set(id: Id): void {
      settings.set({ ...settings.get(), themePreset: id })
    },
  }
}
