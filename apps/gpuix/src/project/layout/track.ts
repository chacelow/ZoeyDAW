import { CONTROL_METRICS, PROJECT_METRICS } from "@zoeymind/ui/metrics"
import type { Track } from "../model/types"

export const TRACK_LAYOUT = {
  controlHeight: CONTROL_METRICS.default["--spacing-control-track"],
  spacing: CONTROL_METRICS.default["--spacing-control-track-gap"],
} as const
export const COLLAPSED_TRACK_HEIGHT =
  TRACK_LAYOUT.controlHeight + TRACK_LAYOUT.spacing * 2 + PROJECT_METRICS.trackBorder
export const TRACK_TITLE_HEIGHT = COLLAPSED_TRACK_HEIGHT - PROJECT_METRICS.trackBorder
export const DEFAULT_TRACK_HEIGHT = PROJECT_METRICS.defaultTrackHeight
export const MAX_TRACK_HEIGHT = 4 * DEFAULT_TRACK_HEIGHT
export const TRACK_RESIZE_STEP = TRACK_LAYOUT.controlHeight + TRACK_LAYOUT.spacing
export const TRACK_REVEAL_THRESHOLD = TRACK_RESIZE_STEP / 2
export const CONTROLS_WIDTH = PROJECT_METRICS.controlsWidth

/**
One layout measurement for header, lane and minimap alike.
*/
export function trackHeight(track: Track): number {
  return track.collapsed
    ? COLLAPSED_TRACK_HEIGHT
    : Math.max(COLLAPSED_TRACK_HEIGHT + TRACK_RESIZE_STEP, track.heightPx)
}

export function trackControlRows(track: Track): number {
  const contentHeight = trackHeight(track) - PROJECT_METRICS.trackBorder - TRACK_LAYOUT.spacing * 2
  return Math.floor((contentHeight + TRACK_LAYOUT.spacing) / TRACK_RESIZE_STEP)
}

/**
Apply a pointer delta from the gesture's starting track, snapping to control-row heights.
*/
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
