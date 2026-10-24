import { describe, expect, it } from "vitest"
import { waveformContour } from "./waveform-polygon"

function vertices(path: string): number[][] {
  return Array.from(path.matchAll(/[ML](-?[\d.e+-]+),(-?[\d.e+-]+)/g), match => [
    Number(match[1]),
    Number(match[2]),
  ])
}

describe("native waveform contour", () => {
  it("expands a flat min=max DC line into a one-pixel strip with unextended endcaps", () => {
    const line = [
      { x: 0, y: 3 },
      { x: 2, y: 3 },
      { x: 4, y: 3 },
    ]
    const path = waveformContour(line, line)
    expect(vertices(path)).toEqual([
      [2, 2.5],
      [4, 2.5],
      [4, 3.5],
      [2, 3.5],
      [0, 3.5],
      [0, 2.5],
    ])
    expect(path.endsWith("Z")).toBe(true)
  })

  it("fills an impulse band with beveled peaks and averaged side joins, not vertical bars", () => {
    const path = waveformContour(
      [
        { x: 0, y: 5 },
        { x: 2, y: 1 },
        { x: 4, y: 5 },
      ],
      [
        { x: 0, y: 5 },
        { x: 2, y: 9 },
        { x: 4, y: 5 },
      ]
    )
    // Side-join normals differ by (0, 1 / sqrt(5)): distance² = 0.2 < 0.25.
    // The native fallback averages these endpoints; the top/bottom joins bevel.
    expect(vertices(path)).toEqual([
      [398 / 256, 199 / 256],
      [626 / 256, 199 / 256],
      [1138 / 256, 5],
      [626 / 256, 2361 / 256],
      [398 / 256, 2361 / 256],
      [-114 / 256, 5],
    ])
    expect(path.match(/M/g)).toHaveLength(1)
  })

  it("intersects inward offset lines and expands outside an already-clipped contour", () => {
    const points = vertices(
      waveformContour(
        [
          { x: 0, y: 0 },
          { x: 2, y: 2 },
          { x: 4, y: 0 },
        ],
        [
          { x: 0, y: 6 },
          { x: 2, y: 6 },
          { x: 4, y: 6 },
        ]
      )
    )
    expect(points[0]).toEqual([2, 331 / 256])
    expect(points).toContainEqual([4.5, 0])
    expect(points).toContainEqual([-0.5, 0])
    expect(Math.min(...points.map(([, y]) => y))).toBe(-91 / 256)
    expect(Math.max(...points.map(([, y]) => y))).toBe(6.5)
  })

  it("bevels a sharp inward join when its miter is longer than both adjacent edges", () => {
    const points = vertices(
      waveformContour(
        [
          { x: 0, y: 0 },
          { x: 0.1, y: 1 },
          { x: 0.2, y: 0 },
        ],
        [
          { x: 0, y: 4 },
          { x: 0.1, y: 4 },
          { x: 0.2, y: 4 },
        ]
      )
    )
    expect(points.slice(0, 2)).toEqual([
      [153 / 256, 243 / 256],
      [-102 / 256, 243 / 256],
    ])
    expect(points.every(([, y]) => y > -1)).toBe(true)
  })

  it("accepts a miter shorter than either adjacent edge, not necessarily both", () => {
    const points = vertices(
      waveformContour(
        [
          { x: 0, y: 0 },
          { x: 0.1, y: 1 },
          { x: 0.2, y: -19 },
        ],
        [
          { x: 0, y: 4 },
          { x: 0.1, y: 4 },
          { x: 0.2, y: 4 },
        ]
      )
    )
    expect(points[0]).toEqual([-90 / 256, -2188 / 256])
  })

  it("averages nearby offset endpoints instead of intersecting a shallow outward join", () => {
    const points = vertices(
      waveformContour(
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 8, y: 1 },
        ],
        [
          { x: 0, y: 4 },
          { x: 4, y: 4 },
          { x: 8, y: 4 },
        ]
      )
    )
    expect(points[0]).toEqual([1040 / 256, -126 / 256])
  })

  it("skips a half-pixel edge without moving the converter's previous vertex", () => {
    const line = [
      { x: 0, y: 2 },
      { x: 0.5, y: 2 },
      { x: 0.75, y: 2 },
      { x: 2, y: 2 },
    ]
    const points = vertices(waveformContour(line, line))
    expect(points[0]).toEqual([0.75, 1.5])
    expect(points).not.toContainEqual([0.5, 1.5])
    expect(points).toContainEqual([0, 1.5])
    expect(points).toContainEqual([0, 2.5])
  })

  it("retains native skipped-end-edge behavior for a long narrow band", () => {
    const path = waveformContour(
      [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
      ],
      [
        { x: 0, y: 0.125 },
        { x: 1000, y: 0.125 },
      ]
    )
    expect(path).toBe("M1000,-0.5L1000,0.5L0,0.625L0,-0.375Z")
  })

  it("rounds both signs away from zero at 24.8 half-unit ties after expansion", () => {
    const line = [
      { x: -1 / 512, y: 0 },
      { x: 1 + 1 / 512, y: 0 },
    ]
    expect(vertices(waveformContour(line, line))).toEqual([
      [257 / 256, -0.5],
      [257 / 256, 0.5],
      [-1 / 256, 0.5],
      [-1 / 256, -0.5],
    ])
  })

  it("returns no fill when there are no edges longer than half a pixel", () => {
    expect(waveformContour([], [])).toBe("")
    const line = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
    ]
    expect(waveformContour(line, line)).toBe("")
  })

  it("does not mutate either ordered input", () => {
    const upper = Object.freeze([Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 4, y: 0 })])
    const lower = Object.freeze([Object.freeze({ x: 0, y: 2 }), Object.freeze({ x: 4, y: 2 })])
    waveformContour(upper, lower)
    expect(upper).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ])
    expect(lower).toEqual([
      { x: 0, y: 2 },
      { x: 4, y: 2 },
    ])
  })
})
