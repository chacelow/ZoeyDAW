import { expect, test } from "bun:test"
import { advanceMeterPeak, createMeterPeak, METER_MIN_DB } from "../../core/meters/meter-peak"
import { createMeterDecayDriver } from "./decay-driver"

test("one activity request serves meters and ends on silence or last unmount", () => {
  const activity: boolean[] = []
  const driver = createMeterDecayDriver(active => {
    activity.push(active)
  })
  const peak = createMeterPeak()
  let level = 0
  driver.wake()
  expect(activity).toEqual([])
  const detach = driver.subscribe({
    active: () => level > METER_MIN_DB || peak.db > METER_MIN_DB,
    advance(timestampMs) {
      advanceMeterPeak(peak, level, timestampMs)
      return peak.db > METER_MIN_DB
    },
  })
  const detachSilent = driver.subscribe({ active: () => false, advance: () => false })
  driver.wake()
  driver.wake()
  expect(activity).toEqual([true])
  driver.advance(0)
  expect(peak.db).toBe(0)
  level = METER_MIN_DB
  driver.advance(600)
  expect(peak.db).toBe(0)
  driver.advance(1000)
  expect(peak.db).toBeCloseTo(-9.6)
  driver.advance(4000)
  expect(peak.db).toBe(METER_MIN_DB)
  expect(activity).toEqual([true, false])
  level = 3
  driver.wake()
  expect(activity).toEqual([true, false, true])
  detachSilent()
  detach()
  expect(activity).toEqual([true, false, true, false])
  driver.wake()
  expect(activity).toEqual([true, false, true, false])
})

test("inactive driver ignores unrelated frames and wakeups do not advance the peak clock", () => {
  const activity: boolean[] = []
  const driver = createMeterDecayDriver(active => {
    activity.push(active)
  })
  const peak = createMeterPeak()
  let level = METER_MIN_DB
  const detach = driver.subscribe({
    active: () => level > METER_MIN_DB || peak.db > METER_MIN_DB,
    advance(timestampMs) {
      advanceMeterPeak(peak, level, timestampMs)
      return peak.db > METER_MIN_DB
    },
  })
  driver.advance(100)
  expect(peak.updatedAt).toBe(0)
  level = 6
  driver.wake()
  expect(peak.db).toBe(METER_MIN_DB)
  driver.advance(1000)
  expect(peak.db).toBe(6)
  expect(peak.holdUntil).toBe(1600)
  level = METER_MIN_DB
  driver.advance(2600)
  expect(peak.db).toBe(-18)
  detach()
  expect(activity).toEqual([true, false])
})

test("repeated telemetry wakes coalesce without duplicating native frame activation", () => {
  let activations = 0
  const driver = createMeterDecayDriver(active => {
    if (active) activations += 1
  })
  let frames = 0
  const detach = driver.subscribe({
    active: () => true,
    advance: () => {
      frames += 1
      return true
    },
  })
  for (let wake = 0; wake < 10; wake++) driver.wake()
  expect(activations).toBe(1)
  expect(frames).toBe(0)
  driver.advance(50)
  expect(frames).toBe(1)
  detach()
})
