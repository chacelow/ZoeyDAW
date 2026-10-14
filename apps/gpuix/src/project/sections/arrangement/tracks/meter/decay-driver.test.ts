import { expect, test } from "bun:test"
import { advanceMeterPeak, createMeterPeak, METER_MIN_DB } from "../../core/meters/meter-peak"
import { createMeterDecayDriver } from "./decay-driver"
import type { FrameSource } from "./decay-driver"

test("one frame source serves visible meters and stops after silence or last unmount", () => {
  let time = 0
  const frameCallbacks = new Set<() => void>()
  let starts = 0
  let stops = 0
  const frames: FrameSource = {
    subscribe(callback) {
      starts += 1
      frameCallbacks.add(callback)
      return () => {
        stops += 1
        frameCallbacks.delete(callback)
      }
    },
  }
  const driver = createMeterDecayDriver(frames, () => time)
  const peak = createMeterPeak()
  let level = 0
  driver.wake()
  expect(starts).toBe(0)
  const unmount = driver.subscribe(now => {
    advanceMeterPeak(peak, level, now)
    return peak.db > METER_MIN_DB
  })
  const unmountSilent = driver.subscribe(() => false)
  driver.wake()
  driver.wake()
  expect(starts).toBe(1)
  expect(peak.db).toBe(0)
  level = METER_MIN_DB
  time = 600
  for (const callback of frameCallbacks) callback()
  expect(peak.db).toBe(0)
  time = 1000
  for (const callback of frameCallbacks) callback()
  expect(peak.db).toBeCloseTo(-9.6)
  time = 4000
  for (const callback of frameCallbacks) callback()
  expect(peak.db).toBe(METER_MIN_DB)
  expect(stops).toBe(1)
  expect(frameCallbacks.size).toBe(0)
  level = 3
  driver.wake()
  expect(starts).toBe(2)
  unmountSilent()
  expect(stops).toBe(1)
  unmount()
  expect(stops).toBe(2)
  driver.wake()
  expect(starts).toBe(2)
})

test("injected frame callbacks advance peak decay without an independent transport clock", () => {
  let time = 0
  const frames = new Set<() => void>()
  const driver = createMeterDecayDriver(
    {
      subscribe(callback) {
        frames.add(callback)
        return () => {
          frames.delete(callback)
        }
      },
    },
    () => time
  )
  const peak = createMeterPeak()
  let level = 6
  const detach = driver.subscribe(now => {
    advanceMeterPeak(peak, level, now)
    return peak.db > METER_MIN_DB
  })
  driver.wake()
  level = METER_MIN_DB
  time = 1600
  for (const callback of frames) callback()
  expect(peak.db).toBe(-18)
  time = 4000
  for (const callback of frames) callback()
  expect(peak.db).toBe(METER_MIN_DB)
  expect(frames.size).toBe(0)
  detach()
})

test("repeated telemetry wakes coalesce into the active frame source", () => {
  const frames = new Set<() => void>()
  const driver = createMeterDecayDriver(
    {
      subscribe(callback) {
        frames.add(callback)
        return () => {
          frames.delete(callback)
        }
      },
    },
    () => 0
  )
  let advances = 0
  const detach = driver.subscribe(() => {
    advances += 1
    return true
  })
  driver.wake()
  for (let subscriber = 0; subscriber < 10; subscriber++) driver.wake()
  expect(advances).toBe(1)
  for (const callback of frames) callback()
  expect(advances).toBe(2)
  detach()
  expect(frames.size).toBe(0)
})
