export function clampBar(bar: number, endBar: number): number {
  return Math.min(endBar, Math.max(1, bar))
}

export function snapBar(
  bar: number,
  enabled: boolean,
  cellBars: number,
  endBar: number,
  bypass = false
): number {
  const bounded = clampBar(bar, endBar)
  return enabled && !bypass
    ? clampBar(1 + Math.round((bounded - 1) / cellBars) * cellBars, endBar)
    : bounded
}
