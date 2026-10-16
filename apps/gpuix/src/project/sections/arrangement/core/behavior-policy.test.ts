import { expect, test } from "bun:test"
import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { createMockDocument } from "@/project/adapters/fixtures"
import { createSceneStore } from "./scene"
import { activeAutomationRows } from "./automation/geometry"
import { paintAutomation } from "./automation/drawing"
import { dragStarted } from "./interactions/layers"
import { edgeScroll } from "./viewport/edge-scroll"
import { minimapDragBody } from "./viewport/minimap"

test("shared drag threshold controls activation and preserves its inclusive Euclidean boundary", () => {
  const policy = { dragThresholdPixels: 10 }
  expect(dragStarted({ x: 0, y: 0 }, { x: 6, y: 7.9 }, policy)).toBe(false)
  expect(dragStarted({ x: 0, y: 0 }, { x: 6, y: 8 }, policy)).toBe(true)
})

test("autoscroll uses independent axis speeds and the configured elapsed cap", () => {
  const tracks = createMockDocument().tracks.map(track => ({ ...track, heightPx: 500 }))
  const base = {
    geometry: DEFAULT_LAYOUT_TOKENS.track,
    viewport: { width: 800, height: 400, pxPerBar: 100, scrollX: 100, scrollY: 100, dpr: 1 },
    bars: 128,
    tracks,
    pointer: { x: 800, y: 0 },
    axis: "both" as const,
    edge: 40,
    elapsed: 100,
    policy: { maxElapsedMs: 10, horizontalPixelsPerMs: 2, verticalPixelsPerMs: 3 },
  }
  // Omit pinned tracks so a vertical scrollable region exists in the fixture viewport.
  base.tracks = tracks.filter(track => track.kind !== "return" && track.kind !== "main")
  expect(edgeScroll(base)).toEqual({ scrollX: 120, scrollY: 70 })
  expect(edgeScroll({ ...base, elapsed: 5 })).toEqual({ scrollX: 110, scrollY: 85 })
})

test("minimap horizontal drag follows its policy independently of vertical zoom", () => {
  const geometry = {
    bars: 128,
    viewportWidth: 640,
    pxPerBar: 32,
    scrollX: 640,
    minPxPerBar: 1,
    maxPxPerBar: 4096,
    policy: {
      ...ARRANGEMENT_DEFAULTS,
      zoom: { ...ARRANGEMENT_DEFAULTS.zoom, minimapPanScale: 0.5 },
    },
  }
  expect(
    minimapDragBody({
      geometry,
      width: 1280,
      initialScrollX: 640,
      zoomAnchorRatio: 0.5,
      deltaX: 40,
      deltaY: 0,
    })
  ).toEqual({ pxPerBar: 32, scrollX: 704 })
})

test("automation freehand samples at the configured pixel resolution and keeps interpolated values", () => {
  const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  const track = createMockDocument().tracks.find(item => item.kind === "audio")
  if (!track) throw new Error("Missing audio fixture track")
  store.setMusic({ ...store.get(), tracks: [{ ...track, collapsed: false, heightPx: 120 }] })
  store.setViewport({ width: 500, height: 300, pxPerBar: 100, scrollX: 0, scrollY: 0, dpr: 1 })
  const [row] = activeAutomationRows(store.get())
  if (!row) throw new Error("Missing automation row")
  const last = { x: 20, y: row.valueTop + row.valueHeight }
  const result = paintAutomation({
    original: [],
    state: { painted: [], swept: [], last, nextId: 0 },
    current: { x: 32, y: row.valueTop },
    scene: store.get(),
    policy: { freehandSamplePixels: 6 },
    row,
    grid: 1,
    freehand: true,
    idPrefix: "configured-sampling",
  })
  expect(result.points.map(point => [point.bar, point.value])).toEqual([
    [1.2, 0],
    [1.26, 0.5],
    [1.32, 1],
  ])
})
