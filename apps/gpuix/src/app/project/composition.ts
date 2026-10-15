import { createSceneStore } from "@/project/sections/arrangement/core/scene"
import { createTimelineController } from "@/project/sections/arrangement/timeline"
import { createLaneController } from "@/project/sections/arrangement/lane"
import { projectActions, useProjectState } from "@/project/adapters"
import type {
  TimelineController,
  TimelineControllerDeps,
} from "@/project/sections/arrangement/timeline"
import type { LaneController } from "@/project/sections/arrangement/lane"
import type { NativeClipboard } from "@/platform/clipboard"
import type { WindowKeyboard } from "@/platform/keyboard"
import type { AppInteraction } from "../interaction"

export interface ProjectComposition {
  readonly timeline: TimelineController
  readonly lane: LaneController
  onClipRegionKey(id: number | undefined): void
  tick(timestampMs: number): void
  getFrameDemand(): boolean
  subscribeFrameDemand(listener: () => void): () => void
  dispose(): void
}

export interface ProjectCompositionDependencies {
  readonly interaction: AppInteraction
  readonly keyboard: WindowKeyboard
  readonly clipboard: NativeClipboard
  readonly metrics: TimelineControllerDeps["metrics"]
  readonly subscribeWindowActive: TimelineControllerDeps["subscribeWindowActive"]
  readonly blurControl: () => void
  readonly browserCollapsed: () => boolean
  readonly focusBrowserSearch: () => void
}

/** Controllers share one scene; the timeline owns its projection and keyboard. */
export function createProjectComposition(deps: ProjectCompositionDependencies): ProjectComposition {
  const sceneStore = createSceneStore()
  let clipKey: number | undefined
  let windowKey: number | undefined
  let lane: LaneController
  const unsubscribeGlobal = deps.keyboard.subscribe("keyDown", event => {
    windowKey = event.keystrokeId
    if (event.defaultPrevented || deps.interaction.isModalOpen()) return
    const modifiers = event.modifiers
    if (
      event.key?.toLowerCase() !== "f" ||
      !(modifiers?.cmd || modifiers?.ctrl) ||
      modifiers.alt ||
      modifiers.shift ||
      deps.browserCollapsed()
    )
      return
    event.preventDefault()
    if (!event.isHeld) deps.focusBrowserSearch()
  })
  const timeline = createTimelineController({
    sceneStore,
    initialSize: { containerWidth: 0, bodyHeight: 0, timelineLeft: 0 },
    metrics: deps.metrics,
    subscribeWindowActive: deps.subscribeWindowActive,
    keyboard: {
      focus: () => {
        if (deps.interaction.isModalOpen()) return "menu"
        if (deps.interaction.isTextFocused()) return "text"
        if (clipKey !== undefined && clipKey === windowKey) return "clip-editor"
        return "timeline"
      },
      blurControl: deps.blurControl,
      claim: event =>
        lane.keyDown({
          key: event.key ?? "",
          shiftKey: event.modifiers?.shift ?? false,
          altKey: event.modifiers?.alt ?? false,
          metaKey: event.modifiers?.cmd ?? false,
          ctrlKey: event.modifiers?.ctrl ?? false,
          repeat: event.isHeld ?? false,
        }),
    },
  })
  lane = createLaneController({
    scene: sceneStore,
    actions: projectActions,
    getState: useProjectState.getState,
    clipboard: deps.clipboard,
    edgePixels: deps.metrics.timelineAutoScrollEdge,
    setScroll: timeline.setScroll,
    markDrawModeGesture: timeline.keyboard.markDrawGesture,
  })
  const unsubscribeActive = deps.subscribeWindowActive(active => {
    if (!active) lane.interrupt()
  })
  let disposed = false
  return {
    timeline,
    lane,
    onClipRegionKey(id) {
      clipKey = id
    },
    tick(timestampMs) {
      timeline.tick(timestampMs)
      lane.step(timestampMs)
    },
    getFrameDemand() {
      return (
        !disposed &&
        (useProjectState.getState().session.playing ||
          lane.getSnapshot().dragActive ||
          timeline.getFrameDemand())
      )
    },
    subscribeFrameDemand(listener) {
      const unsubscribeProject = useProjectState.subscribe((next, previous) => {
        if (next.session.playing !== previous.session.playing) listener()
      })
      const unsubscribeLane = lane.subscribe(listener)
      const unsubscribeScroll = timeline.subscribeFrameDemand(listener)
      return () => {
        unsubscribeProject()
        unsubscribeLane()
        unsubscribeScroll()
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribeGlobal()
      unsubscribeActive()
      lane.dispose()
      timeline.dispose()
    },
  }
}
