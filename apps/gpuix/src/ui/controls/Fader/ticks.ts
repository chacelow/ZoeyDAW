import { meterPosition } from "../LevelMeter/scale"
import type { MeterScale } from "../LevelMeter/scale"

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
    scale,
  }: {
    readonly min: number
    readonly max: number
    readonly travel: number
    readonly lineHeight: number
    readonly scale: MeterScale
  }
): readonly FaderTick[] {
  const positioned = ticks
    .filter(tick => tick.value >= min && tick.value <= max)
    .map((tick, index) => ({
      tick,
      index,
      top: meterPosition(tick.value, scale) * travel,
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
