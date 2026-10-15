import { expect, test } from "bun:test"
import { CONTROL_METRICS } from "@zoeymind/ui/metrics"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { patternGeometry, patternScrollToStep, patternStepAt, patternStepRect } from "./geometry"

const metrics = {
  gap: CONTROL_METRICS.default["--spacing-control-gap"],
  minimum: CONTROL_METRICS.default["--spacing-control-track"],
  border: DEFAULT_DESIGN_TOKENS.shape.controlBorderWidth,
}

test("a normal cycle fits without changing its source step count", () => {
  const geometry = patternGeometry({ ...metrics, count: 16, viewport: 1092, offset: 0 })
  expect(geometry.maximum).toBe(0)
  expect(geometry.first).toBe(0)
  expect(geometry.end).toBe(16)
  expect(patternStepRect(geometry, 15).x + geometry.stepWidth).toBe(1092)
  for (let index = 0; index < 16; index++) {
    const rect = patternStepRect(geometry, index)
    expect(rect.width).toBeGreaterThanOrEqual(metrics.minimum)
    expect(patternStepAt(geometry, rect.x + rect.width / 2)).toBe(index)
  }
})

test("a long cycle keeps target width and reveals its final source step", () => {
  const initial = patternGeometry({ ...metrics, count: 1024, viewport: 1092, offset: 0 })
  expect(initial.stepWidth).toBe(metrics.minimum)
  expect(initial.extent).toBe(1024 * metrics.minimum + 1023 * metrics.gap)
  expect(initial.end).toBeLessThan(1024)
  for (const index of [1, 2, 3]) {
    const rect = patternStepRect(initial, index)
    expect(patternStepAt(initial, rect.x + rect.width / 2)).toBe(index)
  }
  const offset = patternScrollToStep(initial, 1023)
  const final = patternGeometry({ ...metrics, count: 1024, viewport: 1092, offset })
  const rect = patternStepRect(final, 1023)
  expect(final.end).toBe(1024)
  expect(rect.x + rect.width).toBe(1092)
  expect(patternStepAt(final, rect.x + rect.width / 2)).toBe(1023)
})

test("clipped ranges contain no fully offscreen steps, including offsets in gaps", () => {
  for (const offset of [-100, 0, 13, 14, 150, 151.5, 1e9]) {
    const geometry = patternGeometry({ ...metrics, count: 1024, viewport: 1092, offset })
    expect(geometry.offset).toBeGreaterThanOrEqual(0)
    expect(geometry.offset).toBeLessThanOrEqual(geometry.maximum)
    for (let index = geometry.first; index < geometry.end; index++) {
      const rect = patternStepRect(geometry, index)
      expect(rect.x).toBeLessThan(geometry.viewport)
      expect(rect.x + rect.width).toBeGreaterThan(0)
      const point = Math.max(0, Math.min(geometry.viewport, rect.x + rect.width / 2))
      expect(patternStepAt(geometry, point)).toBe(index)
    }
  }
})
