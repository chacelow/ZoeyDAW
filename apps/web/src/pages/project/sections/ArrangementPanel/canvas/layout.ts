/**
 * Shared geometry helpers for canvas painters and hit-tests.
 *
 * Painters and hit-test both need the same track-row Y positions and clip rects, computed from the scene. Keeping this math in one module keeps draw and input aligned at every zoom and scroll.
 */
import { isAutomationTarget, sameAutomationTarget } from "@zoeydaw/project-core/automation-target"
import { visibleTracks } from "@zoeydaw/project-core/types"
import { COLLAPSED_TRACK_HEIGHT, TRACK_RESIZE_STEP, trackHeight } from "@/pages/project/layout"
import type { AutomationTarget, Clip, Track } from "@zoeydaw/project-core/types"
import type { ArrangementScene } from "./scene"

/** Pattern ruler: numbered bars/beats, vertical zoom and horizontal pan. */
export const PATTERN_RULER_HEIGHT = 17
/** Loop band directly below the pattern ruler. */
export const LOOP_RULER_HEIGHT = 17
/** Locator band below the loop band; it has no separator line from the loop band. */
export const MARKER_RULER_HEIGHT = 17
export const BAR_RULER_HEIGHT = PATTERN_RULER_HEIGHT + LOOP_RULER_HEIGHT + MARKER_RULER_HEIGHT
export const TIME_RULER_HEIGHT = 18
/**
Trailing free area after the last track. It is part of the scroll content, not
reserved viewport, and is tall enough to read as a drop target.
*/
export const TRACK_DROP_ZONE_HEIGHT = COLLAPSED_TRACK_HEIGHT * 5
export const EXTRA_AUTOMATION_HEIGHT = TRACK_RESIZE_STEP * 2
export interface AutomationLayout {
  mode: boolean
  lanes: Readonly<Record<string, readonly AutomationTarget[]>>
}

export function displayedAutomationTargets(
  track: Track,
  display?: AutomationLayout
): readonly AutomationTarget[] {
  if (!display?.mode || track.collapsed) return []
  const targets = display.lanes[track.id] ?? []
  return targets.filter(
    (target, index) =>
      isAutomationTarget(target, track) &&
      !targets.slice(0, index).some(other => sameAutomationTarget(other, target))
  )
}

export function automationRowHeight(track: Track, display?: AutomationLayout): number {
  return (
    trackHeight(track) + displayedAutomationTargets(track, display).length * EXTRA_AUTOMATION_HEIGHT
  )
}

export interface TrackRow {
  track: Track
  top: number
  height: number
  contentHeight: number
}

export interface ClipRect {
  clip: Clip
  track: Track
  left: number
  top: number
  width: number
  height: number
}

/**
Y position of the first row, from the top of the canvas.
*/
export function arrangementBodyTop(): number {
  return BAR_RULER_HEIGHT
}

/**
Y position of the bottom time ruler, from the top of the canvas.
*/
export function arrangementBodyBottom(height: number): number {
  return Math.max(arrangementBodyTop(), height - TIME_RULER_HEIGHT)
}

/**
Return and main tracks remain anchored above the bottom ruler, regardless of Y scroll.
*/
export function isPinnedTrack(track: Track): boolean {
  return track.kind === "return" || track.kind === "main"
}

export function pinnedTrackHeight(tracks: readonly Track[], display?: AutomationLayout): number {
  return tracks.reduce(
    (height, track) => height + (isPinnedTrack(track) ? automationRowHeight(track, display) : 0),
    0
  )
}

/**
Rounded top of the pinned strip. Canvas painters and the header column both use
this so their horizontal dividers land on the same pixel.
*/
export function pinnedTopFor(
  tracks: readonly Track[],
  height: number,
  display?: AutomationLayout
): number {
  return Math.round(arrangementBodyBottom(height) - pinnedTrackHeight(tracks, display))
}

export function scrollableTrackHeight(
  tracks: readonly Track[],
  display?: AutomationLayout
): number {
  // The drop zone is the tail of the scroll content, not reserved viewport, so
  // it only appears once every track has scrolled past.
  return (
    tracks.reduce(
      (height, track) => height + (isPinnedTrack(track) ? 0 : automationRowHeight(track, display)),
      0
    ) + TRACK_DROP_ZONE_HEIGHT
  )
}

/**
Canvas-space top of the trailing drop zone: the end of the unpinned stack, so
it scrolls with the tracks and only shows once the last track has passed.
*/
export function dropZoneTop(
  tracks: readonly Track[],
  scrollY: number,
  display?: AutomationLayout
): number {
  const stack = tracks.reduce(
    (height, track) => height + (isPinnedTrack(track) ? 0 : automationRowHeight(track, display)),
    0
  )
  return arrangementBodyTop() - scrollY + stack
}

export function scrollableTrackViewportHeight(
  tracks: readonly Track[],
  height: number,
  display?: AutomationLayout
): number {
  return Math.max(
    0,
    arrangementBodyBottom(height) - arrangementBodyTop() - pinnedTrackHeight(tracks, display)
  )
}

export function maxTrackScrollY(
  tracks: readonly Track[],
  height: number,
  display?: AutomationLayout
): number {
  return Math.max(
    0,
    scrollableTrackHeight(tracks, display) - scrollableTrackViewportHeight(tracks, height, display)
  )
}

/**
Shared CSS-pixel row origins for canvas, hit tests, and the header column.
*/
export function layoutTrackRowsForViewport(
  tracks: readonly Track[],
  scrollY: number,
  height: number,
  display?: AutomationLayout
): TrackRow[] {
  const rows: TrackRow[] = []
  let y = arrangementBodyTop() - scrollY
  let pinnedY = Math.round(arrangementBodyBottom(height) - pinnedTrackHeight(tracks, display))
  for (const track of tracks) {
    const contentHeight = trackHeight(track)
    const height = automationRowHeight(track, display)
    if (isPinnedTrack(track)) {
      rows.push({ track, top: pinnedY, height, contentHeight })
      pinnedY += height
    } else {
      rows.push({ track, top: y, height, contentHeight })
      y += height
    }
  }
  return rows
}

export function layoutTrackRows(scene: ArrangementScene): TrackRow[] {
  return layoutTrackRowsForViewport(
    visibleTracks(scene.tracks),
    scene.viewport.scrollY,
    scene.viewport.height,
    { mode: scene.automationMode, lanes: scene.automationLanes }
  )
}

/**
Rect of a clip in CSS pixel coordinates relative to the canvas.
*/
export function clipRect(clip: Clip, row: TrackRow, pxPerBar: number, scrollX: number): ClipRect {
  const left = (clip.startBar - 1) * pxPerBar - scrollX
  const width = Math.max(2, clip.lengthBars * pxPerBar)
  return { clip, track: row.track, left, top: row.top, width, height: row.contentHeight }
}

export function revealTrackScrollY(
  tracks: readonly Track[],
  height: number,
  scrollY: number,
  trackId: string,
  display?: AutomationLayout
): number {
  const row = layoutTrackRowsForViewport(tracks, scrollY, height, display).find(
    row => row.track.id === trackId
  )
  if (!row || isPinnedTrack(row.track)) {
    return scrollY
  }
  const top = arrangementBodyTop()
  const bottom = arrangementBodyBottom(height) - pinnedTrackHeight(tracks, display)
  const next =
    row.top < top || row.height > bottom - top
      ? scrollY + row.top - top
      : row.top + row.height > bottom
        ? scrollY + row.top + row.height - bottom
        : scrollY
  return Math.max(0, Math.min(maxTrackScrollY(tracks, height, display), next))
}
