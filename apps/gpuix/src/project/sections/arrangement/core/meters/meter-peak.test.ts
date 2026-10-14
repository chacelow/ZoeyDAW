import { expect, it } from "bun:test"
import { advanceMeterPeak, createMeterPeak, meterDb as meterDatabase } from "./meter-peak"

it("holds the latest peak, then falls at the same rate regardless of frame intervals", () => {
  const sparse = createMeterPeak()
  const frequent = createMeterPeak()
  for (const peak of [sparse, frequent]) {
    advanceMeterPeak(peak, -6, 100)
    advanceMeterPeak(peak, -30, 699)
    expect(peak.db).toBe(-6)
  }
  advanceMeterPeak(sparse, -30, 1200)
  for (const now of [700, 800, 900, 1000, 1100, 1200]) {
    advanceMeterPeak(frequent, -30, now)
  }
  expect(sparse.db).toBe(-18)
  expect(frequent.db).toBeCloseTo(sparse.db)
  advanceMeterPeak(sparse, -30, 2200)
  expect(sparse.db).toBe(-30)
})

it("refreshes sustained peaks, catches new higher peaks, and clears after silence", () => {
  const left = createMeterPeak()
  const right = createMeterPeak()
  advanceMeterPeak(left, -10, 100)
  advanceMeterPeak(right, -20, 100)
  advanceMeterPeak(left, -10, 600)
  advanceMeterPeak(left, -40, 1100)
  expect(left.db).toBe(-10)
  advanceMeterPeak(right, -40, 1100)
  expect(right.db).toBeCloseTo(-29.6)
  advanceMeterPeak(left, 3, 1200)
  expect(left.db).toBe(3)
  advanceMeterPeak(left, -Infinity, 5000)
  expect(left.db).toBe(-60)
})

it("retains positive dB headroom and treats non-finite telemetry as overload or silence", () => {
  expect(meterDatabase(0)).toBe(0)
  expect(meterDatabase(3)).toBe(3)
  expect(meterDatabase(Infinity)).toBe(6)
  expect(meterDatabase(-Infinity)).toBe(-60)
  expect(meterDatabase(NaN)).toBe(-60)
})
