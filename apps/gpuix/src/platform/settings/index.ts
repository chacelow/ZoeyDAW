import {
  preferencesDefaults,
  settingsGet,
  settingsSet,
  ThemeMode as NativeThemeMode,
  userDirectories,
} from "@zoeydaw/native"
import type { Preferences, Settings } from "@zoeydaw/native"
import { useSyncExternalStore } from "react"

export type UserSettings = Settings
export type PreferenceValues = Preferences
export type CloseBehavior = NonNullable<UserSettings["closeBehavior"]>
export type ThemeMode = NonNullable<UserSettings["themeMode"]>
export const DEFAULT_THEME_MODE: ThemeMode = NativeThemeMode.System

function freeze<T extends object>(value: T): T {
  if (Object.isFrozen(value)) return value
  const children: unknown[] = Object.values(value)
  for (const child of children) {
    if (child !== null && typeof child === "object") freeze(child)
  }
  return Object.freeze(value)
}

export const PREFERENCE_DEFAULTS: PreferenceValues = freeze(preferencesDefaults())

type SettingsOptions = { configDir?: string }

export function createSettings(options: SettingsOptions = {}) {
  return {
    get(): UserSettings {
      return JSON.parse(settingsGet(options.configDir ?? userDirectories().configDir))
    },
    set(settings: Partial<UserSettings>): void {
      settingsSet(options.configDir ?? userDirectories().configDir, JSON.stringify(settings))
    },
  }
}

export function createSettingStorage<K extends keyof UserSettings>(
  key: K,
  options: SettingsOptions = {}
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

export interface PreferenceOwner {
  getPreferences(): PreferenceValues
  getPreference<K extends keyof PreferenceValues>(key: K): PreferenceValues[K]
  setPreference<K extends keyof PreferenceValues>(key: K, value: PreferenceValues[K]): void
  subscribe(listener: () => void): () => void
}

export function createPreferenceOwner(options: SettingsOptions = {}): PreferenceOwner {
  const settings = createSettings(options)
  const listeners = new Set<() => void>()
  let snapshot: PreferenceValues | undefined
  function current(): PreferenceValues {
    return (snapshot ??= freeze(settings.get().preferences))
  }
  return {
    getPreferences: current,
    getPreference<K extends keyof PreferenceValues>(key: K): PreferenceValues[K] {
      return current()[key]
    },
    setPreference<K extends keyof PreferenceValues>(key: K, value: PreferenceValues[K]): void {
      if (Object.is(current()[key], value)) return
      const preferences = { ...current(), [key]: value }
      settings.set({ ...settings.get(), preferences })
      snapshot = freeze(preferences)
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const registration: { owner: PreferenceOwner | undefined } = { owner: undefined }
function preferences() {
  return (registration.owner ??= createPreferenceOwner())
}

export function configurePreferences(next: PreferenceOwner): () => void {
  const previous = registration.owner
  registration.owner = next
  return () => {
    if (registration.owner === next) registration.owner = previous
  }
}

export function getPreferences(): PreferenceValues {
  return preferences().getPreferences()
}

export function getPreference<K extends keyof PreferenceValues>(key: K): PreferenceValues[K] {
  return preferences().getPreference(key)
}

export function setPreference<K extends keyof PreferenceValues>(
  key: K,
  value: PreferenceValues[K]
): void {
  preferences().setPreference(key, value)
}

export function usePreference<K extends keyof PreferenceValues>(key: K): PreferenceValues[K] {
  return useSyncExternalStore(preferences().subscribe, () => getPreference(key))
}
