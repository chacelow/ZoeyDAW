import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { meterDb } from "./meter-peak"

export interface MeterRms {
  db: number
  power: number
  updatedAt: number | null
}

export function createMeterRms(policy: ArrangementPolicy["meter"]): MeterRms {
  return { db: policy.minDb, power: 0, updatedAt: null }
}

export function advanceMeterRms(
  rms: MeterRms,
  levelDb: number,
  now: number,
  policy: ArrangementPolicy["meter"]
): void {
  const level = meterDb(levelDb, policy)
  const power = level <= policy.minDb ? 0 : 10 ** (level / 10)
  const alpha =
    rms.updatedAt === null
      ? 1
      : -Math.expm1(-Math.max(0, now - rms.updatedAt) / policy.rmsIntegrationMs)
  rms.power += alpha * (power - rms.power)
  rms.db = rms.power > 0 ? meterDb(10 * Math.log10(rms.power), policy) : policy.minDb
  if (rms.db <= policy.minDb) rms.power = 0
  rms.updatedAt = now
}
