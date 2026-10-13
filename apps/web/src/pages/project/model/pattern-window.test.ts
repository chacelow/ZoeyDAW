import { expect, it } from "vitest"
import { patternHasActivity } from "./pattern-window"

it("preserves partial-step activity and wraparound when several source steps share a pixel", () => {
  const steps = [true, false, false, true]
  expect(patternHasActivity(steps, 5.1, 6.9)).toBe(false)
  expect(patternHasActivity(steps, 7.8, 8.2)).toBe(true)
  expect(patternHasActivity(steps, 4.1, 4.2)).toBe(true)
  expect(patternHasActivity(steps, 5, 5000)).toBe(true)
})

it("leaves dense silent patterns empty", () => {
  expect(patternHasActivity([false, false, false, false], 100.25, 100000)).toBe(false)
  expect(patternHasActivity([], 1, 2)).toBe(false)
})
