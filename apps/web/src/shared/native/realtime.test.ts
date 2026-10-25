import { beforeEach, describe, expect, it, vi } from "vitest"
import { Channel, invoke, isTauri } from "@tauri-apps/api/core"
import { jsonU64, type RealtimeRegistry } from "@zoeydaw/project-core/realtime"
import { nativeMeterPort } from "./realtime"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  Channel: class {
    onmessage: (value: unknown) => void
    constructor(onmessage: (value: unknown) => void) {
      this.onmessage = onmessage
    }
  },
}))

const registry: RealtimeRegistry = {
  sessionId: "session",
  sessionEpoch: 1,
  deviceEpoch: 1,
  generation: 1,
  registryRevision: 1,
  resetEpoch: 1,
  entries: [0, 1].map(channelIndex => ({
    slotId: channelIndex,
    endpointId: "track/audio/out",
    kind: "track-out" as const,
    ownerId: "audio",
    channelIndex,
    channelCount: 2,
    capabilities: ["peak", "rms"] as const,
  })),
  sources: [],
  endpointResets: [{ endpointId: "track/audio/out", slotIds: [0, 1], slotResetEpoch: 1 }],
}

function openedChannel() {
  const args = vi.mocked(invoke).mock.calls[0]?.[1]
  if (
    !args ||
    typeof args !== "object" ||
    !("events" in args) ||
    !(args.events instanceof Channel)
  ) {
    throw new Error("Missing native event Channel")
  }
  return args.events
}

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  vi.mocked(isTauri).mockReturnValue(true)
})

describe("native meter IPC boundary", () => {
  it("accepts only a raw ArrayBuffer snapshot, without coercing serialized bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    vi.mocked(invoke).mockResolvedValueOnce(bytes).mockResolvedValueOnce([1, 2, 3])
    await expect(nativeMeterPort.snapshot(7, jsonU64(0n))).resolves.toBe(bytes)
    await expect(nativeMeterPort.snapshot(7, jsonU64(0n))).rejects.toThrow("raw ArrayBuffer")
    expect(invoke).toHaveBeenCalledWith("playback_meter_snapshot", {
      streamId: 7,
      afterSeq: jsonU64(0n),
    })
  })

  it("validates exact clock counters without converting them to JS numbers", async () => {
    const clock = {
      monotonicNs: jsonU64(9007199254740993n),
      deviceEpoch: 4,
      timeSamples: jsonU64(9007199254740995n),
      sampleRate: 48000,
    }
    vi.mocked(invoke)
      .mockResolvedValueOnce(clock)
      .mockResolvedValueOnce({ ...clock, monotonicNs: 9007199254740992 })
    await expect(nativeMeterPort.clock(7)).resolves.toEqual(clock)
    await expect(nativeMeterPort.clock(7)).rejects.toThrow()
  })

  it("accepts empty stopped registry metadata while the sample clock remains unavailable", async () => {
    const stopped = { ...registry, entries: [], sources: [], endpointResets: [] }
    vi.mocked(invoke)
      .mockResolvedValueOnce(stopped)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined)
    await expect(nativeMeterPort.registry(7)).resolves.toEqual(stopped)
    await expect(nativeMeterPort.clock(7)).resolves.toBeNull()
    await expect(nativeMeterPort.registry(7)).rejects.toThrow()
  })

  it("contains invalid channel events and reports the error exactly once", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ streamId: 71, registry })
    const events = vi.fn()
    const onError = vi.fn(() => {
      throw new Error("consumer error handler failed")
    })
    await nativeMeterPort.open("lease", "session", events, onError)
    const channel = openedChannel()
    expect(channel).toBeInstanceOf(Channel)
    expect(() => channel.onmessage([{ kind: "unknown" }])).not.toThrow()
    expect(() => channel.onmessage([{ kind: "unknown" }])).not.toThrow()
    expect(events).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    vi.mocked(invoke).mockResolvedValueOnce(null)
    await nativeMeterPort.close(71)
  })

  it("closes an admitted stream when its registry violates identity uniqueness", async () => {
    const malformed = { ...registry, entries: [registry.entries[0], registry.entries[0]] }
    vi.mocked(invoke)
      .mockResolvedValueOnce({ streamId: 72, registry: malformed })
      .mockResolvedValueOnce(null)
    await expect(nativeMeterPort.open("lease", "session", vi.fn(), vi.fn())).rejects.toThrow()
    expect(invoke).toHaveBeenLastCalledWith("playback_stream_close", { streamId: 72 })
  })

  it("rejects malformed registry mappings returned by the registry command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      ...registry,
      entries: [registry.entries[0], registry.entries[0]],
    })
    await expect(nativeMeterPort.registry(73)).rejects.toThrow()
    expect(invoke).toHaveBeenCalledWith("playback_stream_registry", { streamId: 73 })
  })

  it("detaches the callback on close so later native deliveries cannot reach consumers", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ streamId: 74, registry })
    const events = vi.fn()
    const onError = vi.fn()
    await nativeMeterPort.open("lease", "session", events, onError)
    const channel = openedChannel()
    const event = {
      sessionId: "session",
      sessionEpoch: 1,
      streamId: 74,
      deviceEpoch: 1,
      generation: 1,
      registryRevision: 1,
      seq: jsonU64(1n),
      kind: "xrun",
      count: jsonU64(1n),
      deviceSample: jsonU64(512n),
    }
    channel.onmessage([event])
    expect(events).toHaveBeenCalledWith([event])
    vi.mocked(invoke).mockResolvedValueOnce(null)
    await nativeMeterPort.close(74)
    expect(invoke).toHaveBeenLastCalledWith("playback_stream_close", { streamId: 74 })
    channel.onmessage([event])
    channel.onmessage([{ kind: "invalid" }])
    expect(events).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
})
