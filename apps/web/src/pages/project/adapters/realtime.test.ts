import { afterEach, describe, expect, it, vi } from "vitest"
import {
  HEADER_BYTES,
  MAGIC,
  RECORD_BYTES,
  RECORD_FLAGS_STALE,
  RECORD_FLAGS_UNAVAILABLE,
  RECORD_FLAGS_VALID,
  VERSION,
  writeHeader,
  writeRecord,
  type RealtimeRegistry,
} from "@zoeydaw/project-core/realtime"
import {
  createMeterStore,
  type MeterSession,
  type MeterStore,
} from "@zoeydaw/project-runtime/realtime"
import {
  publishProjectMeters,
  readProjectMeterLevels,
  setProjectMeterInterest,
  watchProjectMeter,
  configureBackendMeterReader,
  synchronizeBackendMeters,
} from "./realtime"

const silent = [-Infinity, -Infinity]
const db = (peak: number) => 20 * Math.log10(peak)

function registry(entries: RealtimeRegistry["entries"], revision = 1): RealtimeRegistry {
  return {
    sessionId: "adapter-test",
    sessionEpoch: 1,
    deviceEpoch: 1,
    generation: 1,
    registryRevision: revision,
    resetEpoch: 1,
    entries,
    sources: [],
    endpointResets: [...new Set(entries.map(entry => entry.endpointId))].map(endpointId => ({
      endpointId,
      slotIds: entries.filter(entry => entry.endpointId === endpointId).map(entry => entry.slotId),
      slotResetEpoch: 1,
    })),
  }
}

function entry(
  slotId: number,
  endpointId: string,
  kind: "input" | "track-out" | "device-in" | "device-out",
  ownerId: string,
  channelIndex: number
): RealtimeRegistry["entries"][number] {
  return {
    slotId,
    endpointId,
    kind,
    ownerId,
    channelIndex: kind === "input" ? 0 : channelIndex,
    channelCount: kind === "input" ? 1 : 2,
    capabilities: ["peak", "rms", "hold", "clip"],
  }
}

function frame(
  records: readonly { slotId: number; peak: number; flags?: number }[],
  revision = 1,
  seq = 1n
): ArrayBuffer {
  const bytes = new ArrayBuffer(HEADER_BYTES + records.length * RECORD_BYTES)
  const view = new DataView(bytes)
  writeHeader(view, {
    magic: MAGIC,
    version: VERSION,
    headerBytes: HEADER_BYTES,
    generation: 1,
    registryRevision: revision,
    streamId: 7,
    slotCount: records.length,
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
    resetEpoch: 1,
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
  records.forEach(({ slotId, peak, flags = RECORD_FLAGS_VALID }, index) => {
    writeRecord(
      view,
      {
        slotId,
        flags,
        blockEndSample: seq * 256n,
        peak,
        rms: peak,
        hold: peak,
        sessionPeak: peak,
        clipCount: 0n,
        validFrames: 256,
        slotResetEpoch: 1,
      },
      HEADER_BYTES + index * RECORD_BYTES
    )
  })
  return bytes
}

function session(initial?: RealtimeRegistry): { store: MeterStore; instance: MeterSession } {
  const store = createMeterStore()
  store.bindStream(7, "adapter-test")
  if (initial) store.acceptRegistry(initial, 7)
  const instance: MeterSession = {
    store,
    ready: Promise.resolve(),
    refresh: async () => {},
    tick: () => {},
    setVisible: () => {},
    reset: async () => {
      throw new Error("reset is not used by adapter")
    },
    readStatus: () => ({ state: "stale", rateHz: 60, error: null }),
    subscribeStatus: () => () => {},
    readFrameAge: () => null,
    recordPaint() {},
    dispose: async () => {
      store.dispose()
    },
  }
  publishProjectMeters(instance)
  return { store, instance }
}

afterEach(() => {
  publishProjectMeters(null)
  configureBackendMeterReader(() => null)
  synchronizeBackendMeters()
})

describe("project meter adapter", () => {
  it("preserves sparse stereo positions, duplicates mono, and sorts track channels", async () => {
    const { store, instance } = session()
    try {
      store.acceptRegistry(
        registry([
          entry(0, "input/device/1", "input", "device", 1),
          entry(1, "track/vocal/out", "track-out", "vocal", 1),
          entry(2, "track/vocal/out", "track-out", "vocal", 0),
        ]),
        7
      )
      expect(
        store.acceptFrame(
          frame([
            { slotId: 0, peak: 0.5 },
            { slotId: 1, peak: 0.25 },
            { slotId: 2, peak: 1 },
          ])
        )
      ).toBe(true)
      expect(readProjectMeterLevels({ kind: "input", channel: "1-2" })).toEqual([
        -Infinity,
        db(0.5),
      ])
      expect(readProjectMeterLevels({ kind: "input", channel: "2" })).toEqual([db(0.5), db(0.5)])
      expect(readProjectMeterLevels({ kind: "track", trackId: "vocal" })).toEqual([db(1), db(0.25)])
      expect(readProjectMeterLevels({ kind: "silent" })).toEqual(silent)
    } finally {
      publishProjectMeters(null)
      await instance.dispose()
    }
  })

  it("keeps device input and output samples distinct from track output", async () => {
    const { store, instance } = session()
    try {
      store.acceptRegistry(
        registry([
          entry(0, "device/gain/in", "device-in", "gain", 1),
          entry(1, "device/gain/in", "device-in", "gain", 0),
          entry(2, "device/gain/out", "device-out", "gain", 0),
          entry(3, "device/gain/out", "device-out", "gain", 1),
        ]),
        7
      )
      expect(
        store.acceptFrame(
          frame([
            { slotId: 0, peak: 0.5 },
            { slotId: 1, peak: 1 },
            { slotId: 2, peak: 0.25 },
            { slotId: 3, peak: 0.125 },
          ])
        )
      ).toBe(true)
      expect(readProjectMeterLevels({ kind: "device", deviceId: "gain", side: "in" })).toEqual([
        db(1),
        db(0.5),
      ])
      expect(readProjectMeterLevels({ kind: "device", deviceId: "gain", side: "out" })).toEqual([
        db(0.25),
        db(0.125),
      ])
      expect(readProjectMeterLevels({ kind: "track", trackId: "gain" })).toEqual(silent)
    } finally {
      publishProjectMeters(null)
      await instance.dispose()
    }
  })

  it("silences unavailable and stale records rather than retaining old peaks", async () => {
    const { store, instance } = session()
    try {
      store.acceptRegistry(
        registry([
          entry(0, "track/vocal/out", "track-out", "vocal", 0),
          entry(1, "track/vocal/out", "track-out", "vocal", 1),
        ]),
        7
      )
      expect(
        store.acceptFrame(
          frame([
            { slotId: 0, peak: 1 },
            { slotId: 1, peak: 0.5 },
          ])
        )
      ).toBe(true)
      expect(
        store.acceptFrame(
          frame(
            [
              { slotId: 0, peak: 1, flags: RECORD_FLAGS_VALID | RECORD_FLAGS_STALE },
              { slotId: 1, peak: 0.5, flags: RECORD_FLAGS_VALID | RECORD_FLAGS_UNAVAILABLE },
            ],
            1,
            2n
          )
        )
      ).toBe(true)
      expect(readProjectMeterLevels({ kind: "track", trackId: "vocal" })).toEqual(silent)
      store.markStale()
      expect(readProjectMeterLevels({ kind: "track", trackId: "vocal" })).toEqual(silent)
    } finally {
      publishProjectMeters(null)
      await instance.dispose()
    }
  })

  it("unites watcher interests, rebinds late sessions, and fences obsolete cleanup", async () => {
    const first = session()
    const left = entry(0, "input/device/0", "input", "device", 0)
    const right = entry(1, "input/device/1", "input", "device", 1)
    const track = { ...entry(2, "track/vocal/out", "track-out", "vocal", 0), channelCount: 1 }
    first.store.acceptRegistry(registry([left, right, track]), 7)
    const notify = vi.fn()
    const removeInput = watchProjectMeter("input-panel", { kind: "input", channel: "1-2" }, notify)
    const removeTrack = watchProjectMeter(
      "track-panel",
      { kind: "track", trackId: "vocal" },
      notify
    )
    let second: { store: MeterStore; instance: MeterSession } | undefined
    try {
      expect(first.store.readMetadata().endpointIds).toEqual([
        left.endpointId,
        right.endpointId,
        track.endpointId,
      ])
      second = session(registry([left, right, track]))
      expect(first.store.readMetadata().endpointIds).toEqual([])
      expect(second.store.readMetadata().endpointIds).toEqual([
        left.endpointId,
        right.endpointId,
        track.endpointId,
      ])
      removeInput()
      expect(second.store.readMetadata().endpointIds).toEqual([track.endpointId])
      const obsolete = setProjectMeterInterest("replacement", [left.endpointId])
      const replacement = setProjectMeterInterest("replacement", [right.endpointId])
      obsolete()
      expect(second.store.readMetadata().endpointIds).toEqual([right.endpointId, track.endpointId])
      replacement()
      removeTrack()
      expect(second.store.readMetadata().endpointIds).toEqual([])
    } finally {
      removeInput()
      removeTrack()
      publishProjectMeters(null)
      await first.instance.dispose()
      if (second) await second.instance.dispose()
    }
  })
})

it("rebinds backend stores without retaining old frame subscriptions or interests", () => {
  const first = createMeterStore()
  const second = createMeterStore()
  const layout = registry([
    { ...entry(0, "track/vocal/out", "track-out", "vocal", 0), channelCount: 1 },
  ])
  for (const store of [first, second]) {
    store.bindStream(7, "adapter-test")
    store.acceptRegistry(layout, 7)
  }
  let backend: MeterStore | null = first
  configureBackendMeterReader(() => backend)
  synchronizeBackendMeters()
  const notify = vi.fn()
  const detach = watchProjectMeter("backend-view", { kind: "track", trackId: "vocal" }, notify)
  try {
    first.acceptFrame(frame([{ slotId: 0, peak: 1 }]))
    expect(readProjectMeterLevels({ kind: "track", trackId: "vocal" })).toEqual([0, 0])
    backend = second
    synchronizeBackendMeters()
    expect(first.readMetadata().endpointIds).toEqual([])
    expect(second.readMetadata().endpointIds).toEqual(["track/vocal/out"])
    notify.mockClear()
    first.acceptFrame(frame([{ slotId: 0, peak: 0.5 }], 1, 2n))
    expect(notify).not.toHaveBeenCalled()
    second.acceptFrame(frame([{ slotId: 0, peak: 0.25 }]))
    expect(notify).toHaveBeenCalledOnce()
    expect(readProjectMeterLevels({ kind: "track", trackId: "vocal" })[0]).toBeCloseTo(db(0.25))
    detach()
    expect(second.readMetadata().endpointIds).toEqual([])
  } finally {
    detach()
    backend = null
    synchronizeBackendMeters()
    first.dispose()
    second.dispose()
  }
})
