import { describe, expect, it } from "vitest"
import { gridZoomLimit } from "@/pages/project/model/grid"
import { minimapDragLeftEdge, minimapDragRightEdge, minimapDragZoom } from "./zoom"

describe("minimap vertical drag zoom", () => {
  it("shrinks the overview selection downward and expands it upward", () => {
    const starting = 32
    const viewportWidth = 640
    const initialBars = viewportWidth / starting
    expect(
      viewportWidth / minimapDragZoom(starting, 100, 160, 8, gridZoomLimit(4, 4))
    ).toBeLessThan(initialBars)
    expect(
      viewportWidth / minimapDragZoom(starting, 100, 40, 8, gridZoomLimit(4, 4))
    ).toBeGreaterThan(initialBars)
    expect(minimapDragZoom(starting, 100, 100, 8, gridZoomLimit(4, 4))).toBe(starting)
  })

  it("stops at the smallest and largest overview selection", () => {
    expect(minimapDragZoom(32, 100, 1000, 8, gridZoomLimit(4, 4))).toBe(gridZoomLimit(4, 4))
    expect(minimapDragZoom(32, 100, -1000, 8, gridZoomLimit(4, 4))).toBe(8)
  })
})

describe("minimap left edge drag", () => {
  const base = {
    bars: 128,
    viewportWidth: 640,
    minPxPerBar: 5,
    maxPxPerBar: gridZoomLimit(4, 4),
    startingPxPerBar: 32,
    startingScrollX: 320,
  } as const

  it("shrinks the frame by moving the left edge right, keeping the right edge pinned", () => {
    const rightBar =
      base.startingScrollX / base.startingPxPerBar + base.viewportWidth / base.startingPxPerBar
    const next = minimapDragLeftEdge({ ...base, deltaBars: 4 })
    expect(next.scrollX / next.pxPerBar).toBeCloseTo(
      base.startingScrollX / base.startingPxPerBar + 4
    )
    expect((next.scrollX + base.viewportWidth) / next.pxPerBar).toBeCloseTo(rightBar)
    expect(next.pxPerBar).toBeGreaterThan(base.startingPxPerBar)
  })

  it("expands the frame by moving the left edge left, zooming out", () => {
    const rightBar =
      base.startingScrollX / base.startingPxPerBar + base.viewportWidth / base.startingPxPerBar
    const next = minimapDragLeftEdge({ ...base, deltaBars: -8 })
    expect(next.scrollX / next.pxPerBar).toBeCloseTo(
      base.startingScrollX / base.startingPxPerBar - 8
    )
    expect((next.scrollX + base.viewportWidth) / next.pxPerBar).toBeCloseTo(rightBar)
    expect(next.pxPerBar).toBeLessThan(base.startingPxPerBar)
  })

  it("stops at bar 0 and at the smallest allowed frame", () => {
    expect(minimapDragLeftEdge({ ...base, deltaBars: -1000 }).scrollX).toBe(0)
    const tiny = minimapDragLeftEdge({ ...base, deltaBars: 1000 })
    expect(tiny.pxPerBar).toBeCloseTo(base.maxPxPerBar)
  })
})

describe("minimap right edge drag", () => {
  const base = {
    bars: 128,
    viewportWidth: 640,
    minPxPerBar: 5,
    maxPxPerBar: gridZoomLimit(4, 4),
    startingPxPerBar: 32,
    startingScrollX: 320,
  } as const

  it("expands the frame by moving the right edge right, zooming out", () => {
    const leftBar = base.startingScrollX / base.startingPxPerBar
    const next = minimapDragRightEdge({ ...base, deltaBars: 4 })
    expect(next.scrollX / next.pxPerBar).toBeCloseTo(leftBar)
    expect((next.scrollX + base.viewportWidth) / next.pxPerBar).toBeCloseTo(leftBar + 20 + 4)
    expect(next.pxPerBar).toBeLessThan(base.startingPxPerBar)
  })

  it("shrinks the frame by moving the right edge left, zooming in and keeping the left pinned", () => {
    const leftBar = base.startingScrollX / base.startingPxPerBar
    const next = minimapDragRightEdge({ ...base, deltaBars: -8 })
    expect(next.scrollX / next.pxPerBar).toBeCloseTo(leftBar)
    expect((next.scrollX + base.viewportWidth) / next.pxPerBar).toBeCloseTo(leftBar + 20 - 8)
    expect(next.pxPerBar).toBeGreaterThan(base.startingPxPerBar)
  })
  it("stops at the project end and at the smallest allowed frame", () => {
    const expanded = minimapDragRightEdge({ ...base, deltaBars: 1000 })
    const leftBar = base.startingScrollX / base.startingPxPerBar
    expect((expanded.scrollX + base.viewportWidth) / expanded.pxPerBar).toBeCloseTo(base.bars)
    expect(expanded.pxPerBar).toBeCloseTo(base.viewportWidth / (base.bars - leftBar))
    const tiny = minimapDragRightEdge({ ...base, deltaBars: -1000 })
    expect(tiny.pxPerBar).toBeCloseTo(base.maxPxPerBar)
  })
})
