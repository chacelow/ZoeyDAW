import type { Position } from "../../model/types"

export function metronomePhase(
  position: Position,
  numerator: number,
  playing: boolean,
  enabled: boolean
): { side: -1 | 0 | 1; swing: number } {
  if (!playing || !enabled) return { side: 0, swing: 0 }
  const ordinal = (position.bar - 1) * numerator + position.beat - 1
  const side = Math.floor(ordinal) % 2 === 0 ? -1 : 1
  const fraction = Math.max(0, Math.min(1, (position.sixteenth - 1) / 4))
  return { side, swing: side * (1 - 2 * fraction) }
}

export function tappedTempo(
  taps: readonly number[],
  now: number
): { taps: number[]; bpm: number | null } {
  const next = [...taps.filter(time => now - time < 2500), now].slice(-5)
  const first = next[0]
  if (next.length < 2 || first === undefined || now <= first) return { taps: next, bpm: null }
  return { taps: next, bpm: (60_000 * (next.length - 1)) / (now - first) }
}

export function formatSampleTime(frame: number, sampleRate: number): string {
  const millis = Math.floor((frame / sampleRate) * 1000)
  const seconds = Math.floor(millis / 1000)
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.${String(millis % 1000).padStart(3, "0")}`
}
