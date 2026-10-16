import type { ResolvedConstraints } from "./sizes"

type Interval = readonly [number, number]

function mergeIntervals(intervals: Interval[]): Interval[] {
  const result: Interval[] = []
  for (const [low, high] of intervals.sort((a, b) => a[0] - b[0])) {
    const previous = result.at(-1)
    if (previous && low <= previous[1] + 0.000001) {
      result[result.length - 1] = [previous[0], Math.max(previous[1], high)]
    } else result.push([low, high])
  }
  return result
}

function allowedChanges(size: number, c: ResolvedConstraints, growing: boolean): Interval[] {
  if (growing) {
    if (c.collapsible && size === c.collapsed) {
      return [
        [0, 0],
        [c.min - size, c.max - size],
      ]
    }
    return [[0, Math.max(0, c.max - size)]]
  }
  if (c.collapsible && size === c.collapsed) return [[0, 0]]
  const continuous: Interval = [0, Math.max(0, size - c.min)]
  return c.collapsible ? [continuous, [size - c.collapsed, size - c.collapsed]] : [continuous]
}

function sideIntervals(
  indices: readonly number[],
  sizes: readonly number[],
  constraints: readonly ResolvedConstraints[],
  growing: boolean
): { changes: Interval[][]; suffix: Interval[][] } {
  const changes = indices.map(i => allowedChanges(sizes[i], constraints[i], growing))
  const suffix: Interval[][] = Array.from({ length: indices.length + 1 }, () => [[0, 0]])
  for (let i = indices.length - 1; i >= 0; i--) {
    suffix[i] = mergeIntervals(
      changes[i].flatMap(([low, high]) =>
        suffix[i + 1].map(([nextLow, nextHigh]): Interval => [low + nextLow, high + nextHigh])
      )
    )
  }
  return { changes, suffix }
}

/** The closest feasible transfer makes a collapse/expand jump only after its midpoint.
 * Both sides must admit the same transfer: a snap can never overflow its neighbour. */
export function computeLayout(
  sizes: readonly number[],
  constraints: readonly ResolvedConstraints[],
  { separator, delta }: { separator: number; delta: number }
): number[] {
  if (sizes.length !== constraints.length || separator < 0 || separator >= sizes.length - 1) {
    throw new RangeError("Divider must separate two panels with matching constraints")
  }
  if (!Number.isFinite(delta)) throw new RangeError("Divider delta must be finite")
  if (delta === 0) return [...sizes]
  const left = Array.from({ length: separator + 1 }, (_, i) => separator - i)
  const right = Array.from({ length: sizes.length - separator - 1 }, (_, i) => separator + 1 + i)
  const growing = delta > 0 ? left : right
  const shrinking = delta > 0 ? right : left
  const grow = sideIntervals(growing, sizes, constraints, true)
  const shrink = sideIntervals(shrinking, sizes, constraints, false)
  let transfer = 0
  let distance = Math.abs(delta)
  for (const [growMin, growMax] of grow.suffix[0]) {
    for (const [shrinkMin, shrinkMax] of shrink.suffix[0]) {
      const low = Math.max(growMin, shrinkMin)
      const high = Math.min(growMax, shrinkMax)
      if (low > high + 0.000001) continue
      const candidate = Math.max(low, Math.min(high, Math.abs(delta)))
      const candidateDistance = Math.abs(candidate - Math.abs(delta))
      if (
        candidateDistance < distance ||
        (candidateDistance === distance && candidate < transfer)
      ) {
        transfer = candidate
        distance = candidateDistance
      }
    }
  }
  const result = [...sizes]
  for (const [indices, side, sign] of [
    [growing, grow, 1],
    [shrinking, shrink, -1],
  ] as const) {
    let remaining = transfer
    for (let i = 0; i < indices.length; i++) {
      let change = 0
      for (const [low, high] of side.changes[i]) {
        for (const [suffixLow, suffixHigh] of side.suffix[i + 1]) {
          const feasibleLow = Math.max(low, remaining - suffixHigh)
          const feasibleHigh = Math.min(high, remaining - suffixLow)
          if (feasibleLow <= feasibleHigh + 0.000001) change = Math.max(change, feasibleHigh)
        }
      }
      result[indices[i]] += sign * change
      remaining -= change
    }
  }
  return result
}
