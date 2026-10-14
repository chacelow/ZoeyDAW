/**
 * Pure numeric model for DragPad controls: clamping, step quantization,
 * display formatting, and the drag/wheel → value mappings.
 *
 * No React, no gpuix host types. Testable with plain `bun:test`.
 */
import { DRAG_PIXELS_PER_STEP, WHEEL_LINE_PIXELS, WHEEL_PIXELS_PER_STEP } from "./constants"

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function quantize(value: number, step: number, min: number, max: number): number {
  const stepped = step > 0 ? Math.round(value / step) * step : value
  return clamp(stepped, min, max)
}

function decimalPlaces(value: number): number {
  for (let places = 0; places <= 6; places++) {
    const scaled = value * 10 ** places
    if (
      Math.abs(scaled - Math.round(scaled)) <=
      Number.EPSILON * Math.max(1, Math.abs(scaled)) * 16
    ) {
      return places
    }
  }
  return 6
}

/**
 * Builds a formatter whose precision follows `step` (falling back to a
 * range-derived guess for a continuous, step-less control), floored by
 * whatever decimals `min`/`max` themselves need so an endpoint never
 * truncates.
 */
export function formatNumericValue(min: number, max: number, step = 0): (value: number) => string {
  const range = Math.abs(max - min)
  const basePrecision =
    step > 0
      ? decimalPlaces(step)
      : range > 0
        ? Math.min(6, Math.max(2, 2 + Math.ceil(-Math.log10(range))))
        : 2
  const precision = Math.max(basePrecision, decimalPlaces(min), decimalPlaces(max))
  return value => (Number.isFinite(value) ? value.toFixed(precision) : String(value))
}

export interface ValueAfterDragInput {
  startValue: number
  /** Vertical pixels travelled since the drag's start position (current Y − start Y). */
  deltaY: number
  step: number
  min: number
  max: number
}

/**
 * Relative-drag mapping: output depends only on `deltaY`, the distance
 * travelled since the press, never on the pointer's absolute position. One
 * `DRAG_PIXELS_PER_STEP` of upward travel (negative deltaY) adds one `step`;
 * downward subtracts. Linear — no velocity term, no easing curve.
 */
export function valueAfterDrag({
  startValue,
  deltaY,
  step,
  min,
  max,
}: ValueAfterDragInput): number {
  const stepsTravelled = -deltaY / DRAG_PIXELS_PER_STEP
  return quantize(startValue + stepsTravelled * step, step, min, max)
}

export interface ValueAfterWheelInput {
  currentValue: number
  deltaY: number
  /** `event.precise`: true for trackpad (pixel-accurate), false for a notched wheel. */
  precise: boolean
  step: number
  min: number
  max: number
}

/** Wheel mapping: scrolling down (`deltaY` > 0) decreases the value. */
export function valueAfterWheel({
  currentValue,
  deltaY,
  precise,
  step,
  min,
  max,
}: ValueAfterWheelInput): number {
  const pixels = precise ? deltaY : deltaY * WHEEL_LINE_PIXELS
  const stepsTravelled = pixels / WHEEL_PIXELS_PER_STEP
  return quantize(currentValue - stepsTravelled * step, step, min, max)
}
