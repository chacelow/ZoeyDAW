import { onReducedMotionChange, reducedMotion } from "@zoeydaw/native"
import { createNativeValueSubscription } from "./native-value-subscription"

/** 系统「减少动态效果」当前值;macOS/Windows 原生读取,其它平台抛错。 */
export const getReducedMotion: () => boolean = reducedMotion

/** 进程级单个原生 observer;首个原生值只建立基线,之后只通知变化。 */
export const subscribeReducedMotion = createNativeValueSubscription<boolean>(
  onReducedMotionChange,
  "reduced motion events"
)
