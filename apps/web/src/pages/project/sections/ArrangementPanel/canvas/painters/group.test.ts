import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { expect, it } from "vitest"
import { createMockDocument } from "@zoeydaw/project-runtime/testing"
import { createSceneStore } from "../scene"
import { layoutTrackRows } from "../layout"
import { readTokens } from "../tokens"
import { paintGroupOverview } from "./group"

it("hides child previews when expanded and clips their compact summary when folded", () => {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const group = document.tracks.find(track => track.id === "drums-group")
  if (!group) {
    throw new Error("Missing Group")
  }
  const scene = createSceneStore()
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: document.transport,
    media: document.media,
    patterns: document.patterns,
    markers: [],
    loop: document.transport.loop,
    tracks: document.tracks,
  })
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 180, height: 400, dpr: 1 })
  const rectangles: number[][] = []
  const context = {
    fillStyle: "",
    globalAlpha: 1,
    save() {},
    restore() {},
    fillRect(x: number, y: number, width: number, height: number) {
      rectangles.push([x, y, width, height])
    },
  }
  const tokens = readTokens(window.document.documentElement)
  const row = () => {
    const value = layoutTrackRows(scene.get()).find(item => item.track.id === group.id)
    if (!value) {
      throw new Error("Missing Group row")
    }
    return value
  }
  paintGroupOverview(context, row(), scene.get(), tokens)
  expect(rectangles).toEqual([])
  group.collapsed = true
  paintGroupOverview(context, row(), scene.get(), tokens)
  expect(rectangles.map(([x, , width]) => [x, width])).toEqual([[0, 180]])
  for (const [, y, , height] of rectangles) {
    expect(y).toBeGreaterThanOrEqual(row().top)
    expect(y + height).toBeLessThanOrEqual(row().top + row().height)
  }
  rectangles.length = 0
  group.collapsed = false
  paintGroupOverview(context, row(), scene.get(), tokens)
  expect(rectangles).toEqual([])
})
