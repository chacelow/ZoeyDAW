import {
  activeAutomationRows,
  automationBar,
  automationRowValue,
  automationX,
  automationY,
} from "./geometry"
import type { AutomationRow } from "./geometry"
import type { AutomationPoint } from "@/pages/project/model/types"
import type { CanvasPointer, InteractionContext } from "../types"

export type AutomationHit =
  | { row: AutomationRow; kind: "point"; point: AutomationPoint }
  | {
      row: AutomationRow
      kind: "segment"
      from: AutomationPoint
      to: AutomationPoint
      value: number
      near: boolean
    }
  | { row: AutomationRow; kind: "lane"; value: number; onLine: boolean }

export function hitAutomation(
  context: InteractionContext,
  pointer: CanvasPointer
): AutomationHit | null {
  const scene = context.scene.get()
  const row = activeAutomationRows(scene).find(
    item => pointer.y >= item.top && pointer.y < item.bottom
  )
  if (!row) {
    return null
  }
  const points = row.lane?.points ?? []
  for (const point of points) {
    if (
      Math.abs(pointer.x - automationX(scene, point.bar)) <= 6 &&
      Math.abs(pointer.y - automationY(row, point.value)) <= 7
    ) {
      return { row, kind: "point", point }
    }
  }
  const bar = automationBar(scene, pointer.x)
  const value = automationRowValue(row, bar)
  const distance = Math.abs(pointer.y - automationY(row, value))
  if (points.length > 1 && bar > points[0].bar && bar < points[points.length - 1].bar) {
    for (let index = 1; index < points.length; index++) {
      const from = points[index - 1]
      const to = points[index]
      if (bar > from.bar && bar < to.bar && distance <= Math.min(14, row.valueHeight / 8)) {
        return { row, kind: "segment", from, to, value, near: distance > 4 }
      }
    }
  }
  return { row, kind: "lane", value, onLine: distance <= 4 }
}
