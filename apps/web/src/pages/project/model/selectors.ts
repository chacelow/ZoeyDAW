import { MIN_TIMELINE_BARS } from "./types"
import type { DocumentState, Track } from "./types"

export const TRACK_LAYOUT = { controlHeight: 13, spacing: 4 } as const
export const COLLAPSED_TRACK_HEIGHT = TRACK_LAYOUT.controlHeight + TRACK_LAYOUT.spacing * 2 + 2
export const TRACK_TITLE_HEIGHT = COLLAPSED_TRACK_HEIGHT - 2
export const DEFAULT_TRACK_HEIGHT = 70
export const MAX_TRACK_HEIGHT = 4 * DEFAULT_TRACK_HEIGHT
export const TRACK_RESIZE_STEP = TRACK_LAYOUT.controlHeight + TRACK_LAYOUT.spacing
export const TRACK_REVEAL_THRESHOLD = TRACK_RESIZE_STEP / 2

/** One layout measurement for header, lane and minimap alike. */
export function trackHeight(track: Track): number {
  return track.collapsed
    ? COLLAPSED_TRACK_HEIGHT
    : Math.max(COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP, track.heightPx)
}

export function trackControlRows(track: Track): number {
  const contentHeight = trackHeight(track) - 2 - TRACK_LAYOUT.spacing * 2
  return Math.floor((contentHeight + TRACK_LAYOUT.spacing) / TRACK_RESIZE_STEP)
}

/** Apply a pointer delta from the gesture's starting track, snapping to control-row heights. */
export function resizeTrackHeight(
  track: Track,
  deltaY: number
): Pick<Track, "collapsed" | "heightPx"> {
  if (track.collapsed && deltaY < TRACK_REVEAL_THRESHOLD) {
    return { collapsed: true, heightPx: track.heightPx }
  }
  if (track.collapsed) {
    const steps = Math.max(
      1,
      Math.min(
        Math.floor((MAX_TRACK_HEIGHT - COLLAPSED_TRACK_HEIGHT) / TRACK_RESIZE_STEP),
        Math.round((deltaY - TRACK_REVEAL_THRESHOLD) / TRACK_RESIZE_STEP) + 1
      )
    )
    return {
      collapsed: false,
      heightPx: COLLAPSED_TRACK_HEIGHT + steps * TRACK_RESIZE_STEP,
    }
  }
  const desired = trackHeight(track) + deltaY
  if (desired <= COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP) {
    return { collapsed: true, heightPx: track.heightPx }
  }
  const steps = Math.max(
    Math.ceil((COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP - track.heightPx) / TRACK_RESIZE_STEP),
    Math.min(
      Math.floor((MAX_TRACK_HEIGHT - track.heightPx) / TRACK_RESIZE_STEP),
      Math.round(deltaY / TRACK_RESIZE_STEP)
    )
  )
  return { collapsed: false, heightPx: track.heightPx + steps * TRACK_RESIZE_STEP }
}

/** Round the last occupied bar up with a full 16-bar region for editing room. */
export function growTimelineBars(baseBars: number, throughBar: number): number {
  if (!Number.isFinite(throughBar) || throughBar <= 1) return Math.max(MIN_TIMELINE_BARS, baseBars)
  const rounded = Math.ceil((throughBar - 1) / 16) * 16 + 16
  return Math.max(MIN_TIMELINE_BARS, baseBars, Number.isFinite(rounded) ? rounded : throughBar)
}

export function timelineBars(document: DocumentState): number {
  let throughBar = document.transport.loop.endBar
  for (const marker of document.markers) throughBar = Math.max(throughBar, marker.bar)
  for (const track of document.tracks) {
    for (const clip of track.clips)
      throughBar = Math.max(throughBar, clip.startBar + clip.lengthBars)
    for (const lane of track.automation)
      for (const point of lane.points) throughBar = Math.max(throughBar, point.bar)
  }
  return growTimelineBars(MIN_TIMELINE_BARS, throughBar)
}
