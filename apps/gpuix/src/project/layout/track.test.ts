import { describe, expect, it } from "bun:test"
import { createMockDocument } from "../adapters/fixtures"
import { resizeTrackHeight, trackControlRows, trackHeight } from "."
import { DEFAULT_LAYOUT_TOKENS, createLayoutTokens } from "@/shared/theme/layout-tokens"
import { CONTROL_METRICS, PROJECT_METRICS } from "@/shared/theme/metrics/config"

describe("track row resize", () => {
  const { tracks } = createMockDocument()

  it("uses the same compact height and reveal step for ordinary, group, return and main tracks", () => {
    for (const track of tracks) {
      const folded = { ...track, collapsed: true }
      expect(trackHeight(folded, DEFAULT_LAYOUT_TOKENS.track)).toBe(
        DEFAULT_LAYOUT_TOKENS.track.collapsedHeight
      )
      expect(
        resizeTrackHeight(
          folded,
          DEFAULT_LAYOUT_TOKENS.track.revealThreshold,
          DEFAULT_LAYOUT_TOKENS.track
        )
      ).toEqual({
        collapsed: false,
        heightPx:
          DEFAULT_LAYOUT_TOKENS.track.collapsedHeight + DEFAULT_LAYOUT_TOKENS.track.resizeStep,
      })
    }
  })

  it("keeps the initial height until a full control row has room, then folds", () => {
    const track = tracks.find(item => item.kind === "audio")!
    const foldDelta =
      DEFAULT_LAYOUT_TOKENS.track.collapsedHeight +
      DEFAULT_LAYOUT_TOKENS.track.resizeStep -
      track.heightPx
    expect(resizeTrackHeight(track, 0, DEFAULT_LAYOUT_TOKENS.track)).toEqual({
      collapsed: false,
      heightPx: track.heightPx,
    })
    expect(resizeTrackHeight(track, foldDelta + 1, DEFAULT_LAYOUT_TOKENS.track).collapsed).toBe(
      false
    )
    expect(resizeTrackHeight(track, foldDelta, DEFAULT_LAYOUT_TOKENS.track)).toEqual({
      collapsed: true,
      heightPx: track.heightPx,
    })
    expect(resizeTrackHeight(track, foldDelta - 1, DEFAULT_LAYOUT_TOKENS.track)).toEqual({
      collapsed: true,
      heightPx: track.heightPx,
    })
  })

  it("snaps longer drags to uniform control-row increments", () => {
    const track = tracks.find(item => item.kind === "audio")!
    expect(
      resizeTrackHeight(
        track,
        DEFAULT_LAYOUT_TOKENS.track.resizeStep * 2,
        DEFAULT_LAYOUT_TOKENS.track
      ).heightPx
    ).toBe(70 + DEFAULT_LAYOUT_TOKENS.track.resizeStep * 2)
    expect(resizeTrackHeight(track, 10_000, DEFAULT_LAYOUT_TOKENS.track).heightPx).toBe(274)
  })

  it("reveals a folded track after a small drag and steps up to a fourfold cap", () => {
    const track = { ...tracks[0], collapsed: true }
    expect(
      resizeTrackHeight(
        track,
        DEFAULT_LAYOUT_TOKENS.track.revealThreshold - 1,
        DEFAULT_LAYOUT_TOKENS.track
      ).collapsed
    ).toBe(true)
    const revealed = resizeTrackHeight(
      track,
      DEFAULT_LAYOUT_TOKENS.track.revealThreshold,
      DEFAULT_LAYOUT_TOKENS.track
    )
    expect(revealed).toEqual({
      collapsed: false,
      heightPx:
        DEFAULT_LAYOUT_TOKENS.track.collapsedHeight + DEFAULT_LAYOUT_TOKENS.track.resizeStep,
    })
    expect(
      resizeTrackHeight(
        { ...track, ...revealed },
        -DEFAULT_LAYOUT_TOKENS.track.resizeStep,
        DEFAULT_LAYOUT_TOKENS.track
      ).collapsed
    ).toBe(true)
    expect(
      resizeTrackHeight(track, 10_000, DEFAULT_LAYOUT_TOKENS.track).heightPx
    ).toBeLessThanOrEqual(DEFAULT_LAYOUT_TOKENS.track.maxHeight)
  })

  it.each([3, 4, 5])("admits %i control rows only when padding and gaps fit", rows => {
    const track = tracks.find(item => item.kind === "audio")!
    const requiredHeight =
      DEFAULT_LAYOUT_TOKENS.track.collapsedHeight +
      (rows - 1) * DEFAULT_LAYOUT_TOKENS.track.resizeStep
    expect(
      trackControlRows(
        { ...track, collapsed: false, heightPx: requiredHeight - 1 },
        DEFAULT_LAYOUT_TOKENS.track
      )
    ).toBe(rows - 1)
    expect(
      trackControlRows(
        { ...track, collapsed: false, heightPx: requiredHeight },
        DEFAULT_LAYOUT_TOKENS.track
      )
    ).toBe(rows)
  })
})

it("density sources jointly control collapsed height, row admission, reveal snapping and resize cap", () => {
  const track = createMockDocument().tracks.find(item => item.kind === "audio")
  if (!track) throw new Error("Missing audio fixture")
  const geometry = createLayoutTokens(
    { ...CONTROL_METRICS.default, "--spacing-control-track": 20, "--spacing-control-track-gap": 6 },
    { ...PROJECT_METRICS, trackBorder: 4, maxTrackHeight: 190 }
  ).track
  const folded = { ...track, collapsed: true }
  expect(trackHeight(folded, geometry)).toBe(36)
  expect(resizeTrackHeight(folded, 12, geometry).collapsed).toBe(true)
  expect(resizeTrackHeight(folded, 13, geometry)).toEqual({ collapsed: false, heightPx: 62 })
  expect(resizeTrackHeight(track, 26, geometry)).toEqual({ collapsed: false, heightPx: 96 })
  expect(resizeTrackHeight(track, 10_000, geometry).heightPx).toBe(174)
  expect(trackControlRows({ ...track, heightPx: 122 }, geometry)).toBe(4)
})
