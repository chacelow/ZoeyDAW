import {
  adjustGrid,
  deriveGridPlan,
  gridForMeterChange,
  isGridSettings,
} from "@zoeydaw/project-core/grid"
import { reduceWorkspace } from "@zoeydaw/project-core/reducers"
import { get, workspace } from "./context"
import type { GridSettings } from "@zoeydaw/project-core/grid"

export const gridActions = {
  setGrid(grid: GridSettings) {
    if (!isGridSettings(grid)) {
      return
    }
    const current = get().workspace.grid
    const next = {
      ...grid,
      ...(grid.triplet === undefined && current.triplet !== undefined
        ? { triplet: current.triplet }
        : {}),
    }
    if (
      current.mode === next.mode &&
      current.triplet === next.triplet &&
      (current.mode === "adaptive" && next.mode === "adaptive"
        ? current.density === next.density
        : current.mode === "fixed" && next.mode === "fixed" && current.bars === next.bars)
    ) {
      return
    }
    workspace(reduceWorkspace(get().workspace, { grid: next }))
  },
  toggleTriplet() {
    const current = get().workspace.grid
    workspace(
      reduceWorkspace(get().workspace, {
        grid: { ...current, triplet: !current.triplet },
      })
    )
  },
  toggleFixedGrid() {
    const state = get()
    const current = state.workspace.grid
    if (current.mode === "fixed") {
      workspace(
        reduceWorkspace(state.workspace, {
          grid: { mode: "adaptive", density: "medium", ...(current.triplet && { triplet: true }) },
        })
      )
      return
    }
    const { numerator, denominator } = state.document.transport
    const cellBars = deriveGridPlan(
      current,
      state.workspace.pxPerBar,
      numerator,
      denominator
    ).cellBars
    workspace(
      reduceWorkspace(state.workspace, {
        grid: {
          mode: "fixed",
          bars: current.triplet ? (cellBars * 3) / 2 : cellBars,
          ...(current.triplet && { triplet: true }),
        },
      })
    )
  },
  adjustGrid(direction: -1 | 1) {
    const { numerator, denominator } = get().document.transport
    const next = adjustGrid(get().workspace.grid, direction, numerator, denominator)
    if (next !== get().workspace.grid) {
      workspace(reduceWorkspace(get().workspace, { grid: next }))
    }
  },
  setSnap(snap: boolean) {
    workspace(reduceWorkspace(get().workspace, { snap }))
  },
  toggleSnap() {
    const current = get().workspace
    workspace(reduceWorkspace(current, { snap: !current.snap }))
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
  if (next !== current) {
    workspace(reduceWorkspace(get().workspace, { grid: next }))
  }
}
