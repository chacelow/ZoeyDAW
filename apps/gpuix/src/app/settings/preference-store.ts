import { logger } from "@/platform/log/logger"

export interface PreferenceSetting<T extends string> {
  get(): string | null
  set(value: T): void
  repair?(): boolean
}

export interface PreferenceStore<T extends string> {
  get(): T
  isPersisted(): boolean
  set(value: T): void
  subscribe(listener: () => void): () => void
}

export function createPreferenceStore<T extends string>(
  setting: PreferenceSetting<T>,
  isValue: (value: string) => value is T,
  fallback: T
): PreferenceStore<T> {
  let persisted = true
  let value = fallback
  try {
    setting.repair?.()
    const stored = setting.get()
    if (stored !== null && isValue(stored)) value = stored
  } catch (error) {
    logger.warn(
      "[app/preferences] Could not initialize preference; using fallback",
      fallback,
      error
    )
    persisted = false
  }
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    isPersisted: () => persisted,
    set(next) {
      if (next === value && persisted) return
      value = next
      try {
        setting.set(next)
        persisted = true
      } catch (error) {
        logger.warn("[app/preferences] Could not persist preference", next, error)
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
