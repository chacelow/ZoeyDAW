export interface FrameSource {
  subscribe: (callback: () => void) => () => void
}

export interface MeterDecayDriver {
  subscribe: (listener: (time: number) => boolean) => () => void
  wake: () => void
}

export function createMeterDecayDriver(
  frames: FrameSource,
  now: () => number = () => performance.now()
): MeterDecayDriver {
  const listeners = new Set<(time: number) => boolean>()
  let stopFrames: (() => void) | null = null
  const stop = () => {
    stopFrames?.()
    stopFrames = null
  }
  const tick = () => {
    let active = false
    const time = now()
    for (const listener of listeners) active = listener(time) || active
    if (!active || !listeners.size) stop()
    return active
  }
  return {
    subscribe(listener: (time: number) => boolean) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) stop()
      }
    },
    wake() {
      if (stopFrames) return
      if (listeners.size && tick() && !stopFrames) stopFrames = frames.subscribe(tick)
    },
  }
}
