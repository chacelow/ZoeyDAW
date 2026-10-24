import type { AudioClip } from "./types"

export const DEFAULT_FADE_CURVE = 0.35
export const FADE_CURVE_VERTICAL_SCALE = 0.4

export const clampFadeCurve = (curve: number): number => Math.max(-1, Math.min(1, curve))

export const clampFadeCurvePosition = (position: number): number =>
  Math.max(0.1, Math.min(0.9, position))

export const fadeCurveProgress = (curve: number): number =>
  0.5 + clampFadeCurve(curve) * FADE_CURVE_VERTICAL_SCALE

/**
The gain a fade applies at normalized progress `x` in 0..1. This is the single
definition shared by the drawn curve and the native envelope, so the picture and
the rendered level can never disagree.
*/
export function fadeGainAt(x: number, position: number, curve: number): number {
  const progress = Math.max(0, Math.min(1, x))
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  const anchorX = clampFadeCurvePosition(position)
  const anchorY = fadeCurveProgress(curve)
  const ratio = anchorX / (1 - anchorX)
  const weight = (ratio * ratio * (1 - anchorY)) / anchorY
  const square = progress * progress
  return square / (square + weight * (1 - progress) * (1 - progress))
}

export interface FadeBezierSegment {
  control1: { x: number; y: number }
  control2: { x: number; y: number }
  end: { x: number; y: number }
}

/**
A single smooth gain curve passes through the anchor; cubic spans approximate it within 0.2px.
*/
export function fadeBezierSegments(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  position: number,
  curve: number
): FadeBezierSegment[] {
  const anchorX = clampFadeCurvePosition(position)
  const anchorY = fadeCurveProgress(curve)
  const ratio = anchorX / (1 - anchorX)
  const weight = (ratio * ratio * (1 - anchorY)) / anchorY
  const value = (x: number) => {
    const square = x * x
    return square / (square + weight * (1 - x) * (1 - x))
  }
  const slope = (x: number) => {
    const denominator = x * x + weight * (1 - x) * (1 - x)
    return (2 * weight * x * (1 - x)) / (denominator * denominator)
  }
  const segments: FadeBezierSegment[] = []
  const append = (left: number, right: number, depth: number) => {
    const a = value(left)
    const b = value(right)
    const span = right - left
    const c1 = a + (slope(left) * span) / 3
    const c2 = b - (slope(right) * span) / 3
    const cubic = (t: number) =>
      (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * b
    const error =
      Math.max(
        Math.abs(cubic(1 / 3) - value(left + span / 3)),
        Math.abs(cubic(2 / 3) - value(left + (span * 2) / 3))
      ) * Math.abs(y1 - y0)
    if (depth < 10 && (error > 0.2 || c1 > c2 || c1 < a || c2 > b)) {
      const middle = (left + right) / 2
      append(left, middle, depth + 1)
      append(middle, right, depth + 1)
      return
    }
    segments.push({
      control1: { x: x0 + (left + span / 3) * (x1 - x0), y: y0 + c1 * (y1 - y0) },
      control2: { x: x0 + (right - span / 3) * (x1 - x0), y: y0 + c2 * (y1 - y0) },
      end: { x: x0 + right * (x1 - x0), y: y0 + b * (y1 - y0) },
    })
  }
  append(0, anchorX, 0)
  append(anchorX, 1, 0)
  return segments
}

export function fadePath(
  edge: "in" | "out",
  start: number,
  length: number,
  curve: number,
  position = 0.5
): string {
  const y0 = edge === "in" ? 100 : 0
  const y1 = edge === "in" ? 0 : 100
  const segments = fadeBezierSegments(start, y0, start + length, y1, position, curve)
  return `M ${start} ${y0} ${segments.map(({ control1: a, control2: b, end }) => `C ${a.x} ${a.y}, ${b.x} ${b.y}, ${end.x} ${end.y}`).join(" ")}`
}

/**
Quiet boundary and full-level peak in visible clip bars.
*/
export function fadeControls(clip: AudioClip, edge: "in" | "out"): { start: number; end: number } {
  if (edge === "in") {
    const start = clip.fadeInOffsetBars ?? 0
    return { start, end: start + (clip.fadeInBars ?? 0) }
  }
  const end = clip.lengthBars - (clip.fadeOutOffsetBars ?? 0)
  return { start: end - (clip.fadeOutBars ?? 0), end }
}

/**
Keep both attenuation intervals inside the visible window without overlap.
*/
export function clampFadeIntervals(clip: AudioClip): AudioClip {
  const fadeInOffsetBars = Math.max(0, Math.min(clip.lengthBars, clip.fadeInOffsetBars ?? 0))
  const fadeOutOffsetBars = Math.max(
    0,
    Math.min(clip.lengthBars - fadeInOffsetBars, clip.fadeOutOffsetBars ?? 0)
  )
  const fadeInBars = Math.max(
    0,
    Math.min(clip.fadeInBars ?? 0, clip.lengthBars - fadeInOffsetBars - fadeOutOffsetBars)
  )
  const fadeOutBars = Math.max(
    0,
    Math.min(
      clip.fadeOutBars ?? 0,
      clip.lengthBars - fadeInOffsetBars - fadeOutOffsetBars - fadeInBars
    )
  )
  return { ...clip, fadeInOffsetBars, fadeOutOffsetBars, fadeInBars, fadeOutBars }
}

/**
Reproject retained-source anchors into a new visible window; negative delta extends left.
*/
export function fadeWindow(
  clip: AudioClip,
  deltaLeft: number,
  length: number
): Pick<AudioClip, "fadeInBars" | "fadeOutBars" | "fadeInOffsetBars" | "fadeOutOffsetBars"> {
  const inFade = fadeControls(clip, "in")
  const outFade = fadeControls(clip, "out")
  const left = deltaLeft
  const right = deltaLeft + length
  const inStart = Math.max(left, Math.min(right, inFade.start))
  const inEnd = Math.max(left, Math.min(right, inFade.end))
  const outStart = Math.max(left, Math.min(right, outFade.start))
  const outEnd = Math.max(left, Math.min(right, outFade.end))
  return {
    fadeInOffsetBars: Math.max(0, inStart - left),
    fadeInBars: inEnd - inStart,
    fadeOutOffsetBars: Math.max(0, right - outEnd),
    fadeOutBars: outEnd - outStart,
  }
}
