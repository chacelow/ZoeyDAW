import { useProjectState } from "../stores/useProjectState"
import { createProjectRuntime } from "@zoeydaw/project-runtime"
import {
  createNativeBrowserAuditionPort,
  createNativeProjectBackend,
  type NativeProjectBackend,
  type NativeRecordingReceipt,
} from "./backend/native"
import { applyRecording } from "./backend/recording"
import { browserLibrary } from "./browser"
import { nativeAudio } from "@/shared/native/audio"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { nativeMeterPort } from "@/shared/native/realtime"
import { configureBackendMeterReader, synchronizeBackendMeters } from "./realtime"

export type {
  ProjectSeed,
  ProjectBackendOptions,
  ProjectRuntimeDependencies,
} from "@zoeydaw/project-runtime"

const runtime = createProjectRuntime({
  store: useProjectState,
  defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
  backendFactory: createProjectBackend,
})
const meterBinding = { users: 0, detach: () => {} }

export function startProjectRuntime() {
  if (meterBinding.users === 0) {
    configureBackendMeterReader(runtime.readBackendMeters)
    meterBinding.detach = useProjectState.subscribe(synchronizeBackendMeters)
  }
  meterBinding.users += 1
  const release = runtime.startProjectRuntime()
  synchronizeBackendMeters()
  let released = false
  return () => {
    if (released) return
    released = true
    release()
    meterBinding.users -= 1
    if (meterBinding.users === 0) {
      meterBinding.detach()
      configureBackendMeterReader(() => null)
      synchronizeBackendMeters()
    }
  }
}
function createProjectBackend(): NativeProjectBackend {
  let owner: { sessionId: string; epoch: string } | undefined
  return createNativeProjectBackend(nativeAudio, {
    meters: nativeMeterPort,
    async commitRecording(recording): Promise<NativeRecordingReceipt> {
      const epoch = runtime.projectEpoch()
      if (
        runtime.get().session.backend.sessionId !== recording.sessionId ||
        (owner && (owner.sessionId !== recording.sessionId || owner.epoch !== epoch))
      ) {
        throw new Error("Recording belongs to a different project session")
      }
      owner ??= { sessionId: recording.sessionId, epoch }
      return runtime.recordDocumentConfirmed(
        document => applyRecording(document, recording),
        owner.epoch
      )
    },
  })
}

export const {
  get,
  sameWorkspacePreferences,
  setPreciseTransportBar,
  configureProjectBackend,
  readProjectTelemetry,
  readBackendMeters,
  readTransportBar,
  whenProjectBackendIdle,
  projectEpoch,
  projectRevision,
  markProjectSaved,
  canSaveProject,
  getCommittedDocument,
  getCommittedWorkspace,
  captureProjectSave,
  waitForProjectSave,
  completeProjectSave,
  replaceProject,
  readRecordingBar,
  session,
  submitNote,
  launch,
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

if (nativeAudio.available()) {
  browserLibrary.configureAudition(createNativeBrowserAuditionPort())
}
