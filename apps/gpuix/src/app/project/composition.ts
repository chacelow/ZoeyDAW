import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import type { ArrangementPolicy } from "@/project/defaults/arrangement"
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
import type { ArrangementGeometry } from "@/project/sections/arrangement/core/scene"

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
  readonly readPolicy?: () => ArrangementPolicy
  readonly interaction: AppInteraction
  readonly keyboard: WindowKeyboard
  readonly clipboard: NativeClipboard
  readonly metrics: TimelineControllerDeps["metrics"]
  readonly geometry: ArrangementGeometry
  readonly subscribeWindowActive: TimelineControllerDeps["subscribeWindowActive"]
  readonly blurControl: () => void
  readonly browserCollapsed: () => boolean
  readonly focusBrowserSearch: () => void
}

export function createProjectComposition(deps: ProjectCompositionDependencies): ProjectComposition {
  const readPolicy = deps.readPolicy ?? (() => ARRANGEMENT_DEFAULTS)
  const sceneStore = createSceneStore(deps.geometry)
  let clipKey: number | undefined
  let windowKey: number | undefined
  let lane: LaneController
  const unsubscribeGlobal = deps.keyboard.subscribe("keyDown", event => {
    windowKey = event.keystrokeId
  })
  const timeline = createTimelineController({
    sceneStore,
    readPolicy,
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
      browserSearch: { available: () => !deps.browserCollapsed(), focus: deps.focusBrowserSearch },
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
    readPolicy,
    actions: projectActions,
    getState: useProjectState.getState,
    clipboard: deps.clipboard,
    get edgePixels() {
      return deps.metrics.timelineAutoScrollEdge
    },
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
