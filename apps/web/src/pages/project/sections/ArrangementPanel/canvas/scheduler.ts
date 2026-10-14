/**
 * Single global requestAnimationFrame loop.
 *
 * Painters register once with an id and a paint callback. They become dirty via
 * {@link RafScheduler.invalidate}; the loop coalesces every invalidation inside
 * a frame into a single paint call. Painters are never re-run while clean.
 *
 * The scheduler owns the rAF handle. Painters never call requestAnimationFrame themselves, so playhead, meters, grid, and clips share one scheduler tick.
 */
export type PaintFn = (deltaMs: number) => void

export interface Scheduler {
  register: (id: string, paint: PaintFn) => () => void
  invalidate: (id: string) => void
  invalidateAll: () => void
  dispose: () => void
}

interface Entry {
  paint: PaintFn
  dirty: boolean
}

export function createScheduler(): Scheduler {
  const entries = new Map<string, Entry>()
  let frame = 0
  let lastTick = 0
  let isDisposed = false

  function schedule() {
    if (frame || isDisposed) {
      return
    }
    frame = requestAnimationFrame(tick)
  }

  function tick(now: number) {
    frame = 0
    const delta = lastTick === 0 ? 16 : now - lastTick
    lastTick = now
    let isRepaintNext = false
    for (const entry of entries.values()) {
      if (!entry.dirty) {
        continue
      }
      entry.dirty = false
      entry.paint(delta)
      if (entry.dirty) {
        isRepaintNext = true
      }
    }
    if (isRepaintNext) {
      schedule()
    }
  }

  return {
    register(id, paint) {
      entries.set(id, { paint, dirty: true })
      schedule()
      return () => {
        entries.delete(id)
      }
    },
    invalidate(id) {
      const entry = entries.get(id)
      if (!entry) {
        return
      }
      entry.dirty = true
      schedule()
    },
    invalidateAll() {
      for (const entry of entries.values()) {
        entry.dirty = true
      }
      schedule()
    },
    dispose() {
      isDisposed = true
      if (frame) {
        cancelAnimationFrame(frame)
      }
      frame = 0
      entries.clear()
    },
  }
}

export const arrangementScheduler = createScheduler()
