import { onReducedMotionChange, reducedMotion } from "@zoeydaw/native"
import { createNativeValueSubscription } from "./native-value-subscription"

/** 系统「减少动态效果」的当前值;首帧用它,之后用订阅。只有 macOS 支持,其它平台抛错。 */
export const getReducedMotion: () => boolean = reducedMotion

/** 进程级单个原生 observer;首个原生值只建立基线,之后只通知变化。 */
export const subscribeReducedMotion = createNativeValueSubscription<boolean>(
  onReducedMotionChange,
  "reduced motion events"
)
