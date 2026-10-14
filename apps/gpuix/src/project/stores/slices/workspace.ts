import { DEFAULT_GRID } from "../../model/grid"
import type { WorkspaceState } from "../../model/types"

export function initialWorkspace(): WorkspaceState {
  return {
    pxPerBar: 24,
    scrollX: 0,
    scrollY: 0,
    snap: true,
    grid: DEFAULT_GRID,
    follow: true,
    automationMode: false,
    drawMode: false,
    computerKeyboard: false,
    link: false,
    metronome: true,
  }
}
