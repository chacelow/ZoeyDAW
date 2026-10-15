import type { AnimationFrameCallback, AnimationFrameSource } from "@/platform/frame"

export interface TestAnimationFrames extends AnimationFrameSource {
  readonly emit: (timestampMs: number) => void
  readonly emitResume: (timestampMs: number) => void
  readonly subscriberCount: number
}

export function createTestAnimationFrames(): TestAnimationFrames {
  const listeners = new Set<AnimationFrameCallback>()
  const resumeListeners = new Set<AnimationFrameCallback>()
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
    subscribeResume(listener) {
      resumeListeners.add(listener)
      return () => {
        resumeListeners.delete(listener)
      }
    },
    emitResume(timestampMs) {
      for (const listener of resumeListeners) listener(timestampMs)
    },
    emit(timestampMs) {
      for (const listener of listeners) listener(timestampMs)
    },
  }
}
