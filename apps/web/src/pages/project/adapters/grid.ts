import type { GridSettings } from "../model/grid"
import { adjustGrid, gridForMeterChange, isGridSettings } from "../model/grid"
import { reduceWorkspace } from "../model/reducers"
import { get, workspace } from "./context"

export const gridActions = {
  setGrid(grid: GridSettings) {
    if (!isGridSettings(grid)) return
    const current = get().workspace.grid
    if (current.mode === "adaptive" && grid.mode === "adaptive" && current.density === grid.density)
      return
    if (current.mode === "fixed" && grid.mode === "fixed" && current.bars === grid.bars) return
    workspace(reduceWorkspace(get().workspace, { grid }))
  },
  adjustGrid(direction: -1 | 1) {
    const { numerator, denominator } = get().document.transport
    const next = adjustGrid(get().workspace.grid, direction, numerator, denominator)
    if (next !== get().workspace.grid) workspace(reduceWorkspace(get().workspace, { grid: next }))
  },
  setSnap(snap: boolean) {
    workspace(reduceWorkspace(get().workspace, { snap }))
  },
}

export function reconcileGridForMeterChange(
  oldNumerator: number,
  oldDenominator: number,
  numerator: number,
  denominator: number
): void {
  const current = get().workspace.grid
  const next = gridForMeterChange(current, oldNumerator, oldDenominator, numerator, denominator)
  if (next !== current) workspace(reduceWorkspace(get().workspace, { grid: next }))
}
