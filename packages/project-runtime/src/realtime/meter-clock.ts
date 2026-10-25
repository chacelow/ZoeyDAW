import type { ClockProbe } from "@zoeydaw/project-core/realtime"

export interface MeterClockMapping {
  readonly deviceEpoch: number
  readonly offsetMs: number
  readonly uncertaintyMs: number
}

export function nativeMilliseconds(ns: bigint) {
  return Number(ns / 1_000_000n) + Number(ns % 1_000_000n) / 1_000_000
}

export async function measureMeterClock(options: {
  probe: () => Promise<ClockProbe | null>
  now: () => number
  active: () => boolean
}): Promise<MeterClockMapping | null> {
  let best: MeterClockMapping | null = null
  async function sample(remaining: number): Promise<void> {
    if (remaining === 0 || !options.active()) return
    const sent = options.now()
    const probe = await options.probe()
    const received = options.now()
    if (!options.active()) return
    if (!probe) {
      best = null
      return
    }
    if (!Number.isFinite(sent) || !Number.isFinite(received) || received < sent)
      throw new Error("Meter clock requires monotonic milliseconds")
    const candidate = {
      deviceEpoch: probe.deviceEpoch,
      offsetMs: (sent + received) / 2 - nativeMilliseconds(BigInt(probe.monotonicNs)),
      uncertaintyMs: (received - sent) / 2,
    }
    if (best && best.deviceEpoch !== candidate.deviceEpoch) best = null
    if (!best || candidate.uncertaintyMs < best.uncertaintyMs) best = candidate
    await sample(remaining - 1)
  }
  await sample(5)
  return options.active() ? best : null
}
