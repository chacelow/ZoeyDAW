import type { PeakEnvelope } from "./waveform"

export function sourceWaveformIntervals(
  envelope: PeakEnvelope,
  from: number,
  through: number
): readonly (readonly [number, number])[] {
  if (through <= from || envelope.span <= 0) return []
  const loop = envelope.loop
  const intervals: [number, number][] = []
  if (loop && loop.end > loop.start) {
    const period = loop.end - loop.start
    if (through - from >= period) intervals.push([loop.start, loop.end])
    else {
      const start = loop.start + ((((from - loop.start) % period) + period) % period)
      const end = start + through - from
      intervals.push([start, Math.min(end, loop.end)])
      if (end > loop.end) intervals.push([loop.start, loop.start + end - loop.end])
    }
  } else {
    intervals.push([
      Math.max(from, envelope.window?.start ?? -Infinity),
      Math.min(through, envelope.window?.end ?? Infinity),
    ])
  }
  const result: [number, number][] = []
  for (const [from, through] of intervals) {
    const start = Math.max(0, Math.min(1, (from - envelope.start) / envelope.span))
    const end = Math.max(0, Math.min(1, (through - envelope.start) / envelope.span))
    if (end > start) result.push(envelope.reverse ? [1 - end, 1 - start] : [start, end])
  }
  return result
}

export function sourceWaveformPosition(envelope: PeakEnvelope, position: number): number | null {
  const loop = envelope.loop
  if (loop && loop.end > loop.start) {
    const period = loop.end - loop.start
    position = loop.start + ((((position - loop.start) % period) + period) % period)
  } else if (
    position < (envelope.window?.start ?? -Infinity) ||
    position >= (envelope.window?.end ?? Infinity)
  ) {
    return null
  }
  const fraction = (position - envelope.start) / envelope.span
  if (fraction < 0 || fraction >= 1) return null
  return envelope.reverse ? 1 - fraction : fraction
}
