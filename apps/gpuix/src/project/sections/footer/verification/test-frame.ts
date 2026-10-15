import type { AnimationFrameCallback, AnimationFrameSource } from "@/platform/frame"

export interface TestAnimationFrames extends AnimationFrameSource {
  readonly emit: (timestampMs: number) => void
  readonly subscriberCount: number
}

export function createTestAnimationFrames(): TestAnimationFrames {
  const listeners = new Set<AnimationFrameCallback>()
  return {
    get subscriberCount() {
      return listeners.size
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(timestampMs) {
      for (const listener of listeners) listener(timestampMs)
    },
  }
}
