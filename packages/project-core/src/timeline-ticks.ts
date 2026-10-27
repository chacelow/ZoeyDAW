import { secondsAtBar, barAtSeconds, tempoAtBar } from "./tempo-map"
import type { TempoTimebase } from "./tempo-map"
export interface RulerTick {
  value: number
  left: number
}

interface VisibleBars {
  bars: number
  visibleStartBar: number
  visibleEndBar: number
  pxPerBar: number
}

const MAX_TICKS = 256

function visibleRange({ bars, visibleStartBar, visibleEndBar, pxPerBar }: VisibleBars) {
  if (
    !Number.isFinite(bars) ||
    !Number.isFinite(visibleStartBar) ||
    !Number.isFinite(visibleEndBar) ||
    !Number.isFinite(pxPerBar) ||
    bars <= 0 ||
    pxPerBar <= 0
  ) {
    return null
  }
  const start = Math.max(1, Math.min(bars + 1, visibleStartBar))
  const end = Math.max(start, Math.min(bars + 1, visibleEndBar))
  return Number.isFinite(end) ? { start, end } : null
}

function powerOfTwoAtLeast(value: number): number {
  const step = 2 ** Math.ceil(Math.log2(Math.max(1, value)))
  return Number.isFinite(step) ? step : value
}

function niceSecondsAtLeast(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value))
  for (const multiple of [1, 2, 5, 10]) {
    const step = multiple * power
    if (step >= value && Number.isFinite(step)) {
      return step
    }
  }
  return value
}

/**
Ruler values are absolute musical bar numbers; x coordinates share the clip axis.
*/
export function musicalTicks(input: VisibleBars): RulerTick[] {
  const range = visibleRange(input)
  if (!range || range.start >= range.end) {
    return []
  }
  const span = range.end - range.start
  const step = powerOfTwoAtLeast(Math.max(56 / input.pxPerBar, span / (MAX_TICKS - 1)))
  const first = 1 + Math.ceil((range.start - 1) / step) * step
  const ticks: RulerTick[] = []
  for (let index = 0; index < MAX_TICKS; index++) {
    const value = first + index * step
    if (
      !Number.isFinite(value) ||
      value >= range.end ||
      (index && value <= ticks[index - 1].value)
    ) {
      break
    }
    const left = (value - 1) * input.pxPerBar
    if (!Number.isFinite(left)) {
      break
    }
    ticks.push({ value, left })
  }
  return ticks
}

/**
Time ticks use actual beat duration (quarter note = 60 / BPM seconds).
*/
export function timeTicks(input: VisibleBars & TempoTimebase): RulerTick[] {
  const range = visibleRange(input)
  if (!range || range.start >= range.end) {
    return []
  }
  const secondsPerBar =
    (60 / tempoAtBar(input, range.start)) * input.numerator * (4 / input.denominator)
  if (!Number.isFinite(secondsPerBar) || secondsPerBar <= 0) {
    return []
  }
  const pixelsPerSecond = input.pxPerBar / secondsPerBar
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
    return []
  }
  const secondsSpan = secondsAtBar(input, range.end) - secondsAtBar(input, range.start)
  if (!Number.isFinite(secondsSpan)) {
    return []
  }
  const step = niceSecondsAtLeast(Math.max(64 / pixelsPerSecond, secondsSpan / (MAX_TICKS - 1)))
  const startSeconds = secondsAtBar(input, range.start)
  const first = Math.ceil(startSeconds / step) * step
  const ticks: RulerTick[] = []
  for (let index = 0; index < MAX_TICKS; index++) {
    const value = first + index * step
    if (!Number.isFinite(value) || (index && value <= ticks[index - 1].value)) {
      break
    }
    const bar = barAtSeconds(input, value)
    if (!Number.isFinite(bar) || bar >= range.end) {
      break
    }
    const left = (bar - 1) * input.pxPerBar
    if (!Number.isFinite(left)) {
      break
    }
    ticks.push({ value, left })
  }
  return ticks
}

export function timeTickLabel(seconds: number): string {
  if (seconds >= Number.MAX_SAFE_INTEGER / 1000) {
    return `${seconds.toExponential(2)}s`
  }
  const milliseconds = Math.round(seconds * 1000)
  const minutes = Math.floor(milliseconds / 60_000)
  const remainder = Math.floor((milliseconds % 60_000) / 1000)
  const fraction = milliseconds % 1000
  const label = `${minutes}:${String(remainder).padStart(2, "0")}`
  return fraction ? `${label}.${String(fraction).padStart(3, "0")}` : label
}
