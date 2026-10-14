import { PATTERN_STEPS_PER_BAR } from "./types"
import type { PatternClip } from "./types"

export function patternWindow(clip: PatternClip) {
  const origin = (clip.sourceOffsetBars ?? 0) * PATTERN_STEPS_PER_BAR
  const through = origin + clip.lengthBars * PATTERN_STEPS_PER_BAR
  return {
    origin,
    first: Math.floor(origin + 1e-9),
    end: Math.ceil(through - 1e-9),
    period: clip.steps?.length || PATTERN_STEPS_PER_BAR,
  }
}

const activity = new WeakMap<readonly boolean[], Uint32Array>()

export function patternHasActivity(
  steps: readonly boolean[],
  from: number,
  through: number
): boolean {
  if (!steps.length || through <= from) {
    return false
  }
  let prefix = activity.get(steps)
  if (!prefix) {
    prefix = new Uint32Array(steps.length + 1)
    for (const [index, step] of steps.entries()) {
      prefix[index + 1] = prefix[index] + (step ? 1 : 0)
    }
    activity.set(steps, prefix)
  }
  const first = Math.floor(from + 1e-9)
  const count = Math.ceil(through - 1e-9) - first
  if (count >= steps.length) {
    return prefix[steps.length] > 0
  }
  const start = ((first % steps.length) + steps.length) % steps.length
  const end = start + count
  return end <= steps.length
    ? prefix[end] > prefix[start]
    : prefix[steps.length] > prefix[start] || prefix[end - steps.length] > 0
}
