import { describe, expect, it } from "vitest"
import {
  envelopeFadeGain,
  peakEnvelopePath,
  samplePeakColumns,
  samplePeakEnvelope,
} from "./waveform"
import type { PeakEnvelope } from "./waveform"

const envelope: PeakEnvelope = { peaks: [0, 0.25, 1, 0, 0.5, 0], start: 0, span: 6 }

describe("real peak envelope intervals", () => {
  it("keeps an impulse between old point samples at non-divisible zoom ratios", () => {
    const peaks = Array.from({ length: 4096 }, () => 0)
    peaks[7] = 1
    const source = { peaks, start: 0, span: 1 }
    const values = samplePeakColumns(source, 0, 1, 511).values
    expect(values[0]).toBe(1)
    expect(Math.max(...values)).toBe(1)
    expect(samplePeakEnvelope(source, 8 / 4096, 1)).toBe(0)
  })

  it("does not interpolate fake detail when a peak bin is wider than a pixel", () => {
    expect(
      Array.from(samplePeakColumns({ peaks: [0, 1], start: 0, span: 2 }, 0, 2, 8).values)
    ).toEqual([0, 0, 0, 0, 1, 1, 1, 1])
    expect(samplePeakEnvelope(envelope, 0, 1)).toBe(0)
    expect(samplePeakEnvelope(envelope, 3, 4)).toBe(0)
  })

  it("bounds allocations and sampling to the visible columns even at distant zoom", () => {
    const columns = samplePeakColumns(envelope, 0, 6, 1_000_000, 400_001.2, 400_008.1)
    expect(columns.start).toBe(400_001)
    expect(columns.end).toBe(400_009)
    expect(Array.from(columns.values)).toEqual(Array.from({ length: 8 }, () => 1))
    expect(samplePeakColumns(envelope, 0, 6, 100, 110, 120).values).toHaveLength(0)
    expect(samplePeakColumns(envelope, 0, 6, 0).values).toHaveLength(0)
  })

  it("clips source and marker windows without stretching their peaks", () => {
    const source = { ...envelope, window: { start: 1, end: 3 } }
    expect(samplePeakEnvelope(source, -10, 1)).toBe(0)
    expect(samplePeakEnvelope(source, 1, 2)).toBe(0.25)
    expect(samplePeakEnvelope(source, 2, 4)).toBe(1)
    expect(samplePeakEnvelope(source, 3, 5)).toBe(0)
    expect(samplePeakEnvelope(envelope, 6, 7)).toBe(0)
  })

  it("reverses whole-source bin intervals and applies gain after extrema reduction", () => {
    const source = { ...envelope, reverse: true, gain: 0.5 }
    expect(samplePeakEnvelope(source, 0, 1)).toBe(0)
    expect(samplePeakEnvelope(source, 1, 2)).toBe(0.25)
    expect(samplePeakEnvelope(source, 3, 4)).toBe(0.5)
    expect(samplePeakEnvelope({ ...envelope, gain: 4 }, 1, 2)).toBe(1)
  })

  it("splits loop seams, wraps negative phase and reduces whole repeated cycles once", () => {
    const source = { ...envelope, loop: { start: 1, end: 5 } }
    expect(samplePeakEnvelope(source, 4.5, 5.5)).toBe(0.5)
    expect(samplePeakEnvelope(source, -0.5, 0.5)).toBe(0.5)
    expect(samplePeakEnvelope(source, -1_000_000, 1_000_000)).toBe(1)
    expect(samplePeakEnvelope({ ...source, reverse: true }, 4, 5)).toBe(0.25)
  })

  it("closes one gap-free symmetric fill and keeps silence on the centerline", () => {
    const path = peakEnvelopePath({ peaks: [0, 1], start: 0, span: 2 }, 0, 2, 2, 48)
    expect(path).toBe("M0,50L0,50H1L1,2H2V98L2,98H1L1,50H0Z")
    const silent = peakEnvelopePath({ peaks: [0], start: 0, span: 1 }, 0, 1, 1, 48)
    expect(silent).toBe("M0,50L0,50H1V50L1,50H0Z")
  })

  it("keeps a completed fade-out silent while a completed fade-in remains at unity", () => {
    const fade = { start: 0.5, end: 0.75, position: 0.5, curve: 0 } as const
    expect(envelopeFadeGain({ ...envelope, fades: [{ ...fade, direction: "out" }] }, 0.875)).toBe(0)
    expect(envelopeFadeGain({ ...envelope, fades: [{ ...fade, direction: "in" }] }, 0.875)).toBe(1)
  })
})
