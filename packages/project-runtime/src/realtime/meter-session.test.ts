import { expect, it, vi } from "vitest"
import {
  HEADER_BYTES,
  MAGIC,
  RECORD_BYTES,
  VERSION,
  writeHeader,
  writeRecord,
  jsonU64,
  type MeterInterest,
  type MeterResetBaseline,
  type MeterResetKind,
  type RealtimeEvent,
  type RealtimeRegistry,
  type RealtimeStreamOpenResult,
  type ClockProbe,
} from "@zoeydaw/project-core/realtime"
import { createMeterSession, type MeterSessionPort } from "./meter-session"

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function registry(revision = 1): RealtimeRegistry {
  return {
    sessionId: "session",
    sessionEpoch: 1,
    deviceEpoch: 1,
    generation: revision,
    registryRevision: revision,
    resetEpoch: 0,
    entries: [
      {
        slotId: 0,
        endpointId: "track/a/out",
        kind: "track-out",
        ownerId: "a",
        channelIndex: 0,
        channelCount: 1,
        capabilities: ["peak"],
      },
    ],
    sources: [],
    endpointResets: [{ endpointId: "track/a/out", slotIds: [0], slotResetEpoch: 0 }],
  }
}

function frame(seq: bigint, generation = 1) {
  const bytes = new ArrayBuffer(HEADER_BYTES + RECORD_BYTES)
  const view = new DataView(bytes)
  writeHeader(view, {
    magic: MAGIC,
    version: VERSION,
    headerBytes: HEADER_BYTES,
    generation,
    registryRevision: generation,
    streamId: 7,
    slotCount: 1,
    seq,
    timeSamples: seq * 256n,
    sampleRate: 48000,
    producedMonotonicNs: seq * 100n,
    controlGeneration: 0n,
    acceptedRevision: 0n,
    audioRevision: 0n,
    subscriptionRevision: 1,
    flags: 0,
    timelineSample: 0n,
    timelineBeat: 0,
    tempoBpm: 120,
    deviceEpoch: 1,
    sourceCount: 0,
    resetEpoch: 0,
    frameType: 1,
  })
  writeRecord(
    view,
    {
      slotId: 0,
      flags: 1,
      blockEndSample: seq * 256n,
      peak: 0.25,
      rms: 0.25,
      hold: 0.25,
      sessionPeak: 0.25,
      clipCount: 0n,
      validFrames: 14400,
      slotResetEpoch: 0,
    },
    HEADER_BYTES
  )
  return bytes
}

async function flush() {
  for (let index = 0; index < 16; index += 1) await Promise.resolve()
}

function harness() {
  const admission = deferred<RealtimeStreamOpenResult>()
  const snapshots: { afterSeq: string; response: Deferred<ArrayBuffer> }[] = []
  const registries: Deferred<RealtimeRegistry | null>[] = []
  let receive: ((batch: readonly RealtimeEvent[]) => void) | undefined
  let reportError: ((error: unknown) => void) | undefined
  const open = vi.fn(
    (
      _leaseId: string,
      _sessionId: string,
      events: (batch: readonly RealtimeEvent[]) => void,
      onError: (error: unknown) => void
    ) => {
      receive = events
      reportError = onError
      return admission.promise
    }
  )
  const interest = vi.fn(async (_request: MeterInterest) => {})
  const snapshot = vi.fn((_streamId: number, afterSeq: string) => {
    const response = deferred<ArrayBuffer>()
    snapshots.push({ afterSeq, response })
    return response.promise
  })
  const fetchRegistry = vi.fn((_streamId: number) => {
    const response = deferred<RealtimeRegistry | null>()
    registries.push(response)
    return response.promise
  })
  const receipt = vi.fn(async (_streamId: number, _throughSeq: string) => {})
  const close = vi.fn(async (_streamId: number) => {})
  const port = {
    open,
    interest,
    snapshot,
    registry: fetchRegistry,
    receipt,
    close,
    clock: vi.fn(async () => ({
      monotonicNs: jsonU64(0n),
      deviceEpoch: 1,
      timeSamples: jsonU64(0n),
      sampleRate: 48000,
    })),
    reset: vi.fn(
      async (
        _streamId: number,
        _endpointIds: readonly string[],
        _reset: MeterResetKind
      ): Promise<MeterResetBaseline> => ({ resetEpoch: 0, affected: [] })
    ),
  } satisfies MeterSessionPort
  const paint = vi.fn()
  const onError = vi.fn()
  const onEvent = vi.fn()
  let clock = 0
  const session = createMeterSession({
    port,
    leaseId: "lease",
    sessionId: "session",
    now: () => clock,
    paint,
    onError,
    onEvent,
  })
  return {
    session,
    admission,
    open,
    interest,
    snapshot,
    snapshots,
    registries,
    fetchRegistry,
    receipt,
    close,
    probeClock: port.clock,
    paint,
    onError,
    onEvent,
    fail(error: unknown) {
      reportError?.(error)
    },
    emit(batch: readonly RealtimeEvent[]) {
      if (!receive) throw new Error("Stream has not opened")
      receive(batch)
    },
    async admit(initial = registry()) {
      await flush()
      admission.resolve({ streamId: 7, registry: initial })
      await session.ready
      await flush()
    },
    tick(at: number) {
      clock = at
      session.tick(at)
    },
  }
}

it("closes an admission arriving after disposal exactly once without polling or painting", async () => {
  const h = harness()
  const disposing = h.session.dispose()
  await flush()
  h.admission.resolve({ streamId: 7, registry: registry() })
  await disposing
  await h.session.dispose()
  h.tick(0)
  await flush()
  expect(h.close).toHaveBeenCalledTimes(1)
  expect(h.close).toHaveBeenCalledWith(7)
  expect(h.interest).not.toHaveBeenCalled()
  expect(h.snapshot).not.toHaveBeenCalled()
  expect(h.paint).not.toHaveBeenCalled()
  expect(h.onError).not.toHaveBeenCalled()
})

it("applies an early registry batch before acknowledging it after admission", async () => {
  const h = harness()
  await flush()
  const changed = registry(2)
  const event: RealtimeEvent = {
    sessionId: "session",
    sessionEpoch: 1,
    streamId: 7,
    deviceEpoch: 1,
    generation: 2,
    registryRevision: 2,
    seq: jsonU64(1n),
    kind: "registry",
    registry: changed,
  }
  h.emit([event])
  expect(h.receipt).not.toHaveBeenCalled()
  await h.admit()
  expect(h.session.store.readMetadata().registry?.registryRevision).toBe(2)
  expect(h.onEvent).toHaveBeenCalledWith(event)
  expect(h.receipt).toHaveBeenCalledOnce()
  expect(h.receipt).toHaveBeenCalledWith(7, "1")
  expect(h.onError).not.toHaveBeenCalled()
  await h.session.dispose()
})

it("keeps overlapping ticks to one in-flight snapshot and paints only on ticks", async () => {
  const h = harness()
  await h.admit()
  h.tick(0)
  await flush()
  for (const at of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) h.tick(at)
  expect(h.snapshot).toHaveBeenCalledTimes(1)
  h.snapshots[0]?.response.resolve(frame(1n))
  await flush()
  expect(h.paint).not.toHaveBeenCalled()
  expect(h.session.store.readLatest()).toBeNull()
  h.tick(120)
  await flush()
  expect(h.paint).toHaveBeenCalledOnce()
  expect(h.session.store.readLatest()?.frame.header.seq).toBe(1n)
  expect(h.snapshots.map(request => request.afterSeq)).toEqual(["0", "1"])
  h.tick(140)
  expect(h.snapshot).toHaveBeenCalledTimes(2)
  h.snapshots[1]?.response.resolve(frame(2n))
  await flush()
  expect(h.paint).toHaveBeenCalledTimes(1)
  h.tick(160)
  expect(h.paint).toHaveBeenCalledTimes(2)
  expect(h.session.store.readLatest()?.frame.header.seq).toBe(2n)
  await h.session.dispose()
})

it("discards the pre-hide response and sends the latest union of interests on resume", async () => {
  const h = harness()
  await h.admit()
  h.tick(0)
  await flush()
  expect(h.snapshot).toHaveBeenCalledTimes(1)
  h.session.setVisible(false)
  h.session.store.setInterest("mixer", ["track/b/out"])
  h.session.store.setInterest("dock", ["track/a/out", "track/b/out"])
  h.session.setVisible(true)
  await flush()
  expect(h.interest.mock.lastCall?.[0]).toMatchObject({
    streamId: 7,
    visible: true,
    endpointIds: ["track/a/out", "track/b/out"],
  })
  h.snapshots[0]?.response.resolve(frame(1n))
  await flush()
  h.tick(20)
  await flush()
  expect(h.paint).not.toHaveBeenCalled()
  expect(h.session.store.readLatest()).toBeNull()
  expect(h.snapshots.map(request => request.afterSeq)).toEqual(["0", "0"])
  h.snapshots[1]?.response.resolve(frame(2n))
  await flush()
  h.tick(40)
  expect(h.paint).toHaveBeenCalledOnce()
  expect(h.session.store.readLatest()?.frame.header.seq).toBe(2n)
  await h.session.dispose()
})

it("refreshes an explicit event gap before delivering and receipting the batch", async () => {
  const h = harness()
  await h.admit()
  h.tick(0)
  await flush()
  h.snapshots[0]?.response.resolve(frame(1n))
  await flush()
  h.tick(20)
  expect(h.session.store.readLatest()?.stale).toBe(false)
  const gap: RealtimeEvent = {
    sessionId: "session",
    sessionEpoch: 1,
    streamId: 7,
    deviceEpoch: 1,
    generation: 1,
    registryRevision: 1,
    seq: jsonU64(5n),
    kind: "event-gap",
    fromSeq: jsonU64(2n),
    toSeq: jsonU64(5n),
    counters: {
      xruns: jsonU64(0n),
      recordingOverruns: jsonU64(0n),
      noteOverruns: jsonU64(0n),
      automationOverruns: jsonU64(0n),
      pluginFaults: jsonU64(0n),
      droppedEvents: jsonU64(3n),
    },
    latchedFaults: [],
  }
  h.emit([gap])
  await flush()
  expect(h.session.store.readLatest()?.stale).toBe(true)
  expect(h.fetchRegistry).toHaveBeenCalledOnce()
  expect(h.fetchRegistry).toHaveBeenCalledWith(7)
  expect(h.onEvent).not.toHaveBeenCalled()
  expect(h.receipt).not.toHaveBeenCalled()
  h.registries[0]?.resolve(registry())
  await flush()
  expect(h.onEvent).toHaveBeenCalledWith(gap)
  expect(h.receipt).toHaveBeenCalledOnce()
  expect(h.receipt).toHaveBeenCalledWith(7, "5")
  expect(h.onError).not.toHaveBeenCalled()
  await h.session.dispose()
})

it("clears needsRegistry when a refresh returns the same registry", async () => {
  const h = harness()
  await h.admit()
  h.tick(0)
  await flush()
  h.snapshots[0]?.response.resolve(frame(1n, 2))
  await flush()
  h.tick(20)
  await flush()
  expect(h.session.store.readMetadata().needsRegistry).toBe(true)
  expect(h.fetchRegistry).toHaveBeenCalledOnce()
  expect(h.fetchRegistry).toHaveBeenCalledWith(7)
  h.registries[0]?.resolve(registry())
  await flush()
  expect(h.session.store.readMetadata().needsRegistry).toBe(false)
  expect(h.onError).not.toHaveBeenCalled()
  await h.session.dispose()
})

it("does not issue a snapshot after disposal while an interest update is pending", async () => {
  const h = harness()
  const interest = deferred<undefined>()
  h.interest.mockReturnValueOnce(interest.promise)
  await h.admit()
  h.tick(0)
  await flush()
  await h.session.dispose()
  interest.resolve(undefined)
  await flush()
  expect(h.snapshot).not.toHaveBeenCalled()
  expect(h.close).toHaveBeenCalledOnce()
})

it("does not deliver or acknowledge an event after disposal during gap refresh", async () => {
  const h = harness()
  await h.admit()
  h.emit([
    {
      sessionId: "session",
      sessionEpoch: 1,
      streamId: 7,
      deviceEpoch: 1,
      generation: 1,
      registryRevision: 1,
      seq: jsonU64(5n),
      kind: "event-gap",
      fromSeq: jsonU64(1n),
      toSeq: jsonU64(5n),
      counters: {
        xruns: jsonU64(0n),
        recordingOverruns: jsonU64(0n),
        noteOverruns: jsonU64(0n),
        automationOverruns: jsonU64(0n),
        pluginFaults: jsonU64(0n),
        droppedEvents: jsonU64(5n),
      },
      latchedFaults: [],
    },
  ])
  await flush()
  await h.session.dispose()
  h.registries[0]?.resolve(registry())
  await flush()
  expect(h.onEvent).not.toHaveBeenCalled()
  expect(h.receipt).not.toHaveBeenCalled()
  expect(h.onError).not.toHaveBeenCalled()
})

it("calibrates age only after a frame and restarts calibration after visibility changes", async () => {
  const h = harness()
  await h.admit()
  expect(h.session.readFrameAge()).toBeNull()
  h.tick(0)
  await flush()
  expect(h.probeClock).not.toHaveBeenCalled()
  h.snapshots[0]?.response.resolve(frame(1n))
  await flush()
  h.tick(20)
  await flush()
  expect(h.probeClock).toHaveBeenCalledTimes(5)
  expect(h.session.readFrameAge()?.uncertaintyMs).toBe(0)
  expect(h.session.readFrameAge()?.ageMs).toBeCloseTo(-0.0001)
  h.session.setVisible(false)
  expect(h.session.readFrameAge()).toBeNull()
  h.session.setVisible(true)
  h.tick(40)
  await flush()
  expect(h.probeClock).toHaveBeenCalledTimes(10)
  await h.session.dispose()
})

it("ignores a clock response from the previous visible generation", async () => {
  const h = harness()
  await h.admit()
  h.tick(0)
  await flush()
  h.snapshots[0]?.response.resolve(frame(1n))
  await flush()
  const clock = deferred<ClockProbe>()
  h.probeClock.mockReturnValueOnce(clock.promise)
  h.tick(20)
  await flush()
  h.session.setVisible(false)
  h.session.setVisible(true)
  clock.resolve({
    monotonicNs: jsonU64(0n),
    deviceEpoch: 1,
    timeSamples: jsonU64(0n),
    sampleRate: 48000,
  })
  await flush()
  expect(h.session.readFrameAge()).toBeNull()
  expect(h.probeClock).toHaveBeenCalledOnce()
  h.tick(40)
  await flush()
  expect(h.probeClock).toHaveBeenCalledTimes(6)
  await h.session.dispose()
})

it("closes the stream even when a stale-frame subscriber fails during channel failure", async () => {
  const h = harness()
  await h.admit()
  h.tick(0)
  await flush()
  h.snapshots[0]?.response.resolve(frame(1n))
  await flush()
  h.tick(20)
  await flush()
  h.session.store.subscribeFrames(() => {
    throw new Error("Failed stale painter")
  })
  expect(() => h.fail(new Error("Invalid event"))).not.toThrow()
  expect(h.onError).toHaveBeenCalledOnce()
  expect(h.close).toHaveBeenCalledOnce()
  await h.session.dispose()
})

it("retires the native stream when a stale painter throws during disposal", async () => {
  const h = harness()
  await h.admit()
  h.tick(0)
  await flush()
  h.snapshots[0]?.response.resolve(frame(1n))
  await flush()
  h.tick(20)
  await flush()
  h.session.store.subscribeFrames(() => {
    throw new Error("Failed unmount painter")
  })
  await expect(h.session.dispose()).resolves.toBeUndefined()
  expect(h.close).toHaveBeenCalledOnce()
  expect(h.session.store.readLatest()).toBeNull()
})

it("keeps the stream open when an obsolete clock probe fails across a graph refresh", async () => {
  const h = harness()
  await h.admit()
  h.tick(0)
  await flush()
  h.snapshots[0]?.response.resolve(frame(1n))
  await flush()
  let rejectClock: (error: unknown) => void = () => {}
  h.probeClock.mockReturnValueOnce(
    new Promise<ClockProbe>((_resolve, reject) => {
      rejectClock = reject
    })
  )
  h.tick(20)
  await flush()
  const refreshing = h.session.refresh()
  h.registries[0]?.resolve(registry(2))
  await refreshing
  rejectClock(new Error("Meter Hub changed during stream admission"))
  await flush()
  expect(h.close).not.toHaveBeenCalled()
  expect(h.onError).not.toHaveBeenCalled()
  expect(h.session.readFrameAge()).toBeNull()
  h.snapshots[1]?.response.resolve(frame(2n, 2))
  await flush()
  h.tick(40)
  await flush()
  h.snapshots[2]?.response.resolve(frame(3n, 2))
  await flush()
  h.tick(60)
  await flush()
  expect(h.session.store.readLatest()?.registry.generation).toBe(2)
  expect(h.probeClock).toHaveBeenCalledTimes(6)
  await h.session.dispose()
})

it("pauses an unprepared graph and resumes the same stream without replaying an old frame", async () => {
  const h = harness()
  await h.admit()
  h.tick(0)
  await flush()
  h.snapshots[0]?.response.resolve(frame(1n))
  await flush()
  h.tick(20)
  await flush()
  const paused = h.session.refresh()
  h.registries[0]?.resolve(null)
  await paused
  expect(h.session.store.readLatest()?.stale).toBe(true)
  expect(h.session.readFrameAge()).toBeNull()
  h.snapshots[1]?.response.resolve(frame(2n))
  await flush()
  h.tick(40)
  await flush()
  expect(h.snapshot).toHaveBeenCalledTimes(2)
  expect(h.paint).toHaveBeenCalledOnce()
  const resumed = h.session.refresh()
  h.registries[1]?.resolve(registry(2))
  await resumed
  h.tick(60)
  await flush()
  h.snapshots[2]?.response.resolve(frame(3n, 2))
  await flush()
  h.tick(80)
  await flush()
  expect(h.session.store.readLatest()?.frame.header.seq).toBe(3n)
  expect(h.paint).toHaveBeenCalledTimes(2)
  expect(h.open).toHaveBeenCalledOnce()
  expect(h.close).not.toHaveBeenCalled()
  expect(h.onError).not.toHaveBeenCalled()
  await h.session.dispose()
})
