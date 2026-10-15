export interface PreferenceSetting<T extends string> {
  get(): string | null
  set(value: T): void
}

export interface PreferenceStore<T extends string> {
  get(): T
  /** False while the last read or write failed; the value then lives in memory only. */
  isPersisted(): boolean
  set(value: T): void
  subscribe(listener: () => void): () => void
}

/**
 * One persisted appearance preference (theme mode, color preset). Stored values are checked
 * at the boundary; a failing settings port keeps the choice in memory instead of throwing
 * into the application root.
 */
export function createPreferenceStore<T extends string>(
  setting: PreferenceSetting<T>,
  isValue: (value: string) => value is T,
  fallback: T
): PreferenceStore<T> {
  let persisted = true
  let value = fallback
  try {
    const stored = setting.get()
    if (stored !== null && isValue(stored)) value = stored
  } catch {
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
