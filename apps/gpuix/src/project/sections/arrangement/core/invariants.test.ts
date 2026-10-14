import { expect, test } from "bun:test"
import { createMockDocument } from "../../../adapters/fixtures"
import { deriveGridPlan, gridZoomLimit } from "../../../model/grid"
import {
  resizeTrackHeight,
  TRACK_RESIZE_STEP,
  TRACK_REVEAL_THRESHOLD,
  COLLAPSED_TRACK_HEIGHT,
} from "../../../layout"
import { projectClipResize } from "../../../model/clip-edits"
import { fadeControls } from "../../../model/fades"
import { createSceneStore } from "./scene"
import { clipRect, layoutTrackRows } from "./layout"
import { clipVisualGeometry, RESIZE_EDGE_PX } from "./clip-geometry"
import { hitTest } from "./hit-test"
import { automationBar, automationX } from "./automation/geometry"
import { rulerBar } from "./rulers/geometry"
import { gridLines } from "./rulers/grid-lines"
import { beginFadeDrag, moveFadeDrag } from "./clip/fade"
import type { AudioClip } from "../../../model/types"

function random(seed: number) {
  let value = seed
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 2 ** 32
  }
}

function fixture() {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "audio")!
  const clip = track.clips.find(item => item.kind === "audio")!
  if (clip.kind !== "audio") throw new Error("Expected audio fixture")
  const owner = { ...track, collapsed: false, heightPx: 120, clips: [clip] }
  const store = createSceneStore()
  store.setMusic({
    bars: 128,
    grid: { mode: "adaptive", density: "medium" },
    transport: score.transport,
    markers: [],
    loop: score.transport.loop,
    tracks: [owner],
  })
  store.setViewport({ width: 1200, height: 700, pxPerBar: 64, scrollX: 0, scrollY: 0, dpr: 1 })
  return { store, owner, clip }
}

test("property: clip interior hits and resize edge tolerance is symmetric", () => {
  const rng = random(0xb1a001)
  const { store, owner, clip } = fixture()
  for (let index = 0; index < 500; index++) {
    const pxPerBar = 20 + rng() * 500
    const moved = { ...clip, startBar: 1 + rng() * 30, lengthBars: 2 + rng() * 8 }
    const track = { ...owner, clips: [moved] }
    store.setMusic({ ...store.get(), tracks: [track] })
    const scrollX = (moved.startBar - 1) * pxPerBar - 20.25
    store.setViewport({ ...store.get().viewport, pxPerBar, scrollX })
    const scene = store.get()
    const rect = clipRect(moved, layoutTrackRows(scene)[0], pxPerBar, scrollX)
    const visual = clipVisualGeometry(rect, moved, track, false)
    const y = visual.bodyTop + visual.bodyHeight * (0.1 + rng() * 0.8)
    const x = visual.left + visual.width * rng()
    const hit = hitTest(scene, x, y)
    expect(hit && "clip" in hit && hit.clip.id).toBe(moved.id)
    const tolerance = rng() * RESIZE_EDGE_PX
    for (const [edge, px] of [
      ["left", visual.left + tolerance],
      ["right", visual.left + visual.width - tolerance],
    ] as const) {
      const edgeHit = hitTest(scene, px, y)
      expect(edgeHit?.kind).toBe("clip-resize")
      if (edgeHit?.kind === "clip-resize") expect(edgeHit.edge).toBe(edge)
    }
    expect(hitTest(scene, visual.left - 0.01, y)?.kind).toBe("track-lane")
    expect(hitTest(scene, visual.left + visual.width + 0.01, y)?.kind).toBe("track-lane")
    expect(hitTest(scene, visual.left + RESIZE_EDGE_PX + 0.01, y)?.kind).toBe("clip-body")
    expect(hitTest(scene, visual.left + visual.width - RESIZE_EDGE_PX - 0.01, y)?.kind).toBe(
      "clip-body"
    )
  }
})

test("property: time pixel round trips retain one-based bars", () => {
  const rng = random(0xb1a002)
  const { store } = fixture()
  for (let index = 0; index < 3000; index++) {
    const pxPerBar = 0.01 + rng() * gridZoomLimit(4, 4)
    const scrollX = rng() * 100000
    store.setViewport({ ...store.get().viewport, pxPerBar, scrollX })
    const bar = 1 + rng() * 10000
    const scene = store.get()
    const x = automationX(scene, bar)
    expect(Math.abs(automationBar(scene, x) - bar)).toBeLessThan(1e-6)
    expect(automationX(scene, 1)).toBe(-scrollX)
    const point = rng() * 1200
    expect(Math.abs(automationX(scene, automationBar(scene, point)) - point)).toBeLessThan(1e-6)
  }
})

test("property: snap lies on the shared grid within half a cell", () => {
  const rng = random(0xb1a003)
  const { store } = fixture()
  for (let index = 0; index < 1500; index++) {
    const pxPerBar = 2 ** (rng() * 17)
    store.setViewport({ ...store.get().viewport, pxPerBar, scrollX: rng() * 100 })
    const scene = store.get()
    const cell = scene.gridPlan.cellBars
    const bar = 1 + rng() * Math.min(120, cell * 20)
    const snapped = rulerBar(scene, automationX(scene, bar), true)
    expect(Math.abs((snapped - 1) / cell - Math.round((snapped - 1) / cell))).toBeLessThan(1e-8)
    expect(Math.abs(snapped - bar)).toBeLessThanOrEqual(cell / 2 + 1e-9)
  }
})

test("grid subdivisions remain adaptive through 1/16384 and quarter snapping matches visible lines", () => {
  const { store } = fixture()
  const max = gridZoomLimit(4, 4)
  expect(deriveGridPlan({ mode: "adaptive", density: "narrowest" }, max, 4, 4).cellBars).toBe(
    1 / 16384
  )
  expect(
    deriveGridPlan({ mode: "adaptive", density: "medium" }, max, 4, 4).cellBars
  ).toBeLessThanOrEqual(1 / 256)
  for (const px of [1, 8, 64, 512, 4096, max]) {
    const plan = deriveGridPlan({ mode: "adaptive", density: "medium" }, px, 4, 4)
    expect(plan.cellBars * px).toBeGreaterThanOrEqual(plan.minimumCellPx)
    expect(plan.cellBars * px).toBeLessThan(plan.minimumCellPx * 2 + 1e-8)
  }
  store.setMusic({ ...store.get(), grid: { mode: "fixed", bars: 1 / 4 } })
  store.setViewport({ ...store.get().viewport, pxPerBar: 128, width: 1024 })
  const scene = store.get()
  const lines = gridLines(scene)
  expect(lines.filter(line => line.kind === "major").map(line => line.bar)).toContain(2)
  expect(lines.filter(line => line.kind === "minor").map(line => line.bar)).toContain(1.25)
  for (const line of lines)
    expect(rulerBar(scene, automationX(scene, line.bar), true)).toBe(line.bar)
  for (let x = 0; x <= 1024; x += 7)
    expect(lines.some(line => line.bar === rulerBar(scene, x, true))).toBe(true)
})

test("track resize snaps by shared control rows and folds across thresholds", () => {
  const { owner } = fixture()
  const expanded = { ...owner, heightPx: COLLAPSED_TRACK_HEIGHT + 4 * TRACK_RESIZE_STEP }
  expect(resizeTrackHeight(expanded, TRACK_RESIZE_STEP * 0.49).heightPx).toBe(expanded.heightPx)
  expect(resizeTrackHeight(expanded, TRACK_RESIZE_STEP * 0.51).heightPx).toBe(
    expanded.heightPx + TRACK_RESIZE_STEP
  )
  expect(resizeTrackHeight(expanded, -4 * TRACK_RESIZE_STEP).collapsed).toBe(true)
  const collapsed = { ...expanded, collapsed: true }
  expect(resizeTrackHeight(collapsed, TRACK_REVEAL_THRESHOLD - 0.01).collapsed).toBe(true)
  expect(resizeTrackHeight(collapsed, TRACK_REVEAL_THRESHOLD)).toEqual({
    collapsed: false,
    heightPx: COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP,
  })
})

test("property: fade anchors stay bounded through arbitrary drag and resize sequences", () => {
  const rng = random(0xb1a004)
  const { owner, clip } = fixture()
  let current: AudioClip = {
    ...clip,
    startBar: 4,
    lengthBars: 16,
    fadeInOffsetBars: 1,
    fadeInBars: 3,
    fadeOutOffsetBars: 1,
    fadeOutBars: 3,
  }
  for (let index = 0; index < 600; index++) {
    const edge = rng() < 0.5 ? "in" : "out"
    const pxPerBar = 32 + rng() * 200
    const height = 40 + rng() * 150
    const handle = rng() < 0.5 ? "length" : "curve"
    let state = beginFadeDrag(current, edge, handle, { x: 0, y: 0 }, pxPerBar, height)
    const before = fadeControls(current, edge)
    const quiet = edge === "in" ? before.start : before.end
    for (let step = 0; step < 10; step++) {
      const result = moveFadeDrag(
        state,
        { x: (rng() - 0.5) * 10000, y: (rng() - 0.5) * 10000 },
        pxPerBar
      )
      state = result.state
      const projected = { ...current, ...result.patch }
      const controls = fadeControls(projected, edge)
      expect(edge === "in" ? controls.start : controls.end).toBe(quiet)
      expect(controls.start).toBeGreaterThanOrEqual(0)
      expect(controls.end).toBeLessThanOrEqual(current.lengthBars)
      expect(controls.end).toBeGreaterThanOrEqual(controls.start)
      if (handle === "curve") {
        expect(state.curve).toBeGreaterThanOrEqual(-1)
        expect(state.curve).toBeLessThanOrEqual(1)
        expect(state.position).toBeGreaterThanOrEqual(state.gap)
        expect(state.position).toBeLessThanOrEqual(1 - state.gap)
      }
      const visual = clipVisualGeometry(
        clipRect(projected, { track: owner, top: 34, height: height + 30 }, pxPerBar, 0),
        projected,
        owner,
        true
      )
      for (const fade of visual.fades) {
        if (!fade.active) continue
        expect(fade.curve.x).toBeGreaterThan(fade.start.x)
        expect(fade.curve.x).toBeLessThan(fade.end.x)
        expect(fade.curve.y).toBeGreaterThan(Math.min(fade.start.y, fade.end.y))
        expect(fade.curve.y).toBeLessThan(Math.max(fade.start.y, fade.end.y))
      }
      if (step === 9) current = projected
    }
    const side = rng() < 0.5 ? "left" : "right"
    const resized = projectClipResize(
      current,
      side,
      side === "left" ? 1 + rng() * 10 : current.startBar + 1 + rng() * 30
    )
    if (resized.kind !== "audio") throw new Error("Expected audio resize")
    current = resized
    for (const fadeEdge of ["in", "out"] as const) {
      const controls = fadeControls(current, fadeEdge)
      expect(controls.start).toBeGreaterThanOrEqual(-1e-9)
      expect(controls.end).toBeLessThanOrEqual(current.lengthBars + 1e-9)
    }
  }
})
