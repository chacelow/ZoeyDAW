import { logger } from "@/platform/log/logger"
import type { ThemePresetId } from "@/shared/theme/presets"
import { DEFAULT_THEME_PRESET } from "@/shared/theme/presets"
import { parseThemeLibrary } from "./model"
import type { ThemeLibrary } from "./model"

export interface ThemeLibraryStorage {
  get(): string | null
  set(value: string): void
}
export interface ThemeLibraryStore {
  get(): ThemeLibrary
  set(value: ThemeLibrary): void
  isPersisted(): boolean
  subscribe(listener: () => void): () => void
}
export function createThemeLibraryStore(
  storage: ThemeLibraryStorage,
  fallback: ThemePresetId = DEFAULT_THEME_PRESET
): ThemeLibraryStore {
  let value: ThemeLibrary = { selection: fallback, themes: [] }
  let persisted = true
  try {
    value = parseThemeLibrary(storage.get(), fallback)
  } catch (error) {
    persisted = false
    logger.warn("[theme-editor] Could not load themes", error)
  }
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    isPersisted: () => persisted,
    set(next) {
      value = next
      try {
        storage.set(JSON.stringify(next))
        persisted = true
      } catch (error) {
        persisted = false
        logger.warn("[theme-editor] Could not save themes", error)
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
