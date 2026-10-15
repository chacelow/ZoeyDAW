export interface MeterListener {
  readonly active: () => boolean
  readonly advance: (timestampMs: number) => boolean
}

export interface MeterDecayDriver {
  subscribe: (listener: MeterListener) => () => void
  wake: () => void
  advance: (timestampMs: number) => void
}

export function createMeterDecayDriver(
  onActiveChange: (active: boolean) => void
): MeterDecayDriver {
  const listeners = new Set<MeterListener>()
  let running = false
  const setActive = (active: boolean) => {
    if (running === active) return
    running = active
    onActiveChange(active)
  }
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) setActive(false)
      }
    },
    wake() {
      for (const listener of listeners) {
        if (listener.active()) {
          setActive(true)
          return
        }
      }
      setActive(false)
    },
    advance(timestampMs) {
      if (!running) return
      let active = false
      for (const listener of listeners) active = listener.advance(timestampMs) || active
      setActive(active && listeners.size > 0)
    },
  }
}
