import type { WaveformRange } from "./waveform-range"
import { envelopeFadeGain, type PeakEnvelope } from "./waveform"
import { interpolateWaveform } from "./waveform-interpolation"
import { waveformContour } from "./waveform-polygon"
import { waveformPeakBase, waveformPeakValue } from "./waveform-half"

export interface WaveformChannelPath {
  readonly kind: "samples" | "envelope"
  readonly path: string
  readonly markers: string
}

type Point = { frame: number; min: number; max: number }
type Run = { from: number; through: number; sourceFrom: number; sourceThrough: number }

type ProjectedPoint = { x: number; high: number; low: number }

function clipPoints(
  points: readonly ProjectedPoint[],
  left: number,
  right: number
): ProjectedPoint[] {
  const clipped: ProjectedPoint[] = []
  const crossing = (a: ProjectedPoint, b: ProjectedPoint, x: number): ProjectedPoint => {
    const t = (x - a.x) / (b.x - a.x)
    return { x, high: a.high + (b.high - a.high) * t, low: a.low + (b.low - a.low) * t }
  }
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    const previous = points[index - 1]
    if (previous && previous.x < left && point.x >= left)
      clipped.push(crossing(previous, point, left))
    if (point.x >= left && point.x <= right) clipped.push(point)
    if (previous && previous.x <= right && point.x > right) {
      clipped.push(crossing(previous, point, right))
      break
    }
  }
  return clipped
}

function visibleRuns(envelope: PeakEnvelope, from: number, through: number): Run[] {
  const result: Run[] = []
  const loop = envelope.loop
  let position = from
  while (position < through) {
    let sourceFrom: number
    let end: number
    if (loop && loop.end > loop.start) {
      const period = loop.end - loop.start
      sourceFrom = loop.start + ((((position - loop.start) % period) + period) % period)
      end = Math.min(through, position + loop.end - sourceFrom)
    } else {
      sourceFrom = Math.max(position, envelope.window?.start ?? -Infinity)
      position = sourceFrom
      end = Math.min(through, envelope.window?.end ?? Infinity)
    }
    const sourceEnd = Math.min(sourceFrom + end - position, envelope.start + envelope.span)
    const clippedStart = Math.max(envelope.start, sourceFrom)
    if (sourceEnd > clippedStart) {
      const a = (clippedStart - envelope.start) / envelope.span
      const b = (sourceEnd - envelope.start) / envelope.span
      result.push({
        from: position + clippedStart - sourceFrom,
        through: position + sourceEnd - sourceFrom,
        sourceFrom: envelope.reverse ? 1 - a : a,
        sourceThrough: envelope.reverse ? 1 - b : b,
      })
    }
    if (end <= position || !loop) break
    position = end
  }
  return result
}

function rawSample(
  ranges: readonly WaveformRange[],
  channel: number,
  frame: number,
  totalFrames: number
): number | null {
  if (frame < 0 || frame >= totalFrames) return 0
  for (const range of ranges) {
    if (
      range.kind !== "samples" ||
      frame < range.startFrame ||
      frame >= range.startFrame + range.frameCount
    )
      continue
    return range.channels[channel]?.[frame - range.startFrame] ?? null
  }
  return null
}

function extrema(
  ranges: readonly WaveformRange[],
  channel: number,
  first: number,
  end: number,
  totalFrames: number
): readonly [number, number] | null {
  if (end <= 0 || first >= totalFrames) return [0, 0]
  let min = Infinity
  let max = -Infinity
  let cursor = Math.max(0, first)
  const limit = Math.min(totalFrames, end)
  while (cursor < limit) {
    let best: WaveformRange | null = null
    let size = Infinity
    for (const range of ranges) {
      const step = range.kind === "samples" ? 1 : range.framesPerBin
      if (
        range.startFrame <= cursor &&
        range.startFrame + range.frameCount > cursor &&
        step <= end - first &&
        step < size &&
        channel < range.channels.length
      ) {
        best = range
        size = step
      }
    }
    if (!best) return null
    const index = Math.floor((cursor - best.startFrame) / size)
    if (best.kind === "samples") {
      const value = best.channels[channel][index]
      min = Math.min(min, value)
      max = Math.max(max, value)
    } else {
      min = Math.min(min, best.channels[channel].min[index])
      max = Math.max(max, best.channels[channel].max[index])
    }
    cursor = Math.min(limit, best.startFrame + (index + 1) * size)
  }
  return [min, max]
}

function envelopePoints(
  ranges: readonly WaveformRange[],
  channel: number,
  first: number,
  end: number,
  totalFrames: number,
  samplesPerPixel: number
): Point[][] {
  const level = Math.log2(samplesPerPixel)
  const exponent = Math.floor(level)
  const size = 2 ** exponent
  const alpha = Math.fround(level - exponent)
  const center = (size - 1) / 2
  const startBin = 2 * Math.floor((first - center) / (2 * size))
  const endBin = 2 * Math.ceil((end - center) / (2 * size)) + 2
  const runs: Point[][] = []
  let points: Point[] = []
  for (let bin = startBin; bin < endBin; bin += 2) {
    const quantize = size >= waveformPeakBase(totalFrames) ? waveformPeakValue : Math.fround
    const rawA = extrema(ranges, channel, bin * size, (bin + 1) * size, totalFrames)
    const rawB = extrema(ranges, channel, (bin + 1) * size, (bin + 2) * size, totalFrames)
    const a = rawA ? [quantize(rawA[0]), quantize(rawA[1])] : null
    const b = rawB ? [quantize(rawB[0]), quantize(rawB[1])] : null
    if (!a || !b) {
      if (points.length) runs.push(points)
      points = []
      continue
    }
    const min = Math.min(a[0], b[0])
    const max = Math.max(a[1], b[1])
    const midpoint = center + (bin + 0.5) * size
    for (const [index, value] of [a, b].entries()) {
      const frame = center + (bin + index) * size
      points.push({
        frame: frame + alpha * (midpoint - frame),
        min: Math.fround(value[0] + alpha * (min - value[0])),
        max: Math.fround(value[1] + alpha * (max - value[1])),
      })
    }
  }
  if (points.length) runs.push(points)
  return runs
}

export function signedWaveformPaths(
  envelope: PeakEnvelope,
  ranges: readonly WaveformRange[],
  totalFrames: number,
  from: number,
  through: number,
  width: number,
  height: number
): WaveformChannelPath[] {
  if (!ranges.length || width <= 0 || height <= 0 || through <= from || envelope.span <= 0)
    return []
  const channels = ranges[0].channels.length
  const samplesPerPixel = ((through - from) * totalFrames) / (envelope.span * width)
  const kind = samplesPerPixel <= 1 ? "samples" : "envelope"
  const sourceRuns = visibleRuns(envelope, from, through)
  const result: WaveformChannelPath[] = []
  const ordinaryHeight = Math.floor(height / channels)
  for (let channel = 0; channel < channels; channel++) {
    const top = channel * ordinaryHeight
    const bottom = channel === channels - 1 ? height : top + ordinaryHeight
    const channelHeight = bottom - top
    const center =
      top + (channelHeight < 3 ? channelHeight / 2 : Math.floor(channelHeight / 2) + 0.5)
    const radius = Math.max(0, Math.min(center - top - 0.5, bottom - 0.5 - center))
    const gain = envelope.gain ?? 1
    let path = ""
    let markers = ""
    for (const run of sourceRuns) {
      const a = Math.min(run.sourceFrom, run.sourceThrough) * totalFrames
      const b = Math.max(run.sourceFrom, run.sourceThrough) * totalFrames
      let pointRuns: Point[][]
      if (kind === "samples") {
        const interpolated = interpolateWaveform(a, b, samplesPerPixel, frame =>
          rawSample(ranges, channel, frame, totalFrames)
        )
        pointRuns = interpolated
          ? [
              Array.from(interpolated.frames, (frame, index) => ({
                frame,
                min: interpolated.values[index],
                max: interpolated.values[index],
              })),
            ]
          : []
      } else pointRuns = envelopePoints(ranges, channel, a, b, totalFrames, samplesPerPixel)
      const project = (point: Point) => {
        const fraction =
          (point.frame / totalFrames - run.sourceFrom) / (run.sourceThrough - run.sourceFrom)
        const coordinate = run.from + fraction * (run.through - run.from)
        const x = ((coordinate - from) * width) / (through - from)
        const amplitude = radius * gain * envelopeFadeGain(envelope, coordinate)
        return {
          x,
          high: Math.max(top - 0.5, Math.min(bottom + 0.5, center - point.max * amplitude)),
          low: Math.max(top - 0.5, Math.min(bottom + 0.5, center - point.min * amplitude)),
        }
      }
      for (const points of pointRuns) {
        if (!points.length) continue
        const ordered = run.sourceFrom > run.sourceThrough ? [...points].reverse() : points
        const projected = clipPoints(
          ordered.map(project),
          Math.max(0, ((run.from - from) * width) / (through - from)),
          Math.min(width, ((run.through - from) * width) / (through - from))
        )
        path += waveformContour(
          projected.map(point => ({ x: point.x, y: point.high })),
          projected.map(point => ({ x: point.x, y: point.low }))
        )
      }
      if (samplesPerPixel <= 1 / 8) {
        for (let frame = Math.ceil(a); frame <= Math.floor(b); frame++) {
          const value = rawSample(ranges, channel, frame, totalFrames)
          if (value === null || frame >= totalFrames) continue
          const point = project({ frame, min: value, max: value })
          if (point.x < 0 || point.x > width) continue
          markers += `M${point.x - 1},${point.high - 1}h2v2h-2Z`
        }
      }
    }
    if (path) result.push({ kind, path, markers })
  }
  return result
}
