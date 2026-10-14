import { describe, expect, it } from "bun:test"
import { gridZoomLimit } from "../../../../model/grid"
import { minimapDragBody, minimapHit, minimapPointerDown } from "./minimap"
import type { MinimapGeometry } from "./minimap"

const geometry: MinimapGeometry = {
  bars: 128,
  viewportWidth: 640,
  pxPerBar: 32,
  scrollX: 640,
  minPxPerBar: 5,
  maxPxPerBar: gridZoomLimit(4, 4),
}
const width = 1280

const bodyDrag = {
  geometry,
  width,
  initialScrollX: 640,
  zoomAnchorRatio: 0.5,
  deltaX: 0,
  deltaY: 0,
}

describe("minimap hit classification", () => {
  it("classifies body, edges, and outside jumps with six-pixel edge slop", () => {
    expect(minimapHit(200, width, geometry)).toBe("left")
    expect(minimapHit(194, width, geometry)).toBe("left")
    expect(minimapHit(206, width, geometry)).toBe("left")
    expect(minimapHit(300, width, geometry)).toBe("body")
    expect(minimapHit(394, width, geometry)).toBe("right")
    expect(minimapHit(400, width, geometry)).toBe("right")
    expect(minimapHit(406, width, geometry)).toBe("right")
    expect(minimapHit(193, width, geometry)).toBe("jump")
    expect(minimapHit(407, width, geometry)).toBe("jump")
  })

  it("chooses the nearest edge in narrow frames and breaks ties toward the left", () => {
    const narrow = { ...geometry, pxPerBar: 640, scrollX: 12800 }
    expect(minimapHit(202, width, narrow)).toBe("left")
    expect(minimapHit(205, width, narrow)).toBe("left")
    expect(minimapHit(208, width, narrow)).toBe("right")
  })

  it("limits the selection span to the project length", () => {
    const fit = { ...geometry, pxPerBar: 1, scrollX: 0 }
    expect(minimapHit(width, width, fit)).toBe("right")
    expect(minimapHit(width / 2, width, fit)).toBe("body")
  })
})

describe("minimap pointer-down anchors", () => {
  it.each([
    { x: 200, mode: "left", ratio: 0 },
    { x: 300, mode: "body", ratio: 0.5 },
    { x: 400, mode: "right", ratio: 1 },
  ])("anchors a $mode press at ratio $ratio", ({ x, mode, ratio }) => {
    expect(minimapPointerDown({ x, width, geometry })).toEqual({
      mode,
      initialScrollX: 640,
      zoomAnchorRatio: ratio,
    })
  })

  it("jumps outside the frame to center the pointer and starts a body drag", () => {
    expect(minimapPointerDown({ x: 800, width, geometry })).toEqual({
      mode: "body",
      initialScrollX: 2240,
      zoomAnchorRatio: 0.5,
    })
  })

  it("clamps jumps at the project boundaries while preserving their anchor ratios", () => {
    expect(minimapPointerDown({ x: 0, width, geometry })).toEqual({
      mode: "body",
      initialScrollX: 0,
      zoomAnchorRatio: 0,
    })
    expect(minimapPointerDown({ x: width, width, geometry })).toEqual({
      mode: "body",
      initialScrollX: 3456,
      zoomAnchorRatio: 1,
    })
  })

  it("rejects unmeasured minimap or viewport widths", () => {
    expect(minimapPointerDown({ x: 300, width: 0, geometry })).toBeNull()
    expect(minimapPointerDown({ x: 300, width: -1, geometry })).toBeNull()
    expect(
      minimapPointerDown({ x: 300, width, geometry: { ...geometry, viewportWidth: 0 } })
    ).toBeNull()
  })
})

describe("minimap body drag projection", () => {
  it.each([
    { x: 200, expectedScrollX: 1280 },
    { x: 300, expectedScrollX: 1600 },
    { x: 400, expectedScrollX: 1920 },
  ])("keeps the bar beneath press $x anchored when zooming up", ({ x, expectedScrollX }) => {
    const anchor = minimapPointerDown({ x, width, geometry })
    if (!anchor) {
      throw new Error("Measured minimap must produce an anchor")
    }
    const next = minimapDragBody({
      ...bodyDrag,
      ...anchor,
      deltaY: -100 * Math.log(2),
    })
    expect(next.pxPerBar).toBeCloseTo(64)
    expect(next.scrollX).toBeCloseTo(expectedScrollX)
    const anchorBar = 1 + (x / width) * geometry.bars
    expect((anchorBar - 1) * next.pxPerBar - next.scrollX).toBeCloseTo(
      anchor.zoomAnchorRatio * geometry.viewportWidth
    )
  })

  it("pans at one quarter of the minimap-to-bar projection", () => {
    expect(minimapDragBody({ ...bodyDrag, deltaX: 40 })).toEqual({ pxPerBar: 32, scrollX: 672 })
    expect(minimapDragBody({ ...bodyDrag, deltaX: -40 })).toEqual({ pxPerBar: 32, scrollX: 608 })
    const mixed = minimapDragBody({ ...bodyDrag, deltaX: 40, deltaY: -100 * Math.log(2) })
    expect(mixed.pxPerBar).toBeCloseTo(64)
    expect(mixed.scrollX).toBeCloseTo(1664)
  })

  it("zooms downward out and upward in, with minimum and maximum clamps", () => {
    const downward = minimapDragBody({ ...bodyDrag, deltaY: 100 * Math.log(2) })
    expect(downward.pxPerBar).toBeCloseTo(16)
    expect(downward.scrollX).toBeCloseTo(160)
    expect(minimapDragBody({ ...bodyDrag, deltaY: 1e6 })).toEqual({ pxPerBar: 5, scrollX: 0 })
    const maximum = minimapDragBody({ ...bodyDrag, deltaY: -1e6 })
    expect(maximum.pxPerBar).toBe(geometry.maxPxPerBar)
    expect(maximum.scrollX).toBe(30 * geometry.maxPxPerBar - 320)
  })

  it("clamps body panning at both project boundaries", () => {
    expect(minimapDragBody({ ...bodyDrag, deltaX: -1e6 })).toEqual({ pxPerBar: 32, scrollX: 0 })
    expect(minimapDragBody({ ...bodyDrag, deltaX: 1e6 })).toEqual({ pxPerBar: 32, scrollX: 3456 })
  })

  it("projects from the jumped scroll position rather than the pre-jump viewport", () => {
    const anchor = minimapPointerDown({ x: 800, width, geometry })
    if (!anchor) {
      throw new Error("Measured minimap must produce an anchor")
    }
    expect(minimapDragBody({ ...bodyDrag, ...anchor })).toEqual({ pxPerBar: 32, scrollX: 2240 })
  })
})
