import { expect, it, vi } from "vitest"
import {
  HEADER_BYTES,
  RECORD_BYTES,
  MAGIC,
  VERSION,
  writeHeader,
  writeRecord,
  SOURCE_BYTES,
  SOURCE_FLAGS_UNAVAILABLE,
  writeSource,
  type RealtimeRegistry,
} from "@zoeydaw/project-core/realtime"
import { createMeterStore } from "./meter-store"

function registry(): RealtimeRegistry {
  return {
    sessionId: "one",
    sessionEpoch: 1,
    deviceEpoch: 1,
    generation: 1,
    registryRevision: 1,
    resetEpoch: 1,
    entries: ["a", "b"].map((id, slotId) => ({
      slotId,
      endpointId: `track/${id}/out`,
      kind: "track-out",
      ownerId: id,
      channelIndex: 0,
      channelCount: 1,
      capabilities: ["peak", "rms", "hold", "clip"],
    })),
    sources: [],
    endpointResets: ["a", "b"].map((id, slot) => ({
      endpointId: `track/${id}/out`,
      slotIds: [slot],
      slotResetEpoch: 1,
    })),
  }
}
function frame(seq: bigint, epochs = [1, 1], resetEpoch = 1, generation = 1, streamId = 7) {
  const bytes = new ArrayBuffer(HEADER_BYTES + 2 * RECORD_BYTES)
  const view = new DataView(bytes)
  writeHeader(view, {
    magic: MAGIC,
    version: VERSION,
    headerBytes: HEADER_BYTES,
    generation,
    registryRevision: 1,
    streamId,
    slotCount: 2,
    seq,
    timeSamples: seq * 256n,
    sampleRate: 48000,
    producedMonotonicNs: seq * 100n,
    controlGeneration: 0n,
    acceptedRevision: 1n,
    audioRevision: 1n,
    subscriptionRevision: 1,
    flags: 1,
    timelineSample: 0n,
    timelineBeat: 0,
    tempoBpm: 120,
    deviceEpoch: 1,
    sourceCount: 0,
    resetEpoch,
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
  for (let slotId = 0; slotId < 2; slotId += 1)
    writeRecord(
      view,
      {
        slotId,
        flags: 1,
        blockEndSample: seq * 256n,
        peak: Number(seq) / 100,
        rms: 0.25,
        hold: 0.5,
        sessionPeak: 1,
        clipCount: 3n,
        validFrames: 14400,
        slotResetEpoch: epochs[slotId] ?? 1,
      },
      HEADER_BYTES + slotId * RECORD_BYTES
    )
  return bytes
}
it("adopts newer values within one graph without notifying React metadata consumers", () => {
  const store = createMeterStore()
  store.bindStream(7, "one")
  store.acceptRegistry(registry(), 7)
  const listener = vi.fn()
  store.subscribeMetadata(listener)
  const frames = vi.fn()
  const detach = store.subscribeFrames(frames)
  expect(store.acceptFrame(frame(1n))).toBe(true)
  expect(store.acceptFrame(frame(2n))).toBe(true)
  expect(store.readLatest()?.records.get(0)?.peak).toBeCloseTo(0.02)
  expect(store.acceptFrame(frame(1n))).toBe(false)
  expect(store.acceptFrame(frame(3n).slice(0, -1))).toBe(false)
  expect(store.readLatest()?.frame.header.seq).toBe(2n)
  expect(listener).not.toHaveBeenCalled()
  expect(frames).toHaveBeenCalledTimes(2)
  store.markStale()
  expect(frames).toHaveBeenCalledTimes(3)
  detach()
  store.acceptFrame(frame(3n))
  expect(frames).toHaveBeenCalledTimes(3)
})

it("accepts a newer subscription at the same sample sequence and rejects delayed older interests", () => {
  const store = createMeterStore()
  store.bindStream(7, "one")
  store.acceptRegistry(registry(), 7)
  expect(store.acceptFrame(frame(1n))).toBe(true)
  const changed = frame(1n)
  const view = new DataView(changed)
  view.setUint32(80, 2, true)
  view.setUint32(84, 5, true)
  view.setFloat32(HEADER_BYTES + 16, 0.5, true)
  expect(store.acceptFrame(changed)).toBe(true)
  expect(store.readLatest()?.records.get(0)?.peak).toBe(0.5)
  expect(store.acceptFrame(changed)).toBe(false)
  expect(store.acceptFrame(frame(2n))).toBe(false)
  const unmarked = frame(1n)
  new DataView(unmarked).setUint32(80, 3, true)
  expect(store.acceptFrame(unmarked)).toBe(false)
})
it("reset(A) immediately hides A while keeping B and rejects stale reset baselines", () => {
  const store = createMeterStore()
  store.bindStream(7, "one")
  store.acceptRegistry(registry(), 7)
  store.acceptFrame(frame(1n))
  const next = registry()
  next.resetEpoch = 2
  const reset = next.endpointResets[0]
  if (!reset) throw new Error("Missing endpoint fixture")
  reset.slotResetEpoch = 2
  store.acceptRegistry(next, 7)
  expect(store.readLatest()?.records.has(0)).toBe(false)
  expect(store.readLatest()?.records.get(1)?.hold).toBe(0.5)
  expect(store.acceptFrame(frame(2n))).toBe(true)
  expect(store.readLatest()?.staleSlots.has(0)).toBe(true)
  expect(store.readLatest()?.records.get(1)?.clipCount).toBe(3n)
  store.acceptRegistry(registry(), 7)
  expect(store.readMetadata().registry?.resetEpoch).toBe(2)
  expect(store.acceptFrame(frame(3n, [2, 1], 2))).toBe(true)
  expect(store.readLatest()?.records.get(0)?.slotResetEpoch).toBe(2)
})
it("fences slot reuse, unknown topology, old streams and old sessions", () => {
  const store = createMeterStore()
  store.bindStream(7, "one")
  store.acceptRegistry(registry(), 7)
  store.acceptFrame(frame(1n))
  expect(store.acceptFrame(frame(2n, [1, 1], 1, 2))).toBe(false)
  expect(store.readMetadata().needsRegistry).toBe(true)
  const next = registry()
  next.generation = 2
  const entry = next.entries[0]
  if (!entry) throw new Error("Missing slot fixture")
  entry.ownerId = "replacement"
  store.acceptRegistry(next, 7)
  expect(store.readLatest()).toBeNull()
  expect(store.acceptFrame(frame(3n))).toBe(false)
  expect(store.acceptFrame(frame(4n, [1, 1], 1, 2))).toBe(true)
  store.bindStream(8, "one")
  expect(store.readLatest()).toBeNull()
  expect(store.acceptFrame(frame(5n, [1, 1], 1, 2, 7))).toBe(false)
  store.acceptRegistry(registry(), 7)
  expect(store.readMetadata().registry).toBeNull()
  const foreign = registry()
  foreign.sessionId = "foreign"
  store.acceptRegistry(foreign, 8)
  expect(store.readMetadata().registry).toBeNull()
  store.acceptRegistry(registry(), 8)
  expect(store.readMetadata().registry?.sessionId).toBe("one")
})
it("unifies interests and prevents stale component cleanup from removing its replacement", () => {
  const store = createMeterStore()
  const old = store.setInterest("dock", { endpointIds: ["track/a/out"], transport: false })
  const replacement = store.setInterest("dock", { endpointIds: ["track/b/out"], transport: false })
  const mixer = store.setInterest("mixer", {
    endpointIds: ["track/b/out", "track/a/out"],
    transport: false,
  })
  old()
  expect(store.readMetadata().endpointIds).toEqual(["track/a/out", "track/b/out"])
  mixer()
  expect(store.readMetadata().endpointIds).toEqual(["track/b/out"])
  replacement()
  expect(store.readMetadata().endpointIds).toEqual([])
  store.dispose()
  expect(store.acceptFrame(frame(1n))).toBe(false)
  expect(store.readLatest()).toBeNull()
})

it("rejects remapping a live slot without a new registry revision", () => {
  const store = createMeterStore()
  store.bindStream(7, "one")
  store.acceptRegistry(registry(), 7)
  store.acceptFrame(frame(1n))
  const changed = registry()
  const entry = changed.entries[0]
  if (!entry) throw new Error("Missing slot fixture")
  entry.ownerId = "replacement"
  expect(() => store.acceptRegistry(changed, 7)).toThrow("registry revision")
  expect(store.readLatest()?.registry.entries[0]?.ownerId).toBe("a")
})

it("marks an unknown source unavailable without losing legal meter records", () => {
  const store = createMeterStore()
  store.bindStream(7, "one")
  const baseline = registry()
  baseline.sources = [
    {
      clipHandle: 1,
      clipId: "clip",
      sourceHandle: 2,
      sourceId: "source",
      sourceGeneration: 3,
      sourceRate: 44100,
      owner: "arrangement",
    },
  ]
  store.acceptRegistry(baseline, 7)
  const original = frame(1n)
  const bytes = new ArrayBuffer(original.byteLength + SOURCE_BYTES)
  new Uint8Array(bytes).set(new Uint8Array(original))
  const view = new DataView(bytes)
  view.setUint32(116, 1, true)
  writeSource(
    view,
    {
      clipHandle: 1,
      sourceHandle: 2,
      sourceFrame: 400,
      sourceRate: 44100,
      observedDeviceSample: 512n,
      sourceGeneration: 2,
      flags: 1,
      positionAgeSamples: 0,
      reserved: 0,
    },
    original.byteLength
  )
  expect(store.acceptFrame(bytes)).toBe(true)
  expect(store.readLatest()?.records.get(0)?.clipCount).toBe(3n)
  expect(store.readLatest()?.sources[0]?.flags).toBe(SOURCE_FLAGS_UNAVAILABLE)
  view.setBigUint64(24, 2n, true)
  view.setUint32(original.byteLength + 32, 3, true)
  expect(store.acceptFrame(bytes)).toBe(true)
  expect(store.readLatest()?.sources[0]?.flags).toBe(1)
})

it("notifies healthy painters after another frame subscriber fails", () => {
  const store = createMeterStore()
  store.bindStream(7, "one")
  store.acceptRegistry(registry(), 7)
  store.subscribeFrames(() => {
    throw new Error("Failed painter")
  })
  const healthy = vi.fn()
  store.subscribeFrames(healthy)
  expect(() => store.acceptFrame(frame(1n))).toThrow(AggregateError)
  expect(healthy).toHaveBeenCalledOnce()
  expect(() => store.markStale()).toThrow(AggregateError)
  expect(healthy).toHaveBeenCalledTimes(2)
  expect(store.readLatest()?.stale).toBe(true)
  store.dispose()
})
