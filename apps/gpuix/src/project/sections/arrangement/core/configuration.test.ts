import { expect, test } from "bun:test"
import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { resolveArrangementPolicy } from "./configuration"
import { stepZoom } from "./viewport/zoom"
import { minimapDragBody } from "./viewport/minimap"
import { dragStarted } from "./interactions/layers"
import { advanceMeterPeak, createMeterPeak } from "./meters/meter-peak"

test("sparse overrides preserve valid zero values while undefined fields use their source", () => {
  const source = {
    ...ARRANGEMENT_DEFAULTS,
    zoom: { ...ARRANGEMENT_DEFAULTS.zoom, stepInFactor: 1.5 },
    meter: { ...ARRANGEMENT_DEFAULTS.meter, minDb: -42 },
  }
  const policy = resolveArrangementPolicy(
    source,
    {
      zoom: { stepInFactor: undefined, stepAnchorRatio: 0, minimapPanScale: 0 },
      meter: { holdMs: 0 },
    },
    { dragThresholdPixels: 0 }
  )
  expect(
    stepZoom(
      {
        bars: 128,
        viewportWidth: 800,
        minPxPerBar: 1,
        maxPxPerBar: 4096,
        pxPerBar: 100,
        scrollX: 1000,
        direction: 1,
      },
      policy.zoom
    )
  ).toEqual({ pxPerBar: 150, scrollX: 1500 })
  expect(dragStarted({ x: 0, y: 0 }, { x: 0, y: 0 }, policy.pointer)).toBe(true)
  const peak = createMeterPeak(policy.meter)
  expect(peak.db).toBe(-42)
  advanceMeterPeak(peak, -6, 0, policy.meter)
  advanceMeterPeak(peak, -30, 100, policy.meter)
  expect(peak.db).toBeCloseTo(-8.4)
  expect(
    minimapDragBody({
      geometry: {
        bars: 128,
        viewportWidth: 640,
        pxPerBar: 32,
        scrollX: 640,
        minPxPerBar: 1,
        maxPxPerBar: 4096,
        policy,
      },
      width: 1280,
      initialScrollX: 640,
      zoomAnchorRatio: 0.5,
      deltaX: 40,
      deltaY: 0,
    })
  ).toEqual({ pxPerBar: 32, scrollX: 640 })
})

test("an absent override document uses the injected source rather than hidden global defaults", () => {
  const policy = resolveArrangementPolicy(
    { ...ARRANGEMENT_DEFAULTS, zoom: { ...ARRANGEMENT_DEFAULTS.zoom, stepOutFactor: 0.5 } },
    undefined,
    { dragThresholdPixels: 12 }
  )
  expect(
    stepZoom(
      {
        bars: 128,
        viewportWidth: 800,
        minPxPerBar: 1,
        maxPxPerBar: 4096,
        pxPerBar: 100,
        scrollX: 1000,
        direction: -1,
      },
      policy.zoom
    )
  ).toEqual({ pxPerBar: 50, scrollX: 300 })
  expect(dragStarted({ x: 0, y: 0 }, { x: 10, y: 0 }, policy.pointer)).toBe(false)
})
