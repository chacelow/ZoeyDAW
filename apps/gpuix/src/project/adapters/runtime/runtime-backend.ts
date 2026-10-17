import { positionToBar } from "../../model/types"
import { projectBackendDocument } from "../backend/projection"
import { createBackendConnection } from "../backend/connection"
import { getEffectiveDocument as projectEffectiveDocument } from "./effective-document"
import { sameWorkspacePreferences } from "./workspace-preferences"
import { snapshot } from "./history"
import { ProjectBackendNotConfiguredError } from "./runtime-state"
import type { RuntimeOwner, ProjectBackendOptions } from "./runtime-state"
import type {
  BackendControl,
  BackendRequest,
  BackendState,
  BackendTelemetry,
  PeakReader,
  ProjectBackendFactory,
  ProjectRuntimeStatus,
} from "../../model/backend"
import type { ProjectEditToken, ProjectState } from "../../model/types"

interface RuntimeEditingCallbacks {
  cancelEdit(token?: ProjectEditToken): void
  cancelPreview(token: ProjectEditToken): void
  flushRecording(): void
}

export function createRuntimeBackend(owner: RuntimeOwner, editing: RuntimeEditingCallbacks) {
  const backendState = (state = owner.get(), documentState = state.document): BackendState => {
    return {
      project: projectBackendDocument(documentState),
      control: control(state),
    }
  }

  function control(state: ProjectState): BackendControl {
    return {
      playing: state.session.playing,
      recording: state.session.recording,
      seekBar: owner.requestedBar,
      seekGeneration: owner.seekGeneration,
      heldNotes: state.session.activeMidiNotes,
      midiVelocity: state.session.midiVelocity,
    }
  }

  function submit(
    stage: "commit" | "preview" | "cancel" | "transport" | "recover",
    editId: string | null = null
  ): void {
    if (owner.isRuntimeDisposed || !owner.connection) {
      return
    }
    if (stage === "commit" || stage === "recover") {
      owner.revision++
      owner.checkpoints.set(owner.revision, owner.checkpoint())
    }
    owner.connection.submit({
      stage,
      revision: owner.revision,
      editId,
      state: backendState(owner.get(), projectEffectiveDocument(owner.get())),
    })
  }

  function acceptedRequest(request: BackendRequest): void {
    if (request.state.control.seekGeneration !== owner.acceptedControl.seekGeneration) {
      owner.observedBar = request.state.control.seekBar
    }
    owner.acceptedControl = request.state.control
    if (request.stage === "commit" || request.stage === "recover" || request.stage === "open") {
      owner.isBackendRecovered = true
    }
    if (request.stage !== "commit" && request.stage !== "recover") {
      return
    }
    const next = owner.checkpoints.get(request.revision)
    if (!next) {
      return
    }
    owner.accepted = next
    for (const key of owner.checkpoints.keys()) {
      if (key <= request.revision) {
        owner.checkpoints.delete(key)
      }
    }
    owner.recordingPending = owner.recordingPending.filter(
      entry => entry.revision > request.revision
    )
    if (request.stage === "recover") {
      editing.flushRecording()
    }
  }

  function rejectedRequest(request: BackendRequest): void {
    owner.isBackendRecovered = false
    owner.checkpoints.clear()
    owner.past.splice(0, owner.past.length, ...owner.accepted.past)
    owner.future.splice(0, owner.future.length, ...owner.accepted.future)
    const currentWorkspace = owner.get().workspace
    owner.acceptedControl = {
      ...owner.acceptedControl,
      heldNotes: owner.get().session.activeMidiNotes,
      midiVelocity: owner.get().session.midiVelocity,
    }
    if (!sameWorkspacePreferences(currentWorkspace, owner.accepted.workspace)) {
      owner.pushHistory({ document: owner.accepted.document, workspace: owner.accepted.workspace })
      owner.isWorkspaceDirty = true
    }
    owner.editStart = null
    owner.activeEdit = null
    owner.editDepth = 0
    owner.activePreview = null
    owner.revision = Math.max(
      owner.revision,
      request.revision,
      owner.get().session.backend.acceptedRevision
    )
    const bar = owner.connection?.readTelemetry()?.clock.bar ?? owner.observedBar
    owner.seekGeneration = owner.acceptedControl.seekGeneration
    owner.isExactSeekPending = false
    owner.requestedBar = owner.acceptedControl.seekBar
    const unreconciledRecording = owner.recordingPending
    owner.store.setState(state => {
      return {
        document: owner.accepted.document,
        session: {
          ...owner.flags(state, owner.accepted.dirty || owner.isWorkspaceDirty),
          playing: owner.acceptedControl.playing,
          recording: owner.acceptedControl.recording,
          position: positionAtBar(bar),
          activeMidiNotes: [...owner.acceptedControl.heldNotes],
          midiVelocity: owner.acceptedControl.midiVelocity,
          preview: null,
          selectedClipIds: state.session.selectedClipIds.filter(id =>
            owner.accepted.document.tracks.some(track => track.clips.some(clip => clip.id === id))
          ),
          selectedTrackIds: state.session.selectedTrackIds.filter(id =>
            owner.accepted.document.tracks.some(track => track.id === id)
          ),
          insertionPoint:
            state.session.insertionPoint &&
            (state.session.insertionPoint.trackId === null ||
              owner.accepted.document.tracks.some(
                track => track.id === state.session.insertionPoint?.trackId
              ))
              ? { ...state.session.insertionPoint, bar: owner.acceptedControl.seekBar }
              : null,
          editingClipId: owner.accepted.document.tracks.some(track =>
            track.clips.some(clip => clip.id === state.session.editingClipId)
          )
            ? state.session.editingClipId
            : null,
        },
      }
    })
    if (unreconciledRecording.length) {
      const before = snapshot(owner.get())
      let recovered = owner.accepted.document

      for (const entry of unreconciledRecording) {
        recovered = entry.apply(recovered)
      }
      owner.pushHistory(before)
      owner.store.setState(state => ({ document: recovered, session: owner.flags(state, true) }))
    }
    if (request.stage !== "recover" && request.stage !== "open") {
      submit("recover")
    }
  }

  function telemetry(frame: BackendTelemetry): void {
    owner.observedBar = frame.clock.bar
    const current = owner.get()
    owner.store.setState({
      session: {
        ...current.session,
        levels: frame.levels,
        inputLevels: frame.inputLevels,
      },
    })
  }

  function positionAtBar(bar: number): ProjectState["session"]["position"] {
    const { numerator } = owner.get().document.transport
    const beats = (Math.max(1, bar) - 1) * numerator
    const whole = Math.floor(beats)
    return {
      bar: Math.floor(whole / numerator) + 1,
      beat: (whole % numerator) + 1,
      sixteenth: 1 + (beats - whole) * 4,
    }
  }

  function setPreciseTransportBar(bar: number): void {
    if (!Number.isFinite(bar)) {
      return
    }

    owner.requestedBar = Math.max(1, bar)
    owner.isExactSeekPending = true
  }

  function openBackend(): void {
    const configuredFactory = owner.factory
    if (!configuredFactory) {
      throw new ProjectBackendNotConfiguredError()
    }
    const isReopening = owner.connection !== null
    owner.isRuntimeDisposed = true
    if (owner.activeEdit) {
      editing.cancelEdit(owner.activeEdit.token)
    }
    if (owner.activePreview) {
      editing.cancelPreview(owner.activePreview)
    }
    editing.flushRecording()
    owner.sessionCounter++
    owner.stopConnection?.()
    owner.isRuntimeDisposed = false
    owner.stopConnection = null
    owner.connection?.dispose()
    owner.connection = null
    owner.checkpoints.clear()
    owner.revision = 0
    owner.seekGeneration = 0
    owner.activePreview = null
    owner.editStart = null
    owner.activeEdit = null
    owner.editDepth = 0
    owner.recordingJournal = []
    owner.recordingPending = []
    owner.isBackendRecovered = false
    const epoch = owner.sessionCounter
    const sessionId = `project-${crypto.randomUUID()}`
    const next = createBackendConnection({
      factory: configuredFactory,
      onAccepted: request => {
        if (epoch === owner.sessionCounter) {
          acceptedRequest(request)
        }
      },
      onRejected: request => {
        if (epoch === owner.sessionCounter) {
          rejectedRequest(request)
        }
      },
      onStatus: (status: ProjectRuntimeStatus) => {
        if (epoch === owner.sessionCounter) {
          owner.store.setState(state => ({ session: { ...state.session, backend: status } }))
        }
      },
      onTelemetry: frame => {
        if (epoch === owner.sessionCounter) {
          telemetry(frame)
        }
      },
    })
    owner.connection = next
    owner.store.setState(state => ({
      session: {
        ...state.session,
        editEpoch: crypto.randomUUID(),
        ...(isReopening ? { playing: false, recording: false, activeMidiNotes: [] } : {}),
        preview: null,
      },
    }))
    owner.accepted = owner.checkpoint()
    if (!owner.isExactSeekPending) {
      owner.requestedBar = positionToBar(
        owner.get().session.position,
        owner.get().document.transport.numerator
      )
    }
    owner.isExactSeekPending = false
    owner.observedBar = owner.requestedBar
    owner.acceptedControl = control(owner.get())
    next.open(sessionId, backendState())
    if (owner.runtimeUsers) {
      owner.stopConnection = next.start()
    }
  }

  function configureProjectBackend(
    next: ProjectBackendFactory,
    options: ProjectBackendOptions = {}
  ): () => void {
    owner.isRuntimeDisposed = true
    if (owner.activeEdit) {
      editing.cancelEdit(owner.activeEdit.token)
    }
    if (owner.activePreview) {
      editing.cancelPreview(owner.activePreview)
    }
    const registration = {
      factory: next,
      createProject: options.createProject,
    }
    owner.backendFactories.push(registration)
    owner.factory = next
    owner.createProject = registration.createProject
    if (owner.runtimeUsers) {
      openBackend()
    }
    return () => {
      const index = owner.backendFactories.indexOf(registration)
      if (index === -1) {
        return
      }
      const active = index === owner.backendFactories.length - 1
      owner.backendFactories.splice(index, 1)
      if (!active) {
        return
      }
      owner.isRuntimeDisposed = true
      if (owner.activeEdit) {
        editing.cancelEdit(owner.activeEdit.token)
      }
      if (owner.activePreview) {
        editing.cancelPreview(owner.activePreview)
      }
      owner.factory = owner.backendFactories.at(-1)?.factory ?? owner.backendFactory
      owner.createProject = owner.backendFactories.at(-1)?.createProject ?? owner.projectFactory
      if (owner.runtimeUsers) {
        if (owner.factory) {
          openBackend()
        } else {
          closeBackend()
        }
      }
    }
  }

  function closeBackend(): void {
    owner.isRuntimeDisposed = true
    if (owner.activeEdit) {
      editing.cancelEdit(owner.activeEdit.token)
    }
    if (owner.activePreview) {
      editing.cancelPreview(owner.activePreview)
    }
    editing.flushRecording()
    owner.sessionCounter++
    owner.stopConnection?.()
    owner.stopConnection = null
    owner.connection?.dispose()
    owner.connection = null
    owner.isBackendRecovered = false
    owner.acceptedControl = {
      ...owner.acceptedControl,
      playing: false,
      recording: false,
      heldNotes: [],
    }
    owner.checkpoints.clear()
    owner.recordingPending = []
    owner.editStart = null
    owner.activeEdit = null
    owner.editDepth = 0
    owner.activePreview = null
    owner.store.setState(state => ({
      session: {
        ...state.session,
        editEpoch: crypto.randomUUID(),
        playing: false,
        recording: false,
        levels: {},
        inputLevels: {},
        activeMidiNotes: [],
        preview: null,
        backend: { phase: "idle", sessionId: "", pending: 0, acceptedRevision: 0, error: null },
      },
    }))
  }

  function startProjectRuntime(): () => void {
    if (!owner.factory) {
      throw new ProjectBackendNotConfiguredError()
    }
    if (owner.runtimeUsers === 0) {
      openBackend()
      owner.stopConnection = owner.connection?.start() ?? null
    }
    owner.runtimeUsers++
    let isStopped = false
    return () => {
      if (isStopped) {
        return
      }
      isStopped = true
      owner.runtimeUsers--
      if (owner.runtimeUsers !== 0) {
        return
      }
      closeBackend()
    }
  }

  function readProjectTelemetry(): BackendTelemetry | null {
    return owner.connection?.readTelemetry() ?? null
  }

  function readTransportBar(): number {
    return (
      owner.connection?.readTelemetry()?.clock.bar ??
      positionToBar(owner.get().session.position, owner.get().document.transport.numerator)
    )
  }

  function whenProjectBackendIdle(): Promise<boolean> {
    return owner.connection?.whenIdle() ?? Promise.resolve(false)
  }

  function projectRevision(): number {
    return owner.revision
  }

  function canSaveProject(): boolean {
    return owner.isBackendRecovered
  }

  function readRecordingBar(): number | null {
    const state = owner.get()
    if (
      !owner.isBackendRecovered ||
      !owner.acceptedControl ||
      owner.seekGeneration !== owner.acceptedControl.seekGeneration ||
      state.session.playing !== owner.acceptedControl.playing ||
      state.session.recording !== owner.acceptedControl.recording ||
      !owner.acceptedControl.playing ||
      !owner.acceptedControl.recording
    ) {
      return null
    }
    const frame = readProjectTelemetry()
    if (frame) {
      return frame.playing && frame.recording ? frame.clock.bar : null
    }
    return owner.acceptedControl.playing && owner.acceptedControl.recording
      ? owner.observedBar
      : null
  }

  function session(patch: Partial<ProjectState["session"]>): void {
    const before = owner.get()
    const was = control(before)
    if (patch.position !== undefined) {
      owner.seekGeneration++
      if (!owner.isExactSeekPending) {
        owner.requestedBar = positionToBar(patch.position, before.document.transport.numerator)
      }
      owner.isExactSeekPending = false
    }
    owner.store.setState(state => ({ session: { ...state.session, ...patch } }))
    const after = control(owner.get())
    if (
      was.playing !== after.playing ||
      was.recording !== after.recording ||
      was.seekGeneration !== after.seekGeneration ||
      was.heldNotes !== after.heldNotes ||
      was.midiVelocity !== after.midiVelocity
    ) {
      submit("transport")
    }
  }

  const readProjectPeaks: PeakReader = (sourceId, startBar, endBar, pixels, contentOffsetBars) =>
    owner.connection?.readPeaks(sourceId, startBar, endBar, pixels, contentOffsetBars) ??
    new Float32Array(0)

  return {
    setPreciseTransportBar,
    configureProjectBackend,
    startProjectRuntime,
    readProjectTelemetry,
    readProjectPeaks,
    readTransportBar,
    whenProjectBackendIdle,
    projectRevision,
    canSaveProject,
    readRecordingBar,
    session,
    submit,
    control,
    openBackend,
  }
}
