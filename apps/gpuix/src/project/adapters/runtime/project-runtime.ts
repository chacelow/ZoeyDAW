import { createSessionTemplate } from "../../defaults/template"
import { positionToBar } from "../../model/types"
import { getEffectiveDocument as projectEffectiveDocument } from "./effective-document"
import { sameWorkspacePreferences } from "./workspace-preferences"
import { RuntimeOwner } from "./runtime-state"
import { createRuntimeBackend } from "./runtime-backend"
import { createRuntimeEditing } from "./runtime-editing"
import { createRuntimeSaving } from "./runtime-saving"
import type { ProjectRuntimeDependencies, ProjectSeed } from "./runtime-state"
import type { DocumentState, ProjectState } from "../../model/types"
import type { BackendRequest } from "../../model/backend"

export { ProjectBackendNotConfiguredError } from "./runtime-state"
export type {
  ProjectSeed,
  ProjectBackendOptions,
  ProjectRuntimeDependencies,
  ProjectCreationConfiguration,
} from "./runtime-state"

export function createProjectRuntime(dependencies: ProjectRuntimeDependencies) {
  const owner = new RuntimeOwner(dependencies)
  const editing = createRuntimeEditing(owner, { submit })
  const backend = createRuntimeBackend(owner, editing)
  const saving = createRuntimeSaving(owner)

  function submit(
    stage: Exclude<BackendRequest["stage"], "open">,
    editId: string | null = null
  ): void {
    backend.submit(stage, editId)
  }

  function hydrateState(next: ProjectSeed): void {
    owner.sessionCounter++
    owner.stopConnection?.()
    owner.stopConnection = null
    owner.connection?.dispose()
    owner.connection = null
    owner.isRuntimeDisposed = true
    owner.isBackendRecovered = false
    owner.past.length = 0
    owner.future.length = 0
    owner.editStart = null
    owner.activeEdit = null
    owner.editDepth = 0
    owner.isEditDirty = false
    owner.isWorkspaceDirty = false
    owner.isExactSeekPending = false
    owner.activePreview = null
    owner.recordingJournal = []
    owner.recordingPending = []
    owner.store.setState({ ...next, session: createSessionTemplate(owner.preferences()) })
    owner.accepted = owner.checkpoint()
    owner.requestedBar = positionToBar(
      owner.get().session.position,
      owner.get().document.transport.numerator
    )
    owner.observedBar = owner.requestedBar
    owner.acceptedControl = backend.control(owner.get())
    owner.revision = 0
    owner.checkpoints.clear()
    if (owner.runtimeUsers && owner.factory) {
      backend.openBackend()
    }
  }

  function resetProject(projectId: string): void {
    hydrateState(owner.newProject(projectId))
  }

  return {
    get: owner.get,
    configureProjectCreation: owner.configureProjectCreation,
    projectCreationValues: owner.creationValues,
    projectPreferences: owner.preferences,
    sameWorkspacePreferences,
    setPreciseTransportBar: backend.setPreciseTransportBar,
    configureProjectBackend: backend.configureProjectBackend,
    startProjectRuntime: backend.startProjectRuntime,
    readProjectTelemetry: backend.readProjectTelemetry,
    readProjectPeaks: backend.readProjectPeaks,
    readTransportBar: backend.readTransportBar,
    whenProjectBackendIdle: backend.whenProjectBackendIdle,
    projectEpoch: owner.projectEpoch,
    projectRevision: backend.projectRevision,
    markProjectSaved: saving.markProjectSaved,
    canSaveProject: backend.canSaveProject,
    getCommittedDocument: saving.getCommittedDocument,
    getCommittedWorkspace: saving.getCommittedWorkspace,
    readRecordingBar: backend.readRecordingBar,
    session: backend.session,
    document: editing.document,
    workspace: editing.workspace,
    tracks: editing.tracks,
    updateTrack: editing.updateTrack,
    editClip: editing.editClip,
    beginEdit: editing.beginEdit,
    recordDocument: editing.recordDocument,
    endEdit: editing.endEdit,
    isCurrentEdit: editing.isCurrentEdit,
    cancelEdit: editing.cancelEdit,
    undo: editing.undo,
    redo: editing.redo,
    getEffectiveDocument: (
      state: {
        document: DocumentState
        session: Pick<ProjectState["session"], "preview">
      } = owner.get()
    ) => projectEffectiveDocument(state),
    beginPreview: editing.beginPreview,
    previewTracks: editing.previewTracks,
    previewMarkers: editing.previewMarkers,
    previewLoop: editing.previewLoop,
    commitPreview: editing.commitPreview,
    cancelPreview: editing.cancelPreview,
    hydrateState,
    resetProject,
  }
}
