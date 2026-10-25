import { expect, it } from "vitest"
import { jsonU64 } from "@zoeydaw/project-core/realtime"
import { measureMeterClock, nativeMilliseconds } from "./meter-clock"

it("selects the smallest RTT midpoint and retains half-RTT uncertainty", async () => {
  let clock = 100
  let index = 0
  const roundTrips = [10, 4, 8, 6, 12]
  const mapping = await measureMeterClock({
    now: () => clock,
    active: () => true,
    async probe() {
      const sent = clock
      clock += roundTrips[index++] ?? 0
      return {
        monotonicNs: jsonU64(BigInt(Math.round(((sent + clock) / 2 - 50) * 1e6))),
        deviceEpoch: 3,
        timeSamples: jsonU64(512n),
        sampleRate: 48000,
      }
    },
  })
  expect(mapping).toEqual({ deviceEpoch: 3, offsetMs: 50, uncertaintyMs: 2 })
})

it("drops pre-switch samples and stops issuing probes when the owner is disposed", async () => {
  let clock = 100
  let probes = 0
  let active = true
  const mapping = await measureMeterClock({
    now: () => clock,
    active: () => active,
    async probe() {
      probes++
      clock += probes === 1 ? 2 : 8
      if (probes === 4) active = false
      return {
        monotonicNs: jsonU64(BigInt(clock * 1e6)),
        deviceEpoch: probes === 1 ? 1 : 2,
        timeSamples: jsonU64(0n),
        sampleRate: 48000,
      }
    },
  })
  expect(mapping).toBeNull()
  expect(probes).toBe(4)
  const ns = 9007199254740993n
  expect(nativeMilliseconds(ns)).toBe(Number(ns / 1000000n) + Number(ns % 1000000n) / 1000000)
})

it("discards a partial calibration when the graph becomes unprepared", async () => {
  let calls = 0
  let clock = 100
  const mapping = await measureMeterClock({
    now: () => clock,
    active: () => true,
    async probe() {
      calls++
      clock += 2
      return calls === 2
        ? null
        : {
            monotonicNs: jsonU64(1000000n),
            deviceEpoch: 1,
            timeSamples: jsonU64(256n),
            sampleRate: 48000,
          }
    },
  })
  expect(mapping).toBeNull()
  expect(calls).toBe(2)
})
