import { describe, expect, it } from "vitest"
import { createMockDocument } from "../adapters/fixtures"
import {
  COLLAPSED_TRACK_HEIGHT,
  MAX_TRACK_HEIGHT,
  resizeTrackHeight,
  TRACK_RESIZE_STEP,
  TRACK_REVEAL_THRESHOLD,
  trackControlRows,
  trackHeight,
} from "."

describe("track row resize", () => {
  const { tracks } = createMockDocument()

  it("uses the same compact height and reveal step for ordinary, group, return and main tracks", () => {
    for (const track of tracks) {
      const folded = { ...track, collapsed: true }
      expect(trackHeight(folded)).toBe(COLLAPSED_TRACK_HEIGHT)
      expect(resizeTrackHeight(folded, TRACK_REVEAL_THRESHOLD)).toEqual({
        collapsed: false,
        heightPx: COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP,
      })
    }
  })

  it("keeps the initial height until a full control row has room, then folds", () => {
    const track = tracks.find(item => item.kind === "audio")!
    const foldDelta = COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP - track.heightPx
    expect(resizeTrackHeight(track, 0)).toEqual({ collapsed: false, heightPx: track.heightPx })
    expect(resizeTrackHeight(track, foldDelta + 1).collapsed).toBe(false)
    expect(resizeTrackHeight(track, foldDelta)).toEqual({
      collapsed: true,
      heightPx: track.heightPx,
    })
    expect(resizeTrackHeight(track, foldDelta - 1)).toEqual({
      collapsed: true,
      heightPx: track.heightPx,
    })
  })

  it("snaps longer drags to uniform control-row increments", () => {
    const track = tracks.find(item => item.kind === "audio")!
    expect(resizeTrackHeight(track, TRACK_RESIZE_STEP * 2).heightPx).toBe(
      70 + TRACK_RESIZE_STEP * 2
    )
    expect(resizeTrackHeight(track, 10_000).heightPx).toBe(274)
  })

  it("reveals a folded track after a small drag and steps up to a fourfold cap", () => {
    const track = { ...tracks[0], collapsed: true }
    expect(resizeTrackHeight(track, TRACK_REVEAL_THRESHOLD - 1).collapsed).toBe(true)
    const revealed = resizeTrackHeight(track, TRACK_REVEAL_THRESHOLD)
    expect(revealed).toEqual({
      collapsed: false,
      heightPx: COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP,
    })
    expect(resizeTrackHeight({ ...track, ...revealed }, -TRACK_RESIZE_STEP).collapsed).toBe(true)
    expect(resizeTrackHeight(track, 10_000).heightPx).toBeLessThanOrEqual(MAX_TRACK_HEIGHT)
  })

  it.each([3, 4, 5])("admits %i control rows only when padding and gaps fit", rows => {
    const track = tracks.find(item => item.kind === "audio")!
    const requiredHeight = COLLAPSED_TRACK_HEIGHT + (rows - 1) * TRACK_RESIZE_STEP
    expect(trackControlRows({ ...track, collapsed: false, heightPx: requiredHeight - 1 })).toBe(
      rows - 1
    )
    expect(trackControlRows({ ...track, collapsed: false, heightPx: requiredHeight })).toBe(rows)
  })
})
