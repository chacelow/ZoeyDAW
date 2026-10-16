import { expect, test } from "bun:test"
import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { CONTROLS_WIDTH } from "@/project/layout"
import { clampTimelineViewport, followViewport, minimapDragZoom, stepZoom, wheelZoom } from "./zoom"

const viewport = {
  bars: 512,
  viewportWidth: 800,
  minPxPerBar: 1,
  maxPxPerBar: 4096,
  pxPerBar: 100,
  scrollX: 1000,
}

test("wheel zoom uses the configured exponential sensitivity and keeps the pointer anchor", () => {
  const policy = { ...ARRANGEMENT_DEFAULTS.zoom, wheelPixelsPerExponent: 100 }
  const next = wheelZoom({ ...viewport, anchorX: 200, deltaY: -100 }, policy)
  expect(next.pxPerBar).toBeCloseTo(100 * Math.E)
  expect((next.scrollX + 200) / next.pxPerBar).toBeCloseTo(12)
})

test("minimap vertical zoom uses its own sensitivity", () => {
  const policy = { ...ARRANGEMENT_DEFAULTS.zoom, minimapPixelsPerExponent: 200 }
  expect(minimapDragZoom(100, 0, 200, 1, 4096, policy)).toBeCloseTo(100 / Math.E)
})

test("zoom buttons use independent in/out factors and a configurable anchor", () => {
  const policy = {
    ...ARRANGEMENT_DEFAULTS.zoom,
    stepInFactor: 2,
    stepOutFactor: 0.25,
    stepAnchorRatio: 0.25,
  }
  const zoomIn = stepZoom({ ...viewport, direction: 1 }, policy)
  const zoomOut = stepZoom({ ...viewport, direction: -1 }, policy)
  expect(zoomIn.pxPerBar).toBe(200)
  expect(zoomIn.scrollX).toBe(2200)
  expect(zoomOut.pxPerBar).toBe(25)
  expect(zoomOut.scrollX).toBe(100)
})

test("follow trigger and recentering anchor are independent preferences", () => {
  const input = {
    ...viewport,
    transportBar: 16,
    follow: true,
    playing: true,
    now: 3000,
    manualPanUntil: 2000,
  }
  expect(followViewport(input, { ...ARRANGEMENT_DEFAULTS.follow, triggerRatio: 0.75 })).toBe(1000)
  expect(followViewport(input, { ...ARRANGEMENT_DEFAULTS.follow, anchorRatio: 0.25 })).toBe(1300)
  expect(followViewport({ ...input, manualPanUntil: 3001 }, ARRANGEMENT_DEFAULTS.follow)).toBe(1000)
})

test("minimum zoom fits the configured timeline extent and uses the unmeasured policy fallback", () => {
  const input = {
    bars: 128,
    containerWidth: CONTROLS_WIDTH + 800,
    bodyHeight: 300,
    numerator: 4,
    denominator: 4,
    tracks: [],
    storedPxPerBar: 0,
    storedScrollX: 0,
    storedScrollY: 0,
  }
  expect(
    clampTimelineViewport(input, {
      ...ARRANGEMENT_DEFAULTS.zoom,
      minZoomTimelineRatio: 2,
    }).minPxPerBar
  ).toBe(3.125)
  expect(
    clampTimelineViewport(
      { ...input, containerWidth: 0 },
      {
        ...ARRANGEMENT_DEFAULTS.zoom,
        unmeasuredMinPxPerBar: 7,
      }
    ).pxPerBar
  ).toBe(7)
})
