import { describe, expect, it } from "vitest"
import { decodeLevelsFrame } from "./levels"
import {
  HEADER_BYTES,
  MAGIC,
  RECORD_BYTES,
  SOURCE_BYTES,
  VERSION,
  writeHeader,
  writeRecord,
  writeSource,
} from "./protocol.generated"

function frame(channels: number, sourceCount = 1): ArrayBuffer {
  const bytes = new ArrayBuffer(HEADER_BYTES + channels * RECORD_BYTES + sourceCount * SOURCE_BYTES)
  const view = new DataView(bytes)
  writeHeader(view, {
    magic: MAGIC,
    version: VERSION,
    headerBytes: HEADER_BYTES,
    generation: 1,
    registryRevision: 2,
    streamId: 3,
    slotCount: channels,
    seq: 9007199254740993n,
    timeSamples: 9007199254740995n,
    sampleRate: 48000,
    producedMonotonicNs: 9007199254740997n,
    controlGeneration: 4n,
    acceptedRevision: 5n,
    audioRevision: 5n,
    subscriptionRevision: 1,
    flags: 1,
    timelineSample: -512n,
    timelineBeat: -0.25,
    tempoBpm: 120,
    deviceEpoch: 1,
    sourceCount,
    resetEpoch: 7,
    frameType: 1,
  })
  for (let slotId = 0; slotId < channels; slotId += 1) {
    writeRecord(
      view,
      {
        slotId,
        flags: 1,
        blockEndSample: 9007199254740995n,
        peak: 0.25,
        rms: 0.25,
        hold: 0.5,
        sessionPeak: 1.5,
        clipCount: 9007199254740999n,
        validFrames: 14400,
        slotResetEpoch: slotId === 0 ? 7 : 2,
      },
      HEADER_BYTES + slotId * RECORD_BYTES
    )
  }
  if (sourceCount)
    writeSource(
      view,
      {
        clipHandle: 1,
        sourceHandle: 2,
        sourceFrame: 44100.5,
        sourceRate: 44100,
        observedDeviceSample: 48000n,
        sourceGeneration: 3,
        flags: 1,
        positionAgeSamples: 0,
        reserved: 0,
      },
      HEADER_BYTES + channels * RECORD_BYTES
    )
  return bytes
}

describe("levels wire boundary", () => {
  it.each([0, 1, 2, 8])("preserves %i channel records and independent reset epochs", channels => {
    const decoded = decodeLevelsFrame(frame(channels))
    expect(decoded?.header.seq).toBe(9007199254740993n)
    expect(decoded?.header.timelineSample).toBe(-512n)
    expect(decoded?.records.map(record => record.slotId)).toEqual(
      Array.from({ length: channels }, (_, index) => index)
    )
    expect(decoded?.sources[0]?.sourceRate).toBe(44100)
    if (channels > 1) expect(decoded?.records[1]?.slotResetEpoch).toBe(2)
  })
  it("accepts empty interest without sources", () => {
    expect(decodeLevelsFrame(frame(0, 0))?.records).toEqual([])
  })
  it("rejects truncation and trailing payload", () => {
    const bytes = frame(2)
    expect(decodeLevelsFrame(bytes.slice(0, -1))).toBeNull()
    expect(decodeLevelsFrame(new ArrayBuffer(bytes.byteLength + 1))).toBeNull()
  })
  it("rejects duplicate slots", () => {
    const bytes = frame(2)
    new DataView(bytes).setUint32(HEADER_BYTES + RECORD_BYTES, 0, true)
    expect(decodeLevelsFrame(bytes)).toBeNull()
  })
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("rejects invalid amplitude %s", value => {
    const bytes = frame(1)
    new DataView(bytes).setFloat32(HEADER_BYTES + 16, value, true)
    expect(decodeLevelsFrame(bytes)).toBeNull()
  })
  it("requires unavailable RMS to carry zero rather than a plausible value", () => {
    const bytes = frame(1)
    const view = new DataView(bytes)
    view.setUint32(HEADER_BYTES + 4, 17, true)
    expect(decodeLevelsFrame(bytes)).toBeNull()
    view.setFloat32(HEADER_BYTES + 20, 0, true)
    expect(decodeLevelsFrame(bytes)?.records[0]?.flags).toBe(17)
  })
  it.each([
    [4, 2],
    [84, 8],
    [HEADER_BYTES + 4, 64],
  ])("rejects unknown version or flags at %i", (offset, value) => {
    const bytes = frame(1)
    new DataView(bytes).setUint32(offset, value, true)
    expect(decodeLevelsFrame(bytes)).toBeNull()
  })
  it("rejects nonfinite source coordinates and unknown source flags", () => {
    const bytes = frame(1)
    const view = new DataView(bytes)
    const source = HEADER_BYTES + RECORD_BYTES
    view.setFloat64(source + 8, Number.NaN, true)
    expect(decodeLevelsFrame(bytes)).toBeNull()
    view.setFloat64(source + 8, 44100.5, true)
    view.setUint32(source + 36, 4, true)
    expect(decodeLevelsFrame(bytes)).toBeNull()
    view.setUint32(source + 36, 8, true)
    expect(decodeLevelsFrame(bytes)?.sources[0]?.flags).toBe(8)
  })
  it("retains value changes within one graph generation", () => {
    const first = frame(1)
    const next = frame(1)
    const view = new DataView(next)
    view.setBigUint64(24, 9007199254740994n, true)
    view.setFloat32(HEADER_BYTES + 16, 0.5, true)
    expect(decodeLevelsFrame(first)?.header.generation).toBe(
      decodeLevelsFrame(next)?.header.generation
    )
    expect(decodeLevelsFrame(next)?.header.seq).toBe(9007199254740994n)
    expect(decodeLevelsFrame(next)?.records[0]?.peak).toBe(0.5)
  })
})
