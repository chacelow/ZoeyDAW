import type { AnimationFrameCallback, AnimationFrameSource } from "@/platform/frame"

export interface ManualFrames extends AnimationFrameSource {
  readonly subscriberCount: number
  readonly resumeSubscriberCount: number
  step(timestampMs: number): void
  stepResume(timestampMs: number): void
}

export function createManualFrames(): ManualFrames {
  const subscribers = new Set<AnimationFrameCallback>()
  const resumeSubscribers = new Set<AnimationFrameCallback>()
  return {
    get subscriberCount() {
      return subscribers.size
    },
    get resumeSubscriberCount() {
      return resumeSubscribers.size
    },
    subscribe(callback) {
      subscribers.add(callback)
      return () => {
        subscribers.delete(callback)
      }
    },
    subscribeResume(callback) {
      resumeSubscribers.add(callback)
      return () => {
        resumeSubscribers.delete(callback)
      }
    },
    stepResume(timestampMs) {
      for (const callback of resumeSubscribers) callback(timestampMs)
    },
    step(timestampMs) {
      for (const callback of subscribers) callback(timestampMs)
    },
  }
}
