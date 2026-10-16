import { describe, expect, test } from "bun:test"
import { computeLayout } from "./computeLayout"
import { fitLayout, initialLayout, reflowLayout, resolveConstraints, toPixels } from "./sizes"

const plain = { min: 0, max: 1000, collapsed: 0, collapsible: false, fixed: false }
const browser = { min: 190, max: 500, collapsed: 0, collapsible: true, fixed: false }

describe("panel dimensions and reflow", () => {
  test("numeric sizes are pixels and bare or suffixed strings are percentages", () => {
    expect(toPixels(25, 800)).toBe(25)
    expect(toPixels("25", 800)).toBe(200)
    expect(toPixels("25%", 800)).toBe(200)
    const constraints = resolveConstraints([{}, {}, {}], 800)
    expect(initialLayout(["25", 120, undefined], constraints, 800)).toEqual([200, 120, 480])
  })

  test("zero pixels initializes a collapsible panel closed rather than at its minimum", () => {
    expect(initialLayout([undefined, 0], [plain, browser], 800)).toEqual([800, 0])
  })

  test("mixed explicit defaults reserve pixels and assign remaining space to percentage panels", () => {
    expect(initialLayout([120, "25"], [plain, plain], 800)).toEqual([120, 680])
    expect(initialLayout([120, 100], [plain, plain], 800)).toEqual([120, 100])
  })

  test("pixel panels retain their resized height when a divider becomes visible", () => {
    expect(reflowLayout([640, 160], [plain, { ...browser, min: 120 }], 793, [false, true])).toEqual(
      [633, 160]
    )
    expect(reflowLayout([640, 160], [plain, { ...browser, min: 120 }], 100, [false, true])).toEqual(
      [0, 100]
    )
  })

  test("expanded panels do not collapse merely because their viewport gets smaller", () => {
    const constraints = [browser, { ...plain, min: 200 }]
    expect(reflowLayout([250, 550], constraints, 200)[0]).toBeGreaterThan(0)
    expect(resolveConstraints([{ minSize: 190, maxSize: "50" }], 300)[0].max).toBe(190)
  })

  test("min and max constraints redistribute excess to flexible panels", () => {
    const constraints = resolveConstraints(
      [{ minSize: 190, maxSize: "50" }, { minSize: "30" }],
      800
    )
    expect(initialLayout([100, 700], constraints, 800)).toEqual([190, 610])
    expect(fitLayout([700, 100], constraints, 800)).toEqual([400, 400])
  })

  test("window shrink and grow recompute percentage limits without retaining old pixels", () => {
    const specs = [{ minSize: 100, maxSize: "50" }, { minSize: 100 }]
    const small = reflowLayout([300, 500], resolveConstraints(specs, 400), 400)
    expect(small).toEqual([150, 250])
    const large = reflowLayout(small, resolveConstraints(specs, 1200), 1200)
    expect(large).toEqual([450, 750])
    expect(large.reduce((sum, size) => sum + size, 0)).toBe(1200)
  })

  test("undersized viewports relax flexible minima but never compress fixed panels", () => {
    const constraints = [
      plain,
      { ...plain, min: 150, max: 150, fixed: true },
      { ...plain, min: 200 },
    ]
    const small = reflowLayout([350, 150, 300], constraints, 250)
    small.forEach((size, index) => expect(size).toBeCloseTo([0, 150, 100][index]))
    expect(() => reflowLayout([350, 150, 300], constraints, 100)).toThrow(RangeError)
  })

  test("collapsed panels stay collapsed across viewport changes", () => {
    expect(reflowLayout([0, 800], [browser, plain], 1000)).toEqual([0, 1000])
  })

  test("maxima leave unused space rather than overflowing a maximum", () => {
    expect(
      fitLayout(
        [100, 100],
        [
          { ...plain, max: 100 },
          { ...plain, max: 100 },
        ],
        500
      )
    ).toEqual([100, 100])
  })

  test("invalid units and impossible size ranges fail at the boundary", () => {
    for (const size of ["bad", "12px", "-2", Number.NaN, -1])
      expect(() => toPixels(size, 800)).toThrow(RangeError)
    expect(() => resolveConstraints([{ minSize: 200, maxSize: 100 }], 800)).toThrow(RangeError)
    expect(() =>
      resolveConstraints([{ minSize: 40, collapsible: true, collapsedSize: 50 }], 800)
    ).toThrow(RangeError)
  })
})

describe("divider transfer", () => {
  test("fractional Clip panel allocation still reaches the exact collapsed endpoint", () => {
    const constraints = resolveConstraints(
      [{ minSize: 140 }, { minSize: "20%", maxSize: "60%", collapsible: true, collapsedSize: 0 }],
      729
    )
    const result = computeLayout([440.17336956521734, 288.8266304347827], constraints, {
      separator: 0,
      delta: 288.8266304347827,
    })
    expect(result).toEqual([729, 0])
    expect(reflowLayout(result, constraints, 736)[1]).toBe(0)
  })

  test("adjacent panels change first, then further panels when a neighbour reaches its bound", () => {
    const constraints = [plain, { ...plain, max: 250 }, { ...plain, min: 150 }, plain]
    expect(computeLayout([200, 200, 200, 200], constraints, { separator: 1, delta: 100 })).toEqual([
      250, 250, 150, 150,
    ])
    expect(
      computeLayout([200, 200, 200], [plain, plain, plain], { separator: 0, delta: 60 })
    ).toEqual([260, 140, 200])
  })

  test("both sides constrain the same transfer and total pixels never change", () => {
    expect(
      computeLayout([200, 600], [browser, { ...plain, min: 550 }], { separator: 0, delta: 900 })
    ).toEqual([250, 550])
    expect(computeLayout([200, 600], [browser, plain], { separator: 0, delta: -5000 })).toEqual([
      0, 800,
    ])
  })

  test("collapse snaps only after the half-minimum threshold and reverses from the anchor", () => {
    expect(computeLayout([190, 610], [browser, plain], { separator: 0, delta: -94 })).toEqual([
      190, 610,
    ])
    expect(computeLayout([190, 610], [browser, plain], { separator: 0, delta: -96 })).toEqual([
      0, 800,
    ])
    expect(computeLayout([190, 610], [browser, plain], { separator: 0, delta: -20 })).toEqual([
      190, 610,
    ])
    expect(computeLayout([0, 800], [browser, plain], { separator: 0, delta: 94 })).toEqual([0, 800])
    expect(computeLayout([0, 800], [browser, plain], { separator: 0, delta: 96 })).toEqual([
      190, 610,
    ])
  })

  test("nonzero collapsed sizes use the midpoint between collapsed and minimum", () => {
    const c = { ...browser, min: 100, collapsed: 20 }
    expect(computeLayout([100, 700], [c, plain], { separator: 0, delta: -39 })).toEqual([100, 700])
    expect(computeLayout([100, 700], [c, plain], { separator: 0, delta: -41 })).toEqual([20, 780])
  })

  test("a fixed-height collapsible chain only switches between closed and its exact height", () => {
    const device = { ...browser, min: 160, max: 160 }
    expect(computeLayout([640, 160], [plain, device], { separator: 0, delta: 79 })).toEqual([
      640, 160,
    ])
    expect(computeLayout([640, 160], [plain, device], { separator: 0, delta: 81 })).toEqual([
      800, 0,
    ])
    expect(computeLayout([800, 0], [plain, device], { separator: 0, delta: -81 })).toEqual([
      640, 160,
    ])
    expect(computeLayout([640, 160], [plain, device], { separator: 0, delta: -100 })).toEqual([
      640, 160,
    ])
  })

  test("a collapse jump is refused if the adjacent panel cannot absorb its pixels", () => {
    expect(
      computeLayout([190, 610], [browser, { ...plain, max: 700 }], { separator: 0, delta: -120 })
    ).toEqual([190, 610])
    expect(
      computeLayout([0, 800], [browser, { ...plain, min: 700 }], { separator: 0, delta: 120 })
    ).toEqual([0, 800])
  })

  test("fixed panels are not squeezed when transfer spills across neighbours", () => {
    const fixed = { ...plain, min: 160, max: 160 }
    expect(
      computeLayout([200, 160, 440], [plain, fixed, plain], { separator: 0, delta: 100 })
    ).toEqual([300, 160, 340])
  })

  test("deterministic sweeps preserve sums and every feasible boundary", () => {
    const constraints = [browser, { ...plain, min: 100 }, { ...plain, min: 50, max: 400 }]
    for (let delta = -1200; delta <= 1200; delta += 13) {
      for (const separator of [0, 1]) {
        const sizes = computeLayout([250, 350, 200], constraints, { separator, delta })
        expect(sizes.reduce((sum, size) => sum + size, 0)).toBeCloseTo(800)
        sizes.forEach((size, i) => {
          const c = constraints[i]
          expect(size).toBeLessThanOrEqual(c.max)
          expect((size === c.collapsed && c.collapsible) || size >= c.min).toBe(true)
        })
      }
    }
  })
})
