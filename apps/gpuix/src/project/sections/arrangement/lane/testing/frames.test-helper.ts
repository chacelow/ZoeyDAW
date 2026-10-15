import type { AnimationFrameCallback, AnimationFrameSource } from "@/platform/frame"

export interface ManualFrames extends AnimationFrameSource {
  step(timestampMs: number): void
}

export function createManualFrames(): ManualFrames {
  const subscribers = new Set<AnimationFrameCallback>()
  return {
    subscribe(callback) {
      subscribers.add(callback)
      return () => {
        subscribers.delete(callback)
      }
    },
    step(timestampMs) {
      for (const callback of subscribers) callback(timestampMs)
    },
  }
}
