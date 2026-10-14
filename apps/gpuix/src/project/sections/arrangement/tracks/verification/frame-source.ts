import type { AnimationFrameCallback, AnimationFrameSource } from "@/platform/frame"

export interface ControlledFrames {
  readonly source: AnimationFrameSource
  advance: (timestampMs: number) => void
}

export function createControlledFrames(): ControlledFrames {
  const callbacks = new Set<AnimationFrameCallback>()
  return {
    source: {
      subscribe(callback) {
        callbacks.add(callback)
        return () => {
          callbacks.delete(callback)
        }
      },
    },
    advance(timestampMs) {
      for (const callback of [...callbacks]) {
        if (callbacks.has(callback)) callback(timestampMs)
      }
    },
  }
}
