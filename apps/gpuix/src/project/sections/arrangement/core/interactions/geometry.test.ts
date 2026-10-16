import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { expect, test } from "bun:test"
import { createMockDocument } from "../../../../adapters/fixtures"
import { createSceneStore } from "../scene"
import { layoutTrackRows } from "../layout"
import { interactionLayer, dragStarted } from "./layers"
import { timeRangeSelection, committedTimeRange } from "../clip/timeRange"

test("time range reverses musical endpoints and spans only visible rows", () => {
  const score = createMockDocument()
  const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  const tracks = score.tracks
    .filter(track => track.kind === "audio" || track.kind === "midi")
    .map(track => ({ ...track, collapsed: false }))
  store.setMusic({ ...store.get(), grid: { mode: "fixed", bars: 1 }, tracks })
  store.setViewport({ pxPerBar: 32, scrollX: 0, scrollY: 0, width: 500, height: 700, dpr: 1 })
  const scene = store.get()
  const rows = layoutTrackRows(scene)
  const target = rows[1]
  const selected = timeRangeSelection(
    scene,
    7,
    tracks[0].id,
    [tracks[0].id],
    { x: 32, y: target.top + 10 },
    true,
    false
  )
  expect(selected).toEqual({ startBar: 2, endBar: 7, trackIds: [tracks[0].id, tracks[1].id] })
  expect(committedTimeRange(selected)).toEqual(selected)
  expect(committedTimeRange({ ...selected, endBar: 2 })).toBeNull()
  expect(
    timeRangeSelection(scene, 7, tracks[0].id, [tracks[0].id], { x: 32, y: -1 }, true, false)
      .trackIds
  ).toEqual([tracks[0].id])
  expect(interactionLayer(scene, { x: 0, y: 0 }, true)).toBe("ruler")
  expect(interactionLayer(scene, { x: 0, y: 50 }, false)).toBe("clip")
  expect(interactionLayer(scene, { x: 499, y: target.top + target.height / 2 }, true)).toBe(
    "automation"
  )
})

test("three-pixel drag threshold accepts equality and Euclidean diagonal travel", () => {
  expect(dragStarted({ x: 0, y: 0 }, { x: 2.99, y: 0 }, ARRANGEMENT_DEFAULTS.pointer)).toBe(false)
  expect(dragStarted({ x: 0, y: 0 }, { x: 3, y: 0 }, ARRANGEMENT_DEFAULTS.pointer)).toBe(true)
  expect(dragStarted({ x: 1, y: 1 }, { x: 3.4, y: 2.8 }, ARRANGEMENT_DEFAULTS.pointer)).toBe(true)
})
