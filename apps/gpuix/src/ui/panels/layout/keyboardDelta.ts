import type { ResolvedConstraints } from "./sizes"

export function keyboardDelta(
  sizes: readonly number[],
  constraints: readonly ResolvedConstraints[],
  separator: number,
  direction: number,
  step: number
): number {
  const growing = direction > 0 ? separator : separator + 1
  const shrinking = direction > 0 ? separator + 1 : separator
  const grow = constraints[growing]
  const shrink = constraints[shrinking]
  const gap =
    grow.collapsible && sizes[growing] === grow.collapsed
      ? grow.min - grow.collapsed
      : shrink.collapsible && sizes[shrinking] <= shrink.min
        ? shrink.min - shrink.collapsed
        : 0
  return direction * Math.max(step, gap)
}
