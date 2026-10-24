import {
  DEFAULT_TRACK_HEIGHT,
  arrangementViewProjection,
  trackHeight,
} from "@/pages/project/layout"
import { describe, expect, it } from "vitest"
import { createMockDocument } from "@zoeydaw/project-runtime/testing"
import { visibleTracks } from "@zoeydaw/project-core/types"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  layoutTrackRowsForViewport,
  maxTrackScrollY,
  pinnedTrackHeight,
  revealTrackScrollY,
  scrollableTrackHeight,
  scrollableTrackViewportHeight,
  TRACK_DROP_ZONE_HEIGHT,
} from "./layout"
import type { AutomationLayout } from "./layout"

describe("arrangement track geometry", () => {
  const tracks = visibleTracks(createMockDocument(DEFAULT_TRACK_HEIGHT).tracks)
  const height = 320

  it("moves ordinary headers and lanes together while return/main stay above the fixed time ruler", () => {
    const initial = layoutTrackRowsForViewport(tracks, 0, height)
    const scrolled = layoutTrackRowsForViewport(tracks, 80, height)
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
    expect(last.top + last.height).toBe(arrangementBodyBottom(height))
    expect(initial[0].top).toBe(arrangementBodyTop())
  })

  it("bounds scroll using only the unpinned viewport and keeps rulers fixed", () => {
    expect(scrollableTrackViewportHeight(tracks, height)).toBe(
      arrangementBodyBottom(height) - arrangementBodyTop() - pinnedTrackHeight(tracks)
    )
    expect(maxTrackScrollY(tracks, height)).toBeGreaterThan(0)
    expect(maxTrackScrollY(tracks, 5000)).toBe(0)
    // The drop zone is trailing content, so it extends the scrollable range.
    expect(scrollableTrackHeight(tracks)).toBe(
      tracks.reduce(
        (total, track) =>
          total + (track.kind === "return" || track.kind === "main" ? 0 : trackHeight(track)),
        0
      ) + TRACK_DROP_ZONE_HEIGHT
    )
  })
})

it("keeps Main bottom-pinned and return automation stored when Return is hidden", () => {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const returnTrack = document.tracks.find(track => track.kind === "return")!
  returnTrack.collapsed = false
  const audio = document.tracks.find(track => track.kind === "audio")!
  audio.sends = { [returnTrack.id]: -12 }
  const view = { routing: true, returns: false, overview: true }
  const projected = arrangementViewProjection(document.tracks, view)
  const display: AutomationLayout = {
    mode: true,
    lanes: { [returnTrack.id]: [{ kind: "mixer", parameter: "volume" }] },
  }
  const rows = layoutTrackRowsForViewport(projected.visible, 0, 320, display)
  const restored = arrangementViewProjection(document.tracks, { ...view, returns: true })
  const restoredRows = layoutTrackRowsForViewport(restored.visible, 0, 320, display)
  expect(restoredRows.find(row => row.track.id === returnTrack.id)?.height).toBeGreaterThan(
    rows.find(row => row.track.id === "main")!.height
  )
  expect(rows.some(row => row.track.id === returnTrack.id)).toBe(false)
  const main = rows.find(row => row.track.kind === "main")!
  expect(main.top + main.height).toBe(arrangementBodyBottom(320))
  expect(projected.tracks.some(track => track.id === returnTrack.id)).toBe(false)
  expect(document.tracks).toContain(returnTrack)
  expect(document.tracks.find(track => track.id === audio.id)?.sends?.[returnTrack.id]).toBe(-12)
  expect(display.lanes[returnTrack.id]).toHaveLength(1)
  expect(arrangementViewProjection(document.tracks, { ...view, returns: true }).visible).toContain(
    returnTrack
  )
})

it("keeps clips in their own rows while extra automation lanes expand scroll and pinned geometry", () => {
  const tracks = visibleTracks(createMockDocument(DEFAULT_TRACK_HEIGHT).tracks)
  const display: AutomationLayout = {
    mode: true,
    lanes: {
      "3-audio": [
        { kind: "mixer", parameter: "volume" },
        { kind: "mixer", parameter: "pan" },
      ],
      main: [{ kind: "mixer", parameter: "pan" }],
    },
  }
  const before = layoutTrackRowsForViewport(tracks, 0, 700)
  const after = layoutTrackRowsForViewport(tracks, 0, 700, display)
  const original = before.find(row => row.track.id === "3-audio")!
  const expanded = after.find(row => row.track.id === "3-audio")!
  const following = after.find(row => row.track.id === "4-midi")!
  expect(expanded.contentHeight).toBe(original.height)
  expect(expanded.height).toBeGreaterThan(original.height)
  expect(following.top).toBe(expanded.top + expanded.height)
  expect(after.find(row => row.track.id === "main")!.top).toBe(
    before.find(row => row.track.id === "main")!.top -
      (after.find(row => row.track.id === "main")!.height -
        before.find(row => row.track.id === "main")!.height)
  )
  expect(pinnedTrackHeight(tracks, display)).toBeGreaterThan(pinnedTrackHeight(tracks))
  expect(maxTrackScrollY(tracks, 320, display)).toBeGreaterThan(maxTrackScrollY(tracks, 320))
  const hidden = { mode: false, lanes: display.lanes }
  expect(layoutTrackRowsForViewport(tracks, 0, 700, hidden).map(row => row.height)).toEqual(
    before.map(row => row.height)
  )
  const folded = tracks.map(track =>
    track.id === "3-audio" ? { ...track, collapsed: true } : track
  )
  expect(
    layoutTrackRowsForViewport(folded, 0, 700, display).find(row => row.track.id === "3-audio")
      ?.height
  ).toBe(layoutTrackRowsForViewport(folded, 0, 700).find(row => row.track.id === "3-audio")?.height)
})

it("anchors each pinned track's bottom while it folds downward", () => {
  const tracks = visibleTracks(createMockDocument(DEFAULT_TRACK_HEIGHT).tracks)
  const pinned = tracks.filter(track => track.kind === "return" || track.kind === "main")
  const expanded = layoutTrackRowsForViewport(tracks, 0, 320)
  for (const track of pinned) {
    const before = expanded.find(row => row.track.id === track.id)!
    track.collapsed = true
    const after = layoutTrackRowsForViewport(tracks, 0, 320)
    const folded = after.find(row => row.track.id === track.id)!
    expect(folded.top + folded.height).toBe(before.top + before.height)
    expect(after[after.length - 1].top + after[after.length - 1].height).toBe(
      arrangementBodyBottom(320)
    )
    track.collapsed = false
  }
})

it("keeps a folded group's compact summary lane while removing child rows", () => {
  const { tracks } = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const group = tracks.find(track => track.id === "drums-group")!
  const child = tracks.find(track => track.id === "trager")!
  const expanded = layoutTrackRowsForViewport(visibleTracks(tracks), 0, 320)
  group.collapsed = true
  const folded = layoutTrackRowsForViewport(visibleTracks(tracks), 0, 320)
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
  const { tracks } = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const outer = tracks.find(track => track.id === "drums-group")!
  const inner = tracks.find(track => track.id === "sidechain")!
  const leaf = tracks.find(track => track.id === "trager")!
  outer.childTrackIds = [inner.id]
  inner.kind = "group"
  inner.childTrackIds = [leaf.id]
  inner.collapsed = false
  const [moved] = tracks.splice(tracks.indexOf(leaf), 1)
  tracks.splice(tracks.indexOf(inner) + 1, 0, moved)
  const expanded = layoutTrackRowsForViewport(visibleTracks(tracks), 20, 320)
  expect(expanded.find(row => row.track.id === leaf.id)?.top).toBe(
    expanded.find(row => row.track.id === inner.id)!.top + inner.heightPx
  )
  inner.collapsed = true
  const foldedInner = layoutTrackRowsForViewport(visibleTracks(tracks), 20, 320)
  expect(foldedInner.find(row => row.track.id === inner.id)!.height).toBeLessThan(inner.heightPx)
  expect(foldedInner.some(row => row.track.id === leaf.id)).toBe(false)
  outer.collapsed = true
  const foldedOuter = layoutTrackRowsForViewport(visibleTracks(tracks), 20, 320)
  expect(foldedOuter.find(row => row.track.id === outer.id)!.height).toBeLessThan(outer.heightPx)
  expect(foldedOuter.some(row => row.track.id === inner.id)).toBe(false)
  outer.collapsed = false
  inner.collapsed = false
  expect(visibleTracks(tracks).find(track => track.id === leaf.id)?.clips).toEqual(leaf.clips)
})

it("reveals the inspected track when an editor reduces the lane viewport", () => {
  const tracks = visibleTracks(createMockDocument(DEFAULT_TRACK_HEIGHT).tracks)
  const next = revealTrackScrollY(tracks, 320, 0, "4-midi")
  const row = layoutTrackRowsForViewport(tracks, next, 320).find(row => row.track.id === "4-midi")
  if (!row) {
    throw new Error("Missing inspected track")
  }
  expect(row.top).toBeGreaterThanOrEqual(arrangementBodyTop())
  expect(row.top + row.height).toBeLessThanOrEqual(
    arrangementBodyBottom(320) - pinnedTrackHeight(tracks)
  )
  expect(revealTrackScrollY(tracks, 320, 20, "trager")).toBe(20)
})
