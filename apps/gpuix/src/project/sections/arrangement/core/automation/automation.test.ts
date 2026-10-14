import { expect, test } from "bun:test"
import { createMockDocument } from "../../../../adapters/fixtures"
import { createSceneStore } from "../scene"
import { activeAutomationRows, automationBar, automationX, automationY } from "./geometry"
import { hitAutomation } from "./hit"
import { selectedPointIds, movePoints, deletePointOnRelease } from "./points"
import { marqueePointIds } from "./selection"
import { flatLinePoint, shouldInsertFlatPoint } from "./flat"
import { moveSegment, insertSegmentPoint, shouldInsertSegmentPoint } from "./segment"
import { paintAutomation } from "./drawing"
import { automationAction, automationCursor } from "."
import type { DrawingState } from "./drawing"

function setup() {
  const score = createMockDocument()
  const store = createSceneStore()
  store.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: score.transport,
    markers: score.markers,
    loop: score.transport.loop,
    tracks: score.tracks,
  })
  store.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1200, height: 700, dpr: 1 })
  store.setAutomationParameters({ "3-audio": "volume" })
  const row = activeAutomationRows(store.get()).find(item => item.track.id === "3-audio")!
  const source = row.lane!.points
  const pointer = (bar: number, value: number) => ({
    x: automationX(store.get(), bar),
    y: automationY(row, value),
  })
  return { store, row, source, pointer }
}

test("collapsed tracks expose no automation body targets", () => {
  const { store } = setup()
  store.setMusic({
    ...store.get(),
    tracks: store.get().tracks.map(track => ({ ...track, collapsed: true })),
  })
  expect(activeAutomationRows(store.get())).toEqual([])
})

test("group selection moves in lockstep without mutating source and replaces collided points", () => {
  const { source } = setup()
  const first = selectedPointIds([], "fade-up", true)
  const ids = selectedPointIds(first, "peak", true)
  expect(ids).toEqual(["fade-up", "peak"])
  expect(selectedPointIds(ids, "peak", false)).toEqual(ids)
  expect(selectedPointIds(ids, "peak", true)).toEqual(["fade-up"])
  const before = structuredClone(source)
  const moved = movePoints({
    source,
    ids,
    rawDelta: 2,
    valueDelta: 0.1,
    snap: true,
    cellBars: 1,
    endBar: 129,
  })
  expect(moved.map(point => point.bar)).toEqual([3, 11, 17])
  expect(source).toEqual(before)
  expect(
    movePoints({
      source,
      ids: ["peak"],
      rawDelta: 8,
      valueDelta: 2,
      snap: true,
      cellBars: 1,
      endBar: 129,
    })
  ).toEqual([source[0], { ...source[1], bar: 17, value: 1 }])
  expect(
    movePoints({
      source,
      ids,
      rawDelta: -100,
      valueDelta: -10,
      snap: true,
      cellBars: 1,
      endBar: 129,
    }).map(point => [point.bar, point.value])
  ).toEqual([
    [1, 0],
    [9, 0],
    [17, 0.5],
  ])
})

test("world-time delta changes during autoscroll with a stationary pointer", () => {
  const { store, source, pointer } = setup()
  const initial = pointer(9, 0.85)
  const originBar = automationBar(store.get(), initial.x)
  store.setViewport({ ...store.get().viewport, scrollX: 48 })
  const moved = movePoints({
    source,
    ids: ["peak"],
    rawDelta: automationBar(store.get(), initial.x) - originBar,
    valueDelta: 0,
    snap: true,
    cellBars: 1,
    endBar: 129,
  })
  expect(moved.find(point => point.id === "peak")?.bar).toBe(11)
})

test("rectangle selection is direction independent and does not edit points", () => {
  const { row, source, pointer } = setup()
  const before = structuredClone(source)
  expect(marqueePointIds(row, 1.5, 10, pointer(1.5, 0.1).y, pointer(10, 0.95).y)).toEqual(["peak"])
  expect(marqueePointIds(row, 10, 1.5, pointer(10, 0.95).y, pointer(1.5, 0.1).y)).toEqual(["peak"])
  expect(source).toEqual(before)
})

test("held tail and untouched pan lines materialize only on stationary releases", () => {
  const { store, pointer } = setup()
  const hit = hitAutomation(store.get(), pointer(20, 0.5))
  expect(hit?.kind).toBe("lane")
  if (hit?.kind === "lane") expect(hit.onLine).toBe(true)
  expect(flatLinePoint(20, 0.5, true, 1, 129)).toEqual({ bar: 20, value: 0.5 })
  store.setAutomationParameters({ "4-midi": "pan" })
  const row = activeAutomationRows(store.get()).find(item => item.track.id === "4-midi")!
  const empty = hitAutomation(store.get(), {
    x: automationX(store.get(), 4),
    y: automationY(row, 0.5),
  })
  expect(empty?.kind).toBe("lane")
  expect(flatLinePoint(4, 0.5, true, 1, 129)).toEqual({ bar: 4, value: 0.5 })
  expect(shouldInsertFlatPoint(false, false)).toBe(true)
  expect(shouldInsertFlatPoint(true, false)).toBe(false)
  expect(shouldInsertFlatPoint(false, true)).toBe(false)
})

test("stationary point deletion excludes shift, moved and cancelled releases", () => {
  expect(deletePointOnRelease(false, false, false, ["peak"])).toBe(true)
  for (const [cancelled, moved, shift] of [
    [true, false, false],
    [false, true, false],
    [false, false, true],
  ]) {
    expect(deletePointOnRelease(cancelled, moved, shift, ["peak"])).toBe(false)
  }
  expect(deletePointOnRelease(false, false, false, ["peak", "tail"])).toBe(false)
})

test("grid drawing paints each traversed cell without mutating the discarded baseline", () => {
  const { source, row, store, pointer } = setup()
  const before = structuredClone(source)
  const start = pointer(2.2, 0.2)
  const state: DrawingState = { painted: [], last: start, nextId: 0 }
  const input = {
    original: source,
    state,
    current: start,
    scene: store.get(),
    row,
    grid: 1,
    freehand: false,
    idPrefix: "draw",
  }
  const initial = paintAutomation(input)
  const result = paintAutomation({ ...input, state: initial.state, current: pointer(6.2, 0.7) })
  expect([2, 3, 4, 5, 6].every(bar => result.points.some(point => point.bar === bar))).toBe(true)
  expect(result.points.find(point => point.bar === 6)?.value).toBeCloseTo(0.7)
  expect(result.points.find(point => point.id.endsWith("-end"))?.bar).toBeCloseTo(2.9999)
  expect(source).toEqual(before)
  expect(state).toEqual({ painted: [], last: start, nextId: 0 })
  const free = paintAutomation({ ...input, current: pointer(3.2, 0.8), freehand: true })
  expect(free.points.find(point => point.bar === 2.2)?.value).toBeCloseTo(0.2)
  expect(free.points.find(point => point.bar === 3.2)?.value).toBeCloseTo(0.8)
})

test("fine-grid insertion shares the 1/256 snapping cell", () => {
  expect(flatLinePoint(20 + (1 / 256) * 1.6, 0.5, true, 1 / 256, 129).bar).toBe(20 + (1 / 256) * 2)
})

test("segment shifts both endpoint values while bend changes only the outgoing curve", () => {
  const { source } = setup()
  const moved = moveSegment(source, "fade-up", "peak", 0.1, false)
  expect(moved[0].value).toBeCloseTo(0.45)
  expect(moved[1].value).toBeCloseTo(0.95)
  const bent = moveSegment(source, "fade-up", "peak", 0.15, true)
  expect(bent[0].curve).toBeCloseTo(0.6)
  expect(bent[0].value).toBe(0.35)
  expect(bent[1]).toEqual(source[1])
  expect(insertSegmentPoint(source[0], source[1], 5.2, true, 1, 129)).toEqual({
    bar: 5,
    value: 0.6,
  })
  expect(shouldInsertSegmentPoint(false, false, false, false)).toBe(true)
  expect(shouldInsertSegmentPoint(false, false, true, false)).toBe(false)
  expect(shouldInsertSegmentPoint(false, false, false, true)).toBe(false)
})

test("automation gesture routing prefers draw then point then segment then flat or marquee", () => {
  const { store, pointer } = setup()
  const point = hitAutomation(store.get(), pointer(9, 0.85))
  const segment = hitAutomation(store.get(), pointer(5, 0.6))
  const line = hitAutomation(store.get(), pointer(20, 0.5))
  const background = hitAutomation(store.get(), pointer(20, 0.1))
  expect(automationAction(point, true, 0)).toBe("draw")
  expect(automationAction(point, false, 0)).toBe("point")
  expect(automationAction(segment, false, 0)).toBe("segment")
  expect(automationAction(line, false, 0)).toBe("flat")
  expect(automationAction(background, false, 0)).toBe("marquee")
  expect(automationAction(point, false, 2)).toBeNull()
  expect(automationCursor(point, false)).toBe("grab")
  expect(automationCursor(segment, false)).toBe("ns-resize")
})
