import { expect, it } from "vitest"
import { decodeTransport } from "./transport"
import {
  MAGIC,
  VERSION,
  HEADER_BYTES,
  TRANSPORT_FLAGS_AUDIBLE_VALID,
  TRANSPORT_FLAGS_CONTROL_VALID,
  TRANSPORT_KINDS_STOPPED,
  TRANSPORT_KINDS_UNAVAILABLE,
  type WireHeader,
} from "./protocol.generated"

function audioHeader(): WireHeader {
  return {
    magic: MAGIC,
    version: VERSION,
    headerBytes: HEADER_BYTES,
    generation: 11,
    registryRevision: 12,
    streamId: 13,
    slotCount: 1,
    seq: 9007199254740993n,
    timeSamples: 48000n,
    sampleRate: 48000,
    producedMonotonicNs: 9007199254740995n,
    controlGeneration: 17n,
    acceptedRevision: 18n,
    audioRevision: 18n,
    subscriptionRevision: 19,
    flags: 1,
    timelineSample: -512n,
    timelineBeat: -0.25,
    tempoBpm: 120,
    deviceEpoch: 20,
    sourceCount: 1,
    resetEpoch: 21,
    frameType: 1,
    appliedSequence: 9007199254740994n,
    ownerEpoch: 9007199254740995n,
    bar: 3.25,
    barsPerSecond: 0.5,
    audibleBar: 3.125,
    audibleBarsPerSecond: 0.5,
    observedMonotonicNs: 9007199254740994n,
    transportKind: 2,
    transportFlags: 3,
  }
}
function stoppedHeader(): WireHeader {
  return {
    ...audioHeader(),
    flags: 0,
    timeSamples: 0n,
    sampleRate: 0,
    timelineSample: 0n,
    timelineBeat: 0,
    tempoBpm: 0,
    transportKind: TRANSPORT_KINDS_STOPPED,
    transportFlags: TRANSPORT_FLAGS_CONTROL_VALID,
    bar: 9,
    barsPerSecond: 0.5,
    audibleBar: 0,
    audibleBarsPerSecond: 0,
  }
}
it("keeps rendered and audible coordinates separate and preserves exact control identity", () => {
  expect(decodeTransport(audioHeader())).toMatchObject({
    kind: "audio",
    rendered: { bar: 3.25, barsPerSecond: 0.5 },
    audible: { bar: 3.125, barsPerSecond: 0.5 },
    control: { ownerEpoch: 9007199254740995n, appliedSequence: 9007199254740994n },
  })
})
it.each([
  { transportKind: 3 },
  { transportFlags: 4 },
  { ownerEpoch: 0n },
  { bar: Number.NaN },
  { sampleRate: Number.POSITIVE_INFINITY },
  { audibleBarsPerSecond: Number.NaN },
  { observedMonotonicNs: 18446744073709551615n },
])("rejects an invalid transport observation %s", change => {
  expect(decodeTransport({ ...audioHeader(), ...change })).toBeNull()
})
it("represents an unadopted audio block without an invented control identity", () => {
  const value = {
    ...audioHeader(),
    transportFlags: TRANSPORT_FLAGS_AUDIBLE_VALID,
    ownerEpoch: 0n,
    appliedSequence: 0n,
    controlGeneration: 0n,
  }
  expect(decodeTransport(value)).toMatchObject({
    kind: "audio",
    control: null,
    audible: { bar: 3.125 },
  })
  expect(decodeTransport({ ...value, controlGeneration: 1n })).toBeNull()
})
it("accepts a stopped musical position and rejects relabelled audio timing", () => {
  expect(decodeTransport(stoppedHeader())).toMatchObject({
    kind: "stopped",
    position: { bar: 9, barsPerSecond: 0.5 },
  })
  expect(decodeTransport({ ...stoppedHeader(), sampleRate: 48000 })).toBeNull()
  expect(decodeTransport({ ...stoppedHeader(), transportFlags: 0 })).toBeNull()
})
it("requires unavailable coordinates to be empty instead of plausible stale values", () => {
  const value = {
    ...stoppedHeader(),
    transportKind: TRANSPORT_KINDS_UNAVAILABLE,
    transportFlags: 0,
    ownerEpoch: 0n,
    appliedSequence: 0n,
    controlGeneration: 0n,
    bar: 0,
    barsPerSecond: 0,
    observedMonotonicNs: 0n,
  }
  expect(decodeTransport(value)).toEqual({ kind: "unavailable" })
  expect(decodeTransport({ ...value, bar: 9 })).toBeNull()
})
