import type { DocumentState, ProjectState, WorkspaceState } from "../../model/types"
import type { ProjectSeed } from "./runtime-state"

export interface Checkpoint {
  document: DocumentState
  workspace: WorkspaceState
  past: ProjectSeed[]
  future: ProjectSeed[]
  dirty: boolean
}

export function snapshot(state: ProjectState): ProjectSeed {
  return { document: state.document, workspace: state.workspace }
}

export function createCheckpoint(
  state: ProjectState,
  past: ProjectSeed[],
  future: ProjectSeed[]
): Checkpoint {
  return {
    workspace: state.workspace,
    document: state.document,
    past: [...past],
    future: [...future],
    dirty: state.session.dirty,
  }
}

export function historyFlags(
  state: ProjectState,
  dirty: boolean,
  past: ProjectSeed[],
  future: ProjectSeed[]
): ProjectState["session"] {
  return { ...state.session, dirty, canUndo: past.length > 0, canRedo: future.length > 0 }
}
