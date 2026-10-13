import type { AutomationPoint } from "@/pages/project/model/types"
import { clampAutomationValue } from "@/pages/project/model/automation-curve"
import { uniqueId } from "@/pages/project/model/reducers"
import type { CanvasGesture, CanvasPointer, InteractionContext } from "../types"
import { automationBar, automationValue, type AutomationRow } from "./geometry"
import { previewAutomation, sortedPoints } from "./preview"

export function drawGesture(
  context: InteractionContext,
  pointer: CanvasPointer,
  row: AutomationRow
): CanvasGesture {
  const grid = context.scene.get().gridPlan.cellBars
  const freehand = pointer.altKey || pointer.metaKey
  const original = row.lane?.points ?? []
  const painted = new Map<number, { bar: number; value: number; id: string }>()
  let last = pointer
  let next: AutomationPoint[] = [...original]
  function paint(current: CanvasPointer) {
    const scene = context.scene.get()
    const { width } = scene.viewport
    const fromBar = Math.max(
      1,
      Math.min(scene.bars + 1, automationBar(scene, Math.max(0, Math.min(width, last.x))))
    )
    const toBar = Math.max(
      1,
      Math.min(scene.bars + 1, automationBar(scene, Math.max(0, Math.min(width, current.x))))
    )
    if (freehand) {
      const samples = Math.max(1, Math.ceil(Math.abs(current.x - last.x) / 3))
      for (let i = 0; i <= samples; i++) {
        const fraction = i / samples
        const bar = fromBar + (toBar - fromBar) * fraction
        const existing = painted.get(bar)
        painted.set(bar, {
          id: existing?.id ?? uniqueId("point"),
          bar,
          value: automationValue(row, last.y + (current.y - last.y) * fraction),
        })
      }
      next = sortedPoints([
        ...original.filter(
          point => ![...painted.keys()].some(bar => Math.abs(point.bar - bar) < 0.000001)
        ),
        ...painted.values(),
      ])
    } else {
      const startCell = Math.round((fromBar - 1) / grid)
      const endCell = Math.round((toBar - 1) / grid)
      const direction = Math.sign(endCell - startCell) || 1
      for (
        let cell = startCell;
        direction > 0 ? cell <= endCell : cell >= endCell;
        cell += direction
      ) {
        const bar = 1 + cell * grid
        const fraction =
          toBar === fromBar
            ? 1
            : clampAutomationValue((bar + grid / 2 - fromBar) / (toBar - fromBar))
        const existing = painted.get(cell)
        painted.set(cell, {
          id: existing?.id ?? uniqueId("point"),
          bar,
          value: automationValue(row, last.y + (current.y - last.y) * fraction),
        })
      }
      const cells = [...painted.values()]
      next = sortedPoints([
        ...original.filter(
          point => !cells.some(cell => point.bar >= cell.bar && point.bar < cell.bar + grid)
        ),
        ...cells.flatMap(cell => {
          const end = Math.min(
            context.scene.get().bars + 1,
            cell.bar + grid - Math.min(grid / 1000, 0.0001)
          )
          return end - cell.bar >= 0.000001
            ? [cell, { id: `${cell.id}-end`, bar: end, value: cell.value }]
            : [cell]
        }),
      ])
    }
    last = current
    previewAutomation(context, row.track.id, row.laneId, next)
  }
  paint(pointer)
  return {
    cursor: "crosshair",
    autoScroll: "horizontal",
    move(current) {
      paint(current)
    },
    finish(cancelled) {
      context.scene.setPreviewTracks(null)
      if (!cancelled) context.actions.replaceAutomationPoints(row.track.id, row.laneId, next)
    },
  }
}
