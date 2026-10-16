import { expect, test } from "bun:test"
import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { advanceMeterPeak, createMeterPeak, meterDb } from "./meter-peak"

test("meter policy controls silence, clipping and invalid telemetry", () => {
  const policy = { ...ARRANGEMENT_DEFAULTS.meter, minDb: -42, maxDb: 3 }
  expect(createMeterPeak(policy).db).toBe(-42)
  expect(meterDb(-Infinity, policy)).toBe(-42)
  expect(meterDb(Number.NaN, policy)).toBe(-42)
  expect(meterDb(Infinity, policy)).toBe(3)
  expect(meterDb(-12, policy)).toBe(-12)
})

test("changing peak hold preserves the peak until the configured boundary", () => {
  const policy = { ...ARRANGEMENT_DEFAULTS.meter, holdMs: 1200 }
  const peak = createMeterPeak(policy)
  advanceMeterPeak(peak, -6, 100, policy)
  advanceMeterPeak(peak, -30, 1299, policy)
  expect(peak.db).toBe(-6)
  advanceMeterPeak(peak, -30, 1400, policy)
  expect(peak.db).toBeCloseTo(-8.4)
})

test("changing peak fall rate changes decay without changing hold or current level", () => {
  const policy = { ...ARRANGEMENT_DEFAULTS.meter, fallDbPerSecond: 12 }
  const peak = createMeterPeak(policy)
  advanceMeterPeak(peak, -6, 100, policy)
  advanceMeterPeak(peak, -30, 1700, policy)
  expect(peak.db).toBe(-18)
  advanceMeterPeak(peak, -10, 1800, policy)
  expect(peak.db).toBe(-10)
  advanceMeterPeak(peak, -40, 2399, policy)
  expect(peak.db).toBe(-10)
})
