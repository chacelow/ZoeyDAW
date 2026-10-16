import { visibleTracks } from "@/project/model/types"
import { trackHeight } from "@/project/layout"
import type { TrackGeometry } from "@/project/layout"
import type { Clip, Track } from "@/project/model/types"
import type { ArrangementGeometry, ArrangementScene } from "./scene"

export interface TrackRow {
  track: Track
  top: number
  height: number
  trackGeometry: TrackGeometry
  arrangementGeometry: ArrangementGeometry["arrangement"]
}

export interface ClipRect {
  clip: Clip
  track: Track
  left: number
  top: number
  width: number
  height: number
  trackGeometry: TrackGeometry
  arrangementGeometry: ArrangementGeometry["arrangement"]
}

export function arrangementBodyTop(geometry: ArrangementGeometry["arrangement"]): number {
  return geometry.barRulerHeight
}

export function arrangementBodyBottom(
  height: number,
  geometry: ArrangementGeometry["arrangement"]
): number {
  return Math.max(arrangementBodyTop(geometry), height - geometry.timeRulerHeight)
}

export function isPinnedTrack(track: Track): boolean {
  return track.kind === "return" || track.kind === "main"
}

export function pinnedTrackHeight(tracks: readonly Track[], geometry: TrackGeometry): number {
  return tracks.reduce(
    (height, track) => height + (isPinnedTrack(track) ? trackHeight(track, geometry) : 0),
    0
  )
}

export function scrollableTrackHeight(tracks: readonly Track[], geometry: TrackGeometry): number {
  return tracks.reduce(
    (height, track) => height + (isPinnedTrack(track) ? 0 : trackHeight(track, geometry)),
    0
  )
}

export function scrollableTrackViewportHeight(
  tracks: readonly Track[],
  height: number,
  geometry: ArrangementGeometry
): number {
  return Math.max(
    0,
    arrangementBodyBottom(height, geometry.arrangement) -
      arrangementBodyTop(geometry.arrangement) -
      pinnedTrackHeight(tracks, geometry.track)
  )
}

export function maxTrackScrollY(
  tracks: readonly Track[],
  height: number,
  geometry: ArrangementGeometry
): number {
  return Math.max(
    0,
    scrollableTrackHeight(tracks, geometry.track) -
      scrollableTrackViewportHeight(tracks, height, geometry)
  )
}

export function layoutTrackRowsForViewport(
  tracks: readonly Track[],
  scrollY: number,
  height: number,
  geometry: ArrangementGeometry
): TrackRow[] {
  const rows: TrackRow[] = []
  let y = arrangementBodyTop(geometry.arrangement) - scrollY
  let pinnedY =
    arrangementBodyBottom(height, geometry.arrangement) - pinnedTrackHeight(tracks, geometry.track)
  for (const track of tracks) {
    const rowHeight = trackHeight(track, geometry.track)
    if (isPinnedTrack(track)) {
      rows.push({
        track,
        top: pinnedY,
        height: rowHeight,
        trackGeometry: geometry.track,
        arrangementGeometry: geometry.arrangement,
      })
      pinnedY += rowHeight
    } else {
      rows.push({
        track,
        top: y,
        height: rowHeight,
        trackGeometry: geometry.track,
        arrangementGeometry: geometry.arrangement,
      })
      y += rowHeight
    }
  }
  return rows
}

export function layoutTrackRows(scene: ArrangementScene): TrackRow[] {
  return layoutTrackRowsForViewport(
    visibleTracks([...scene.tracks]),
    scene.viewport.scrollY,
    scene.viewport.height,
    scene.geometry
  )
}

export function clipRect(clip: Clip, row: TrackRow, pxPerBar: number, scrollX: number): ClipRect {
  const left = (clip.startBar - 1) * pxPerBar - scrollX
  const width = Math.max(row.arrangementGeometry.clip.minWidth, clip.lengthBars * pxPerBar)
  return {
    clip,
    track: row.track,
    left,
    top: row.top,
    width,
    height: row.height,
    trackGeometry: row.trackGeometry,
    arrangementGeometry: row.arrangementGeometry,
  }
}

export function revealTrackScrollY(
  tracks: readonly Track[],
  height: number,
  scrollY: number,
  trackId: string,
  geometry: ArrangementGeometry
): number {
  const row = layoutTrackRowsForViewport(tracks, scrollY, height, geometry).find(
    row => row.track.id === trackId
  )
  if (!row || isPinnedTrack(row.track)) {
    return scrollY
  }
  const top = arrangementBodyTop(geometry.arrangement)
  const bottom =
    arrangementBodyBottom(height, geometry.arrangement) - pinnedTrackHeight(tracks, geometry.track)
  const next =
    row.top < top || row.height > bottom - top
      ? scrollY + row.top - top
      : row.top + row.height > bottom
        ? scrollY + row.top + row.height - bottom
        : scrollY
  return Math.max(0, Math.min(maxTrackScrollY(tracks, height, geometry), next))
}
