import { clampAutomationCurve, clampAutomationValue } from "@/project/model/automation-curve"
import { automationSegmentValue } from "./geometry"
import { snapBar } from "@/project/model/grid-geometry"
import type { AutomationPoint } from "@/project/model/types"

export function moveSegment(
  source: readonly AutomationPoint[],
  fromId: string,
  toId: string,
  delta: number,
  bend: boolean
): AutomationPoint[] {
  return source.map(point =>
    bend
      ? point.id === fromId
        ? { ...point, curve: clampAutomationCurve((point.curve ?? 0) + delta * 4) }
        : point
      : point.id === fromId || point.id === toId
        ? { ...point, value: clampAutomationValue(point.value + delta) }
        : point
  )
}

export function insertSegmentPoint(
  from: AutomationPoint,
  to: AutomationPoint,
  bar: number,
  snap: boolean,
  cellBars: number,
  endBar: number,
  bypass = false
): Omit<AutomationPoint, "id"> {
  const snapped = snapBar(bar, snap, cellBars, endBar, bypass)
  return { bar: snapped, value: automationSegmentValue(from, to, snapped) }
}

export function shouldInsertSegmentPoint(
  cancelled: boolean,
  changed: boolean,
  bend: boolean,
  near: boolean
): boolean {
  return !cancelled && !changed && !bend && !near
}
