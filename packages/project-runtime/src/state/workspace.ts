import { DEFAULT_GRID } from "@zoeydaw/project-core/grid"
import type { WorkspaceState } from "@zoeydaw/project-core/types"

export function initialWorkspace(): WorkspaceState {
  return {
    pxPerBar: 24,
    scrollX: 0,
    scrollY: 0,
    snap: true,
    grid: DEFAULT_GRID,
    follow: true,
    automationMode: false,
    automationLanes: {},
    arrangementView: { routing: true, returns: true, overview: true },
    rulerFormat: "time",
    drawMode: false,
    computerKeyboard: false,
    link: false,
    metronome: false,
  }
}
