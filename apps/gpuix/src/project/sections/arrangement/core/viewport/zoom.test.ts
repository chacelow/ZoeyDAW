import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { describe, expect, it } from "bun:test"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { gridZoomLimit } from "../../../../model/grid"
import type { Track } from "../../../../model/types"
import {
  clampScrollX,
  clampTimelineViewport,
  followViewport,
  minimapDragLeftEdge,
  minimapDragRightEdge,
  minimapDragZoom,
  panViewport,
  stepZoom,
  wheelZoom,
  zoomAtAnchor,
} from "./zoom"

const edgeBase = {
  bars: 128,
  viewportWidth: 640,
  minPxPerBar: 5,
  maxPxPerBar: gridZoomLimit(4, 4),
  startingPxPerBar: 32,
  startingScrollX: 320,
}

const zoomBase = {
  bars: 128,
  viewportWidth: 640,
  minPxPerBar: 5,
  maxPxPerBar: gridZoomLimit(4, 4),
  pxPerBar: 32,
  scrollX: 640,
  anchorX: 320,
}

const audioTrack: Track = {
  id: "audio",
  name: "Audio",
  kind: "audio",
  color: "#888888",
  solo: false,
  armed: false,
  mute: false,
  volumeDb: 0,
  pan: 0,
  input: "none",
  output: "main",
  clips: [],
  heightPx: 300,
  monitor: "off",
  automation: [],
}
const tracks: Track[] = [
  audioTrack,
  { ...audioTrack, id: "second" },
  { ...audioTrack, id: "main", kind: "main", heightPx: 100 },
]

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

describe("minimap vertical drag zoom", () => {
  it("lowers pxPerBar downward and increases it upward", () => {
    const starting = 32
    const viewportWidth = 640
    const initialBars = viewportWidth / starting
    expect(
      viewportWidth /
        minimapDragZoom(starting, 100, 160, 8, gridZoomLimit(4, 4), ARRANGEMENT_DEFAULTS.zoom)
    ).toBeGreaterThan(initialBars)
    expect(
      viewportWidth /
        minimapDragZoom(starting, 100, 40, 8, gridZoomLimit(4, 4), ARRANGEMENT_DEFAULTS.zoom)
    ).toBeLessThan(initialBars)
    expect(
      minimapDragZoom(starting, 100, 100, 8, gridZoomLimit(4, 4), ARRANGEMENT_DEFAULTS.zoom)
    ).toBe(starting)
  })

  it("stops at minimum and maximum zoom", () => {
    expect(minimapDragZoom(32, 100, 1000, 8, gridZoomLimit(4, 4), ARRANGEMENT_DEFAULTS.zoom)).toBe(
      8
    )
    expect(minimapDragZoom(32, 100, -1000, 8, gridZoomLimit(4, 4), ARRANGEMENT_DEFAULTS.zoom)).toBe(
      gridZoomLimit(4, 4)
    )
  })
})

describe("minimap left edge drag", () => {
  it("shrinks the frame by moving left edge right and pins the right edge", () => {
    const rightBar =
      edgeBase.startingScrollX / edgeBase.startingPxPerBar +
      edgeBase.viewportWidth / edgeBase.startingPxPerBar
    const next = minimapDragLeftEdge({ ...edgeBase, deltaBars: 4 })
    expect(next.scrollX / next.pxPerBar).toBeCloseTo(14)
    expect((next.scrollX + edgeBase.viewportWidth) / next.pxPerBar).toBeCloseTo(rightBar)
    expect(next.pxPerBar).toBeGreaterThan(edgeBase.startingPxPerBar)
  })

  it("expands the frame by moving left edge left and pins the right edge", () => {
    const next = minimapDragLeftEdge({ ...edgeBase, deltaBars: -8 })
    expect(next.scrollX / next.pxPerBar).toBeCloseTo(2)
    expect((next.scrollX + edgeBase.viewportWidth) / next.pxPerBar).toBeCloseTo(30)
    expect(next.pxPerBar).toBeLessThan(edgeBase.startingPxPerBar)
  })

  it("stops at the project start and the smallest allowed frame", () => {
    expect(minimapDragLeftEdge({ ...edgeBase, deltaBars: -1000 }).scrollX).toBe(0)
    expect(minimapDragLeftEdge({ ...edgeBase, deltaBars: 1000 }).pxPerBar).toBeCloseTo(
      edgeBase.maxPxPerBar
    )
  })
})

describe("minimap right edge drag", () => {
  it("expands the frame right while pinning the left edge", () => {
    const next = minimapDragRightEdge({ ...edgeBase, deltaBars: 4 })
    expect(next.scrollX / next.pxPerBar).toBeCloseTo(10)
    expect((next.scrollX + edgeBase.viewportWidth) / next.pxPerBar).toBeCloseTo(34)
    expect(next.pxPerBar).toBeLessThan(edgeBase.startingPxPerBar)
  })

  it("shrinks the frame left while pinning the left edge", () => {
    const next = minimapDragRightEdge({ ...edgeBase, deltaBars: -8 })
    expect(next.scrollX / next.pxPerBar).toBeCloseTo(10)
    expect((next.scrollX + edgeBase.viewportWidth) / next.pxPerBar).toBeCloseTo(22)
    expect(next.pxPerBar).toBeGreaterThan(edgeBase.startingPxPerBar)
  })

  it("stops at the project end and the smallest allowed frame", () => {
    const expanded = minimapDragRightEdge({ ...edgeBase, deltaBars: 1000 })
    expect((expanded.scrollX + edgeBase.viewportWidth) / expanded.pxPerBar).toBeCloseTo(
      edgeBase.bars
    )
    expect(expanded.pxPerBar).toBeCloseTo(edgeBase.viewportWidth / (edgeBase.bars - 10))
    expect(minimapDragRightEdge({ ...edgeBase, deltaBars: -1000 }).pxPerBar).toBeCloseTo(
      edgeBase.maxPxPerBar
    )
  })
})

describe("anchored timeline zoom", () => {
  it.each([0, 320, 640])("preserves the bar under pixel %i", anchorX => {
    const next = zoomAtAnchor({ ...zoomBase, anchorX, nextPxPerBar: 64 })
    const anchorBar = 1 + (zoomBase.scrollX + anchorX) / zoomBase.pxPerBar
    expect((anchorBar - 1) * next.pxPerBar - next.scrollX).toBeCloseTo(anchorX)
    expect(next.scrollX).toBe(1280 + anchorX)
  })

  it("preserves anchor pixels across seeded unclamped projections", () => {
    const random = seededRandom(0xb1a77a)
    for (let sample = 0; sample < 500; sample += 1) {
      const bars = 4096
      const viewportWidth = 400 + random() * 800
      const pxPerBar = 32 + random() * 128
      const scrollX = (bars * pxPerBar - viewportWidth) * (0.2 + random() * 0.6)
      const anchorX = random() * viewportWidth
      const nextPxPerBar = pxPerBar * (0.75 + random() * 0.75)
      const anchorBar = 1 + (scrollX + anchorX) / pxPerBar
      const requestedScrollX = (anchorBar - 1) * nextPxPerBar - anchorX
      expect(requestedScrollX).toBeGreaterThan(0)
      expect(requestedScrollX).toBeLessThan(bars * nextPxPerBar - viewportWidth)
      const next = zoomAtAnchor({
        bars,
        viewportWidth,
        pxPerBar,
        scrollX,
        anchorX,
        minPxPerBar: viewportWidth / bars,
        maxPxPerBar: gridZoomLimit(4, 4),
        nextPxPerBar,
      })
      expect(next.pxPerBar).toBe(nextPxPerBar)
      expect((anchorBar - 1) * next.pxPerBar - next.scrollX).toBeCloseTo(anchorX, 8)
    }
  })

  it("clamps wheel zoom at both limits and clamps scroll at project boundaries", () => {
    expect(wheelZoom({ ...zoomBase, deltaY: 1_000_000 }, ARRANGEMENT_DEFAULTS.zoom)).toEqual({
      pxPerBar: 5,
      scrollX: 0,
    })
    const maximum = wheelZoom({ ...zoomBase, deltaY: -1_000_000 }, ARRANGEMENT_DEFAULTS.zoom)
    expect(maximum.pxPerBar).toBe(zoomBase.maxPxPerBar)
    expect(maximum.scrollX).toBe(30 * zoomBase.maxPxPerBar - 320)
    expect(zoomAtAnchor({ ...zoomBase, scrollX: 0, nextPxPerBar: 16 }).scrollX).toBe(0)
    expect(zoomAtAnchor({ ...zoomBase, scrollX: 3456, nextPxPerBar: 16 }).scrollX).toBe(1408)
  })

  it("clamps wheel anchor offsets to the canvas and applies exponential zoom", () => {
    expect(
      wheelZoom(
        { ...zoomBase, anchorX: -20, deltaY: -260 * Math.log(2) },
        ARRANGEMENT_DEFAULTS.zoom
      ).scrollX
    ).toBeCloseTo(1280)
    expect(
      wheelZoom(
        { ...zoomBase, anchorX: 900, deltaY: -260 * Math.log(2) },
        ARRANGEMENT_DEFAULTS.zoom
      ).scrollX
    ).toBeCloseTo(1920)
  })

  it("zooms buttons about the center using reciprocal steps", () => {
    expect(stepZoom({ ...zoomBase, direction: 1 }, ARRANGEMENT_DEFAULTS.zoom)).toEqual({
      pxPerBar: 40,
      scrollX: 880,
    })
    expect(stepZoom({ ...zoomBase, direction: -1 }, ARRANGEMENT_DEFAULTS.zoom)).toEqual({
      pxPerBar: 25.6,
      scrollX: 448,
    })
  })
})

describe("viewport clamping and navigation", () => {
  const base = {
    bars: 128,
    containerWidth: DEFAULT_LAYOUT_TOKENS.track.controlsWidth + 640,
    bodyHeight: 400,
    numerator: 4,
    denominator: 4,
    tracks,
    geometry: DEFAULT_LAYOUT_TOKENS.track,
    storedPxPerBar: 32,
    storedScrollX: 320,
    storedScrollY: 100,
  }

  it("derives fit/grid zoom bounds and clamps both axes including pinned tracks", () => {
    const minimum = clampTimelineViewport(
      {
        ...base,
        storedPxPerBar: -1,
        storedScrollX: 1e9,
        storedScrollY: 1e9,
      },
      ARRANGEMENT_DEFAULTS.zoom
    )
    expect(minimum.timeViewportWidth).toBe(640)
    expect(minimum.minPxPerBar).toBe(5)
    expect(minimum.maxPxPerBar).toBe(gridZoomLimit(4, 4))
    expect(minimum.pxPerBar).toBe(5)
    expect(minimum.timelineWidth).toBe(640)
    expect(minimum.scrollX).toBe(0)
    expect(minimum.scrollY).toBe(352)
    const maximum = clampTimelineViewport(
      {
        ...base,
        storedPxPerBar: 1e9,
        storedScrollX: -1,
        storedScrollY: -1,
      },
      ARRANGEMENT_DEFAULTS.zoom
    )
    expect(maximum.pxPerBar).toBe(gridZoomLimit(4, 4))
    expect(maximum.scrollX).toBe(0)
    expect(maximum.scrollY).toBe(0)
  })

  it("preserves unmeasured vertical scroll and supplies initial zoom fallbacks", () => {
    const unmeasured = clampTimelineViewport(
      {
        ...base,
        containerWidth: 0,
        bodyHeight: 0,
        storedPxPerBar: 0,
      },
      ARRANGEMENT_DEFAULTS.zoom
    )
    expect(unmeasured.timeViewportWidth).toBe(0)
    expect(unmeasured.pxPerBar).toBe(1)
    expect(unmeasured.scrollY).toBe(100)
    const fit = clampTimelineViewport({ ...base, storedPxPerBar: 0 }, ARRANGEMENT_DEFAULTS.zoom)
    expect(fit.pxPerBar).toBe(5)
    expect(clampScrollX(100, 4, 10, 640)).toBe(0)
  })

  it("does not invert zoom bounds when fitting exceeds the grid limit", () => {
    const wide = clampTimelineViewport(
      { ...base, bars: 1, containerWidth: DEFAULT_LAYOUT_TOKENS.track.controlsWidth + 1e6 },
      ARRANGEMENT_DEFAULTS.zoom
    )
    expect(wide.minPxPerBar).toBe(1e6)
    expect(wide.maxPxPerBar).toBe(1e6)
    expect(wide.pxPerBar).toBe(1e6)
  })

  it("pans normal wheels on both axes and combines shifted deltas horizontally", () => {
    const pan = {
      bars: 128,
      width: 640,
      height: 400,
      tracks,
      geometry: DEFAULT_LAYOUT_TOKENS.track,
      pxPerBar: 32,
      scrollX: 320,
      scrollY: 100,
      deltaX: 20,
      deltaY: 40,
      shiftKey: false,
    }
    expect(panViewport(pan)).toEqual({ scrollX: 340, scrollY: 140 })
    expect(panViewport({ ...pan, shiftKey: true })).toEqual({ scrollX: 380, scrollY: 100 })
    expect(panViewport({ ...pan, deltaX: 1e9, deltaY: 1e9 })).toEqual({
      scrollX: 3456,
      scrollY: 352,
    })
    expect(panViewport({ ...pan, deltaX: -1e9, deltaY: -1e9 })).toEqual({ scrollX: 0, scrollY: 0 })
  })

  it("follows one-based bars only outside the leading half viewport", () => {
    const follow = {
      ...zoomBase,
      transportBar: 26,
      follow: true,
      playing: true,
      now: 2000,
      manualPanUntil: 2000,
    }
    expect(followViewport(follow, ARRANGEMENT_DEFAULTS.follow)).toBe(640)
    expect(followViewport({ ...follow, transportBar: 31 }, ARRANGEMENT_DEFAULTS.follow)).toBe(640)
    expect(followViewport({ ...follow, transportBar: 32 }, ARRANGEMENT_DEFAULTS.follow)).toBe(672)
    expect(followViewport({ ...follow, transportBar: 20 }, ARRANGEMENT_DEFAULTS.follow)).toBe(288)
    expect(followViewport({ ...follow, transportBar: 1 }, ARRANGEMENT_DEFAULTS.follow)).toBe(0)
    expect(followViewport({ ...follow, transportBar: 200 }, ARRANGEMENT_DEFAULTS.follow)).toBe(3456)
  })

  it("leaves follow suspended until its deadline or while disabled, stopped or unmeasured", () => {
    const follow = {
      ...zoomBase,
      transportBar: 90,
      follow: true,
      playing: true,
      now: 2000,
      manualPanUntil: 2000,
    }
    expect(followViewport({ ...follow, now: 1999 }, ARRANGEMENT_DEFAULTS.follow)).toBe(640)
    expect(followViewport({ ...follow, follow: false }, ARRANGEMENT_DEFAULTS.follow)).toBe(640)
    expect(followViewport({ ...follow, playing: false }, ARRANGEMENT_DEFAULTS.follow)).toBe(640)
    expect(followViewport({ ...follow, viewportWidth: 0 }, ARRANGEMENT_DEFAULTS.follow)).toBe(640)
    expect(followViewport(follow, ARRANGEMENT_DEFAULTS.follow)).toBe(2528)
  })
})
