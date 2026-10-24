export const KEY_WIDTH = 58
export const RULER_HEIGHT = 40
export const VELOCITY_HEIGHT = 68
export const ALL_PITCHES = Array.from({ length: 128 }, (_, row) => 127 - row)

export function pitchName(pitch: number): string {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 2}`
}

export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitch % 12)
}

export function pitchAt(y: number, height: number, pitches: readonly number[]): number {
  const row = Math.max(0, Math.min(pitches.length - 1, Math.floor((y / height) * pitches.length)))
  return pitches[row] ?? 60
}
