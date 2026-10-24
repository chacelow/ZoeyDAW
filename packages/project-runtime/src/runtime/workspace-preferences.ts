import type { WorkspaceState } from "@zoeydaw/project-core/types"

export function sameWorkspacePreferences(a: WorkspaceState, b: WorkspaceState): boolean {
  return (
    a.snap === b.snap &&
    JSON.stringify(a.grid) === JSON.stringify(b.grid) &&
    a.follow === b.follow &&
    a.automationMode === b.automationMode &&
    JSON.stringify(a.automationLanes) === JSON.stringify(b.automationLanes) &&
    a.arrangementView.routing === b.arrangementView.routing &&
    a.arrangementView.returns === b.arrangementView.returns &&
    a.arrangementView.overview === b.arrangementView.overview &&
    a.rulerFormat === b.rulerFormat &&
    a.drawMode === b.drawMode &&
    a.computerKeyboard === b.computerKeyboard &&
    a.link === b.link &&
    a.metronome === b.metronome
  )
}
