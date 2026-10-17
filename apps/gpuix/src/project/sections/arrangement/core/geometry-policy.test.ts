import { expect, test } from "bun:test"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { createMockDocument } from "@/project/adapters/fixtures"
import { createSceneStore } from "./scene"
import type { ArrangementGeometry } from "./scene"
import { arrangementBodyBottom, clipRect, layoutTrackRows } from "./layout"
import { clipVisualGeometry, fadeHandleX } from "./clip-geometry"
import { beginFadeDrag, moveFadeDrag } from "./clip/fade"
import { hitTest } from "./hit-test"
import { activeAutomationRows, automationX, automationY } from "./automation/geometry"
import { hitAutomation } from "./automation/hit"
import { interactionLayer } from "./interactions/layers"
import { numberedRulerPlan, gridLines } from "./rulers/grid-lines"
import { rulerHit } from "./rulers/geometry"

function fixture(
  arrangement: ArrangementGeometry["arrangement"] = DEFAULT_LAYOUT_TOKENS.arrangement
) {
  const geometry = { ...DEFAULT_LAYOUT_TOKENS, arrangement }
  const store = createSceneStore(geometry)
  const track = createMockDocument().tracks.find(item => item.kind === "audio")
  const clip = track?.clips.find(item => item.kind === "audio")
  if (!track || !clip) throw new Error("Missing audio geometry fixture")
  const audio = { ...clip, startBar: 1, lengthBars: 4, fadeInBars: 1, fadeOutBars: 0 }
  const owner = {
    ...track,
    collapsed: false,
    heightPx: 160,
    clips: [audio],
    automation: [
      {
        id: "automation",
        parameter: "volume" as const,
        points: [
          { id: "p1", bar: 2, value: 0.5 },
          { id: "p2", bar: 4, value: 0.5 },
        ],
      },
    ],
  }
  store.setMusic({
    ...store.get(),
    tracks: [owner],
    markers: [{ id: "locator", bar: 2, label: "Locator" }],
  })
  store.setViewport({ width: 800, height: 400, pxPerBar: 100, scrollX: 0, scrollY: 0, dpr: 1 })
  return { store, owner, clip: audio }
}

const defaults = DEFAULT_LAYOUT_TOKENS.arrangement

test("runtime ruler geometry moves rows, clipping and the input owner together", () => {
  const { store } = fixture()
  store.setGeometry({
    ...DEFAULT_LAYOUT_TOKENS,
    arrangement: { ...defaults, barRulerHeight: 60, timeRulerHeight: 30 },
  })
  expect(layoutTrackRows(store.get())[0].top).toBe(60)
  expect(arrangementBodyBottom(400, store.get().geometry.arrangement)).toBe(370)
  expect(interactionLayer(store.get(), { x: 10, y: 45 }, false)).toBe("ruler")
  expect(hitTest(store.get(), 10, 45)).toBeNull()
  expect(hitTest(store.get(), 10, 80)?.kind).toBe("clip-title")
})

test("clip bounds consume configured minimum size, symmetric inset and body threshold", () => {
  const arrangement = {
    ...defaults,
    clip: {
      ...defaults.clip,
      minWidth: 10.4,
      minHeight: 9,
      verticalInset: 3,
      bodyThresholdInset: 8,
    },
  }
  const { store, owner, clip } = fixture(arrangement)
  const [row] = layoutTrackRows(store.get())
  if (!row) throw new Error("Missing configured row")
  const short = { ...clip, lengthBars: 0.01 }
  expect(clipRect(short, row, 100, 0).width).toBe(10.4)
  const tiny = clipVisualGeometry(
    clipRect(short, { ...row, height: 6 }, 100, 0),
    short,
    owner,
    false
  )
  expect(tiny.width).toBe(10.4)
  expect(tiny.height).toBe(9)
  expect(tiny.top).toBe(37)
  const small = clipVisualGeometry(
    clipRect(clip, { ...row, height: 34 }, 100, 0),
    clip,
    owner,
    false
  )
  expect(small.height).toBe(28)
  expect(small.bodyHeight).toBe(0)
})

test("fade margin and hit size independently control clamping, visibility and pointer reach", () => {
  const arrangement = {
    ...defaults,
    clip: { ...defaults.clip, fadeHandleMargin: 9 },
    hit: { ...defaults.hit, clipFadeHandle: 12 },
  }
  const { store, owner, clip } = fixture(arrangement)
  store.setHover({ id: clip.id, region: "body" })
  const [row] = layoutTrackRows(store.get())
  if (!row) throw new Error("Missing fade row")
  const visual = clipVisualGeometry(clipRect(clip, row, 100, 0), clip, owner, true)
  expect(fadeHandleX(visual, visual.left)).toBe(9)
  expect(hitTest(store.get(), 110, visual.bodyTop + 10)?.kind).toBe("clip-fade")
  const narrow = clipVisualGeometry(
    { ...clipRect(clip, row, 100, 0), width: 20 },
    clip,
    owner,
    true
  )
  expect(narrow.fades.map(fade => fade.handlesVisible)).toEqual([false, false])
  const shortFade = { ...clip, fadeInBars: 0.2 }
  const shortOwner = { ...owner, clips: [shortFade] }
  store.setMusic({ ...store.get(), tracks: [shortOwner] })
  const shortVisual = clipVisualGeometry(
    clipRect(shortFade, row, 100, 0),
    shortFade,
    shortOwner,
    true
  )
  expect(
    hitTest(store.get(), shortVisual.fades[0].curve.x, shortVisual.fades[0].curve.y)?.kind
  ).toBe("clip-body")
  const drag = beginFadeDrag(clip, "in", "curve", { x: 0, y: 0 }, 100, 100, 12)
  expect(moveFadeDrag(drag, { x: -1000, y: 0 }, 100).patch?.fadeInCurvePosition).toBe(0.12)
})

test("clip resize slop uses the injected edge without changing body selection", () => {
  const { store } = fixture({ ...defaults, hit: { ...defaults.hit, clipResizeEdge: 2 } })
  expect(hitTest(store.get(), 2, 40)?.kind).toBe("clip-resize")
  expect(hitTest(store.get(), 3, 40)?.kind).toBe("clip-title")
  expect(hitTest(store.get(), 397, 40)?.kind).toBe("clip-title")
  expect(hitTest(store.get(), 398, 40)?.kind).toBe("clip-resize")
})

test("automation drawing radius changes value projection without borrowing the point hit radii", () => {
  const { store } = fixture({ ...defaults, automationPointRadius: 8 })
  const [row] = activeAutomationRows(store.get())
  if (!row) throw new Error("Missing automation row")
  const { titleHeight } = DEFAULT_LAYOUT_TOKENS.track
  expect(row.valueTop).toBe(43 + titleHeight)
  expect(row.valueHeight).toBe(143 - titleHeight)
})

test("automation point hits use independent horizontal and vertical source radii", () => {
  const xFixture = fixture({ ...defaults, hit: { ...defaults.hit, automationPointX: 12 } })
  const [xRow] = activeAutomationRows(xFixture.store.get())
  if (!xRow) throw new Error("Missing X hit row")
  expect(
    hitAutomation(xFixture.store.get(), {
      x: automationX(xFixture.store.get(), 2) + 10,
      y: automationY(xRow, 0.5),
    })?.kind
  ).toBe("point")
  const yFixture = fixture({ ...defaults, hit: { ...defaults.hit, automationPointY: 12 } })
  const [yRow] = activeAutomationRows(yFixture.store.get())
  if (!yRow) throw new Error("Missing Y hit row")
  expect(
    hitAutomation(yFixture.store.get(), {
      x: automationX(yFixture.store.get(), 2),
      y: automationY(yRow, 0.5) + 10,
    })?.kind
  ).toBe("point")
})

test("automation segment reach respects the independent cap, row fraction and near-line boundary", () => {
  for (const hit of [
    { ...defaults.hit, automationSegmentMax: 6 },
    { ...defaults.hit, automationSegmentHeightFraction: 0.01 },
  ]) {
    const { store } = fixture({ ...defaults, hit })
    const [row] = activeAutomationRows(store.get())
    if (!row) throw new Error("Missing segment row")
    expect(hitAutomation(store.get(), { x: 200, y: automationY(row, 0.5) + 10 })?.kind).toBe("lane")
  }
  const { store } = fixture({ ...defaults, hit: { ...defaults.hit, automationNear: 2 } })
  const [row] = activeAutomationRows(store.get())
  if (!row) throw new Error("Missing near-line row")
  expect(hitAutomation(store.get(), { x: 200, y: automationY(row, 0.5) + 3 })).toMatchObject({
    kind: "segment",
    near: true,
  })
  expect(hitAutomation(store.get(), { x: 450, y: automationY(row, 0.5) + 3 })).toMatchObject({
    kind: "lane",
    onLine: false,
  })
})

test("ruler marker and loop-edge hit slop follow their own sources", () => {
  const { store } = fixture({
    ...defaults,
    markerRulerHeight: 25,
    barRulerHeight: 42,
    hit: { ...defaults.hit, rulerMarker: 3, rulerLoopEdge: 2 },
  })
  expect(rulerHit(store.get(), { x: 100, y: 22 })?.kind).toBe("marker")
  expect(rulerHit(store.get(), { x: 104, y: 10 })?.kind).toBe("bar")
  store.setMusic({ ...store.get(), loop: { enabled: true, startBar: 2, endBar: 4 } })
  expect(rulerHit(store.get(), { x: 103, y: 30 })).toEqual({ kind: "loop", edge: "body" })
  expect(rulerHit(store.get(), { x: 297, y: 30 })).toEqual({ kind: "loop", edge: "body" })
  expect(rulerHit(store.get(), { x: 299, y: 30 })).toEqual({ kind: "loop", edge: "end" })
})

test("ruler readability thresholds independently choose subdivisions, beats and whole bars", () => {
  const spacing = defaults.rulerLabelSpacing
  expect(numberedRulerPlan(160, 4, 4, { ...spacing, subdivision: 8 })).toEqual({
    mode: "sixteenth",
    stepBars: 1 / 16,
  })
  expect(numberedRulerPlan(160, 4, 4, { ...spacing, beat: 30 })).toEqual({
    mode: "beat",
    stepBars: 1 / 4,
  })
  expect(numberedRulerPlan(20, 4, 4, { ...spacing, bar: 10 })).toEqual({ mode: "bar", stepBars: 1 })
  expect(numberedRulerPlan(20, 4, 4, { ...spacing, bar: 160 })).toEqual({
    mode: "bar",
    stepBars: 8,
  })
})

test("minor-grid readability can hide fine cells without changing whole-bar lines", () => {
  const { store } = fixture({ ...defaults, gridMinSubdivisionWidth: 10 })
  store.setMusic({ ...store.get(), grid: { mode: "fixed", bars: 1 / 16 } })
  store.setViewport({ ...store.get().viewport, pxPerBar: 80 })
  const lines = gridLines(store.get())
  expect(lines.filter(line => line.kind === "minor")).toEqual([])
  expect(lines.filter(line => line.kind === "major").map(line => line.bar)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
  ])
})
