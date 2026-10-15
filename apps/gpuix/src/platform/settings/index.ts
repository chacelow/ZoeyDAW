import { settingsGet, settingsSet, userDirectories } from "@zoeydaw/native"

export type CloseBehavior = "ask" | "tray" | "quit"
/** 明暗模式;与配色预设 `themePreset` 是两个设置。未保存时按 `DEFAULT_THEME_MODE` 处理。 */
export type ThemeMode = "light" | "dark" | "system"
export const DEFAULT_THEME_MODE: ThemeMode = "system"

export interface UserSettings {
  themePreset?: string
  themeMode?: ThemeMode
  language?: string
  closeBehavior?: CloseBehavior
}

export function createSettings(options: { configDir?: string } = {}) {
  const configDir = options.configDir ?? userDirectories().configDir
  return {
    get(): UserSettings {
      return JSON.parse(settingsGet(configDir))
    },
    set(settings: UserSettings): void {
      settingsSet(configDir, JSON.stringify(settings))
    },
  }
}

export function createSettingStorage<K extends keyof UserSettings>(
  key: K,
  options: { configDir?: string } = {}
) {
  const settings = createSettings(options)
  return {
    get(): NonNullable<UserSettings[K]> | null {
      return settings.get()[key] ?? null
    },
    set(value: NonNullable<UserSettings[K]>): void {
      settings.set({ ...settings.get(), [key]: value })
    },
  }
}
