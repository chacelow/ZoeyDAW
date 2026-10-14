/**
 * Pure geometry for automation-curve rendering. Mirrors the segment easing
 * rule from `apps/web/src/pages/project/model/automation-curve.ts`
 * (`clampAutomationValue`, `interpolateAutomation`): value is normalized
 * 0..1, `curve` bends the segment left-to-right with an exponential ease,
 * zero is linear. gpuix has its own app boundary, so this is a local port
 * rather than a cross-app import, kept in lockstep deliberately so both
 * renderers treat a lane's curve field the same way.
 */
import type { AutomationPoint } from "../../../shared/model/types"

const CURVE_STRENGTH = 4

export function clampAutomationValue(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Curve belongs to the left breakpoint of the segment; zero is linear. */
export function interpolateAutomationValue(
  from: number,
  to: number,
  fraction: number,
  curve = 0
): number {
  const t = clampAutomationValue(fraction)
  const bend = Math.max(-1, Math.min(1, curve)) * CURVE_STRENGTH
  const eased = Math.abs(bend) < 0.000001 ? t : Math.expm1(bend * t) / Math.expm1(bend)
  return clampAutomationValue(from + (to - from) * eased)
}

/** Value at an arbitrary bar position, sorted points assumed (adapter invariant upstream). */
export function automationValueAtBar(points: readonly AutomationPoint[], bar: number): number {
  if (points.length === 0) {
    return 0.5
  }
  if (bar <= points[0].bar) {
    return clampAutomationValue(points[0].value)
  }
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1]
    const right = points[index]
    if (bar < right.bar) {
      return interpolateAutomationValue(
        left.value,
        right.value,
        (bar - left.bar) / (right.bar - left.bar),
        left.curve
      )
    }
  }
  return clampAutomationValue(points[points.length - 1].value)
}

export interface AutomationCurveGeometry {
  /** SVG path `d` attribute sampling the eased curve across the full width. */
  d: string
  /** Pixel position of each source point, for drawing anchor markers. */
  anchors: Array<{ x: number; y: number }>
}

export interface AutomationCurveLayoutOptions {
  /** Pixel distance between sampled points along the curve; smaller is smoother. */
  sampleStepPx?: number
}

function valueToY(value: number, height: number): number {
  return (1 - clampAutomationValue(value)) * height
}

/**
 * Builds a sampled path through `points`, eased per segment the same way
 * the Web timeline paints automation. Never degrades to a flat line just
 * because adjacent values are close: the eased value is sampled at
 * sub-pixel resolution and mapped through the full 0..1 -> 0..height
 * range, so real differences between anchors stay visible regardless of
 * how small they are.
 */
export function buildAutomationCurveGeometry(
  points: readonly AutomationPoint[],
  width: number,
  height: number,
  options: AutomationCurveLayoutOptions = {}
): AutomationCurveGeometry {
  const sampleStepPx = Math.max(1, options.sampleStepPx ?? 3)
  if (points.length === 0 || width <= 0 || height <= 0) {
    const y = valueToY(0.5, height)
    return { d: `M 0 ${y.toFixed(2)} L ${width.toFixed(2)} ${y.toFixed(2)}`, anchors: [] }
  }
  const firstBar = points[0].bar
  const lastBar = points[points.length - 1].bar
  const barSpan = lastBar - firstBar

  const anchors = points.map(point => ({
    x: barSpan > 0 ? ((point.bar - firstBar) / barSpan) * width : width / 2,
    y: valueToY(point.value, height),
  }))

  if (barSpan <= 0) {
    const y = valueToY(points[0].value, height)
    return { d: `M 0 ${y.toFixed(2)} L ${width.toFixed(2)} ${y.toFixed(2)}`, anchors }
  }

  const stepCount = Math.max(1, Math.ceil(width / sampleStepPx))
  const commands: string[] = []
  for (let step = 0; step <= stepCount; step++) {
    const x = Math.min(width, step * sampleStepPx)
    const value = automationValueAtBar(
      points,
      barSpan > 0 ? firstBar + (x / width) * barSpan : firstBar
    )
    const y = valueToY(value, height)
    commands.push(`${step === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return { d: commands.join(" "), anchors }
}
