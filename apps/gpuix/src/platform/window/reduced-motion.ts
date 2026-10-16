import { onReducedMotionChange, reducedMotion } from "@zoeydaw/native"
import { createNativeValueSubscription } from "./native-value-subscription"

export const getReducedMotion: () => boolean = reducedMotion

export const subscribeReducedMotion = createNativeValueSubscription<boolean>(
  onReducedMotionChange,
  "reduced motion events"
)
