export interface FrameSource {
  subscribe: (callback: () => void) => () => void
}

export interface MeterDecayDriver {
  subscribe: (listener: (time: number) => boolean) => () => void
  wake: () => void
}

// Temporary UI-animation source until the renderer exposes its native frame callback.
const timerFrames: FrameSource = {
  subscribe(callback) {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const frame = () => {
      if (!active) return
      callback()
      if (active) timer = setTimeout(frame, 1000 / 30)
    }
    timer = setTimeout(frame, 1000 / 30)
    return () => {
      active = false
      clearTimeout(timer)
    }
  },
}

export function createMeterDecayDriver(
  frames: FrameSource = timerFrames,
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

export const meterDecayDriver = createMeterDecayDriver()
