import { describe, expect, test } from "bun:test"
import { adjustGrid, deriveGridPlan, gridZoomLimit, noteGridBars } from "@/project/model/grid"
import { createSceneStore } from "../core/scene"
import { gridLines, numberedRulerPlan, patternRegions, rulerTicks } from "../core/rulers/grid-lines"

const METERS = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 4, denominator: 8 },
  { numerator: 7, denominator: 8 },
]

describe("Music-position grid invariants", () => {
  test("zoomed-out numbering cannot group Pattern shading into four-bar blocks", () => {
    const scene = createSceneStore()
    scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 200, height: 200, dpr: 1 })
    const regions = patternRegions(scene.get())
    expect(
      regions
        .slice(0, 3)
        .map(region => ({ bar: region.bar, width: region.width, alternate: region.alternate }))
    ).toEqual([
      { bar: 1, width: 24, alternate: false },
      { bar: 2, width: 24, alternate: true },
      { bar: 3, width: 24, alternate: false },
    ])
  })

  test("fine ruler labels cannot leave full-height subdivision lines after Ctrl+2 widens the grid", () => {
    const scene = createSceneStore()
    scene.setViewport({ pxPerBar: 800, scrollX: 0, scrollY: 0, width: 1600, height: 200, dpr: 1 })
    scene.setMusic({ ...scene.get(), grid: { mode: "fixed", bars: 16 } })
    expect(gridLines(scene.get()).map(line => line.bar)).toEqual([1, 2, 3])
  })

  test("subpixel Pattern bands are omitted instead of allocating document-wide regions", () => {
    const scene = createSceneStore()
    scene.setViewport({ pxPerBar: 0.5, scrollX: 0, scrollY: 0, width: 800, height: 200, dpr: 1 })
    scene.setMusic({ ...scene.get(), bars: 1e9 })
    expect(patternRegions(scene.get())).toEqual([])
  })

  test("Live-observed 4/8 numbering contains the half-beat sixteenth hierarchy", () => {
    const plan = numberedRulerPlan(320, 4, 8)
    expect(plan.mode).toBe("sixteenth")
    expect(plan.stepBars).toBe(1 / 8)
    expect(numberedRulerPlan(320, 4, 4)).toEqual({ mode: "beat", stepBars: 1 / 4 })
  })

  test("ruler cadence, snapping and Pattern shading remain coherent across randomized zooms and five meters", () => {
    let seed = 71321
    const scene = createSceneStore()
    for (let i = 0; i < 500; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const meter = METERS[i % METERS.length]
      const pxPerBar = 12 * 2 ** ((seed / 2 ** 32) * 12)
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const scrollX = (seed / 2 ** 32) * Math.max(0, 128 * pxPerBar - 800)
      scene.setViewport({ pxPerBar, scrollX, scrollY: 0, width: 800, height: 320, dpr: 1 })
      scene.setMusic({
        ...scene.get(),
        transport: { ...meter, bpm: 120 },
        grid: { mode: "fixed", bars: noteGridBars(4, meter.numerator, meter.denominator) },
      })
      const current = scene.get()
      const plan = numberedRulerPlan(pxPerBar, meter.numerator, meter.denominator)
      if (plan.mode === "sixteenth")
        expect(plan.stepBars).toBe(noteGridBars(16, meter.numerator, meter.denominator))
      if (plan.mode === "beat") expect(plan.stepBars).toBe(1 / meter.numerator)
      const lines = gridLines(current)
      const majors = lines.filter(line => line.kind === "major")
      for (let index = 1; index < majors.length; index++) {
        expect(Number.isInteger(majors[index].bar)).toBe(true)
        expect(majors[index].bar - majors[index - 1].bar).toBe(1)
        expect(Math.abs(majors[index].x - majors[index - 1].x - pxPerBar)).toBeLessThanOrEqual(1)
      }
      const ticks = rulerTicks(current)
      for (let index = 1; index < ticks.length; index++) {
        expect(ticks[index].bar - ticks[index - 1].bar).toBeCloseTo(plan.stepBars)
        expect(
          Math.abs(ticks[index].x - ticks[index - 1].x - plan.stepBars * pxPerBar)
        ).toBeLessThanOrEqual(1)
      }
      const cell = current.gridPlan.cellBars
      if (cell * pxPerBar >= 2) {
        const first = Math.ceil(scrollX / (cell * pxPerBar))
        const last = Math.floor((scrollX + 800) / (cell * pxPerBar))
        for (let index = first; index <= last; index++) {
          const bar = 1 + index * cell
          expect(lines.some(line => Math.abs(line.bar - bar) < 1e-8)).toBe(true)
        }
      }
      const regions = patternRegions(current)
      expect(regions[0].left).toBe(0)
      expect(regions.reduce((sum, region) => sum + region.width, 0)).toBeCloseTo(800)
      for (let index = 1; index < regions.length; index++) {
        expect(regions[index].alternate).toBe(!regions[index - 1].alternate)
        expect(regions[index].bar - regions[index - 1].bar).toBe(1)
        expect(regions[index].left).toBeCloseTo(regions[index - 1].left + regions[index - 1].width)
      }
      scene.setMusic({ ...current, grid: { mode: "adaptive", density: "narrowest" } })
      expect(patternRegions(scene.get())).toEqual(regions)
    }
  })

  test("Ctrl+1/2 fixed steps saturate at 1/256 notes and 16 bars in every meter", () => {
    for (const meter of METERS) {
      let grid = {
        mode: "fixed",
        bars: noteGridBars(4, meter.numerator, meter.denominator),
      } as const
      for (let i = 0; i < 30; i++) {
        const next = adjustGrid(grid, -1, meter.numerator, meter.denominator)
        if (next.mode !== "fixed") throw new Error("Fixed mode changed")
        grid = next
      }
      expect(grid.bars).toBe(noteGridBars(256, meter.numerator, meter.denominator))
      for (let i = 0; i < 30; i++) {
        const next = adjustGrid(grid, 1, meter.numerator, meter.denominator)
        if (next.mode !== "fixed") throw new Error("Fixed mode changed")
        grid = next
      }
      expect(grid.bars).toBe(16)
    }
  })

  test("maximum zoom keeps 1/16384 cells sparse and independent from numbered Pattern boundaries", () => {
    for (const meter of METERS) {
      const pxPerBar = gridZoomLimit(meter.numerator, meter.denominator)
      const plan = deriveGridPlan(
        { mode: "adaptive", density: "narrowest" },
        pxPerBar,
        meter.numerator,
        meter.denominator
      )
      expect(plan.cellBars).toBe(noteGridBars(16384, meter.numerator, meter.denominator))
      expect(plan.cellBars * pxPerBar).toBe(8)
      const scene = createSceneStore()
      scene.setViewport({
        pxPerBar,
        scrollX: pxPerBar * 4.3,
        scrollY: 0,
        width: 800,
        height: 320,
        dpr: 1,
      })
      scene.setMusic({
        ...scene.get(),
        transport: { ...meter, bpm: 120 },
        grid: { mode: "adaptive", density: "narrowest" },
      })
      expect(gridLines(scene.get()).length).toBeLessThanOrEqual(102)
      expect(patternRegions(scene.get()).map(region => region.bar)).toEqual([5])
    }
  })
})
