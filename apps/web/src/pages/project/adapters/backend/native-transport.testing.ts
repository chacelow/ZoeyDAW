import { vi } from "vitest"
import {
  HEADER_BYTES,
  MAGIC,
  VERSION,
  FRAME_TYPES_LEVELS,
  HEADER_FLAGS_PLAYING,
  HEADER_FLAGS_REVISIONS_UNAVAILABLE,
  TRANSPORT_KINDS_AUDIO,
  TRANSPORT_KINDS_STOPPED,
  TRANSPORT_KINDS_UNAVAILABLE,
  TRANSPORT_FLAGS_CONTROL_VALID,
  TRANSPORT_FLAGS_AUDIBLE_VALID,
  writeHeader,
  type WireHeader,
  type RealtimeRegistry,
} from "@zoeydaw/project-core/realtime"
import type { MeterSessionPort } from "@zoeydaw/project-runtime/realtime"
import { readProjectMeters } from "../realtime"

function header(seq: bigint): WireHeader {
  return {
    magic: MAGIC,
    version: VERSION,
    headerBytes: HEADER_BYTES,
    generation: 1,
    registryRevision: 1,
    streamId: 7,
    slotCount: 0,
    seq,
    timeSamples: 0n,
    sampleRate: 0,
    producedMonotonicNs: 0n,
    controlGeneration: 0n,
    acceptedRevision: 0n,
    audioRevision: 0n,
    subscriptionRevision: 1,
    flags: HEADER_FLAGS_REVISIONS_UNAVAILABLE,
    timelineSample: 0n,
    timelineBeat: 0,
    tempoBpm: 0,
    deviceEpoch: 1,
    sourceCount: 0,
    resetEpoch: 0,
    frameType: FRAME_TYPES_LEVELS,
    appliedSequence: 0n,
    ownerEpoch: 0n,
    bar: 0,
    barsPerSecond: 0,
    audibleBar: 0,
    audibleBarsPerSecond: 0,
    observedMonotonicNs: 0n,
    transportKind: TRANSPORT_KINDS_UNAVAILABLE,
    transportFlags: 0,
  }
}
function encode(value: WireHeader): ArrayBuffer {
  const bytes = new ArrayBuffer(HEADER_BYTES)
  writeHeader(new DataView(bytes), value)
  return bytes
}
export function audioFrame(seq: bigint, bar: number, observed = 0n): ArrayBuffer {
  return encode({
    ...header(seq),
    timeSamples: 48000n,
    sampleRate: 48000,
    producedMonotonicNs: observed,
    controlGeneration: 9007199254740993n,
    ownerEpoch: 9007199254740995n,
    flags: HEADER_FLAGS_REVISIONS_UNAVAILABLE | HEADER_FLAGS_PLAYING,
    timelineSample: 96000n,
    timelineBeat: 8,
    tempoBpm: 120,
    bar: bar + 0.25,
    barsPerSecond: 0.5,
    audibleBar: bar,
    audibleBarsPerSecond: 0.5,
    observedMonotonicNs: observed,
    transportKind: TRANSPORT_KINDS_AUDIO,
    transportFlags: TRANSPORT_FLAGS_CONTROL_VALID | TRANSPORT_FLAGS_AUDIBLE_VALID,
  })
}
export function stoppedFrame(seq: bigint, bar: number): ArrayBuffer {
  return encode({
    ...header(seq),
    controlGeneration: 9007199254740994n,
    appliedSequence: 5n,
    ownerEpoch: 9007199254740996n,
    bar,
    barsPerSecond: 0.5,
    transportKind: TRANSPORT_KINDS_STOPPED,
    transportFlags: TRANSPORT_FLAGS_CONTROL_VALID,
  })
}
export function unavailableFrame(seq: bigint): ArrayBuffer {
  return encode(header(seq))
}

export interface NativeTransportFixture {
  readonly port: MeterSessionPort
  readonly queue: ArrayBuffer[]
  tick(at: number): Promise<void>
}
async function flush(remaining = 16): Promise<void> {
  if (remaining === 0) return
  await Promise.resolve()
  return flush(remaining - 1)
}
export function transportFixture(): NativeTransportFixture {
  const queue: ArrayBuffer[] = []
  const registry: RealtimeRegistry = {
    sessionId: "s",
    sessionEpoch: 1,
    deviceEpoch: 1,
    generation: 1,
    registryRevision: 1,
    resetEpoch: 0,
    entries: [],
    sources: [],
    endpointResets: [],
  }
  const port: MeterSessionPort = {
    open: vi.fn(async () => ({ streamId: 7, registry })),
    registry: vi.fn(async () => registry),
    clock: vi.fn(async () => null),
    interest: vi.fn(async () => {}),
    snapshot: vi.fn(async () => queue.shift() ?? new ArrayBuffer(0)),
    receipt: vi.fn(async () => {}),
    reset: vi.fn(async () => ({ resetEpoch: 0, affected: [] })),
    close: vi.fn(async () => {}),
  }
  return {
    port,
    queue,
    async tick(at) {
      await flush()
      readProjectMeters()?.tick(at)
      await flush()
    },
  }
}
