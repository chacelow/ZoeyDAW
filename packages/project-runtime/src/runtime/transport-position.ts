import type { Position } from "@zoeydaw/project-core/types"

export function positionAtBar(bar: number, numerator: number): Position {
  const beats = (Math.max(1, bar) - 1) * numerator
  const whole = Math.floor(beats)
  return {
    bar: Math.floor(whole / numerator) + 1,
    beat: (whole % numerator) + 1,
    sixteenth: 1 + (beats - whole) * 4,
  }
}
