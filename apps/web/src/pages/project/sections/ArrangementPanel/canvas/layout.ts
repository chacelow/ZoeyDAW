/**
 * Shared geometry helpers for canvas painters and hit-tests.
 *
 * Painters and hit-test both need the same track-row Y positions and clip rects, computed from the scene. Keeping this math in one module keeps draw and input aligned at every zoom and scroll.
 */
import { visibleTracks } from "@/pages/project/model/types"
import { trackHeight } from "@/pages/project/layout"
import type { Clip, Track } from "@/pages/project/model/types"
import type { ArrangementScene } from "./scene"

export const MARKER_RULER_HEIGHT = 17
export const LOOP_RULER_HEIGHT = 17
export const BAR_RULER_HEIGHT = MARKER_RULER_HEIGHT + LOOP_RULER_HEIGHT
export const TIME_RULER_HEIGHT = 18

export interface TrackRow {
  track: Track
  top: number
  height: number
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

export function pinnedTrackHeight(tracks: readonly Track[]): number {
  return tracks.reduce(
    (height, track) => height + (isPinnedTrack(track) ? trackHeight(track) : 0),
    0
  )
}

export function scrollableTrackHeight(tracks: readonly Track[]): number {
  return tracks.reduce(
    (height, track) => height + (isPinnedTrack(track) ? 0 : trackHeight(track)),
    0
  )
}

/**
Scrollable lane height excludes both fixed rulers and the bottom-anchored tracks.
*/
export function scrollableTrackViewportHeight(tracks: readonly Track[], height: number): number {
  return Math.max(
    0,
    arrangementBodyBottom(height) - arrangementBodyTop() - pinnedTrackHeight(tracks)
  )
}

export function maxTrackScrollY(tracks: readonly Track[], height: number): number {
  return Math.max(0, scrollableTrackHeight(tracks) - scrollableTrackViewportHeight(tracks, height))
}

/**
Shared CSS-pixel row origins for canvas, hit tests, and the header column.
*/
export function layoutTrackRowsForViewport(
  tracks: readonly Track[],
  scrollY: number,
  height: number
): TrackRow[] {
  const rows: TrackRow[] = []
  let y = arrangementBodyTop() - scrollY
  let pinnedY = arrangementBodyBottom(height) - pinnedTrackHeight(tracks)
  for (const track of tracks) {
    const rowHeight = trackHeight(track)
    if (isPinnedTrack(track)) {
      rows.push({ track, top: pinnedY, height: rowHeight })
      pinnedY += rowHeight
    } else {
      rows.push({ track, top: y, height: rowHeight })
      y += rowHeight
    }
  }
  return rows
}

export function layoutTrackRows(scene: ArrangementScene): TrackRow[] {
  return layoutTrackRowsForViewport(
    visibleTracks([...scene.tracks]),
    scene.viewport.scrollY,
    scene.viewport.height
  )
}

/**
Rect of a clip in CSS pixel coordinates relative to the canvas.
*/
export function clipRect(clip: Clip, row: TrackRow, pxPerBar: number, scrollX: number): ClipRect {
  const left = (clip.startBar - 1) * pxPerBar - scrollX
  const width = Math.max(2, clip.lengthBars * pxPerBar)
  return { clip, track: row.track, left, top: row.top, width, height: row.height }
}

export function revealTrackScrollY(
  tracks: readonly Track[],
  height: number,
  scrollY: number,
  trackId: string
): number {
  const row = layoutTrackRowsForViewport(tracks, scrollY, height).find(
    row => row.track.id === trackId
  )
  if (!row || isPinnedTrack(row.track)) {
    return scrollY
  }
  const top = arrangementBodyTop()
  const bottom = arrangementBodyBottom(height) - pinnedTrackHeight(tracks)
  const next =
    row.top < top || row.height > bottom - top
      ? scrollY + row.top - top
      : row.top + row.height > bottom
        ? scrollY + row.top + row.height - bottom
        : scrollY
  return Math.max(0, Math.min(maxTrackScrollY(tracks, height), next))
}
