import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { expect, test } from "bun:test"
import { createMockDocument } from "@/project/adapters/fixtures"
import { arrangementBodyBottom, arrangementBodyTop, pinnedTrackHeight } from "../layout"
import { visibleTracks } from "@/project/model/types"
import { edgeScroll } from "./edge-scroll"

const tracks = createMockDocument().tracks
const viewport = { width: 800, height: 320, pxPerBar: 100, scrollX: 100, scrollY: 80, dpr: 1 }
const bottom =
  arrangementBodyBottom(viewport.height, DEFAULT_LAYOUT_TOKENS.arrangement) -
  pinnedTrackHeight(visibleTracks(tracks), DEFAULT_LAYOUT_TOKENS.track)
const base = {
  viewport,
  bars: 128,
  tracks,
  axis: "both" as const,
  edge: 40,
  elapsed: 20,
  policy: ARRANGEMENT_DEFAULTS.autoScroll,
  geometry: DEFAULT_LAYOUT_TOKENS,
}

test("edge scrolling respects pinned rows, horizontal mode and elapsed limits", () => {
  expect(edgeScroll({ ...base, pointer: { x: 800, y: bottom - 20 } })).toEqual({
    scrollX: 115,
    scrollY: 86,
  })
  expect(edgeScroll({ ...base, pointer: { x: 800, y: bottom } })).toEqual({
    scrollX: 115,
    scrollY: 80,
  })
  expect(
    edgeScroll({
      ...base,
      axis: "horizontal",
      pointer: { x: 0, y: arrangementBodyTop(DEFAULT_LAYOUT_TOKENS.arrangement) },
    })
  ).toEqual({ scrollX: 85, scrollY: 80 })
  expect(
    edgeScroll({
      ...base,
      elapsed: 500,
      pointer: { x: 800, y: arrangementBodyTop(DEFAULT_LAYOUT_TOKENS.arrangement) },
    })
  ).toEqual({ scrollX: 136, scrollY: 51.2 })
  expect(edgeScroll({ ...base, elapsed: -1, pointer: { x: 800, y: 0 } })).toEqual({
    scrollX: 100,
    scrollY: 80,
  })
  expect(
    edgeScroll({
      ...base,
      viewport: { ...viewport, scrollX: 0, scrollY: 0 },
      pointer: { x: 0, y: 0 },
    })
  ).toEqual({ scrollX: 0, scrollY: 0 })
})
