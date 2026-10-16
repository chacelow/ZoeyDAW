import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { expect, test } from "bun:test"
import { createSceneStore } from "../scene"
import { MIN_CLIP_LENGTH_BARS } from "../../../../model/grid"
import { rulerBar, rulerHit, movedLoop } from "./geometry"

function fixture() {
  const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  store.setMusic({
    ...store.get(),
    grid: { mode: "fixed", bars: 1 },
    markers: [{ id: "m", bar: 3, label: "Marker", color: "red" }],
    loop: { enabled: true, startBar: 3, endBar: 7 },
  })
  store.setViewport({ pxPerBar: 32, scrollX: 0, scrollY: 0, width: 500, height: 200, dpr: 1 })
  return store.get()
}

test("marker snapping is optional and Shift bypass retains fractional travel", () => {
  const scene = fixture()
  expect(rulerBar(scene, 101, true)).toBe(4)
  expect(rulerBar(scene, 72, true, true)).toBe(3.25)
  expect(rulerBar(scene, 72, false)).toBe(3.25)
  expect(rulerBar(scene, -100, false)).toBe(1)
})

test("marker and loop hits are distinct at the same musical position", () => {
  const scene = fixture()
  expect(rulerHit(scene, { x: 64, y: 8 })).toEqual({ kind: "marker", marker: scene.markers[0] })
  expect(rulerHit(scene, { x: 64, y: 24 })).toEqual({ kind: "loop", edge: "start" })
  expect(rulerHit(scene, { x: 192, y: 24 })).toEqual({ kind: "loop", edge: "end" })
  expect(rulerHit(scene, { x: 112, y: 24 })).toEqual({ kind: "loop", edge: "body" })
  expect(rulerHit(scene, { x: 400, y: 25 })).toEqual({ kind: "bar" })
  expect(rulerHit(scene, { x: -1, y: 8 })).toBeNull()
})

test("loop body preserves span and each edge independently respects bounds", () => {
  const { loop } = fixture()
  expect(movedLoop(loop, "start", 0.4375, 129)).toEqual({ ...loop, startBar: 3.4375 })
  expect(movedLoop(loop, "start", 1, 129)).toEqual({ ...loop, startBar: 4 })
  expect(movedLoop(loop, "body", 1, 129)).toEqual({ ...loop, startBar: 4, endBar: 8 })
  expect(movedLoop(loop, "end", 2, 129)).toEqual({ ...loop, endBar: 9 })
  expect(movedLoop(loop, "body", -100, 129)).toEqual({ ...loop, startBar: 1, endBar: 5 })
  expect(movedLoop(loop, "body", 1000, 129)).toEqual({ ...loop, startBar: 125, endBar: 129 })
  expect(movedLoop(loop, "start", 1000, 129).startBar).toBe(loop.endBar - MIN_CLIP_LENGTH_BARS)
  expect(movedLoop(loop, "end", -1000, 129).endBar).toBe(loop.startBar + MIN_CLIP_LENGTH_BARS)
})
