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
  /** Unquantized value accumulated so far in this drag, already inside [min, max]. */
  rawValue: number
  /** Vertical movement since the previous event. */
  deltaY: number
  step: number
  min: number
  max: number
  dragPixelsPerStep: number
}

/**
 * Advances a drag by one movement. The raw value is clamped on every step, so
 * travel beyond a boundary is discarded and reversing changes the value at once.
 */
export function valueAfterDrag({
  rawValue,
  deltaY,
  step,
  min,
  max,
  dragPixelsPerStep,
}: ValueAfterDragInput): { raw: number; value: number } {
  const raw = clamp(rawValue - (deltaY / dragPixelsPerStep) * step, min, max)
  return { raw, value: quantize(raw, step, min, max) }
}

export interface ValueAfterWheelInput {
  currentValue: number
  deltaY: number
  precise: boolean
  step: number
  min: number
  max: number
  wheelPixelsPerStep: number
  wheelLinePixels: number
}

export function valueAfterWheel({
  currentValue,
  deltaY,
  precise,
  step,
  min,
  max,
  wheelPixelsPerStep,
  wheelLinePixels,
}: ValueAfterWheelInput): number {
  const pixels = precise ? deltaY : deltaY * wheelLinePixels
  const stepsTravelled = pixels / wheelPixelsPerStep
  return quantize(currentValue + stepsTravelled * step, step, min, max)
}
