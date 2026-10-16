import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { createTimelineController } from "../../timeline/controller"
import type { SceneStore } from "../../core/scene"

export function createTestTimeline(sceneStore: SceneStore, width: number, height: number) {
  return createTimelineController({
    sceneStore,
    initialSize: {
      containerWidth: width + DEFAULT_LAYOUT_TOKENS.track.controlsWidth,
      bodyHeight: height,
      timelineLeft: 0,
    },
    metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
}
