export interface FaderTick {
  readonly value: number
  readonly label: string
}

export function visibleFaderTicks(
  ticks: readonly FaderTick[],
  {
    min,
    max,
    travel,
    lineHeight,
  }: {
    readonly min: number
    readonly max: number
    readonly travel: number
    readonly lineHeight: number
  }
): readonly FaderTick[] {
  const positioned = ticks.map((tick, index) => ({
    tick,
    index,
    top:
      (1 - (max === min ? 0 : Math.max(0, Math.min(1, (tick.value - min) / (max - min))))) * travel,
  }))
  const zero = positioned.find(entry => entry.tick.value === 0)
  const visible = zero ? [zero] : []
  for (const candidate of [...positioned].sort((a, b) => a.top - b.top)) {
    if (candidate === zero) continue
    if (visible.every(entry => Math.abs(entry.top - candidate.top) >= lineHeight))
      visible.push(candidate)
  }
  return visible.sort((a, b) => a.index - b.index).map(entry => entry.tick)
}
