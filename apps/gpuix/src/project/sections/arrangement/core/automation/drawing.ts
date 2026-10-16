import { clampAutomationValue } from "@/project/model/automation-curve"
import { automationBar, automationValue } from "./geometry"
import { sortedPoints } from "./points"
import type { AutomationPoint } from "@/project/model/types"
import type { ArrangementScene } from "../scene"
import type { Point } from "../interactions/types"
import type { AutomationRow } from "./geometry"

export interface DrawingSample extends AutomationPoint {
  key: number
}
export interface DrawingState {
  painted: readonly DrawingSample[]
  swept: readonly { start: number; end: number }[]
  last: Point
  nextId: number
}
export interface PaintInput {
  original: readonly AutomationPoint[]
  state: DrawingState
  current: Point
  scene: ArrangementScene
  row: AutomationRow
  grid: number
  freehand: boolean
  idPrefix: string
}
export interface PaintResult {
  state: DrawingState
  points: AutomationPoint[]
}

export function paintAutomation({
  original,
  state,
  current,
  scene,
  row,
  grid,
  freehand,
  idPrefix,
}: PaintInput): PaintResult {
  const painted = new Map(state.painted.map(point => [point.key, point]))
  const { last } = state
  let nextId = state.nextId
  let swept = state.swept
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
    const start = Math.min(fromBar, toBar)
    const end = Math.max(fromBar, toBar)
    const intervals: { start: number; end: number }[] = []
    let merged = { start, end }
    for (const interval of state.swept) {
      if (interval.end < merged.start) intervals.push(interval)
      else if (interval.start > merged.end) {
        intervals.push(merged)
        merged = interval
      } else {
        merged = {
          start: Math.min(merged.start, interval.start),
          end: Math.max(merged.end, interval.end),
        }
      }
    }
    intervals.push(merged)
    swept = intervals
    const samples = Math.max(1, Math.ceil(Math.abs(current.x - last.x) / 3))
    for (let index = 0; index <= samples; index++) {
      const fraction = index / samples
      const bar = fromBar + (toBar - fromBar) * fraction
      const existing = painted.get(bar)
      painted.set(bar, {
        key: bar,
        id: existing?.id ?? `${idPrefix}-${nextId++}`,
        bar,
        value: automationValue(row, last.y + (current.y - last.y) * fraction),
      })
    }
    for (const point of state.painted) {
      if (point.bar >= start && point.bar <= end && painted.get(point.key) === point) {
        painted.delete(point.key)
      }
    }
  } else {
    const startCell = Math.round((fromBar - 1) / grid)
    const endCell = Math.round((toBar - 1) / grid)
    const direction = Math.sign(endCell - startCell) || 1
    const cellCount = Math.abs(endCell - startCell)
    for (let offset = 0; offset <= cellCount; offset++) {
      const cell = startCell + offset * direction
      const bar = 1 + cell * grid
      const fraction =
        toBar === fromBar ? 1 : clampAutomationValue((bar + grid / 2 - fromBar) / (toBar - fromBar))
      const existing = painted.get(cell)
      painted.set(cell, {
        key: cell,
        id: existing?.id ?? `${idPrefix}-${nextId++}`,
        bar,
        value: automationValue(row, last.y + (current.y - last.y) * fraction),
      })
    }
  }
  const cells = [...painted.values()]
  const points = freehand
    ? sortedPoints([
        ...original.filter(point =>
          swept.every(interval => point.bar < interval.start || point.bar > interval.end)
        ),
        ...cells.map(({ key: _key, ...point }) => point),
      ])
    : sortedPoints([
        ...original.filter(point =>
          cells.every(cell => !(point.bar >= cell.bar && point.bar < cell.bar + grid))
        ),
        ...cells.flatMap(({ key: _key, ...cell }) => {
          const end = Math.min(scene.bars + 1, cell.bar + grid - Math.min(grid / 1000, 0.0001))
          return end - cell.bar >= 0.000001
            ? [cell, { id: `${cell.id}-end`, bar: end, value: cell.value }]
            : [cell]
        }),
      ])
  return { state: { painted: cells, swept, last: current, nextId }, points }
}
