import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { expect, test } from "bun:test"
import { createMockDocument } from "../../../../adapters/fixtures"
import { fadeControls } from "../../../../model/fades"
import { projectClipResize } from "../../../../model/clip-edits"
import { clipRect } from "../layout"
import { clipVisualGeometry } from "../clip-geometry"
import { beginFadeDrag, moveFadeDrag } from "./fade"

function fixture() {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.id === "3-audio")!
  const source = track.clips[0]
  if (source.kind !== "audio") throw new Error("Expected audio fixture")
  const clip = {
    ...source,
    fadeInOffsetBars: 1,
    fadeInBars: 2,
    fadeOutOffsetBars: 1,
    fadeOutBars: 2,
  }
  return { track, clip }
}

test("fade peaks move while quiet offsets and discarded source remain fixed", () => {
  const { clip } = fixture()
  const before = fadeControls(clip, "in")
  const initial = beginFadeDrag(
    clip,
    "in",
    "length",
    { x: 300, y: 200 },
    32,
    64,
    DEFAULT_LAYOUT_TOKENS.arrangement.hit.clipFadeHandle
  )
  const result = moveFadeDrag(initial, { x: 332, y: 200 }, 32)
  expect(fadeControls({ ...clip, ...result.patch }, "in")).toEqual({
    start: before.start,
    end: before.end + 1,
  })
  expect(fadeControls(clip, "in")).toEqual(before)
  const out = fadeControls(clip, "out")
  const outResult = moveFadeDrag(
    beginFadeDrag(
      clip,
      "out",
      "length",
      { x: 300, y: 200 },
      32,
      64,
      DEFAULT_LAYOUT_TOKENS.arrangement.hit.clipFadeHandle
    ),
    { x: 268, y: 200 },
    32
  )
  expect(fadeControls({ ...clip, ...outResult.patch }, "out")).toEqual({
    start: out.start - 1,
    end: out.end,
  })
  const curve = moveFadeDrag(
    beginFadeDrag(
      clip,
      "in",
      "curve",
      { x: 300, y: 200 },
      32,
      64,
      DEFAULT_LAYOUT_TOKENS.arrangement.hit.clipFadeHandle
    ),
    { x: 300, y: 192 },
    32
  )
  expect(curve.patch?.fadeInCurve).toBeGreaterThan(0.35)
  expect(fadeControls({ ...clip, ...curve.patch }, "in")).toEqual(before)
})

test("resizing either clip edge carries both fade anchors together", () => {
  const { clip, track } = fixture()
  for (const edge of ["left", "right"] as const) {
    const next = projectClipResize(
      clip,
      edge,
      edge === "left" ? clip.startBar + 2 : clip.startBar + clip.lengthBars + 2
    )
    expect(next).toMatchObject({
      fadeInOffsetBars: 1,
      fadeInBars: 2,
      fadeOutOffsetBars: 1,
      fadeOutBars: 2,
    })
    const row = {
      trackGeometry: DEFAULT_LAYOUT_TOKENS.track,
      arrangementGeometry: DEFAULT_LAYOUT_TOKENS.arrangement,
      track,
      top: 34,
      height: 121,
    }
    const before = clipVisualGeometry(clipRect(clip, row, 32, 0), clip, track, true)
    const after = clipVisualGeometry(clipRect(next, row, 32, 0), next, track, true)
    const affected = edge === "left" ? 0 : 1
    expect(after.fades[affected].start.x - before.fades[affected].start.x).toBe(64)
    expect(after.fades[affected].end.x - before.fades[affected].end.x).toBe(64)
  }
})

for (const edge of ["in", "out"] as const) {
  for (const height of [70, 121]) {
    test(`curve follows pointer and reverses immediately at limits (${edge}, ${height})`, () => {
      const { clip: source, track: owner } = fixture()
      const clip = { ...source, fadeInCurve: 0, fadeOutCurve: 0, fadeInBars: 3, fadeOutBars: 3 }
      const track = { ...owner, collapsed: false, heightPx: height }
      const row = {
        trackGeometry: DEFAULT_LAYOUT_TOKENS.track,
        arrangementGeometry: DEFAULT_LAYOUT_TOKENS.arrangement,
        track,
        top: 34,
        height,
      }
      const visual = clipVisualGeometry(clipRect(clip, row, 32, 0), clip, track, true)
      const fade = visual.fades.find(item => item.edge === edge)!
      const pointer = fade.curve
      let state = beginFadeDrag(
        clip,
        edge,
        "curve",
        pointer,
        32,
        visual.bodyHeight,
        DEFAULT_LAYOUT_TOKENS.arrangement.hit.clipFadeHandle
      )
      const projected = (x: number, y: number) => {
        const result = moveFadeDrag(state, { x, y }, 32)
        state = result.state
        const next = { ...clip, ...result.patch }
        return clipVisualGeometry(clipRect(next, row, 32, 0), next, track, true).fades.find(
          item => item.edge === edge
        )!
      }
      const width = fade.end.x - fade.start.x
      expect(projected(pointer.x + width * 0.2, pointer.y).curve.x).toBeCloseTo(
        pointer.x + width * 0.2
      )
      const right = fade.end.x - Math.max(7, width * 0.1)
      expect(projected(pointer.x + width * 2, pointer.y).curve.x).toBeCloseTo(right)
      expect(projected(pointer.x + width * 2 - 1, pointer.y).curve.x).toBeCloseTo(right - 1)
      expect(projected(pointer.x, pointer.y + visual.bodyHeight * 0.4).curve.y).toBeCloseTo(
        pointer.y + visual.bodyHeight * 0.4
      )
      expect(projected(pointer.x, pointer.y + visual.bodyHeight * 2).curve.y).toBeCloseTo(
        visual.bodyTop + visual.bodyHeight * 0.9
      )
      expect(projected(pointer.x, pointer.y + visual.bodyHeight * 2 - 1).curve.y).toBeCloseTo(
        visual.bodyTop + visual.bodyHeight * 0.9 - 1
      )
    })
  }
}
