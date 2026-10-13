export const METER_MIN_DB = -60
export const METER_MAX_DB = 6
const HOLD_MS = 600
const FALL_DB_PER_SECOND = 24

export interface MeterPeak {
  db: number
  holdUntil: number
  updatedAt: number
}

export function createMeterPeak(): MeterPeak {
  return { db: METER_MIN_DB, holdUntil: 0, updatedAt: 0 }
}

export function meterDb(db: number): number {
  return Number.isNaN(db) ? METER_MIN_DB : Math.max(METER_MIN_DB, Math.min(METER_MAX_DB, db))
}

export function advanceMeterPeak(peak: MeterPeak, db: number, now: number): void {
  const level = meterDb(db)
  if (level >= peak.db && level > METER_MIN_DB) {
    peak.db = level
    peak.holdUntil = now + HOLD_MS
  } else {
    const elapsed = Math.max(0, now - Math.max(peak.updatedAt, peak.holdUntil))
    peak.db = Math.max(level, peak.db - (elapsed * FALL_DB_PER_SECOND) / 1000)
  }
  peak.updatedAt = now
}
