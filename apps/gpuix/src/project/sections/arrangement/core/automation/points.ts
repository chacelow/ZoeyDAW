import { clampAutomationValue } from "@/project/model/automation-curve"
import { snapBar } from "@/project/model/grid-geometry"
import type { AutomationPoint } from "@/project/model/types"

export function sortedPoints(points: readonly AutomationPoint[]): AutomationPoint[] {
  return [...points]
    .sort((a, b) => a.bar - b.bar || a.id.localeCompare(b.id))
    .filter((point, index, array) => index === 0 || point.bar - array[index - 1].bar >= 0.000001)
}

export function selectedPointIds(
  existing: readonly string[],
  pointId: string,
  shift: boolean
): string[] {
  return shift
    ? existing.includes(pointId)
      ? existing.filter(id => id !== pointId)
      : [...existing, pointId]
    : existing.includes(pointId)
      ? [...existing]
      : [pointId]
}

export interface MovePointsInput {
  source: readonly AutomationPoint[]
  ids: readonly string[]
  rawDelta: number
  valueDelta: number
  snap: boolean
  cellBars: number
  endBar: number
  bypass?: boolean
}

export function movePoints({
  source,
  ids,
  rawDelta,
  valueDelta,
  snap,
  cellBars,
  endBar,
  bypass = false,
}: MovePointsInput): AutomationPoint[] {
  const moving = new Set(ids)
  const chosen = source.filter(item => moving.has(item.id))
  if (!chosen.length) return [...source]
  const minBar = Math.min(...chosen.map(item => item.bar))
  const maxBar = Math.max(...chosen.map(item => item.bar))
  const snapped = snapBar(Math.max(1, minBar + rawDelta), snap, cellBars, endBar, bypass)
  const delta = Math.min(endBar - maxBar, snapped - minBar)
  const edited = chosen.map(item => ({
    ...item,
    bar: item.bar + delta,
    value: clampAutomationValue(item.value + valueDelta),
  }))
  return sortedPoints([
    ...source.filter(
      item =>
        !moving.has(item.id) && edited.every(other => !(Math.abs(item.bar - other.bar) < 0.000001))
    ),
    ...edited,
  ])
}

export function deletePointOnRelease(
  cancelled: boolean,
  moved: boolean,
  shift: boolean,
  ids: readonly string[]
): boolean {
  return !cancelled && !moved && !shift && ids.length === 1
}
