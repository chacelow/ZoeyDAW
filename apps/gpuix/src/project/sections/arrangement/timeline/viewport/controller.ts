import { projectActions, useProjectState } from "@/project/adapters"
import { growTimelineBars, timelineBars } from "@/project/model/selectors"
import { positionToBar, visibleTracks } from "@/project/model/types"
import {
  clampTimelineViewport,
  followViewport,
  panViewport,
  stepZoom,
  wheelZoom,
} from "../../core/viewport/zoom"
import { revealTrackScrollY } from "../../core/layout"
import type { EventPayload } from "@gpuix/react"
import type { TimelineViewport as ClampedTimelineViewport } from "../../core/viewport/zoom"
import type { Track } from "@/project/model/types"
import type { TrackGeometry } from "@/project/layout"

export interface TimelineSize {
  containerWidth: number
  bodyHeight: number
  timelineLeft: number
}

export interface TimelineViewportSnapshot extends ClampedTimelineViewport {
  bars: number
  tracks: readonly Track[]
  geometry: TrackGeometry
}

export interface TimelineViewportController {
  read: () => TimelineViewportSnapshot
  suspendFollow: () => void
  clamp: () => void
  wheel: (event: EventPayload) => boolean
  zoom: (direction: -1 | 1) => void
  reveal: (trackId: string) => void
  follow: (transportBar: number) => void
}

export function readTimelineViewport(
  size: TimelineSize,
  geometry: TrackGeometry
): TimelineViewportSnapshot {
  const { document: project, workspace, session } = useProjectState.getState()
  const bars = growTimelineBars(
    timelineBars(project),
    Math.max(
      positionToBar(session.position, project.transport.numerator),
      session.timeSelection?.endBar ?? 1
    )
  )
  const tracks = visibleTracks(project.tracks)
  return {
    bars,
    tracks,
    geometry,
    ...clampTimelineViewport({
      bars,
      containerWidth: size.containerWidth,
      bodyHeight: size.bodyHeight,
      numerator: project.transport.numerator,
      denominator: project.transport.denominator,
      tracks,
      geometry,
      storedPxPerBar: workspace.pxPerBar,
      storedScrollX: workspace.scrollX,
      storedScrollY: workspace.scrollY,
    }),
  }
}

export function createTimelineViewport(
  readSize: () => TimelineSize,
  readGeometry: () => TrackGeometry
): TimelineViewportController {
  let manualPanUntil = 0
  function suspendFollow() {
    manualPanUntil = performance.now() + 2000
  }
  return {
    read: () => readTimelineViewport(readSize(), readGeometry()),
    suspendFollow,
    clamp() {
      const { pxPerBar, scrollX, scrollY } = readTimelineViewport(readSize(), readGeometry())
      const workspace = useProjectState.getState().workspace
      if (
        pxPerBar !== workspace.pxPerBar ||
        scrollX !== workspace.scrollX ||
        scrollY !== workspace.scrollY
      ) {
        projectActions.setViewport({ pxPerBar, scrollX, scrollY })
      }
    },
    wheel(event: EventPayload) {
      const size = readSize()
      const view = readTimelineViewport(size, readGeometry())
      const modifiers = event.modifiers
      const deltaX = -(event.deltaX ?? 0)
      const deltaY = -(event.deltaY ?? 0)
      if (!deltaX && !deltaY) return false
      if (modifiers?.ctrl || modifiers?.cmd) {
        suspendFollow()
        projectActions.setViewport(
          wheelZoom({
            ...view,
            viewportWidth: view.timeViewportWidth,
            anchorX: (event.x ?? size.timelineLeft) - size.timelineLeft,
            deltaY,
          })
        )
      } else {
        if (deltaX || modifiers?.shift) suspendFollow()
        projectActions.setViewport(
          panViewport({
            ...view,
            width: view.timeViewportWidth,
            height: view.bodyHeight,
            deltaX,
            deltaY,
            shiftKey: modifiers?.shift ?? false,
          })
        )
      }
      return true
    },
    zoom(direction: -1 | 1) {
      suspendFollow()
      const view = readTimelineViewport(readSize(), readGeometry())
      projectActions.setViewport(
        stepZoom({ ...view, viewportWidth: view.timeViewportWidth, direction })
      )
    },
    reveal(trackId: string) {
      const view = readTimelineViewport(readSize(), readGeometry())
      const scrollY = revealTrackScrollY(
        view.tracks,
        view.bodyHeight,
        view.scrollY,
        trackId,
        view.geometry
      )
      if (scrollY !== view.scrollY) projectActions.setViewport({ scrollY })
    },
    follow(transportBar: number) {
      const view = readTimelineViewport(readSize(), readGeometry())
      const state = useProjectState.getState()
      const scrollX = followViewport({
        ...view,
        viewportWidth: view.timeViewportWidth,
        transportBar,
        follow: state.workspace.follow,
        playing: state.session.playing,
        now: performance.now(),
        manualPanUntil,
      })
      if (scrollX !== view.scrollX) projectActions.setViewport({ scrollX })
    },
  }
}
