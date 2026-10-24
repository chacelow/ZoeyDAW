import { describe, expect, it } from "vitest"
import {
  minimapAnchor,
  minimapEdgeZoom,
  minimapFrame,
  minimapHit,
  minimapPan,
  minimapZoom,
} from "./zoom"

const geometry = {
  bars: 128,
  viewportWidth: 640,
  pxPerBar: 32,
  scrollX: 320,
  minPxPerBar: 639 / 128,
  maxPxPerBar: 100000,
  onNavigate() {},
}

describe("Arrangement overview native frame mapping", () => {
  it("includes both caps and maps the available pan distance", () => {
    expect(minimapFrame(1000, geometry)).toMatchObject({ left: 78, right: 237 })
    expect(minimapFrame(1000, { ...geometry, scrollX: 3456 })).toMatchObject({
      left: 841,
      right: 1000,
    })
  })
  it("keeps a 12px inner frame plus two 2px caps at extreme zoom", () => {
    const p = { ...geometry, pxPerBar: 20000, scrollX: 128 * 20000 - 640 }
    expect(minimapFrame(1000, p)).toMatchObject({ left: 984, right: 1000 })
    expect(minimapHit(985, 1000, p)).toBe("left")
    expect(minimapHit(990, 1000, p)).toBe("body")
    expect(minimapHit(998, 1000, p)).toBe("right")
    expect(minimapHit(1000, 1000, p)).toBe("body")
  })
  it("uses alternate pan and page modes with a modifier", () => {
    expect(minimapHit(80, 1000, geometry, true)).toBe("pan")
    expect(minimapHit(500, 1000, geometry, true)).toBe("page")
  })
})

describe("actual content viewport transformations", () => {
  it("preserves the content time anchor while changing width", () => {
    const anchor = minimapAnchor(1000, 100, geometry)
    const before = anchor * geometry.pxPerBar - geometry.scrollX
    const next = minimapZoom(geometry, 64, anchor)
    expect(Math.abs(anchor * next.pxPerBar - next.scrollX - before)).toBeLessThanOrEqual(0.5)
  })
  it("clamps zoom width and immediately reverses panning at a boundary", () => {
    expect(minimapZoom(geometry, -32, 0)).toEqual({ pxPerBar: 639 / 128, scrollX: 0 })
    const p = { ...geometry, ...minimapPan(geometry, -1000) }
    expect(minimapPan(p, 10).scrollX).toBe(10)
  })
  it.each(["left", "right"] as const)("keeps the opposite time boundary on %s resize", mode => {
    const frame = minimapFrame(1000, geometry)
    const x = mode === "left" ? frame.left + 20 : frame.right - 20
    const anchor =
      (geometry.scrollX + (mode === "left" ? geometry.viewportWidth : 0)) / geometry.pxPerBar
    const next = minimapZoom(geometry, minimapEdgeZoom(1000, x, mode, frame, geometry), anchor)
    expect(
      (next.scrollX + (mode === "left" ? geometry.viewportWidth : 0)) / next.pxPerBar
    ).toBeCloseTo(anchor, 1)
    expect(next.pxPerBar).toBeGreaterThan(geometry.pxPerBar)
  })

  it("stops edge resizing at the native bounds after pointer capture leaves the overview", () => {
    const frame = minimapFrame(1000, geometry)
    expect(minimapEdgeZoom(1000, 2000, "right", frame, geometry)).toBe(
      minimapEdgeZoom(1000, 1000, "right", frame, geometry)
    )
    const requested = minimapEdgeZoom(1000, -2000, "left", frame, geometry)
    expect(requested).toBeCloseTo((4097 * 640) / (960 * 128), 10)
  })
})
