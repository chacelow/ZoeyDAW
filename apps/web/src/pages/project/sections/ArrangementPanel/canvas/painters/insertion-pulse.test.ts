import { expect, it } from "vitest"
import { createInsertionPulse } from "./insertion-pulse"

it("breathes visible colors on a symmetric 1200 ms triangle without fading away", () => {
  const color = createInsertionPulse("rgb(20, 100, 180)", "rgb(220, 240, 255)")
  expect(color(0)).toBe("rgb(20, 100, 180)")
  expect(color(300)).toBe(color(900))
  expect(color(600)).toBe("rgb(120, 170, 218)")
  expect(color(1200)).toBe(color(0))
  expect(color(1500)).toBe(color(300))
  expect(color(300)).not.toBe(color(0))
})

it("accepts WebKit resolved sRGB colors and leaves unsupported color formats visible", () => {
  const color = createInsertionPulse("color(srgb 0 0.5 1)", "rgb(255, 255, 255)")
  expect(color(600)).toBe("rgb(128, 191, 255)")
  expect(createInsertionPulse("teal", "white")(600)).toBe("teal")
})
