import { useSyncExternalStore } from "react"
import { projectActions, readTransportBar, useProjectState } from "@/project/adapters"
import { zoomAtAnchor } from "../core/viewport/zoom"
import { createTimelineKeyboard } from "./keyboard/controller"
import { createRulerController } from "./rulers/controller"
import { createTimelineAutoScroll } from "./viewport/auto-scroll"
import { createTimelineViewport } from "./viewport/controller"
import type { EventPayload } from "@gpuix/react"
import type { Theme } from "@/shared/theme/ThemeProvider"
import type { ArrangementViewport, SceneStore } from "../core/scene"
import type { MinimapGeometry } from "../core/viewport/minimap"
import type { KeyboardOwner, TimelineKeyboardDeps } from "./keyboard/controller"
import type { MinimapGesture } from "./minimap/gesture"
import type { RulerController } from "./rulers/controller"
import type { TimelineAutoScroll } from "./viewport/auto-scroll"
import type { TimelineSize } from "./viewport/controller"
import type { SessionState } from "@/project/model/types"

export interface TimelinePresentation {
  readonly size: TimelineSize
  readonly overviewHeight: number
}

export interface TimelineView {
  readonly rulers: RulerController
  readonly autoScroll: TimelineAutoScroll
  getSnapshot: () => TimelinePresentation
  subscribe: (listener: () => void) => () => void
  measure: (size: TimelineSize) => void
  setOverviewHeight: (height: number) => void
  overviewGeometry: () => MinimapGeometry
  wheel: (event: EventPayload) => boolean
  stepZoom: (direction: -1 | 1) => void
  suspendFollow: () => void
  registerMinimap: (gesture: MinimapGesture) => () => void
  cancelGestures: () => void
}

export interface TimelineController {
  readonly sceneStore: SceneStore
  readonly keyboard: KeyboardOwner
  readonly view: TimelineView
  useViewport: () => ArrangementViewport
  setScroll: (x: number, y: number) => ArrangementViewport
  zoomAt: (anchorBar: number, anchorPx: number, factor: number) => ArrangementViewport
  fitToProject: () => ArrangementViewport
  tick: (nowMs: number) => void
  dispose: () => void
}

export interface TimelineControllerDeps {
  sceneStore: SceneStore
  keyboard: TimelineKeyboardDeps
  initialSize: TimelineSize
  metrics: Pick<
    Theme["project"],
    "minimapMinHeight" | "minimapMaxHeight" | "timelineAutoScrollEdge"
  >
  subscribeWindowActive: (listener: (active: boolean) => void) => () => void
}

export function createTimelineController({
  sceneStore,
  keyboard: keyboardDeps,
  initialSize,
  metrics,
  subscribeWindowActive,
}: TimelineControllerDeps): TimelineController {
  let disposed = false
  let presentation: TimelinePresentation = {
    size: initialSize,
    overviewHeight: metrics.minimapMinHeight,
  }
  const listeners = new Set<() => void>()
  let minimap: MinimapGesture | null = null
  const viewport = createTimelineViewport(() => presentation.size)
  const rulers = createRulerController(sceneStore)
  const getViewport = () => sceneStore.get().viewport

  function setScroll(x: number, y: number): ArrangementViewport {
    if (!disposed) {
      viewport.suspendFollow()
      projectActions.setViewport({ scrollX: x, scrollY: y })
      synchronize()
    }
    return getViewport()
  }

  const autoScroll = createTimelineAutoScroll({
    scene: sceneStore,
    edge: metrics.timelineAutoScrollEdge,
    setScroll,
    onScroll: pointer => rulers.move(pointer.x, pointer.shiftKey),
  })

  const keyboard = createTimelineKeyboard({
    ...keyboardDeps,
    claim(event) {
      const key = event.key?.toLowerCase()
      if (key === "escape" && (rulers.active || (minimap && minimap.phase !== "idle"))) {
        cancelGestures()
        return true
      }
      if (rulers.active && key === "z" && (event.modifiers?.ctrl || event.modifiers?.cmd)) {
        cancelGestures()
        return true
      }
      return rulers.keyDown(event) || (keyboardDeps.claim?.(event) ?? false)
    },
  })
  function cancelGestures() {
    autoScroll.stop()
    rulers.cancel()
    minimap?.cancel()
    keyboard.deactivate()
  }

  let epoch = useProjectState.getState().session.editEpoch
  let clipIds = useProjectState.getState().session.selectedClipIds
  let trackIds = useProjectState.getState().session.selectedTrackIds
  let revealedClip: SessionState["editingClipId"] | undefined
  let revealedHeight: number | undefined

  function synchronize() {
    if (disposed) return
    const state = useProjectState.getState()
    if (epoch !== state.session.editEpoch) {
      epoch = state.session.editEpoch
      autoScroll.stop()
      rulers.cancel()
      minimap?.cancel()
      sceneStore.setTargetSelection({ kind: "none" })
    }
    viewport.clamp()
    const current = useProjectState.getState()
    if (
      revealedClip !== current.session.editingClipId ||
      revealedHeight !== presentation.size.bodyHeight
    ) {
      revealedClip = current.session.editingClipId
      revealedHeight = presentation.size.bodyHeight
      if (revealedClip && revealedHeight > 0) {
        const track = current.document.tracks.find(item =>
          item.clips.some(clip => clip.id === revealedClip)
        )
        if (track) viewport.reveal(track.id)
      }
    }
    const projection = viewport.read()
    sceneStore.setMusic({
      bars: projection.bars,
      grid: current.workspace.grid,
      transport: current.document.transport,
      tracks: current.document.tracks,
      markers: current.document.markers,
      loop: current.document.transport.loop,
    })
    sceneStore.setViewport({
      pxPerBar: projection.pxPerBar,
      scrollX: projection.scrollX,
      scrollY: projection.scrollY,
      width: projection.timeViewportWidth,
      height: projection.bodyHeight,
      dpr: sceneStore.get().viewport.dpr,
    })
    sceneStore.setPlayback({
      playing: current.session.playing,
      insertionPoint: current.session.insertionPoint,
    })
    sceneStore.setProjectPreview(current.session.preview)
    sceneStore.setTimeSelection(current.session.timeSelection)
    if (clipIds !== current.session.selectedClipIds) {
      clipIds = current.session.selectedClipIds
      sceneStore.setSelection(new Set(clipIds))
    }
    if (trackIds !== current.session.selectedTrackIds) {
      trackIds = current.session.selectedTrackIds
      sceneStore.setTrackSelection(new Set(trackIds))
    }
  }

  const view: TimelineView = {
    rulers,
    autoScroll,
    getSnapshot: () => presentation,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    measure(size) {
      if (
        disposed ||
        (size.containerWidth === presentation.size.containerWidth &&
          size.bodyHeight === presentation.size.bodyHeight &&
          size.timelineLeft === presentation.size.timelineLeft)
      )
        return
      presentation = { ...presentation, size }
      synchronize()
      for (const listener of listeners) listener()
    },
    setOverviewHeight(height) {
      if (disposed) return
      const next = Math.max(metrics.minimapMinHeight, Math.min(metrics.minimapMaxHeight, height))
      if (next === presentation.overviewHeight) return
      presentation = { ...presentation, overviewHeight: next }
      for (const listener of listeners) listener()
    },
    overviewGeometry: () => ({ ...viewport.read(), viewportWidth: getViewport().width }),
    wheel: viewport.wheel,
    stepZoom: viewport.zoom,
    suspendFollow: viewport.suspendFollow,
    registerMinimap(gesture) {
      minimap = gesture
      return () => {
        if (minimap === gesture) minimap = null
      }
    },
    cancelGestures,
  }

  const unsubscribeProject = useProjectState.subscribe(synchronize)
  const unsubscribeWindow = subscribeWindowActive(active => {
    if (!active) cancelGestures()
  })
  synchronize()
  sceneStore.setSelection(new Set(clipIds))
  sceneStore.setTrackSelection(new Set(trackIds))

  return {
    sceneStore,
    keyboard,
    view,
    useViewport() {
      return useSyncExternalStore(sceneStore.subscribe, getViewport)
    },
    setScroll,
    zoomAt(anchorBar, anchorPx, factor) {
      if (disposed) return getViewport()
      viewport.suspendFollow()
      const current = viewport.read()
      const offset = Math.max(0, Math.min(current.timeViewportWidth, anchorPx))
      projectActions.setViewport(
        zoomAtAnchor({
          ...current,
          viewportWidth: current.timeViewportWidth,
          scrollX: (anchorBar - 1) * current.pxPerBar - offset,
          anchorX: offset,
          nextPxPerBar: current.pxPerBar * factor,
        })
      )
      synchronize()
      return getViewport()
    },
    fitToProject() {
      if (disposed) return getViewport()
      viewport.suspendFollow()
      const current = viewport.read()
      projectActions.setViewport({ pxPerBar: current.minPxPerBar, scrollX: 0 })
      synchronize()
      return getViewport()
    },
    tick(nowMs) {
      if (disposed) return
      autoScroll.tick(nowMs)
      if (!rulers.active && (!minimap || minimap.phase === "idle"))
        viewport.follow(readTransportBar())
    },
    dispose() {
      if (disposed) return
      cancelGestures()
      keyboard.dispose()
      rulers.dispose()
      unsubscribeProject()
      unsubscribeWindow()
      disposed = true
      minimap = null
      listeners.clear()
    },
  }
}
