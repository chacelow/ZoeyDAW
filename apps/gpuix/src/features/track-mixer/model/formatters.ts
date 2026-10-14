/**
 * Pure display formatters for the mixer's numeric drag controls. Mirrors
 * `apps/web/src/pages/project/sections/.../TrackMixer`'s `formatDb` and
 * `packages/ui/src/controls/PanControl`'s pan formatter so the two surfaces
 * read the same units, without sharing the DOM-only `DragPad*` component.
 */

export const VOLUME_MIN_DB = -60
export const VOLUME_MAX_DB = 6

export function formatVolumeDb(db: number): string {
  return db <= VOLUME_MIN_DB ? "\u2212\u221e" : db.toFixed(1)
}

export function normalizeVolume(db: number): number {
  const clamped = Math.min(VOLUME_MAX_DB, Math.max(VOLUME_MIN_DB, db))
  return (clamped - VOLUME_MIN_DB) / (VOLUME_MAX_DB - VOLUME_MIN_DB)
}

export const PAN_MIN = -1
export const PAN_MAX = 1

export function formatPan(pan: number): string {
  if (pan === 0) {
    return "C"
  }
  return `${pan < 0 ? "L" : "R"}${Math.round(Math.abs(pan) * 100)}`
}
