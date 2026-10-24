import { automationTargetBounds } from "./automation-target"
import type { AutomationPoint, AutomationTarget } from "./types"

export const MIN_AUTOMATION_CURVE = -1
export const MAX_AUTOMATION_CURVE = 1
const CURVE_STRENGTH = 4

export function clampAutomationValue(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function clampAutomationCurve(curve: number): number {
  return Math.max(MIN_AUTOMATION_CURVE, Math.min(MAX_AUTOMATION_CURVE, curve))
}

/**
Curve belongs to the left breakpoint of a segment; zero is linear.
*/
export function interpolateAutomation(
  from: number,
  to: number,
  fraction: number,
  curve = 0
): number {
  const t = clampAutomationValue(fraction)
  const bend = clampAutomationCurve(curve) * CURVE_STRENGTH
  const eased = Math.abs(bend) < 0.000001 ? t : Math.expm1(bend * t) / Math.expm1(bend)
  return clampAutomationValue(from + (to - from) * eased)
}
/**
Sorted points are the domain invariant enforced at the adapter and snapshot boundary.
*/
export function automationValueAt(
  points: readonly AutomationPoint[],
  bar: number,
  fallback: number
): number {
  if (!points.length) {
    return clampAutomationValue(fallback)
  }
  if (bar <= points[0].bar) {
    return clampAutomationValue(points[0].value)
  }
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1]
    const right = points[index]
    if (bar < right.bar) {
      return interpolateAutomation(
        left.value,
        right.value,
        (bar - left.bar) / (right.bar - left.bar),
        left.curve
      )
    }
  }
  return clampAutomationValue(points[points.length - 1].value)
}

export function normalizedAutomationValue(target: AutomationTarget, source: number): number {
  const { min, max } = automationTargetBounds(target)
  return clampAutomationValue((source - min) / (max - min))
}

export function automationSourceValue(target: AutomationTarget, normalized: number): number {
  const { min, max } = automationTargetBounds(target)
  return min + clampAutomationValue(normalized) * (max - min)
}
