import type { WorkspaceState } from "@/pages/project/model/types"

export function sameWorkspacePreferences(a: WorkspaceState, b: WorkspaceState): boolean {
  return (
    a.snap === b.snap &&
    JSON.stringify(a.grid) === JSON.stringify(b.grid) &&
    a.follow === b.follow &&
    a.automationMode === b.automationMode &&
    a.drawMode === b.drawMode &&
    a.computerKeyboard === b.computerKeyboard &&
    a.link === b.link
  )
}
