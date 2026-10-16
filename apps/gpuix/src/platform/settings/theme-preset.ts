import { createSettingStorage } from "./index"

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
    repair(): boolean {
      const stored = storage.get()
      if (stored === null || isPresetId(stored)) return false
      storage.set(defaultId)
      return true
    },
  }
}
