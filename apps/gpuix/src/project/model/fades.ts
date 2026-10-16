import { PROJECT_TEMPLATE } from "../defaults/template"
import type { AudioClip } from "./types"

export const FADE_CURVE_VERTICAL_SCALE = 0.4

export const clampFadeCurve = (curve: number): number => Math.max(-1, Math.min(1, curve))

export const clampFadeCurvePosition = (position: number): number =>
  Math.max(0.1, Math.min(0.9, position))

export const fadeCurveProgress = (curve: number): number =>
  0.5 + clampFadeCurve(curve) * FADE_CURVE_VERTICAL_SCALE

export interface FadeBezierSegment {
  control1: { x: number; y: number }
  control2: { x: number; y: number }
  end: { x: number; y: number }
}

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
  position = PROJECT_TEMPLATE.clip.fade.position
): string {
  const y0 = edge === "in" ? 100 : 0
  const y1 = edge === "in" ? 0 : 100
  const segments = fadeBezierSegments(start, y0, start + length, y1, position, curve)
  return `M ${start} ${y0} ${segments.map(({ control1: a, control2: b, end }) => `C ${a.x} ${a.y}, ${b.x} ${b.y}, ${end.x} ${end.y}`).join(" ")}`
}

export function fadeControls(clip: AudioClip, edge: "in" | "out"): { start: number; end: number } {
  if (edge === "in") {
    const start = clip.fadeInOffsetBars ?? PROJECT_TEMPLATE.clip.fade.offsetBars
    return { start, end: start + (clip.fadeInBars ?? PROJECT_TEMPLATE.clip.fade.durationBars) }
  }
  const end = clip.lengthBars - (clip.fadeOutOffsetBars ?? PROJECT_TEMPLATE.clip.fade.offsetBars)
  return { start: end - (clip.fadeOutBars ?? PROJECT_TEMPLATE.clip.fade.durationBars), end }
}

export function clampFadeIntervals(clip: AudioClip): AudioClip {
  const fadeInOffsetBars = Math.max(
    0,
    Math.min(clip.lengthBars, clip.fadeInOffsetBars ?? PROJECT_TEMPLATE.clip.fade.offsetBars)
  )
  const fadeOutOffsetBars = Math.max(
    0,
    Math.min(
      clip.lengthBars - fadeInOffsetBars,
      clip.fadeOutOffsetBars ?? PROJECT_TEMPLATE.clip.fade.offsetBars
    )
  )
  const fadeInBars = Math.max(
    0,
    Math.min(
      clip.fadeInBars ?? PROJECT_TEMPLATE.clip.fade.durationBars,
      clip.lengthBars - fadeInOffsetBars - fadeOutOffsetBars
    )
  )
  const fadeOutBars = Math.max(
    0,
    Math.min(
      clip.fadeOutBars ?? PROJECT_TEMPLATE.clip.fade.durationBars,
      clip.lengthBars - fadeInOffsetBars - fadeOutOffsetBars - fadeInBars
    )
  )
  return { ...clip, fadeInOffsetBars, fadeOutOffsetBars, fadeInBars, fadeOutBars }
}

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
