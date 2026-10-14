import type { ProjectState } from "./types"

export function effectiveDrawMode(state: ProjectState): boolean {
  return state.session.drawModeOverride ?? state.workspace.drawMode
}
