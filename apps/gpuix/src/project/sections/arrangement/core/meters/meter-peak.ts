import type { ArrangementPolicy } from "@/project/defaults/arrangement"

export interface MeterPeak {
  db: number
  holdUntil: number
  updatedAt: number
}

export function createMeterPeak(policy: ArrangementPolicy["meter"]): MeterPeak {
  return { db: policy.minDb, holdUntil: 0, updatedAt: 0 }
}

export function meterDb(levelDb: number, policy: ArrangementPolicy["meter"]): number {
  return Number.isNaN(levelDb)
    ? policy.minDb
    : Math.max(policy.minDb, Math.min(policy.maxDb, levelDb))
}

export function advanceMeterPeak(
  peak: MeterPeak,
  levelDb: number,
  now: number,
  policy: ArrangementPolicy["meter"]
): void {
  const level = meterDb(levelDb, policy)
  if (level >= peak.db && level > policy.minDb) {
    peak.db = level
    peak.holdUntil = now + policy.holdMs
  } else {
    const elapsed = Math.max(0, now - Math.max(peak.updatedAt, peak.holdUntil))
    // Milliseconds-to-seconds conversion is a time-unit constant, not a meter preference.
    peak.db = Math.max(level, peak.db - (elapsed * policy.fallDbPerSecond) / 1000)
  }
  peak.updatedAt = now
}
