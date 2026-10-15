import { CONTROLS_WIDTH } from "@/project/layout"
import { createTimelineController } from "../../timeline/controller"
import type { SceneStore } from "../../core/scene"

export function createTestTimeline(sceneStore: SceneStore, width: number, height: number) {
  return createTimelineController({
    sceneStore,
    initialSize: { containerWidth: width + CONTROLS_WIDTH, bodyHeight: height, timelineLeft: 0 },
    metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
}
