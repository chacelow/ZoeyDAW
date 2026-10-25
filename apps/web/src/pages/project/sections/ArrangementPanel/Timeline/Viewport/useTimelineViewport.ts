import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { projectActions, readTransportBar, useProjectState } from "@/pages/project/adapters"
import { timelineBars } from "@zoeydaw/project-core/selectors"
import { timelineZoomLimit } from "@zoeydaw/project-core/timeline-zoom"
import { positionToBar } from "@zoeydaw/project-core/types"
import { arrangementViewProjection } from "@/pages/project/layout"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import {
  maxTrackScrollY,
  revealTrackScrollY,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { useViewportSync } from "@/pages/project/sections/ArrangementPanel/canvas/useSceneSync"
import { arrangementScheduler } from "@/pages/project/sections/ArrangementPanel/canvas/scheduler"
import { arrangementPlayhead } from "@/pages/project/sections/ArrangementPanel/canvas/audio/playhead-projection"
import { useSongExtent } from "./useSongExtent"
import type { RefObject } from "react"

function useMeasuredSize(reference: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = reference.current
    if (!element) {
      return
    }
    const measure = () => {
      const rect = element.getBoundingClientRect()
      setSize(previous => {
        return previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height }
      })
    }
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(element)
    measure()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [reference])
  return size
}

/**
Owns viewport measurement, store clamping, wheel input and temporary follow suspension.
*/
export function useTimelineViewport(
  containerReference: RefObject<HTMLDivElement | null>,
  bodyReference: RefObject<HTMLDivElement | null>,
  canvasReference: RefObject<HTMLDivElement | null>
) {
  const { width: containerWidth } = useMeasuredSize(containerReference)
  const { height: bodyHeight } = useMeasuredSize(bodyReference)
  const document = useProjectState(state => state.document)
  const arrangementView = useProjectState(state => state.workspace.arrangementView)
  const projection = useMemo(
    () => arrangementViewProjection(document.tracks, arrangementView),
    [document.tracks, arrangementView]
  )
  const visible = projection.visible
  const positionBar = useProjectState(state =>
    positionToBar(state.session.position, state.document.transport.numerator)
  )
  const selectionEnd = useProjectState(state => state.session.timeSelection?.endBar ?? 1)
  const editingClipId = useProjectState(state => state.session.editingClipId)
  const editEpoch = useProjectState(state => state.session.editEpoch)
  const follow = useProjectState(state => state.workspace.follow)
  const playing = useProjectState(state => state.session.playing)
  const storedPxPerBar = useProjectState(state => state.workspace.pxPerBar)
  const storedScrollX = useProjectState(state => state.workspace.scrollX)
  const storedScrollY = useProjectState(state => state.workspace.scrollY)
  const automationMode = useProjectState(state => state.workspace.automationMode)
  const automationLanes = useProjectState(state => state.workspace.automationLanes)
  const automationDisplay = useMemo(
    () => ({ mode: automationMode, lanes: automationLanes }),
    [automationMode, automationLanes]
  )
  const manualPanUntil = useRef(0)
  const suspendFollow = useCallback(() => {
    manualPanUntil.current = performance.now() + 2000
  }, [])

  const baseBars = useMemo(() => timelineBars(document), [document])
  const quarterNotesPerBar = (document.transport.numerator * 4) / document.transport.denominator
  const songBars = useSongExtent(
    editEpoch,
    baseBars,
    Math.max(positionBar, selectionEnd),
    quarterNotesPerBar
  )
  const timeViewportWidth = Math.max(0, containerWidth - projection.controlsWidth)
  const bars = Math.max(
    songBars,
    storedPxPerBar > 0 ? (storedScrollX + Math.max(0, timeViewportWidth - 1)) / storedPxPerBar : 0
  )
  const minPxPerBar = timeViewportWidth > 1 ? (timeViewportWidth - 1) / bars : 1
  const maxPxPerBar = Math.max(minPxPerBar, timelineZoomLimit(document.transport, document.media))
  const pxPerBar = Math.max(minPxPerBar, Math.min(maxPxPerBar, storedPxPerBar || minPxPerBar))
  const timelineWidth = Math.trunc(bars * pxPerBar + 1.5)
  const scrollX = Math.max(
    0,
    Math.min(Math.max(0, timelineWidth - timeViewportWidth), storedScrollX || 0)
  )
  const scrollY =
    bodyHeight > 0
      ? Math.max(
          0,
          Math.min(maxTrackScrollY(visible, bodyHeight, automationDisplay), storedScrollY || 0)
        )
      : Math.max(0, storedScrollY || 0)

  useViewportSync({ pxPerBar, scrollX, scrollY })
  useEffect(() => {
    if (storedPxPerBar !== pxPerBar || storedScrollX !== scrollX || storedScrollY !== scrollY) {
      projectActions.setViewport({ pxPerBar, scrollX, scrollY })
    }
  }, [storedPxPerBar, storedScrollX, storedScrollY, pxPerBar, scrollX, scrollY])

  useEffect(() => {
    if (!editingClipId || bodyHeight <= 0) {
      return
    }
    const state = useProjectState.getState()
    const track = state.document.tracks.find(item =>
      item.clips.some(clip => clip.id === editingClipId)
    )
    if (!track) {
      return
    }
    const next = revealTrackScrollY(
      arrangementViewProjection(state.document.tracks, state.workspace.arrangementView).visible,
      bodyHeight,
      state.workspace.scrollY,
      track.id,
      automationDisplay
    )
    if (next !== state.workspace.scrollY) {
      projectActions.setViewport({ scrollY: next })
    }
  }, [editingClipId, bodyHeight, automationDisplay])

  useEffect(() => {
    if (!follow || !playing || timeViewportWidth <= 0) {
      return
    }
    const id = "timeline-follow"
    const paint = () => {
      const state = useProjectState.getState()
      if (!state.workspace.follow || !state.session.playing) {
        return
      }
      if (performance.now() >= manualPanUntil.current) {
        const sampled = arrangementPlayhead.readPlayhead()
        const pixel = ((sampled.playing ? sampled.bar : readTransportBar()) - 1) * pxPerBar
        const current = state.workspace.scrollX
        const next = Math.max(
          0,
          Math.min(timelineWidth - timeViewportWidth, pixel - timeViewportWidth / 2)
        )
        if (next !== current && (pixel < current || pixel >= current + timeViewportWidth / 2)) {
          arrangementScene.setViewport({
            ...arrangementScene.get().viewport,
            pxPerBar,
            scrollX: next,
          })
          projectActions.setViewport({ scrollX: next })
        }
      }
      arrangementScheduler.invalidate(id)
    }
    return arrangementScheduler.register(id, paint, "update")
  }, [follow, playing, pxPerBar, timeViewportWidth, timelineWidth])

  useEffect(() => {
    const element = bodyReference.current
    if (!element) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) {
        return
      }
      event.preventDefault()
      const current = arrangementScene.get().viewport
      if (event.ctrlKey || event.metaKey) {
        const rect = canvasReference.current?.getBoundingClientRect()
        if (!rect) {
          return
        }
        const state = useProjectState.getState()
        // Two distinct cases: while playing with follow on, zoom keeps the playhead centred so
        // the view stays locked to playback. Otherwise zoom anchors at the pointer, like Live.
        const followingPlayback = state.workspace.follow && state.session.playing
        if (!followingPlayback) suspendFollow()
        const offset = followingPlayback
          ? rect.width / 2
          : Math.max(0, Math.min(rect.width, event.clientX - rect.left))
        const next = Math.max(
          minPxPerBar,
          Math.min(maxPxPerBar, current.pxPerBar * Math.exp(-event.deltaY / 260))
        )
        const anchor = followingPlayback
          ? readTransportBar() - 1
          : (current.scrollX + offset) / current.pxPerBar
        projectActions.setViewport({
          pxPerBar: next,
          scrollX: Math.max(0, Math.min(bars * next - rect.width, anchor * next - offset)),
        })
        return
      }
      const dx = event.shiftKey ? event.deltaY + event.deltaX : event.deltaX
      const dy = event.shiftKey ? 0 : event.deltaY
      if (dx) {
        suspendFollow()
      }
      const nextX = Math.max(
        0,
        Math.min(Math.max(0, bars * current.pxPerBar - current.width), current.scrollX + dx)
      )
      const nextY = Math.max(
        0,
        Math.min(maxTrackScrollY(visible, current.height, automationDisplay), current.scrollY + dy)
      )
      if (nextX !== current.scrollX || nextY !== current.scrollY) {
        projectActions.setViewport({ scrollX: nextX, scrollY: nextY })
      }
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }, [
    bodyReference,
    canvasReference,
    bars,
    maxPxPerBar,
    minPxPerBar,
    visible,
    suspendFollow,
    automationDisplay,
  ])

  const zoom = (direction: -1 | 1) => {
    suspendFollow()
    const next = Math.max(
      minPxPerBar,
      Math.min(maxPxPerBar, pxPerBar * (direction > 0 ? 1.25 : 0.8))
    )
    const center = scrollX + timeViewportWidth / 2
    projectActions.setViewport({
      pxPerBar: next,
      scrollX: Math.max(
        0,
        Math.min(
          bars * next - timeViewportWidth,
          (center * next) / pxPerBar - timeViewportWidth / 2
        )
      ),
    })
  }

  return {
    bars,
    bodyHeight,
    controlsWidth: projection.controlsWidth,
    timeViewportWidth,
    minPxPerBar,
    maxPxPerBar,
    pxPerBar,
    scrollX,
    scrollY,
    visible,
    suspendFollow,
    zoom,
  }
}
