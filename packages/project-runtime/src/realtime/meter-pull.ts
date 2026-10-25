import type { MeterSnapshot, MeterStore } from "@zoeydaw/project-core/realtime"

export type MeterPullState = "stale" | "running" | "stalled" | "hidden" | "error" | "disposed"

export interface MeterPull {
  tick(now: number): void
  setVisible(visible: boolean): void
  recordPaint(durationMs: number): void
  readStatus(): {
    readonly state: MeterPullState
    readonly rateHz: 30 | 60
    readonly error: unknown
  }
  subscribeStatus(listener: () => void): () => void
  dispose(): void
}

export function createMeterPull(options: {
  store: MeterStore
  snapshot: (afterSeq: string) => Promise<ArrayBuffer>
  paint?: (snapshot: MeterSnapshot) => void
  now: () => number
}): MeterPull {
  let state: MeterPullState = "stale"
  let error: unknown = null
  let visible = true
  let disposed = false
  let generation = 0
  let lastTick: number | null = null
  let nextSlot = 0
  let afterSeq = "0"
  let pending: ArrayBuffer | null = null
  let flight: { generation: number; started: number; stalled: boolean } | null = null
  let rateHz: 30 | 60 = 60
  let samples: { at: number; duration: number }[] = []
  let healthySince: number | null = null
  let paintDuration = 0
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const transition = (next: MeterPullState) => {
    if (state === next) return
    state = next
    notify()
  }
  const fail = (caught: unknown) => {
    error = caught
    try {
      options.store.markStale()
    } catch (staleError) {
      error = new AggregateError([caught, staleError], "Meter frame and stale notification failed")
    }
    transition("error")
  }
  const invalidate = (stale = true) => {
    generation += 1
    pending = null
    afterSeq = "0"
    if (stale) options.store.markStale()
    samples = []
    healthySince = null
    paintDuration = 0
  }
  const measurePaint = (at: number, duration: number) => {
    samples.push({ at, duration })
    samples = samples.filter(sample => at - sample.at <= 2000)
    if (samples.length < 2 || at - (samples[0]?.at ?? at) < 1900) return
    const sorted = samples.map(sample => sample.duration).sort((a, b) => a - b)
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
    if (rateHz === 60 && p95 > 16.67) {
      rateHz = 30
      healthySince = null
      notify()
    } else if (rateHz === 30) {
      if (p95 > 12) healthySince = null
      else {
        healthySince ??= at
        if (at - healthySince >= 5000) {
          rateHz = 60
          healthySince = null
          notify()
        }
      }
    }
  }
  let registry = options.store.readMetadata().registry
  let endpointIds = options.store.readMetadata().endpointIds
  let transport = options.store.readMetadata().transport
  const unsubscribe = options.store.subscribeMetadata(() => {
    const metadata = options.store.readMetadata()
    const next = metadata.registry
    const interestChanged = endpointIds !== metadata.endpointIds || transport !== metadata.transport
    endpointIds = metadata.endpointIds
    transport = metadata.transport
    if (next === registry && !interestChanged) return
    const sameGraph =
      next !== null &&
      registry !== null &&
      next.sessionEpoch === registry.sessionEpoch &&
      next.deviceEpoch === registry.deviceEpoch &&
      next.generation === registry.generation &&
      next.registryRevision === registry.registryRevision
    const sameReset = next?.resetEpoch === registry?.resetEpoch
    registry = next
    if (!sameGraph || !sameReset || interestChanged) {
      invalidate(!sameGraph || interestChanged)
      if ((!sameGraph || interestChanged) && state !== "error" && visible) transition("stale")
    }
  })
  return {
    tick(at) {
      if (disposed || !visible || state === "error") return
      if (!Number.isFinite(at) || (lastTick !== null && at < lastTick))
        throw new Error("Meter tick requires monotonic milliseconds")
      if (paintDuration > 0) {
        measurePaint(at, paintDuration)
        paintDuration = 0
      }
      if (lastTick !== null && at - lastTick > 250) {
        invalidate()
        transition("stale")
      }
      lastTick = at
      if (flight && !flight.stalled && at - flight.started > 500) {
        flight.stalled = true
        invalidate()
        transition("stalled")
      }
      if (at < nextSlot) return
      const interval = 1000 / rateHz
      nextSlot = (Math.floor(at / interval) + 1) * interval
      if (pending) {
        const bytes = pending
        pending = null
        const started = options.now()
        try {
          if (options.store.acceptFrame(bytes)) {
            const snapshot = options.store.readLatest()
            if (snapshot) {
              afterSeq = snapshot.frame.header.seq.toString()
              options.paint?.(snapshot)
              paintDuration += Math.max(0, options.now() - started)
              transition("running")
            }
          }
        } catch (caught) {
          fail(caught)
          return
        }
      }
      if (flight) return
      const current = { generation, started: at, stalled: false }
      flight = current
      // Request completion never schedules another pull or paints outside a frame tick.
      Promise.resolve()
        .then(() => {
          if (disposed || !visible || current.generation !== generation) return null
          return options.snapshot(afterSeq)
        })
        .then(bytes => {
          if (
            bytes &&
            !disposed &&
            visible &&
            current.generation === generation &&
            bytes.byteLength > 0
          )
            pending = bytes
        })
        .catch((caught: unknown) => {
          if (disposed || current.generation !== generation) return
          fail(caught)
        })
        .finally(() => {
          if (flight === current) flight = null
        })
    },
    setVisible(next) {
      if (disposed || visible === next) return
      visible = next
      invalidate()
      lastTick = null
      nextSlot = 0
      if (state !== "error") transition(next ? "stale" : "hidden")
    },
    recordPaint(durationMs) {
      if (!disposed && visible && Number.isFinite(durationMs) && durationMs >= 0)
        paintDuration += durationMs
    },
    readStatus: () => ({ state, rateHz, error }),
    subscribeStatus(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      invalidate()
      transition("disposed")
      listeners.clear()
    },
  }
}
