import { fadeGainAt } from "./fades"
import { sourceWaveformIntervals } from "./waveform-source"
import type { AudioWarpMarker } from "./audio-editor/warp-map"

export interface PeakEnvelopeFade {
  readonly start: number
  readonly end: number
  readonly position: number
  readonly curve: number
  readonly direction: "in" | "out"
}

export interface PeakEnvelope {
  readonly peaks: readonly number[]
  readonly start: number
  readonly span: number
  readonly reverse?: boolean
  readonly gain?: number
  readonly window?: { readonly start: number; readonly end: number }
  readonly loop?: { readonly start: number; readonly end: number }
  /** Clip fades in source-bar coordinates, applied so the drawing matches rendered gain. */
  readonly fades?: readonly PeakEnvelopeFade[]
  readonly warpMarkers?: readonly AudioWarpMarker[]
}

/**
Gain contributed by the envelope's fades at a source-bar coordinate. Uses the same
curve definition as the native envelope, so drawing and audio cannot diverge.
*/
export function envelopeFadeGain(envelope: PeakEnvelope, coordinate: number): number {
  const fades = envelope.fades
  if (!fades?.length) return 1
  let gain = 1
  for (const fade of fades) {
    if (fade.end <= fade.start) continue
    if (coordinate <= fade.start) {
      if (fade.direction === "in") gain = 0
      continue
    }
    if (coordinate >= fade.end) {
      if (fade.direction === "out") gain = 0
      continue
    }
    const progress = (coordinate - fade.start) / (fade.end - fade.start)
    const shaped = fadeGainAt(progress, fade.position, fade.curve)
    gain *= fade.direction === "in" ? shaped : 1 - shaped
  }
  return gain
}

const peakTrees = new WeakMap<readonly number[], Float64Array>()

function peakMaximum(peaks: readonly number[], first: number, end: number): number {
  let tree = peakTrees.get(peaks)
  if (!tree) {
    tree = new Float64Array(peaks.length * 2)
    for (let index = 0; index < peaks.length; index++) {
      tree[peaks.length + index] = Math.abs(peaks[index])
    }
    for (let index = peaks.length - 1; index > 0; index--) {
      tree[index] = Math.max(tree[index * 2], tree[index * 2 + 1])
    }
    peakTrees.set(peaks, tree)
  }
  let maximum = 0
  for (let left = first + peaks.length, right = end + peaks.length; left < right;) {
    if (left % 2) maximum = Math.max(maximum, tree[left++])
    if (right % 2) maximum = Math.max(maximum, tree[--right])
    left = Math.floor(left / 2)
    right = Math.floor(right / 2)
  }
  return maximum
}

/** Each source bin is a real absolute peak over an interval, not a PCM sample. */
export function samplePeakEnvelope(envelope: PeakEnvelope, from: number, through: number): number {
  if (!envelope.peaks.length || envelope.span <= 0 || through <= from) return 0
  let maximum = 0
  for (const [start, end] of sourceWaveformIntervals(envelope, from, through)) {
    maximum = Math.max(
      maximum,
      peakMaximum(
        envelope.peaks,
        Math.max(0, Math.floor(start * envelope.peaks.length)),
        Math.min(envelope.peaks.length, Math.ceil(end * envelope.peaks.length))
      )
    )
  }
  return Math.min(1, maximum * (envelope.gain ?? 1))
}

export function samplePeakColumns(
  envelope: PeakEnvelope,
  from: number,
  through: number,
  width: number,
  visibleStart = 0,
  visibleEnd = width
): { start: number; end: number; values: Float64Array } {
  const start = Math.max(0, Math.floor(visibleStart))
  const end = Math.max(start, Math.min(Math.ceil(width), Math.ceil(visibleEnd)))
  const values = new Float64Array(width > 0 && through > from ? end - start : 0)
  for (let index = 0; index < values.length; index++) {
    const x = start + index
    values[index] = samplePeakEnvelope(
      envelope,
      from + (x / width) * (through - from),
      from + (Math.min(x + 1, width) / width) * (through - from)
    )
  }
  return { start, end, values }
}

/** A filled step envelope preserves bin bounds without inventing interpolated samples. */
export function peakEnvelopePath(
  envelope: PeakEnvelope,
  from: number,
  through: number,
  width: number,
  amplitude: number
): string {
  const { values } = samplePeakColumns(envelope, from, through, width)
  if (!values.length) return ""
  const x = (index: number) => from + (Math.min(index, width) / width) * (through - from)
  let path = `M${from},${50 - values[0] * amplitude}`
  for (let index = 0; index < values.length; index++) {
    path += `L${x(index)},${50 - values[index] * amplitude}H${x(index + 1)}`
  }
  path += `V${50 + values[values.length - 1] * amplitude}`
  for (let index = values.length - 1; index >= 0; index--) {
    path += `L${x(index + 1)},${50 + values[index] * amplitude}H${x(index)}`
  }
  return `${path}Z`
}
