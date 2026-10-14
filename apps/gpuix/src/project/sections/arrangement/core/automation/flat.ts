import { snapBar } from "@/project/model/grid-geometry"
import type { AutomationPoint } from "@/project/model/types"

export function flatLinePoint(
  bar: number,
  value: number,
  snap: boolean,
  cellBars: number,
  endBar: number,
  bypass = false
): Omit<AutomationPoint, "id"> {
  return { bar: snapBar(bar, snap, cellBars, endBar, bypass), value }
}

export function shouldInsertFlatPoint(cancelled: boolean, moved: boolean): boolean {
  return !cancelled && !moved
}
