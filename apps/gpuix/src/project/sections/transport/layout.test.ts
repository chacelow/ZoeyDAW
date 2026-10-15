import { expect, test } from "bun:test"
import { transportColumns } from "./layout"

test("property: Header columns conserve space and respect intrinsic minima", () => {
  let seed = 61
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  for (let sample = 0; sample < 2000; sample++) {
    const measured = {
      viewport: random() * 2400,
      left: random() * 900,
      center: random() * 400,
      right: random() * 900,
    }
    const gap = random() * 20
    const columns = transportColumns(measured, gap)
    expect(columns.left).toBeGreaterThanOrEqual(measured.left)
    expect(columns.right).toBeGreaterThanOrEqual(measured.right)
    expect(columns.content).toBeCloseTo(
      Math.max(measured.viewport, measured.left + measured.center + measured.right + gap * 2),
      8
    )
    if (
      measured.viewport >=
      Math.max(measured.left, measured.right) * 2 + measured.center + gap * 2
    ) {
      expect(columns.left).toBeCloseTo(columns.right, 8)
    }
  }
})
