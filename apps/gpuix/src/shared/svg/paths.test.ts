import { describe, expect, test } from "bun:test"
import { cubicAreaPath, cubicPath, polygonPath, polylinePath, segmentsPath } from "./paths"

const p = (x: number, y: number) => ({ x, y })

describe("paths", () => {
  test("polylinePath rounds to two digits and keeps every sample", () => {
    expect(polylinePath([p(0, 1), p(2, 3.456), p(4, 0.004)])).toBe("M0,1L2,3.46L4,0")
  })

  test("polylinePath rejects empty input instead of returning a blank path", () => {
    expect(() => polylinePath([])).toThrow(RangeError)
  })

  test("cubicPath chains segments from the start point", () => {
    expect(
      cubicPath(p(1, 2), [
        { control1: p(3, 4), control2: p(5, 6), end: p(7, 8) },
        { control1: p(9, 10), control2: p(11, 12), end: p(13, 14) },
      ])
    ).toBe("M1,2C3,4,5,6,7,8C9,10,11,12,13,14")
  })

  test("cubicAreaPath follows the curve then closes along the baseline, not the diagonal", () => {
    expect(
      cubicAreaPath(p(10, 40), [{ control1: p(12, 30), control2: p(18, 10), end: p(20, 5) }], 0)
    ).toBe("M10,40C12,30,18,10,20,5L20,0L10,0Z")
  })

  test("cubicAreaPath drops to the baseline from the last segment's end, not the first", () => {
    expect(
      cubicAreaPath(
        p(0, 10),
        [
          { control1: p(1, 9), control2: p(2, 8), end: p(3, 7) },
          { control1: p(4, 6), control2: p(5, 5), end: p(6, 4) },
        ],
        0
      )
    ).toBe("M0,10C1,9,2,8,3,7C4,6,5,5,6,4L6,0L0,0Z")
  })

  test("cubicAreaPath with no segments degenerates to a vertical edge at the start", () => {
    expect(cubicAreaPath(p(3, 7), [], 0)).toBe("M3,7L3,0L3,0Z")
  })

  test("polygonPath closes the shape", () => {
    expect(polygonPath([p(0, 0), p(2, 0), p(1, 1)])).toBe("M0,0L2,0L1,1Z")
  })

  test("segmentsPath keeps disconnected segments disconnected", () => {
    expect(
      segmentsPath([
        [p(0, 54), p(200, 54)],
        [p(50, 0), p(50, 60)],
      ])
    ).toBe("M0,54L200,54M50,0L50,60")
  })
})
