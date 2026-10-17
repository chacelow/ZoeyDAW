import { expect, test } from "bun:test"
import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { advanceMeterRms, createMeterRms } from "./meter-rms"

const policy = ARRANGEMENT_DEFAULTS.meter

test("RMS power reaches 63% of a step after one integration time constant and converges", () => {
  const rms = createMeterRms(policy)
  advanceMeterRms(rms, policy.minDb, 0, policy)
  advanceMeterRms(rms, -12, policy.rmsIntegrationMs, policy)
  expect(rms.power / 10 ** (-12 / 10)).toBeCloseTo(1 - Math.exp(-1), 8)
  expect(rms.db).toBeLessThan(-12)
  advanceMeterRms(rms, -12, policy.rmsIntegrationMs * 20, policy)
  expect(rms.db).toBeCloseTo(-12, 6)
})

test("RMS integration is frame-rate independent, decays to silence, and resets with its owner", () => {
  const sparse = createMeterRms(policy)
  const frequent = createMeterRms(policy)
  for (const rms of [sparse, frequent]) advanceMeterRms(rms, -6, 0, policy)
  advanceMeterRms(sparse, -30, policy.rmsIntegrationMs, policy)
  for (let now = 10; now <= policy.rmsIntegrationMs; now += 10)
    advanceMeterRms(frequent, -30, now, policy)
  expect(sparse.db).toBeCloseTo(frequent.db, 8)
  advanceMeterRms(sparse, policy.minDb, policy.rmsIntegrationMs * 100, policy)
  expect(sparse.db).toBe(policy.minDb)
  expect(createMeterRms(policy).db).toBe(policy.minDb)
})
