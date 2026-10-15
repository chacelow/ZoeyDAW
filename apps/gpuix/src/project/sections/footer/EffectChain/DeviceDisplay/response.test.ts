import { expect, test } from "bun:test"
import { quadraticAsCubic } from "./response"

test("property: quadratic device responses retain their geometry when converted to cubic paths", () => {
  let seed = 29
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return (seed / 2 ** 32) * 400 - 200
  }
  for (let sample = 0; sample < 600; sample++) {
    const start = { x: random(), y: random() }
    const control = { x: random(), y: random() }
    const end = { x: random(), y: random() }
    const cubic = quadraticAsCubic(start, control, end)
    for (let step = 0; step <= 10; step++) {
      const t = step / 10
      const u = 1 - t
      const quadraticX = u * u * start.x + 2 * u * t * control.x + t * t * end.x
      const quadraticY = u * u * start.y + 2 * u * t * control.y + t * t * end.y
      const cubicX =
        u ** 3 * start.x +
        3 * u * u * t * cubic.control1.x +
        3 * u * t * t * cubic.control2.x +
        t ** 3 * cubic.end.x
      const cubicY =
        u ** 3 * start.y +
        3 * u * u * t * cubic.control1.y +
        3 * u * t * t * cubic.control2.y +
        t ** 3 * cubic.end.y
      expect(cubicX).toBeCloseTo(quadraticX, 10)
      expect(cubicY).toBeCloseTo(quadraticY, 10)
    }
  }
})
