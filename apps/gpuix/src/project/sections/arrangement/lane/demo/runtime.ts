import type { EventPayload } from "@gpuix/react"
import { createNativeClipboard } from "@/platform/clipboard"
import type { NativeClipboard } from "@/platform/clipboard"
import { createWindowKeyboard } from "@/platform/keyboard"
import type { WindowKeyboard, WindowKeyEvent } from "@/platform/keyboard"
import {
  getEffectiveDocument,
  projectActions,
  readTransportBar,
  startProjectRuntime,
  useProjectState,
} from "@/project/adapters"
import { timelineBars, growTimelineBars } from "@/project/model/selectors"
import { positionToBar, visibleTracks } from "@/project/model/types"
import type { ProjectState } from "@/project/model/types"
import { TRACK_RESIZE_STEP } from "@/project/layout"
import { createSceneStore } from "../../core/scene"
import type { ArrangementViewport, SceneStore } from "../../core/scene"
import {
  clampTimelineViewport,
  followViewport,
  panViewport,
  stepZoom,
  wheelZoom,
} from "../../core/viewport/zoom"
import { createLaneController } from "../interactions/controller"
import type { LaneController } from "../interactions/controller"

export interface LaneDemoRuntime {
  scene: SceneStore
  lane: LaneController
  clipboard: NativeClipboard
  keyboard: WindowKeyboard
  measure(width: number, height: number, x: number): void
  wheel(event: EventPayload): void
  zoom(direction: -1 | 1): void
  frame(timestampMs: number): void
  interrupt(): void
  dispose(): void
}

export function createLaneDemoRuntime(): LaneDemoRuntime {
  const release = startProjectRuntime()
  const scene = createSceneStore()
  const clipboard = createNativeClipboard()
  const keyboard = createWindowKeyboard()
  let width = 0
  let height = 0
  let originX = 0
  let nativeTime = 0
  let manualPanUntil = 0
  let disposed = false

  function layout(
    patch: Partial<Pick<ArrangementViewport, "pxPerBar" | "scrollX" | "scrollY">> = {}
  ) {
    const state = useProjectState.getState()
    return clampTimelineViewport({
      bars: scene.get().bars,
      containerWidth: width,
      bodyHeight: height,
      numerator: state.document.transport.numerator,
      denominator: state.document.transport.denominator,
      tracks: visibleTracks(getEffectiveDocument().tracks),
      storedPxPerBar: patch.pxPerBar ?? state.workspace.pxPerBar,
      storedScrollX: patch.scrollX ?? state.workspace.scrollX,
      storedScrollY: patch.scrollY ?? state.workspace.scrollY,
    })
  }
  function applyViewport(
    patch: Partial<Pick<ArrangementViewport, "pxPerBar" | "scrollX" | "scrollY">> = {}
  ): ArrangementViewport {
    const solved = layout(patch)
    const next = {
      pxPerBar: solved.pxPerBar,
      scrollX: solved.scrollX,
      scrollY: solved.scrollY,
      width: solved.timeViewportWidth,
      height,
      dpr: 1,
    }
    scene.setViewport(next)
    const stored = useProjectState.getState().workspace
    if (
      stored.pxPerBar !== next.pxPerBar ||
      stored.scrollX !== next.scrollX ||
      stored.scrollY !== next.scrollY
    )
      projectActions.setViewport({
        pxPerBar: next.pxPerBar,
        scrollX: next.scrollX,
        scrollY: next.scrollY,
      })
    return next
  }
  function synchronize(state: ProjectState, previous?: ProjectState) {
    const musicalChange =
      !previous ||
      state.document !== previous.document ||
      state.session.preview !== previous.session.preview ||
      state.workspace.grid !== previous.workspace.grid
    if (musicalChange) {
      const effective = getEffectiveDocument(state)
      scene.setMusic({
        bars: growTimelineBars(
          timelineBars(effective),
          Math.max(
            positionToBar(state.session.position, state.document.transport.numerator),
            state.session.timeSelection?.endBar ?? 1
          )
        ),
        grid: state.workspace.grid,
        transport: state.document.transport,
        tracks: state.document.tracks,
        markers: state.document.markers,
        loop: state.document.transport.loop,
      })
      scene.setProjectPreview(state.session.preview)
      if (state.session.preview?.kind !== "tracks") {
        scene.setClipDrag(null)
        scene.setClipResize(null)
      }
    }
    scene.setPlayback({
      playing: state.session.playing,
      insertionPoint: state.session.insertionPoint,
    })
    if (!previous || state.session.selectedClipIds !== previous.session.selectedClipIds)
      scene.setSelection(new Set(state.session.selectedClipIds))
    if (!previous || state.session.selectedTrackIds !== previous.session.selectedTrackIds)
      scene.setTrackSelection(new Set(state.session.selectedTrackIds))
    if (!previous || state.session.timeSelection !== previous.session.timeSelection)
      scene.setTimeSelection(state.session.timeSelection)
    if (!previous || state.session.automationParameters !== previous.session.automationParameters)
      scene.setAutomationParameters(state.session.automationParameters)
    if (previous && state.session.editEpoch !== previous.session.editEpoch)
      scene.setTargetSelection({ kind: "none" })
    if (
      musicalChange ||
      !previous ||
      state.workspace.pxPerBar !== previous.workspace.pxPerBar ||
      state.workspace.scrollX !== previous.workspace.scrollX ||
      state.workspace.scrollY !== previous.workspace.scrollY
    )
      applyViewport()
  }
  synchronize(useProjectState.getState())
  const unsubscribeStore = useProjectState.subscribe(synchronize)
  const lane = createLaneController({
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
    clipboard,
    edgePixels: TRACK_RESIZE_STEP * 2,
    setScroll: (x, y) => applyViewport({ scrollX: x, scrollY: y }),
  })

  function claim(event: WindowKeyEvent) {
    event.preventDefault()
    event.stopPropagation()
  }
  const unsubscribeKeyboard = keyboard.subscribe("keyDown", event => {
    if (!event.key || event.defaultPrevented) return
    const target = scene.get().targetSelection
    if (
      (target.kind === "clip" && target.phase === "renaming") ||
      target.kind === "automation-value"
    )
      return
    const key = event.key.toLowerCase()
    const modifiers = event.modifiers
    const command = (modifiers?.cmd || modifiers?.ctrl) && !modifiers?.alt
    if ((key === "space" || key === " ") && !command && !modifiers?.alt) {
      claim(event)
      if (!event.isHeld) projectActions.togglePlay()
      return
    }
    if (command && (key === "1" || key === "2")) {
      claim(event)
      if (!event.isHeld) projectActions.adjustGrid(key === "1" ? -1 : 1)
      return
    }
    if (command && key === "z") {
      claim(event)
      if (modifiers?.shift) projectActions.redo()
      else projectActions.undo()
      return
    }
    if (
      lane.keyDown({
        key,
        shiftKey: modifiers?.shift ?? false,
        altKey: modifiers?.alt ?? false,
        metaKey: modifiers?.cmd ?? false,
        ctrlKey: modifiers?.ctrl ?? false,
        repeat: event.isHeld ?? false,
      })
    ) {
      claim(event)
      return
    }
    if (command || modifiers?.alt || event.isHeld) return
    const workspace = useProjectState.getState().workspace
    if (key === "m") {
      claim(event)
      projectActions.setMode("computerKeyboard", !workspace.computerKeyboard)
    }
    if (key === "a" && !workspace.computerKeyboard) {
      claim(event)
      projectActions.setMode("automationMode", !workspace.automationMode)
    }
  })
  return {
    scene,
    lane,
    clipboard,
    keyboard,
    measure(nextWidth, nextHeight, x) {
      width = nextWidth
      height = nextHeight
      originX = x
      applyViewport()
    },
    wheel(event) {
      manualPanUntil = nativeTime + 3000
      const current = scene.get()
      const scale = event.precise ? 1 : TRACK_RESIZE_STEP
      if (event.modifiers?.cmd || event.modifiers?.ctrl) {
        const solved = layout()
        applyViewport(
          wheelZoom({
            ...current.viewport,
            bars: current.bars,
            viewportWidth: current.viewport.width,
            minPxPerBar: solved.minPxPerBar,
            maxPxPerBar: solved.maxPxPerBar,
            anchorX: (event.x ?? originX) - originX,
            deltaY: -(event.deltaY ?? 0) * scale,
          })
        )
      } else {
        applyViewport(
          panViewport({
            ...current.viewport,
            bars: current.bars,
            tracks: visibleTracks(getEffectiveDocument().tracks),
            deltaX: -(event.deltaX ?? 0) * scale,
            deltaY: -(event.deltaY ?? 0) * scale,
            shiftKey: event.modifiers?.shift ?? false,
          })
        )
      }
    },
    zoom(direction) {
      const current = scene.get()
      const solved = layout()
      applyViewport(
        stepZoom({
          ...current.viewport,
          bars: current.bars,
          viewportWidth: current.viewport.width,
          minPxPerBar: solved.minPxPerBar,
          maxPxPerBar: solved.maxPxPerBar,
          direction,
        })
      )
    },
    frame(timestampMs) {
      nativeTime = timestampMs
      lane.step(timestampMs)
      const current = scene.get()
      const state = useProjectState.getState()
      const next = followViewport({
        ...current.viewport,
        bars: current.bars,
        viewportWidth: current.viewport.width,
        transportBar: readTransportBar(),
        playing: state.session.playing,
        follow: state.workspace.follow,
        now: timestampMs,
        manualPanUntil,
      })
      if (next !== current.viewport.scrollX) applyViewport({ scrollX: next })
    },
    interrupt() {
      lane.interrupt()
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribeKeyboard()
      unsubscribeStore()
      lane.dispose()
      release()
    },
  }
}
