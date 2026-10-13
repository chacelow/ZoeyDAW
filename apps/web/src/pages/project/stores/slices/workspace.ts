import type { WorkspaceState } from "@/pages/project/model/types"
import { DEFAULT_GRID } from "@/pages/project/model/grid"

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
  }
}
