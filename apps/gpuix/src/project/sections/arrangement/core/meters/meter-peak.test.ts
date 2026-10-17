import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { expect, it } from "bun:test"
import { advanceMeterPeak, createMeterPeak, meterDb as meterDatabase } from "./meter-peak"

it("holds the latest peak, then falls at the same rate regardless of frame intervals", () => {
  const sparse = createMeterPeak(ARRANGEMENT_DEFAULTS.meter)
  const frequent = createMeterPeak(ARRANGEMENT_DEFAULTS.meter)
  for (const peak of [sparse, frequent]) {
    advanceMeterPeak(peak, -6, 100, ARRANGEMENT_DEFAULTS.meter)
    advanceMeterPeak(peak, -30, 699, ARRANGEMENT_DEFAULTS.meter)
    expect(peak.db).toBe(-6)
  }
  advanceMeterPeak(sparse, -30, 1200, ARRANGEMENT_DEFAULTS.meter)
  for (const now of [700, 800, 900, 1000, 1100, 1200]) {
    advanceMeterPeak(frequent, -30, now, ARRANGEMENT_DEFAULTS.meter)
  }
  expect(sparse.db).toBe(-18)
  expect(frequent.db).toBeCloseTo(sparse.db)
  advanceMeterPeak(sparse, -30, 2200, ARRANGEMENT_DEFAULTS.meter)
  expect(sparse.db).toBe(-30)
})

it("refreshes sustained peaks, catches new higher peaks, and clears after silence", () => {
  const left = createMeterPeak(ARRANGEMENT_DEFAULTS.meter)
  const right = createMeterPeak(ARRANGEMENT_DEFAULTS.meter)
  advanceMeterPeak(left, -10, 100, ARRANGEMENT_DEFAULTS.meter)
  advanceMeterPeak(right, -20, 100, ARRANGEMENT_DEFAULTS.meter)
  advanceMeterPeak(left, -10, 600, ARRANGEMENT_DEFAULTS.meter)
  advanceMeterPeak(left, -40, 1100, ARRANGEMENT_DEFAULTS.meter)
  expect(left.db).toBe(-10)
  advanceMeterPeak(right, -40, 1100, ARRANGEMENT_DEFAULTS.meter)
  expect(right.db).toBeCloseTo(-29.6)
  advanceMeterPeak(left, 3, 1200, ARRANGEMENT_DEFAULTS.meter)
  expect(left.db).toBe(3)
  advanceMeterPeak(left, -Infinity, 8000, ARRANGEMENT_DEFAULTS.meter)
  expect(left.db).toBe(ARRANGEMENT_DEFAULTS.meter.minDb)
})

it("retains positive dB headroom and treats non-finite telemetry as overload or silence", () => {
  expect(meterDatabase(0, ARRANGEMENT_DEFAULTS.meter)).toBe(0)
  expect(meterDatabase(3, ARRANGEMENT_DEFAULTS.meter)).toBe(3)
  expect(meterDatabase(Infinity, ARRANGEMENT_DEFAULTS.meter)).toBe(6)
  expect(meterDatabase(-Infinity, ARRANGEMENT_DEFAULTS.meter)).toBe(
    ARRANGEMENT_DEFAULTS.meter.minDb
  )
  expect(meterDatabase(NaN, ARRANGEMENT_DEFAULTS.meter)).toBe(ARRANGEMENT_DEFAULTS.meter.minDb)
})
