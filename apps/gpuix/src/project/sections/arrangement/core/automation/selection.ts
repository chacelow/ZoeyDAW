import { automationY } from "./geometry"
import type { AutomationRow } from "./geometry"

export function marqueePointIds(
  row: AutomationRow,
  originBar: number,
  endBar: number,
  originY: number,
  endY: number
): string[] {
  const lower = Math.min(originY, endY)
  const upper = Math.max(originY, endY)
  return (
    row.lane?.points
      .filter(
        point =>
          point.bar >= Math.min(originBar, endBar) &&
          point.bar <= Math.max(originBar, endBar) &&
          automationY(row, point.value) >= lower &&
          automationY(row, point.value) <= upper
      )
      .map(point => point.id) ?? []
  )
}
