import type { Position } from "../../model/types"
import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"

export interface MetronomePhase {
  readonly side: -1 | 0 | 1
  readonly swing: number
}

export function metronomePhase(
  position: Position,
  numerator: number,
  playing: boolean,
  enabled: boolean
): MetronomePhase {
  if (!playing || !enabled) return { side: 0, swing: 0 }
  const ordinal = (position.bar - 1) * numerator + position.beat - 1
  const side = Math.floor(ordinal) % 2 === 0 ? -1 : 1
  const fraction = Math.max(0, Math.min(1, (position.sixteenth - 1) / 4))
  return { side, swing: side * (1 - 2 * fraction) }
}

export function tappedTempo(
  taps: readonly number[],
  now: number,
  policy: typeof PREFERENCE_DEFAULTS.transport = PREFERENCE_DEFAULTS.transport
): { taps: number[]; bpm: number | null } {
  const next = [...taps.filter(time => now - time < policy.tapWindowMs), now].slice(
    -policy.tapSamples
  )
  const first = next[0]
  if (next.length < 2 || first === undefined || now <= first) return { taps: next, bpm: null }
  // Milliseconds per minute is a unit conversion, not an editor preference.
  return { taps: next, bpm: (60_000 * (next.length - 1)) / (now - first) }
}
