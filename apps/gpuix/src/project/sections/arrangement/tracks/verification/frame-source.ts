import type { AnimationFrameCallback, AnimationFrameSource } from "@/platform/frame"

export interface ControlledFrames {
  readonly source: AnimationFrameSource
  readonly subscribers: number
  readonly resumeSubscribers: number
  advance: (timestampMs: number) => void
  resume: (timestampMs: number) => void
}

export function createControlledFrames(): ControlledFrames {
  const callbacks = new Set<AnimationFrameCallback>()
  const resumeCallbacks = new Set<AnimationFrameCallback>()
  return {
    get subscribers() {
      return callbacks.size
    },
    get resumeSubscribers() {
      return resumeCallbacks.size
    },
    source: {
      subscribe(callback) {
        callbacks.add(callback)
        return () => {
          callbacks.delete(callback)
        }
      },
      subscribeResume(callback) {
        resumeCallbacks.add(callback)
        return () => {
          resumeCallbacks.delete(callback)
        }
      },
    },
    advance(timestampMs) {
      for (const callback of [...callbacks]) {
        if (callbacks.has(callback)) callback(timestampMs)
      }
    },
    resume(timestampMs) {
      for (const callback of [...resumeCallbacks]) {
        if (resumeCallbacks.has(callback)) callback(timestampMs)
      }
    },
  }
}
