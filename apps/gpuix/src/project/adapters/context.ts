import { useProjectState } from "../stores/useProjectState"
import { createProjectRuntime } from "./runtime"
import { registerNativeBackend } from "./runtime/backend-registration"

export type { ProjectSeed, ProjectBackendOptions, ProjectRuntimeDependencies } from "./runtime"

const runtime = createProjectRuntime({
  store: useProjectState,
})
// eslint-disable-next-line unicorn/no-top-level-side-effects -- Installs a local factory; the first runtime lease opens the device.
registerNativeBackend(runtime)

export const {
  get,
  sameWorkspacePreferences,
  setPreciseTransportBar,
  configureProjectBackend,
  startProjectRuntime,
  readProjectTelemetry,
  readProjectPeaks,
  readTransportBar,
  whenProjectBackendIdle,
  projectEpoch,
  projectRevision,
  markProjectSaved,
  canSaveProject,
  getCommittedDocument,
  getCommittedWorkspace,
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
