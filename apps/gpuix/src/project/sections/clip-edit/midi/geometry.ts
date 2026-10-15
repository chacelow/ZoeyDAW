/** Rows top to bottom: pitch 127 first, pitch 0 last. */
export const ALL_PITCHES: readonly number[] = Array.from({ length: 128 }, (_, row) => 127 - row)

const PITCH_CLASSES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
const BLACK_KEYS = new Set([1, 3, 6, 8, 10])

/** Live/Web octave numbering: MIDI 60 is C3. */
export function pitchName(pitch: number): string {
  return `${PITCH_CLASSES[pitch % 12]}${Math.floor(pitch / 12) - 2}`
}

export function isBlackKey(pitch: number): boolean {
  return BLACK_KEYS.has(pitch % 12)
}

/** The piano roll draws, hits and moves notes on one sixteenth-note grid. */
export const NOTE_GRID_BEATS = 0.25
