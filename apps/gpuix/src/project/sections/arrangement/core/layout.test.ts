import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { describe, expect, it } from "bun:test"
import { createMockDocument } from "../../../adapters/fixtures"
import { visibleTracks } from "../../../model/types"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  layoutTrackRowsForViewport,
  maxTrackScrollY,
  pinnedTrackHeight,
  revealTrackScrollY,
  scrollableTrackViewportHeight,
} from "./layout"

describe("arrangement track geometry", () => {
  const tracks = visibleTracks(createMockDocument().tracks)
  const height = 320

  it("moves ordinary headers and lanes together while return/main stay above the fixed time ruler", () => {
    const initial = layoutTrackRowsForViewport(tracks, 0, height, DEFAULT_LAYOUT_TOKENS)
    const scrolled = layoutTrackRowsForViewport(tracks, 80, height, DEFAULT_LAYOUT_TOKENS)
    const scrollable = initial.filter(
      row => row.track.kind !== "return" && row.track.kind !== "main"
    )
    for (const row of scrollable) {
      expect(scrolled.find(other => other.track.id === row.track.id)?.top).toBe(row.top - 80)
    }
    for (const row of initial.filter(
      row => row.track.kind === "return" || row.track.kind === "main"
    )) {
      expect(scrolled.find(other => other.track.id === row.track.id)?.top).toBe(row.top)
    }
    const last = scrolled[scrolled.length - 1]
    expect(last.top + last.height).toBe(
      arrangementBodyBottom(height, DEFAULT_LAYOUT_TOKENS.arrangement)
    )
    expect(initial[0].top).toBe(arrangementBodyTop(DEFAULT_LAYOUT_TOKENS.arrangement))
  })

  it("bounds scroll using only the unpinned viewport and keeps rulers fixed", () => {
    expect(scrollableTrackViewportHeight(tracks, height, DEFAULT_LAYOUT_TOKENS)).toBe(
      arrangementBodyBottom(height, DEFAULT_LAYOUT_TOKENS.arrangement) -
        arrangementBodyTop(DEFAULT_LAYOUT_TOKENS.arrangement) -
        pinnedTrackHeight(tracks, DEFAULT_LAYOUT_TOKENS.track)
    )
    expect(maxTrackScrollY(tracks, height, DEFAULT_LAYOUT_TOKENS)).toBe(
      maxTrackScrollY(tracks, height, {
        ...DEFAULT_LAYOUT_TOKENS,
        track: { ...DEFAULT_LAYOUT_TOKENS.track, dropZoneHeight: 0 },
      }) + DEFAULT_LAYOUT_TOKENS.track.dropZoneHeight
    )
  })
})

it("anchors each pinned track's bottom while it folds downward", () => {
  const tracks = visibleTracks(createMockDocument().tracks)
  const pinned = tracks.filter(track => track.kind === "return" || track.kind === "main")
  const expanded = layoutTrackRowsForViewport(tracks, 0, 320, DEFAULT_LAYOUT_TOKENS)
  for (const track of pinned) {
    const before = expanded.find(row => row.track.id === track.id)!
    track.collapsed = true
    const after = layoutTrackRowsForViewport(tracks, 0, 320, DEFAULT_LAYOUT_TOKENS)
    const folded = after.find(row => row.track.id === track.id)!
    expect(folded.top + folded.height).toBe(before.top + before.height)
    expect(after[after.length - 1].top + after[after.length - 1].height).toBe(
      arrangementBodyBottom(320, DEFAULT_LAYOUT_TOKENS.arrangement)
    )
    track.collapsed = false
  }
})

it("keeps a folded group's compact summary lane while removing child rows", () => {
  const { tracks } = createMockDocument()
  const group = tracks.find(track => track.id === "drums-group")!
  const child = tracks.find(track => track.id === "trager")!
  const expanded = layoutTrackRowsForViewport(visibleTracks(tracks), 0, 320, DEFAULT_LAYOUT_TOKENS)
  group.collapsed = true
  const folded = layoutTrackRowsForViewport(visibleTracks(tracks), 0, 320, DEFAULT_LAYOUT_TOKENS)
  expect(folded.find(row => row.track.id === group.id)!.height).toBeLessThan(group.heightPx)
  expect(folded.some(row => row.track.id === child.id)).toBe(false)
  expect(folded.find(row => row.track.id === "3-audio")?.top).toBe(
    expanded.find(row => row.track.id === "3-audio")!.top -
      expanded
        .filter(row => group.childTrackIds?.includes(row.track.id))
        .reduce((sum, row) => sum + row.height, 0) -
      (group.heightPx - folded.find(row => row.track.id === group.id)!.height)
  )
  expect(child.clips.length).toBeGreaterThan(0)
  group.collapsed = false
  expect(visibleTracks(tracks).some(track => track.id === child.id)).toBe(true)
})

it("folds nested groups independently into compact summary lanes", () => {
  const { tracks } = createMockDocument()
  const outer = tracks.find(track => track.id === "drums-group")!
  const inner = tracks.find(track => track.id === "sidechain")!
  const leaf = tracks.find(track => track.id === "trager")!
  outer.childTrackIds = [inner.id]
  inner.kind = "group"
  inner.childTrackIds = [leaf.id]
  inner.collapsed = false
  const [moved] = tracks.splice(tracks.indexOf(leaf), 1)
  tracks.splice(tracks.indexOf(inner) + 1, 0, moved)
  const expanded = layoutTrackRowsForViewport(visibleTracks(tracks), 20, 320, DEFAULT_LAYOUT_TOKENS)
  expect(expanded.find(row => row.track.id === leaf.id)?.top).toBe(
    expanded.find(row => row.track.id === inner.id)!.top + inner.heightPx
  )
  inner.collapsed = true
  const foldedInner = layoutTrackRowsForViewport(
    visibleTracks(tracks),
    20,
    320,
    DEFAULT_LAYOUT_TOKENS
  )
  expect(foldedInner.find(row => row.track.id === inner.id)!.height).toBeLessThan(inner.heightPx)
  expect(foldedInner.some(row => row.track.id === leaf.id)).toBe(false)
  outer.collapsed = true
  const foldedOuter = layoutTrackRowsForViewport(
    visibleTracks(tracks),
    20,
    320,
    DEFAULT_LAYOUT_TOKENS
  )
  expect(foldedOuter.find(row => row.track.id === outer.id)!.height).toBeLessThan(outer.heightPx)
  expect(foldedOuter.some(row => row.track.id === inner.id)).toBe(false)
  outer.collapsed = false
  inner.collapsed = false
  expect(visibleTracks(tracks).find(track => track.id === leaf.id)?.clips).toEqual(leaf.clips)
})

it("reveals the inspected track when an editor reduces the lane viewport", () => {
  const tracks = visibleTracks(createMockDocument().tracks)
  const next = revealTrackScrollY(tracks, 320, 0, "4-midi", DEFAULT_LAYOUT_TOKENS)
  const row = layoutTrackRowsForViewport(tracks, next, 320, DEFAULT_LAYOUT_TOKENS).find(
    row => row.track.id === "4-midi"
  )
  if (!row) {
    throw new Error("Missing inspected track")
  }
  expect(row.top).toBeGreaterThanOrEqual(arrangementBodyTop(DEFAULT_LAYOUT_TOKENS.arrangement))
  expect(row.top + row.height).toBeLessThanOrEqual(
    arrangementBodyBottom(320, DEFAULT_LAYOUT_TOKENS.arrangement) -
      pinnedTrackHeight(tracks, DEFAULT_LAYOUT_TOKENS.track)
  )
  expect(revealTrackScrollY(tracks, 320, 20, "trager", DEFAULT_LAYOUT_TOKENS)).toBe(20)
})
