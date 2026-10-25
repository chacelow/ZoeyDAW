import {
  meterRegistrySchema,
  type MeterInterest,
  type MeterResetKind,
  type MeterResetBaseline,
  type RealtimeEvent,
  type RealtimeRegistry,
  type RealtimeStreamOpenResult,
  type ClockProbe,
  type MeterSnapshot,
  type MeterStore,
} from "@zoeydaw/project-core/realtime"
import { createMeterStore } from "./meter-store"
import { createMeterPull, type MeterPull } from "./meter-pull"
import { measureMeterClock, nativeMilliseconds, type MeterClockMapping } from "./meter-clock"

export interface MeterSessionPort {
  open(
    leaseId: string,
    sessionId: string,
    events: (batch: readonly RealtimeEvent[]) => void,
    onError: (error: unknown) => void
  ): Promise<RealtimeStreamOpenResult>
  registry(streamId: number): Promise<RealtimeRegistry | null>
  clock(streamId: number): Promise<ClockProbe | null>
  interest(interest: MeterInterest): Promise<void>
  snapshot(streamId: number, afterSeq: string): Promise<ArrayBuffer>
  receipt(streamId: number, throughSeq: string): Promise<void>
  reset(
    streamId: number,
    endpointIds: readonly string[],
    reset: MeterResetKind
  ): Promise<MeterResetBaseline>
  close(streamId: number): Promise<void>
}

export interface MeterSession {
  readonly store: MeterStore
  readonly ready: Promise<void>
  refresh(): Promise<void>
  tick(now: number): void
  setVisible(visible: boolean): void
  reset(endpointIds: readonly string[], reset: MeterResetKind): Promise<MeterResetBaseline>
  readStatus: MeterPull["readStatus"]
  subscribeStatus: MeterPull["subscribeStatus"]
  recordPaint: MeterPull["recordPaint"]
  readFrameAge(): { ageMs: number; uncertaintyMs: number } | null
  dispose(): Promise<void>
}

export function createMeterSession(options: {
  port: MeterSessionPort
  leaseId: string
  sessionId: string
  now: () => number
  paint?: (snapshot: MeterSnapshot) => void
  onError: (error: unknown) => void
  onEvent: (event: RealtimeEvent) => void
}): MeterSession {
  const { port } = options
  const store = createMeterStore()
  let disposed = false
  let failed = false
  let streamId: number | null = null
  let sessionEpoch: number | null = null
  const cursor: { sequence: bigint | null } = { sequence: null }
  let visible = true
  let graphReady = true
  let earlyBatch: readonly RealtimeEvent[] | null = null
  let interestRevision = 0
  let interestKey = ""
  let pendingInterest: MeterInterest | null = null
  let sendingInterest: Promise<void> | null = null
  let refreshing: Promise<void> | null = null
  let eventWork = Promise.resolve()
  let closing: Promise<void> | null = null
  let clockMapping: MeterClockMapping | null = null
  let clockFlight: Promise<void> | null = null
  let nextClockProbe = 0
  let clockGeneration = 0
  function synchronizeClock(at: number) {
    if (
      !store.readLatest() ||
      streamId === null ||
      disposed ||
      failed ||
      !visible ||
      !graphReady ||
      clockFlight ||
      at < nextClockProbe
    )
      return
    const id = streamId
    const generation = clockGeneration
    nextClockProbe = at + 5000
    clockFlight = measureMeterClock({
      probe: () => port.clock(id),
      now: options.now,
      active: () => !disposed && !failed && visible && generation === clockGeneration,
    })
      .then(mapping => {
        if (!disposed && !failed && generation === clockGeneration) clockMapping = mapping
      })
      .catch(error => {
        if (generation === clockGeneration) fail(error)
      })
      .finally(() => {
        clockFlight = null
      })
  }

  const pull = createMeterPull({
    store,
    now: options.now,
    paint: options.paint,
    async snapshot(afterSeq) {
      if (streamId === null || disposed || failed) return new ArrayBuffer(0)
      if (sendingInterest) await sendingInterest
      if (pendingInterest || disposed || failed || !visible || !graphReady)
        return new ArrayBuffer(0)
      try {
        return await port.snapshot(streamId, afterSeq)
      } catch (error) {
        if (
          error !== "meter-registry-required" &&
          !(error instanceof Error && error.message === "meter-registry-required")
        )
          throw error
        await refresh()
        return new ArrayBuffer(0)
      }
    },
  })
  function fail(error: unknown) {
    if (disposed || failed) return
    failed = true
    try {
      store.markStale()
    } catch (notificationError) {
      error = new AggregateError(
        [error, notificationError],
        "Meter session and stale notification failed"
      )
    }
    pull.setVisible(false)
    pull.dispose()
    options.onError(error)
    if (streamId !== null) void close(streamId).catch(options.onError)
  }
  function close(id: number): Promise<void> {
    closing ??= port.close(id)
    return closing
  }
  function acceptRegistry(input: RealtimeRegistry) {
    const registry = meterRegistrySchema.parse(input)
    if (
      streamId === null ||
      registry.sessionId !== options.sessionId ||
      registry.sessionEpoch !== sessionEpoch
    )
      throw new Error("Meter registry belongs to another session")
    const previous = store.readMetadata().registry
    store.acceptRegistry(registry, streamId)
    graphReady = true
    pull.setVisible(visible)
    const accepted = store.readMetadata().registry
    if (
      accepted &&
      (!previous ||
        accepted.deviceEpoch !== previous.deviceEpoch ||
        accepted.generation !== previous.generation)
    ) {
      clockGeneration += 1
      clockMapping = null
      nextClockProbe = 0
    }
  }
  function refresh(): Promise<void> {
    if (disposed || failed || streamId === null) return Promise.resolve()
    const id = streamId
    refreshing ??= port
      .registry(id)
      .then(registry => {
        if (disposed || failed || id !== streamId) return
        if (registry) acceptRegistry(registry)
        else {
          graphReady = false
          pull.setVisible(false)
          clockGeneration += 1
          clockMapping = null
          store.markStale()
        }
      })
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }
  function drainInterest() {
    if (sendingInterest || !pendingInterest || disposed || failed) return
    const next = pendingInterest
    pendingInterest = null
    sendingInterest = port
      .interest(next)
      .then(() => {})
      .catch(fail)
      .finally(() => {
        sendingInterest = null
        drainInterest()
      })
  }
  function updateInterest() {
    if (disposed || failed || streamId === null) return
    const rateHz = pull.readStatus().rateHz
    const endpointIds = store.readMetadata().endpointIds
    const key = JSON.stringify([visible, rateHz, endpointIds])
    if (key === interestKey) return
    if (interestRevision === 0xffff_ffff) {
      fail(new Error("Meter interest revision exhausted"))
      return
    }
    interestKey = key
    pendingInterest = { streamId, revision: ++interestRevision, endpointIds, rateHz, visible }
    drainInterest()
  }
  function receive(batch: readonly RealtimeEvent[]) {
    if (disposed || failed) return
    if (batch.length === 0 || batch.length > 64) {
      fail(new Error("Invalid meter event batch size"))
      return
    }
    if (streamId === null) {
      if (earlyBatch) {
        fail(new Error("More than one meter event batch before admission"))
        return
      }
      earlyBatch = batch
      return
    }
    eventWork = eventWork
      .then(async () => {
        if (disposed || failed || streamId === null) return
        const id = streamId
        async function processEvent(index: number): Promise<void> {
          const event = batch[index]
          if (!event || disposed || failed) return
          if (
            event.streamId !== id ||
            event.sessionId !== options.sessionId ||
            event.sessionEpoch !== sessionEpoch
          )
            throw new Error("Meter event belongs to another stream")
          const sequence = BigInt(event.seq)
          const previous = cursor.sequence
          if (cursor.sequence !== null && sequence <= cursor.sequence)
            throw new Error("Meter event sequence regressed")
          cursor.sequence = sequence
          if (event.kind === "event-gap") {
            if (BigInt(event.toSeq) !== sequence || BigInt(event.fromSeq) > sequence)
              throw new Error("Invalid meter event gap")
            store.markStale()
            await refresh()
          } else if (previous !== null && sequence !== previous + 1n) {
            throw new Error("Meter event sequence gap without resynchronization")
          }
          if (event.kind === "registry") acceptRegistry(event.registry)
          if (event.kind === "meter-reset") await refresh()
          if (disposed || failed) return
          options.onEvent(event)
          await processEvent(index + 1)
        }
        await processEvent(0)
        if (!disposed && !failed) await port.receipt(id, batch[batch.length - 1].seq.toString())
      })
      .catch(fail)
  }
  const unsubscribeMetadata = store.subscribeMetadata(() => {
    updateInterest()
    if (store.readMetadata().registry && store.readMetadata().needsRegistry)
      void refresh().catch(fail)
  })
  const unsubscribeStatus = pull.subscribeStatus(() => {
    updateInterest()
    const status = pull.readStatus()
    if (status.state === "error") fail(status.error)
  })
  const ready = Promise.resolve()
    .then(() => port.open(options.leaseId, options.sessionId, receive, fail))
    .then(async opened => {
      streamId = opened.streamId
      if (disposed || failed) {
        await close(opened.streamId)
        return
      }
      if (
        !Number.isInteger(streamId) ||
        streamId < 1 ||
        streamId > 0xffff_ffff ||
        opened.registry.sessionId !== options.sessionId
      )
        throw new Error("Invalid meter stream admission")
      sessionEpoch = opened.registry.sessionEpoch
      store.bindStream(streamId, options.sessionId)
      acceptRegistry(opened.registry)
      pull.setVisible(visible)
      updateInterest()
      if (earlyBatch) {
        const batch = earlyBatch
        earlyBatch = null
        receive(batch)
      }
    })
    .catch(fail)

  return {
    store,
    ready,
    refresh,
    tick(now: number) {
      if (!disposed && !failed) pull.tick(now)
      synchronizeClock(now)
    },
    setVisible(next: boolean) {
      if (disposed || failed || visible === next) return
      visible = next
      clockGeneration += 1
      clockMapping = null
      nextClockProbe = 0
      pull.setVisible(next && graphReady)
      updateInterest()
    },
    async reset(endpointIds: readonly string[], reset: MeterResetKind) {
      await ready
      if (streamId === null || disposed || failed) throw new Error("Meter session is unavailable")
      const result = await port.reset(streamId, endpointIds, reset)
      await refresh()
      return result
    },
    readStatus: pull.readStatus,
    subscribeStatus: pull.subscribeStatus,
    recordPaint: pull.recordPaint,
    readFrameAge() {
      const snapshot = store.readLatest()
      if (
        !snapshot ||
        !clockMapping ||
        snapshot.frame.header.deviceEpoch !== clockMapping.deviceEpoch
      )
        return null
      return {
        ageMs:
          options.now() -
          nativeMilliseconds(snapshot.frame.header.producedMonotonicNs) -
          clockMapping.offsetMs,
        uncertaintyMs: clockMapping.uncertaintyMs,
      }
    },
    async dispose() {
      if (disposed) {
        await ready
        if (closing) await closing
        return
      }
      disposed = true
      unsubscribeMetadata()
      unsubscribeStatus()
      store.dispose()
      pull.dispose()
      earlyBatch = null
      pendingInterest = null
      await ready
      if (streamId !== null) await close(streamId)
    },
  }
}
