import type { Track } from "../model/types"

export interface TrackGeometry {
  readonly spacing: number
  readonly border: number
  readonly collapsedHeight: number
  readonly titleHeight: number
  readonly maxHeight: number
  readonly resizeStep: number
  readonly revealThreshold: number
  readonly controlsWidth: number
}

export function trackHeight(track: Track, geometry: TrackGeometry): number {
  return track.collapsed
    ? geometry.collapsedHeight
    : Math.max(geometry.collapsedHeight + geometry.resizeStep, track.heightPx)
}

export function trackControlRows(track: Track, geometry: TrackGeometry): number {
  const contentHeight = trackHeight(track, geometry) - geometry.border - geometry.spacing * 2
  return Math.floor((contentHeight + geometry.spacing) / geometry.resizeStep)
}

export function resizeTrackHeight(
  track: Track,
  deltaY: number,
  geometry: TrackGeometry
): Pick<Track, "collapsed" | "heightPx"> {
  const { collapsedHeight, maxHeight, resizeStep, revealThreshold } = geometry
  if (track.collapsed && deltaY < revealThreshold) {
    return { collapsed: true, heightPx: track.heightPx }
  }
  if (track.collapsed) {
    const steps = Math.max(
      1,
      Math.min(
        Math.floor((maxHeight - collapsedHeight) / resizeStep),
        Math.round((deltaY - revealThreshold) / resizeStep) + 1
      )
    )
    return { collapsed: false, heightPx: collapsedHeight + steps * resizeStep }
  }
  const desired = trackHeight(track, geometry) + deltaY
  if (desired <= collapsedHeight + resizeStep) {
    return { collapsed: true, heightPx: track.heightPx }
  }
  const steps = Math.max(
    Math.ceil((collapsedHeight + resizeStep - track.heightPx) / resizeStep),
    Math.min(Math.floor((maxHeight - track.heightPx) / resizeStep), Math.round(deltaY / resizeStep))
  )
  return { collapsed: false, heightPx: track.heightPx + steps * resizeStep }
}
