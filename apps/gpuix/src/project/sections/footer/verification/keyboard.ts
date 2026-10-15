import { createTimelineController } from "@/project/sections/arrangement/timeline"
import { createSceneStore } from "@/project/sections/arrangement/core/scene"
import type {
  TimelineController,
  TimelineControllerDeps,
} from "@/project/sections/arrangement/timeline"
import type { WindowKeyboard } from "@/platform/keyboard"

export interface VerificationKeyboardOptions {
  readonly windowKeyboard: WindowKeyboard
  readonly metrics: TimelineControllerDeps["metrics"]
  readonly size: TimelineControllerDeps["initialSize"]
  readonly subscribeWindowActive: TimelineControllerDeps["subscribeWindowActive"]
  readonly blurControl: () => void
}

export interface VerificationKeyboardOwner {
  readonly timeline: TimelineController
  readonly dispose: () => void
}

export function createVerificationKeyboard({
  windowKeyboard,
  metrics,
  size,
  subscribeWindowActive,
  blurControl,
}: VerificationKeyboardOptions): VerificationKeyboardOwner {
  const timeline = createTimelineController({
    sceneStore: createSceneStore(),
    metrics,
    initialSize: size,
    subscribeWindowActive,
    keyboard: { focus: () => "control", blurControl },
  })
  const down = windowKeyboard.subscribe("keyDown", event => {
    if (timeline.keyboard.down(event)) event.preventDefault()
  })
  const up = windowKeyboard.subscribe("keyUp", event => {
    if (timeline.keyboard.up(event)) event.preventDefault()
  })
  return {
    timeline,
    dispose() {
      down()
      up()
      timeline.dispose()
    },
  }
}
