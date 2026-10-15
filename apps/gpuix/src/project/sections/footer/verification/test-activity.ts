export interface TestWindowActivity {
  readonly subscribe: (listener: (active: boolean) => void) => () => void
  readonly emit: (active: boolean) => void
}

export function createTestWindowActivity(): TestWindowActivity {
  const listeners = new Set<(active: boolean) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(active) {
      for (const listener of listeners) listener(active)
    },
  }
}
