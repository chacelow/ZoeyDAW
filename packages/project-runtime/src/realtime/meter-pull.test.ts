import { expect, it, vi } from "vitest"
import {
  HEADER_BYTES,
  MAGIC,
  RECORD_BYTES,
  VERSION,
  writeHeader,
  writeRecord,
} from "@zoeydaw/project-core/realtime"
import { createMeterStore } from "./meter-store"
import { createMeterPull } from "./meter-pull"

function frame(seq: bigint) {
  const bytes = new ArrayBuffer(HEADER_BYTES + RECORD_BYTES)
  const view = new DataView(bytes)
  writeHeader(view, {
    magic: MAGIC,
    version: VERSION,
    headerBytes: HEADER_BYTES,
    generation: 1,
    registryRevision: 1,
    streamId: 1,
    slotCount: 1,
    seq,
    timeSamples: 0n,
    sampleRate: 48000,
    producedMonotonicNs: 0n,
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
    appliedSequence: 0n,
    ownerEpoch: 1n,
    bar: 1,
    barsPerSecond: 0.5,
    audibleBar: 0,
    audibleBarsPerSecond: 0,
    observedMonotonicNs: 0n,
    transportKind: 2,
    transportFlags: 1,
  })
  writeRecord(
    view,
    {
      slotId: 0,
      flags: 1,
      blockEndSample: 0n,
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
function harness() {
  const store = createMeterStore()
  store.bindStream(1, "session")
  store.acceptRegistry(
    {
      sessionId: "session",
      sessionEpoch: 1,
      deviceEpoch: 1,
      generation: 1,
      registryRevision: 1,
      resetEpoch: 0,
      entries: [
        {
          slotId: 0,
          endpointId: "master/main/out",
          kind: "master",
          ownerId: "main",
          channelIndex: 0,
          channelCount: 1,
          capabilities: ["peak"],
        },
      ],
      sources: [],
      endpointResets: [{ endpointId: "master/main/out", slotIds: [0], slotResetEpoch: 0 }],
    },
    1
  )
  let resolve: ((bytes: ArrayBuffer) => void) | null = null
  const snapshot = vi.fn(
    (_afterSeq: string) =>
      new Promise<ArrayBuffer>(done => {
        resolve = done
      })
  )
  const paint = vi.fn()
  let time = 0
  const pull = createMeterPull({ store, snapshot, paint, now: () => time })
  const tick = (at: number) => {
    time = at
    pull.tick(at)
  }
  return {
    store,
    pull,
    tick,
    snapshot,
    paint,
    resolve(bytes: ArrayBuffer) {
      if (!resolve) throw new Error("No pending pull")
      resolve(bytes)
    },
  }
}
async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}
it("keeps one request in flight and only adopts or paints on frame ticks", async () => {
  const h = harness()
  h.tick(0)
  await flush()
  for (let at = 10; at <= 100; at += 10) h.tick(at)
  expect(h.snapshot).toHaveBeenCalledTimes(1)
  h.resolve(frame(1n))
  await flush()
  expect(h.paint).not.toHaveBeenCalled()
  expect(h.store.readLatest()).toBeNull()
  expect(h.snapshot).toHaveBeenCalledTimes(1)
  h.tick(120)
  await flush()
  expect(h.paint).toHaveBeenCalledOnce()
  expect(h.store.readLatest()?.frame.header.seq).toBe(1n)
  expect(h.snapshot.mock.calls.map(call => call[0])).toEqual(["0", "1"])
})
it("discards pending and late responses after a long frame gap without catch-up", async () => {
  const h = harness()
  h.tick(0)
  await flush()
  h.resolve(frame(1n))
  await flush()
  h.tick(1200)
  await flush()
  expect(h.paint).not.toHaveBeenCalled()
  expect(h.snapshot).toHaveBeenCalledTimes(2)
  h.tick(2400)
  h.resolve(frame(2n))
  await flush()
  expect(h.paint).not.toHaveBeenCalled()
  h.tick(2420)
  await flush()
  expect(h.snapshot).toHaveBeenCalledTimes(3)
  h.resolve(frame(3n))
  await flush()
  h.tick(2440)
  expect(h.store.readLatest()?.frame.header.seq).toBe(3n)
})
it("marks stalled without concurrent replacement and waits for the old request to settle", async () => {
  const h = harness()
  h.tick(0)
  await flush()
  for (const at of [200, 400, 600, 800]) h.tick(at)
  expect(h.pull.readStatus().state).toBe("stalled")
  expect(h.snapshot).toHaveBeenCalledTimes(1)
  h.resolve(frame(1n))
  await flush()
  h.tick(820)
  await flush()
  expect(h.paint).not.toHaveBeenCalled()
  expect(h.snapshot).toHaveBeenCalledTimes(2)
  h.resolve(frame(2n))
  await flush()
  h.tick(840)
  expect(h.pull.readStatus().state).toBe("running")
})
it("hides without cancel claims and never adopts a pre-hide response", async () => {
  const h = harness()
  h.tick(0)
  await flush()
  h.pull.setVisible(false)
  h.tick(100)
  expect(h.pull.readStatus().state).toBe("hidden")
  h.pull.setVisible(true)
  h.tick(120)
  expect(h.snapshot).toHaveBeenCalledTimes(1)
  h.resolve(frame(1n))
  await flush()
  h.tick(140)
  await flush()
  expect(h.paint).not.toHaveBeenCalled()
  expect(h.snapshot).toHaveBeenCalledTimes(2)
  h.pull.dispose()
  h.resolve(frame(2n))
  await flush()
  h.tick(160)
  expect(h.paint).not.toHaveBeenCalled()
  expect(h.pull.readStatus().state).toBe("disposed")
})
it("caps a 120Hz frame source at 60 pulls per second", async () => {
  const h = harness()
  for (let index = 0; index < 120; index += 1) {
    h.tick((index * 1000) / 120)
    await flush()
    if (h.snapshot.mock.calls.length) {
      h.resolve(new ArrayBuffer(0))
      await flush()
    }
  }
  expect(h.snapshot.mock.calls.length).toBeGreaterThanOrEqual(59)
  expect(h.snapshot.mock.calls.length).toBeLessThanOrEqual(60)
})
it("does not start a queued request after disposal before its dispatch microtask", async () => {
  const h = harness()
  h.tick(0)
  h.pull.dispose()
  await flush()
  expect(h.snapshot).not.toHaveBeenCalled()
})

it("degrades after sustained expensive painting and recovers after five healthy seconds", async () => {
  const h = harness()
  let clock = 0
  let duration = 20
  let seq = 0n
  const snapshot = vi.fn(async () => frame(++seq))
  const pull = createMeterPull({
    store: h.store,
    snapshot,
    now: () => clock,
    paint: () => {
      clock += duration
    },
  })
  for (let index = 0; index < 120; index += 1) {
    clock = index * 20
    pull.tick(clock)
    await flush()
  }
  expect(pull.readStatus().rateHz).toBe(30)
  duration = 1
  for (let index = 120; index < 560; index += 1) {
    clock = index * 20
    pull.tick(clock)
    await flush()
  }
  expect(pull.readStatus().rateHz).toBe(60)
  expect(pull.readStatus().state).toBe("running")
})

it("marks the shared displayed snapshot stale while preserving its sequence fence", async () => {
  const h = harness()
  h.tick(0)
  await flush()
  h.resolve(frame(1n))
  await flush()
  h.tick(20)
  await flush()
  expect(h.store.readLatest()?.stale).toBe(false)
  h.pull.setVisible(false)
  expect(h.store.readLatest()?.stale).toBe(true)
  expect(h.store.readLatest()?.frame.header.seq).toBe(1n)
  h.resolve(frame(2n))
  await flush()
  h.pull.setVisible(true)
  h.tick(40)
  await flush()
  expect(h.snapshot.mock.calls.at(-1)?.[0]).toBe("0")
  h.resolve(frame(3n))
  await flush()
  h.tick(60)
  expect(h.store.readLatest()?.stale).toBe(false)
  expect(h.store.readLatest()?.frame.header.seq).toBe(3n)
})

it("drops an in-flight frame after a reset baseline and requests the current baseline again", async () => {
  const h = harness()
  h.tick(0)
  await flush()
  h.resolve(frame(1n))
  await flush()
  h.tick(20)
  await flush()
  const previous = h.store.readMetadata().registry
  if (!previous) throw new Error("Missing registry fixture")
  h.store.acceptRegistry(
    {
      ...previous,
      resetEpoch: 1,
      endpointResets: [{ endpointId: "master/main/out", slotIds: [0], slotResetEpoch: 1 }],
    },
    1
  )
  h.resolve(frame(2n))
  await flush()
  h.tick(40)
  await flush()
  expect(h.paint).toHaveBeenCalledTimes(1)
  expect(h.snapshot.mock.calls.at(-1)?.[0]).toBe("0")
  expect(h.store.readLatest()?.records.has(0)).toBe(false)
  expect(h.store.readLatest()?.stale).toBe(false)
})

it("contains consumer errors raised by store frame notifications", async () => {
  const h = harness()
  h.store.subscribeFrames(() => {
    throw new Error("Meter painter failed")
  })
  h.tick(0)
  await flush()
  h.resolve(frame(1n))
  await flush()
  expect(() => h.tick(20)).not.toThrow()
  expect(h.pull.readStatus().state).toBe("error")
  expect(h.store.readLatest()?.stale).toBe(true)
  h.pull.dispose()
  h.store.dispose()
})

it("discards an old subscription response without issuing a concurrent request", async () => {
  const h = harness()
  h.store.setInterest("panel", { endpointIds: ["master/main/out"], transport: false })
  h.tick(0)
  await flush()
  h.store.setInterest("panel", { endpointIds: [], transport: false })
  h.tick(20)
  expect(h.snapshot).toHaveBeenCalledOnce()
  h.resolve(frame(1n))
  await flush()
  h.tick(40)
  await flush()
  expect(h.paint).not.toHaveBeenCalled()
  expect(h.store.readLatest()).toBeNull()
  expect(h.snapshot).toHaveBeenCalledTimes(2)
  expect(h.snapshot.mock.lastCall?.[0]).toBe("0")
  h.pull.dispose()
  h.store.dispose()
})

it("degrades from accumulated consumer painting without an inline paint callback", async () => {
  const h = harness()
  h.snapshot.mockResolvedValue(new ArrayBuffer(0))
  for (let index = 0; index < 120; index++) {
    h.pull.recordPaint(10)
    h.pull.recordPaint(10)
    h.tick(index * 20)
    await flush()
  }
  expect(h.pull.readStatus().rateHz).toBe(30)
  for (let index = 120; index < 560; index++) {
    h.pull.recordPaint(1)
    h.tick(index * 20)
    await flush()
  }
  expect(h.pull.readStatus().rateHz).toBe(60)
  h.pull.dispose()
  h.store.dispose()
})
