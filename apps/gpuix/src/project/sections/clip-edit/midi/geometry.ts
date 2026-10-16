/** MIDI protocol defines 128 pitches, numbered 0–127; rows run highest first. */
export const ALL_PITCHES: readonly number[] = Array.from({ length: 128 }, (_, row) => 127 - row)

const BLACK_KEYS = new Set([1, 3, 6, 8, 10])

// Black-key classes repeat every octave in 12-tone equal temperament.
export function isBlackKey(pitch: number): boolean {
  return BLACK_KEYS.has(pitch % 12)
}
