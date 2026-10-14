import { describe, expect, test } from "bun:test"
import { DRAG_PIXELS_PER_STEP } from "./constants"
import { clamp, formatNumericValue, quantize, valueAfterDrag, valueAfterWheel } from "./numberModel"

describe("clamp", () => {
  test("bounds a value into [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })
})

describe("quantize", () => {
  test("snaps to the nearest step multiple", () => {
    expect(quantize(7, 5, 0, 100)).toBe(5)
    expect(quantize(8, 5, 0, 100)).toBe(10)
  })

  test("passes the value through unchanged when step is 0", () => {
    expect(quantize(3.14159, 0, 0, 10)).toBeCloseTo(3.14159)
  })

  test("clamps after quantizing", () => {
    expect(quantize(999, 5, 0, 100)).toBe(100)
  })
})

describe("formatNumericValue", () => {
  test("derives decimal places from step", () => {
    const format = formatNumericValue(0, 1, 0.01)
    expect(format(0.5)).toBe("0.50")
  })

  test("formats an integer step range with no decimals", () => {
    const format = formatNumericValue(20, 300, 1)
    expect(format(120)).toBe("120")
  })

  test("widens precision when an endpoint needs more decimals than step implies", () => {
    const format = formatNumericValue(0, 1.125, 0.5)
    expect(format(1.125)).toBe("1.125")
  })
})

describe("valueAfterDrag", () => {
  test("maps distance × step, not absolute position", () => {
    // Two drags that start from different values but travel the same
    // distance produce the same step delta.
    const a = valueAfterDrag({ startValue: 10, deltaY: -40, step: 1, min: 0, max: 1000 })
    const b = valueAfterDrag({ startValue: 500, deltaY: -40, step: 1, min: 0, max: 1000 })
    expect(a - 10).toBe(b - 500)
  })

  test("dragging up (negative deltaY) increases the value", () => {
    const next = valueAfterDrag({
      startValue: 10,
      deltaY: -DRAG_PIXELS_PER_STEP * 3,
      step: 1,
      min: 0,
      max: 1000,
    })
    expect(next).toBe(13)
  })

  test("dragging down decreases the value", () => {
    const next = valueAfterDrag({
      startValue: 10,
      deltaY: DRAG_PIXELS_PER_STEP * 3,
      step: 1,
      min: 0,
      max: 1000,
    })
    expect(next).toBe(7)
  })

  test("is linear: doubling the distance exactly doubles the delta (no velocity damping)", () => {
    const start = 0
    const short = valueAfterDrag({
      startValue: start,
      deltaY: -40,
      step: 1,
      min: -10_000,
      max: 10_000,
    })
    const long = valueAfterDrag({
      startValue: start,
      deltaY: -80,
      step: 1,
      min: -10_000,
      max: 10_000,
    })
    expect(long - start).toBe((short - start) * 2)
  })

  test("uses the same pixel scale for a small-range control as a large-range one", () => {
    const smallRange = valueAfterDrag({ startValue: 0, deltaY: -40, step: 0.01, min: -1, max: 1 })
    const largeRange = valueAfterDrag({
      startValue: 0,
      deltaY: -40,
      step: 0.01,
      min: -1000,
      max: 1000,
    })
    expect(smallRange).toBe(largeRange)
  })

  test("clamps at the range boundary", () => {
    const next = valueAfterDrag({ startValue: 99, deltaY: -1000, step: 1, min: 0, max: 100 })
    expect(next).toBe(100)
  })
})

describe("valueAfterWheel", () => {
  test("scrolling down decreases the value", () => {
    const next = valueAfterWheel({
      currentValue: 10,
      deltaY: 16,
      precise: true,
      step: 1,
      min: 0,
      max: 100,
    })
    expect(next).toBe(9)
  })

  test("scrolling up increases the value", () => {
    const next = valueAfterWheel({
      currentValue: 10,
      deltaY: -16,
      precise: true,
      step: 1,
      min: 0,
      max: 100,
    })
    expect(next).toBe(11)
  })

  test("a line-based wheel notch scales deltaY before converting to steps", () => {
    const preciseResult = valueAfterWheel({
      currentValue: 0,
      deltaY: 16,
      precise: true,
      step: 1,
      min: -100,
      max: 100,
    })
    const lineResult = valueAfterWheel({
      currentValue: 0,
      deltaY: 1,
      precise: false,
      step: 1,
      min: -100,
      max: 100,
    })
    expect(lineResult).toBe(preciseResult)
  })
})
