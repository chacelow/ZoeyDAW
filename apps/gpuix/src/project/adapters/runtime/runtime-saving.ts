import { sameWorkspacePreferences } from "./workspace-preferences"
import type { RuntimeOwner } from "./runtime-state"
import type { DocumentState, WorkspaceState } from "../../model/types"

export function createRuntimeSaving(owner: RuntimeOwner) {
  function markProjectSaved(document: DocumentState, workspace: WorkspaceState): void {
    if (!owner.accepted) {
      owner.accepted = owner.checkpoint()
    }
    if (owner.accepted.document === document) {
      const current = owner.get()
      const historyMatchesSave =
        !owner.editDepth &&
        owner.revision === current.session.backend.acceptedRevision &&
        current.document === document &&
        sameWorkspacePreferences(current.workspace, workspace)
      owner.accepted = {
        ...(historyMatchesSave ? owner.checkpoint() : owner.accepted),
        workspace,
        dirty: false,
      }
    }
    if (sameWorkspacePreferences(owner.get().workspace, workspace)) {
      owner.isWorkspaceDirty = false
    }
    if (
      owner.editStart?.document === document &&
      sameWorkspacePreferences(owner.editStart.workspace, workspace)
    ) {
      owner.isEditDirty = false
    }
  }

  function getCommittedDocument(): DocumentState {
    return owner.editStart?.document ?? owner.get().document
  }

  function getCommittedWorkspace(): WorkspaceState {
    const current = owner.get().workspace
    return owner.editStart
      ? {
          ...owner.editStart.workspace,
          pxPerBar: current.pxPerBar,
          scrollX: current.scrollX,
          scrollY: current.scrollY,
        }
      : current
  }

  return { markProjectSaved, getCommittedDocument, getCommittedWorkspace }
}
