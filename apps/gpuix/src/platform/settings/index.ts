import { settingsGet, settingsSet, userDirectories } from "@zoeydaw/native"

export type CloseBehavior = "ask" | "tray" | "quit"

export interface UserSettings {
  themePreset?: string
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
