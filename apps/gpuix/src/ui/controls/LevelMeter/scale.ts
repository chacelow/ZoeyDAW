import type { DesignDetails } from "@/shared/theme/design-details"

export type MeterScale = DesignDetails["editor"]["meter"]["scale"]

/** Positions run from the top (+6 dB) to the bottom (silence). */
export function meterPosition(db: number, scale: MeterScale): number {
  const first = scale[0]
  if (!first) return 1
  if (db >= first.db) return first.position
  for (let index = 1; index < scale.length; index++) {
    const upper = scale[index - 1]
    const lower = scale[index]
    if (upper && lower && db >= lower.db)
      return (
        upper.position +
        ((upper.db - db) / (upper.db - lower.db)) * (lower.position - upper.position)
      )
  }
  return scale[scale.length - 1]?.position ?? 1
}

export function meterDbAtPosition(position: number, scale: MeterScale): number {
  const first = scale[0]
  if (!first) return -Infinity
  if (position <= first.position) return first.db
  for (let index = 1; index < scale.length; index++) {
    const upper = scale[index - 1]
    const lower = scale[index]
    if (upper && lower && position <= lower.position)
      return (
        upper.db +
        ((position - upper.position) / (lower.position - upper.position)) * (lower.db - upper.db)
      )
  }
  return scale[scale.length - 1]?.db ?? -Infinity
}
