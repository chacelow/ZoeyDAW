import { describe, expect, test } from "bun:test"
import { TEST_INPUT_POLICY } from "./input-policy.test-fixture"
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
  const drag = (rawValue: number, deltaY: number, step = 1, min = 0, max = 1000) =>
    valueAfterDrag({ ...TEST_INPUT_POLICY, rawValue, deltaY, step, min, max })

  test("maps distance × step, independent of the current value", () => {
    expect(drag(10, -40).value - 10).toBe(drag(500, -40).value - 500)
  })

  test("dragging up increases and dragging down decreases", () => {
    expect(drag(10, -TEST_INPUT_POLICY.dragPixelsPerStep * 3).value).toBe(13)
    expect(drag(10, TEST_INPUT_POLICY.dragPixelsPerStep * 3).value).toBe(7)
  })

  test("splitting a movement into steps lands on the same value (no velocity dependency)", () => {
    const whole = drag(0, -80, 1, -10_000, 10_000)
    let raw = 0
    for (let i = 0; i < 8; i++) raw = drag(raw, -10, 1, -10_000, 10_000).raw
    expect(drag(raw, 0, 1, -10_000, 10_000).value).toBe(whole.value)
  })

  test("uses the same pixel scale for a small-range control as a large-range one", () => {
    expect(drag(0, -40, 0.01, -1, 1).value).toBe(drag(0, -40, 0.01, -1000, 1000).value)
  })

  test("travel past a boundary is discarded, so reversing moves the value immediately", () => {
    const pinned = drag(99, -1000, 1, 0, 100)
    expect(pinned.value).toBe(100)
    const reversed = drag(pinned.raw, TEST_INPUT_POLICY.dragPixelsPerStep * 2, 1, 0, 100)
    expect(reversed.value).toBe(98)
  })
})

describe("valueAfterWheel", () => {
  test("scrolling toward later content (negative GPUI deltaY) decreases the value", () => {
    const next = valueAfterWheel({
      ...TEST_INPUT_POLICY,
      currentValue: 10,
      deltaY: -16,
      precise: true,
      step: 1,
      min: 0,
      max: 100,
    })
    expect(next).toBe(9)
  })

  test("scrolling toward earlier content (positive GPUI deltaY) increases the value", () => {
    const next = valueAfterWheel({
      ...TEST_INPUT_POLICY,
      currentValue: 10,
      deltaY: 16,
      precise: true,
      step: 1,
      min: 0,
      max: 100,
    })
    expect(next).toBe(11)
  })

  test("a line-based wheel notch scales deltaY before converting to steps", () => {
    const preciseResult = valueAfterWheel({
      ...TEST_INPUT_POLICY,
      currentValue: 0,
      deltaY: 16,
      precise: true,
      step: 1,
      min: -100,
      max: 100,
    })
    const lineResult = valueAfterWheel({
      ...TEST_INPUT_POLICY,
      currentValue: 0,
      deltaY: 1,
      precise: false,
      step: 1,
      min: -100,
      max: 100,
    })
    expect(lineResult).toBe(preciseResult)
  })

  test("both raw wheel directions preserve range, quantization, and monotonicity", () => {
    for (const precise of [true, false]) {
      for (const step of [0.01, 0.25, 1, 5]) {
        const min = -20 * step
        const max = 20 * step
        for (let index = -20; index <= 20; index++) {
          const currentValue = index * step
          for (const deltaY of [-1600, -80, -16, -1, 0, 1, 16, 80, 1600]) {
            const next = valueAfterWheel({
              ...TEST_INPUT_POLICY,
              currentValue,
              deltaY,
              precise,
              step,
              min,
              max,
            })
            expect(next).toBeGreaterThanOrEqual(min)
            expect(next).toBeLessThanOrEqual(max)
            expect(next / step).toBeCloseTo(Math.round(next / step), 8)
            if (deltaY > 0) expect(next).toBeGreaterThanOrEqual(currentValue - 1e-12)
            if (deltaY < 0) expect(next).toBeLessThanOrEqual(currentValue + 1e-12)
            if (deltaY === 0) expect(next).toBeCloseTo(currentValue, 12)
          }
        }
      }
    }
  })

  test("wheel sensitivity stays step-based across ranges in both directions", () => {
    for (const direction of [-1, 1]) {
      const small = valueAfterWheel({
        ...TEST_INPUT_POLICY,
        currentValue: 0,
        deltaY: direction * TEST_INPUT_POLICY.wheelPixelsPerStep,
        precise: true,
        step: 0.01,
        min: -1,
        max: 1,
      })
      const large = valueAfterWheel({
        ...TEST_INPUT_POLICY,
        currentValue: 0,
        deltaY: direction * TEST_INPUT_POLICY.wheelPixelsPerStep,
        precise: true,
        step: 1,
        min: -1000,
        max: 1000,
      })
      expect(small).toBeCloseTo(direction * 0.01)
      expect(large).toBe(direction)
    }
  })
})
