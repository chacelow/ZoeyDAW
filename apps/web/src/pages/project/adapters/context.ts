import { useProjectState } from "../stores/useProjectState"
import { createProjectRuntime } from "./runtime"
import { createMockDocument, createMockWorkspace } from "./fixtures"

export type { ProjectSeed, ProjectBackendOptions, ProjectRuntimeDependencies } from "./runtime"

const runtime = createProjectRuntime({
  store: useProjectState,
  createProject: () => ({ document: createMockDocument(), workspace: createMockWorkspace() }),
})

export const {
  get,
  sameWorkspacePreferences,
  setPreciseTransportBar,
  configureProjectBackend,
  startProjectRuntime,
  readProjectTelemetry,
  readTransportBar,
  whenProjectBackendIdle,
  projectEpoch,
  projectRevision,
  markProjectSaved,
  canSaveProject,
  getCommittedDocument,
  readRecordingBar,
  session,
  document,
  workspace,
  tracks,
  updateTrack,
  editClip,
  beginEdit,
  recordDocument,
  endEdit,
  isCurrentEdit,
  cancelEdit,
  undo,
  redo,
  getEffectiveDocument,
  beginPreview,
  previewTracks,
  previewMarkers,
  previewLoop,
  commitPreview,
  cancelPreview,
  hydrateState,
  resetProject,
} = runtime
