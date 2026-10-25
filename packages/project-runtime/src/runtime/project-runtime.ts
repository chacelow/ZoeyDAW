import { initialSession } from "../state/session"
import { positionToBar } from "@zoeydaw/project-core/types"
import {
  ensureOrdinaryTrack,
  mapClips,
  reduceDocument,
  uniqueId,
} from "@zoeydaw/project-core/reducers"
import { replaceClip } from "@zoeydaw/project-core/clip-edits"
import { initialDocument } from "../state/document"
import { initialWorkspace } from "../state/workspace"
import { projectBackendDocument } from "../backend/projection"
import { createBackendConnection } from "../backend/connection"
import { withWaveformPreview } from "../visuals"
import { routeTrack } from "./track-routing"
import { sameWorkspacePreferences } from "./workspace-preferences"
import { getEffectiveDocument as projectEffectiveDocument } from "./effective-document"
import { createProjectEditing } from "./project-editing"
import { createRecordingPublication } from "./recording-publication"
import type { RecordingReceipt } from "./recording-publication"
import type {
  Checkpoint,
  ProjectSeed,
  ProjectSaveCapture,
  ProjectBackendOptions,
  ProjectRuntimeDependencies,
} from "./runtime-contracts"
export type {
  ProjectSeed,
  ProjectSaveCapture,
  ProjectBackendOptions,
  ProjectRuntimeDependencies,
} from "./runtime-contracts"
import type { BackendConnection } from "../backend/connection"
import type {
  BackendControl,
  BackendControlRequest,
  BackendNote,
  BackendDocumentRequest,
  BackendState,
  BackendTelemetry,
  ProjectBackendFactory,
  ProjectRuntimeStatus,
} from "@zoeydaw/project-core/backend"
import type {
  Clip,
  DocumentState,
  ProjectState,
  Track,
  WorkspaceState,
} from "@zoeydaw/project-core/types"

export function createProjectRuntime({
  store,
  backendFactory,
  defaultTrackHeight,
  createProject: projectFactory = () => ({
    document: initialDocument(defaultTrackHeight),
    workspace: initialWorkspace(),
  }),
}: ProjectRuntimeDependencies) {
  const createEmptyProject = (): ProjectSeed => ({
    document: initialDocument(defaultTrackHeight),
    workspace: initialWorkspace(),
  })
  let sessionCounter = 0
  let revision = 0
  let seekGeneration = 0
  let requestedBar = 1
  let observedBar = 1
  let isExactSeekPending = false
  let rejectionGeneration = 0
  let accepted: Checkpoint
  let acceptedReceipt: RecordingReceipt | null = null
  let acceptedControl: BackendControl
  let isBackendRecovered = false
  const checkpoints = new Map<number, Checkpoint>()
  let factory: ProjectBackendFactory = backendFactory
  let createProject: (projectId: string) => ProjectSeed = projectFactory
  const backendFactories: {
    factory: ProjectBackendFactory
    createProject: (projectId: string) => ProjectSeed
  }[] = []
  let connection: BackendConnection | null = null
  let runtimeUsers = 0
  let stopConnection: (() => void) | null = null
  let isRuntimeDisposed = true
  let projectedDocument: DocumentState | null = null
  let projectedPreview: ProjectState["session"]["preview"] = null
  let projectedProject: BackendState["project"] | null = null

  const get = () => store.getState()
  const editing = createProjectEditing({
    store,
    submit,
    flushRecording,
    projectTrackWaveforms,
    metronomeChanged: () => submitControl(control(get())),
  })
  const recordings = createRecordingPublication({
    document: () => get().document,
    epoch: projectEpoch,
    blocked: editing.isBusy,
    backend: () => {
      const backend = get().session.backend
      if (
        isRuntimeDisposed ||
        !connection ||
        (!isBackendRecovered && backend.phase === "error" && backend.pending === 0)
      )
        return { kind: "unavailable" }
      return isBackendRecovered
        ? { kind: "ready", document: accepted.document, receipt: acceptedReceipt }
        : { kind: "pending" }
    },
    publish: next => {
      if (next === get().document) submit("commit")
      else editing.document(next)
    },
  })
  const {
    snapshot,
    checkpoint,
    pushHistory,
    flags,
    document,
    workspace,
    beginEdit,
    endEdit,
    isCurrentEdit,
    cancelEdit,
    undo,
    redo,
    beginPreview,
    previewTracks,
    previewMarkers,
    previewLoop,
    commitPreview,
    cancelPreview,
    getCommittedDocument,
    getCommittedWorkspace,
  } = editing
  const {
    recordDocument,
    recordDocumentConfirmed,
    rejectReceipts: rejectRecordingReceipts,
  } = recordings
  function flushRecording(): void {
    recordings.flush()
  }

  const backendState = (state = get()): BackendState => {
    if (
      !projectedProject ||
      projectedDocument !== state.document ||
      projectedPreview !== state.session.preview
    ) {
      projectedDocument = state.document
      projectedPreview = state.session.preview
      projectedProject = projectBackendDocument(projectEffectiveDocument(state))
    }
    return { project: projectedProject, control: control(state) }
  }
  function control(state: ProjectState): BackendControl {
    return {
      playing: state.session.playing,
      recording: state.session.recording,
      seekBar: requestedBar,
      seekGeneration,
      metronome: state.workspace.metronome,
    }
  }
  function submit(
    stage: "commit" | "preview" | "cancel" | "recover",
    editId: string | null = null
  ): void {
    if (isRuntimeDisposed || !connection) {
      return
    }
    if (stage === "commit" || stage === "recover") {
      revision++
      recordings.submitted(revision)
      checkpoints.set(revision, checkpoint())
    }
    connection.submit({
      stage,
      revision,
      editId,
      state: backendState(),
    })
  }
  function submitControl(next: BackendControl): void {
    if (!isRuntimeDisposed) connection?.submitControl(next)
  }
  function submitNote(note: BackendNote): void {
    if (!isRuntimeDisposed) connection?.submitNote(note)
  }
  function acceptedTransport(next: BackendControl): void {
    if (next.seekGeneration !== acceptedControl.seekGeneration) observedBar = next.seekBar
    acceptedControl = next
  }
  function rejectedNote(): void {
    store.setState(state => ({ session: { ...state.session, activeMidiNotes: [] } }))
  }
  function acceptedRequest(request: BackendDocumentRequest): void {
    acceptedTransport(request.state.control)
    if (request.stage === "commit" || request.stage === "recover" || request.stage === "open") {
      isBackendRecovered = true
      acceptedReceipt = { sessionId: request.sessionId, revision: request.revision }
    }
    if (request.stage !== "commit" && request.stage !== "recover") {
      return
    }
    const next = checkpoints.get(request.revision)
    if (!next) {
      return
    }
    accepted = next
    for (const key of checkpoints.keys()) {
      if (key <= request.revision) {
        checkpoints.delete(key)
      }
    }
    recordings.accepted({ sessionId: request.sessionId, revision: request.revision })
    if (request.stage === "recover") {
      flushRecording()
    }
  }
  function rejectedRequest(request: BackendDocumentRequest | BackendControlRequest): void {
    rejectionGeneration++
    isBackendRecovered = false
    checkpoints.clear()
    const isWorkspaceDirty = editing.restoreAccepted(accepted)
    revision = Math.max(
      revision,
      "revision" in request ? request.revision : 0,
      get().session.backend.acceptedRevision
    )
    const bar = connection?.readTelemetry()?.clock.bar ?? observedBar
    seekGeneration = acceptedControl.seekGeneration
    isExactSeekPending = false
    requestedBar = acceptedControl.seekBar
    const recoverRecording = recordings.beginRecovery()
    store.setState(state => {
      return {
        document: accepted.document,
        session: {
          ...flags(state, accepted.dirty || isWorkspaceDirty),
          playing: acceptedControl.playing,
          recording: acceptedControl.recording,
          position: positionAtBar(bar),
          activeMidiNotes: [],
          preview: null,
          selectedClipIds: state.session.selectedClipIds.filter(id =>
            accepted.document.tracks.some(track => track.clips.some(clip => clip.id === id))
          ),
          selectedTrackIds: state.session.selectedTrackIds.filter(id =>
            accepted.document.tracks.some(track => track.id === id)
          ),
          insertionPoint:
            state.session.insertionPoint &&
            (state.session.insertionPoint.trackId === null ||
              accepted.document.tracks.some(
                track => track.id === state.session.insertionPoint?.trackId
              ))
              ? { ...state.session.insertionPoint, bar: acceptedControl.seekBar }
              : null,
          editingClipId: accepted.document.tracks.some(track =>
            track.clips.some(clip => clip.id === state.session.editingClipId)
          )
            ? state.session.editingClipId
            : null,
        },
      }
    })
    if (recoverRecording) {
      const before = snapshot(get())
      const recovered = recoverRecording(accepted.document)
      if (recovered !== accepted.document) {
        pushHistory(before)
        store.setState(state => ({ document: recovered, session: flags(state, true) }))
      }
    }
    if (!("stage" in request) || (request.stage !== "recover" && request.stage !== "open")) {
      submit("recover")
    } else {
      recordings.rejectRecovery(new Error("Project backend rejected recording recovery"))
    }
  }
  function telemetry(frame: BackendTelemetry): void {
    observedBar = frame.clock.bar
    const current = get()
    store.setState({
      session: {
        ...current.session,
        ...(frame.playing && { position: positionAtBar(frame.clock.bar) }),
      },
    })
  }
  function positionAtBar(bar: number): ProjectState["session"]["position"] {
    const { numerator } = get().document.transport
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

    requestedBar = Math.max(1, bar)
    isExactSeekPending = true
  }
  function openBackend(): void {
    const isReopening = connection !== null
    rejectRecordingReceipts(
      new Error("Project backend session changed before recording acceptance")
    )
    editing.cancelActive()
    sessionCounter++
    stopConnection?.()
    isRuntimeDisposed = false
    stopConnection = null
    connection?.dispose()
    connection = null
    checkpoints.clear()
    revision = 0
    seekGeneration = 0
    editing.clearTransient()
    recordings.clear()
    isBackendRecovered = false
    acceptedReceipt = null
    const epoch = sessionCounter
    const sessionId = `project-${crypto.randomUUID()}`
    const next = createBackendConnection({
      factory: () => factory(),
      onAccepted: request => {
        if (epoch === sessionCounter) {
          acceptedRequest(request)
        }
      },
      onRejected: request => {
        if (epoch === sessionCounter) {
          rejectedRequest(request)
        }
      },
      onControlAccepted: request => {
        if (epoch === sessionCounter) acceptedTransport(request.control)
      },
      onControlRejected: request => {
        if (epoch === sessionCounter) rejectedRequest(request)
      },
      onNoteRejected: () => {
        if (epoch === sessionCounter) rejectedNote()
      },
      onStatus: (status: ProjectRuntimeStatus) => {
        if (epoch === sessionCounter) {
          store.setState(state => ({ session: { ...state.session, backend: status } }))
        }
      },
      onTelemetry: frame => {
        if (epoch === sessionCounter) {
          telemetry(frame)
        }
      },
    })
    connection = next
    store.setState(state => ({
      session: {
        ...state.session,
        editEpoch: crypto.randomUUID(),
        ...(isReopening ? { playing: false, recording: false, activeMidiNotes: [] } : {}),
        preview: null,
      },
    }))
    accepted = checkpoint()
    if (!isExactSeekPending) {
      requestedBar = positionToBar(get().session.position, get().document.transport.numerator)
    }
    isExactSeekPending = false
    observedBar = requestedBar
    acceptedControl = control(get())
    next.open(sessionId, backendState())
    if (runtimeUsers) {
      stopConnection = next.start()
    }
  }
  function configureProjectBackend(
    next: ProjectBackendFactory,
    options: ProjectBackendOptions = {}
  ): () => void {
    rejectRecordingReceipts(new Error("Project backend changed before recording acceptance"))
    editing.cancelActive()
    const registration = {
      factory: next,
      createProject: options.createProject ?? createEmptyProject,
    }
    backendFactories.push(registration)
    factory = next
    createProject = registration.createProject
    if (runtimeUsers) {
      openBackend()
    }
    return () => {
      const index = backendFactories.indexOf(registration)
      if (index === -1) {
        return
      }
      const active = index === backendFactories.length - 1
      backendFactories.splice(index, 1)
      if (!active) {
        return
      }
      rejectRecordingReceipts(new Error("Project backend changed before recording acceptance"))
      editing.cancelActive()
      factory = backendFactories.at(-1)?.factory ?? backendFactory
      createProject = backendFactories.at(-1)?.createProject ?? projectFactory
      if (runtimeUsers) {
        openBackend()
      }
    }
  }
  function startProjectRuntime(): () => void {
    if (runtimeUsers === 0) {
      if (connection === null) openBackend()
      stopConnection = connection?.start() ?? null
    }
    runtimeUsers++
    let isStopped = false
    return () => {
      if (isStopped) {
        return
      }
      isStopped = true
      runtimeUsers--
      if (runtimeUsers !== 0) {
        return
      }

      rejectRecordingReceipts(new Error("Project runtime disposed before recording acceptance"))
      editing.cancelActive()
      sessionCounter++
      stopConnection?.()
      stopConnection = null
      connection?.dispose()
      connection = null
      isRuntimeDisposed = true
      isBackendRecovered = false
      acceptedReceipt = null
      acceptedControl = { ...acceptedControl, playing: false, recording: false }
      checkpoints.clear()
      recordings.clear()
      editing.clearTransient()
      store.setState(state => ({
        session: {
          ...state.session,
          editEpoch: crypto.randomUUID(),
          playing: false,
          recording: false,
          activeMidiNotes: [],
          preview: null,
          backend: { phase: "idle", sessionId: "", pending: 0, acceptedRevision: 0, error: null },
        },
      }))
    }
  }
  function readProjectTelemetry(): BackendTelemetry | null {
    return connection?.readTelemetry() ?? null
  }
  function readBackendMeters() {
    return connection?.readMeters() ?? null
  }
  function readTransportBar(): number {
    return (
      connection?.readTelemetry()?.clock.bar ??
      positionToBar(get().session.position, get().document.transport.numerator)
    )
  }
  function whenProjectBackendIdle(): Promise<boolean> {
    return connection?.whenIdle() ?? Promise.resolve(false)
  }
  function projectEpoch(): string {
    return get().session.editEpoch
  }
  function projectRevision(): number {
    return revision
  }
  function markProjectSaved(document: DocumentState, workspace: WorkspaceState): void {
    if (!accepted) {
      accepted = checkpoint()
    }
    if (accepted.document === document) {
      const current = get()
      const historyMatchesSave =
        !editing.hasEdit() &&
        revision === current.session.backend.acceptedRevision &&
        current.document === document &&
        sameWorkspacePreferences(current.workspace, workspace)
      accepted = { ...(historyMatchesSave ? checkpoint() : accepted), workspace, dirty: false }
    }
    editing.markSaved(document, workspace)
  }
  function canSaveProject(): boolean {
    return isBackendRecovered
  }
  function captureProjectSave(): ProjectSaveCapture {
    return {
      document: getCommittedDocument(),
      workspace: getCommittedWorkspace(),
      epoch: projectEpoch(),
      revision,
      rejectionGeneration,
    }
  }
  function waitForProjectSave(capture: ProjectSaveCapture, signal: AbortSignal): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<undefined>()
    let unsubscribe = () => {}
    function finish(error?: Error) {
      unsubscribe()
      signal.removeEventListener("abort", abort)
      if (error) reject(error)
      else resolve(undefined)
    }
    function abort() {
      finish(new DOMException("Cancelled", "AbortError"))
    }
    const check = () => {
      const backend = get().session.backend
      if (signal.aborted) return abort()
      if (capture.epoch !== projectEpoch() || capture.rejectionGeneration !== rejectionGeneration) {
        return finish(new Error("Project changed or its backend rejected the saved revision"))
      }
      if (canSaveProject() && backend.acceptedRevision >= capture.revision) return finish()
      if (backend.phase === "error" && backend.pending === 0)
        finish(new Error(backend.error ?? "Project backend is unavailable"))
    }
    unsubscribe = store.subscribe(check)
    signal.addEventListener("abort", abort, { once: true })
    check()
    return promise
  }
  function completeProjectSave(capture: ProjectSaveCapture): void {
    if (capture.epoch !== projectEpoch()) return
    const clean =
      getCommittedDocument() === capture.document &&
      sameWorkspacePreferences(getCommittedWorkspace(), capture.workspace)
    markProjectSaved(capture.document, capture.workspace)
    if (clean && !editing.hasEdit()) session({ dirty: false })
  }
  function readRecordingBar(): number | null {
    const state = get()
    if (
      !isBackendRecovered ||
      !acceptedControl ||
      seekGeneration !== acceptedControl.seekGeneration ||
      state.session.playing !== acceptedControl.playing ||
      state.session.recording !== acceptedControl.recording ||
      !acceptedControl.playing ||
      !acceptedControl.recording
    ) {
      return null
    }
    const frame = readProjectTelemetry()
    if (frame) {
      return frame.playing && frame.recording ? frame.clock.bar : null
    }
    return acceptedControl.playing && acceptedControl.recording ? observedBar : null
  }

  function session(patch: Partial<ProjectState["session"]>): void {
    const before = get()
    const was = control(before)
    if (patch.position !== undefined) {
      seekGeneration++
      if (!isExactSeekPending) {
        requestedBar = positionToBar(patch.position, before.document.transport.numerator)
      }
      isExactSeekPending = false
    }
    store.setState(state => ({ session: { ...state.session, ...patch } }))
    const after = control(get())
    if (
      was.playing !== after.playing ||
      was.recording !== after.recording ||
      was.seekGeneration !== after.seekGeneration
    ) {
      submitControl(after)
    }
  }
  function projectTrackWaveforms(next: readonly Track[]): Track[] {
    const source = get().document.tracks
    return next.map(track => {
      const original = source.find(item => item.id === track.id)
      return {
        ...track,
        clips: track.clips.map(clip => {
          if (clip.kind !== "audio") return clip
          const prior = original?.clips.find(item => item.id === clip.id)
          return prior?.kind === "audio" &&
            prior.sourceId === clip.sourceId &&
            prior.sourceOffsetBars === clip.sourceOffsetBars &&
            prior.lengthBars === clip.lengthBars
            ? clip
            : withWaveformPreview(clip, get().document.media)
        }),
      }
    })
  }
  function tracks(next: Track[]): void {
    document(
      reduceDocument(get().document, { type: "tracks", tracks: projectTrackWaveforms(next) })
    )
  }
  function updateTrack(id: string, patch: Partial<Track>): void {
    const next = routeTrack(get().document.tracks, id, patch)
    if (next) {
      tracks(next)
    }
  }
  function editClip(id: string, apply: (clip: Clip) => Clip | null): void {
    const source = get().document.tracks
    const track = source.find(item => item.clips.some(clip => clip.id === id))
    const original = track?.clips.find(clip => clip.id === id)
    if (!original) {
      return
    }
    const next = apply(original)
    if (next !== original) {
      tracks(
        next
          ? replaceClip(source, next, () => uniqueId("clip"), get().document.transport.bpm)
          : mapClips(source, [id], () => null)
      )
    }
  }
  function hydrateState(next: ProjectSeed, reopen = true): void {
    next = { ...next, document: ensureOrdinaryTrack(next.document, defaultTrackHeight) }
    rejectRecordingReceipts(new Error("Project changed before recording acceptance"))
    sessionCounter++
    stopConnection?.()
    stopConnection = null
    connection?.dispose()
    connection = null
    isRuntimeDisposed = true
    isBackendRecovered = false
    acceptedReceipt = null
    editing.reset()
    isExactSeekPending = false
    recordings.clear()
    store.setState({ ...next, session: initialSession() })
    accepted = checkpoint()
    requestedBar = positionToBar(get().session.position, get().document.transport.numerator)
    observedBar = requestedBar
    acceptedControl = control(get())
    revision = 0
    checkpoints.clear()
    if (runtimeUsers && reopen) {
      openBackend()
    }
  }
  function resetProject(projectId: string): void {
    hydrateState(createProject(projectId))
  }
  async function replaceProject(next: ProjectSeed, signal: AbortSignal): Promise<void> {
    next = { ...next, document: ensureOrdinaryTrack(next.document, defaultTrackHeight) }
    const epoch = projectEpoch()
    const before = get()
    const openingSession = initialSession()
    const openingState = { ...next, session: openingSession }
    let ready = false
    let status: ProjectRuntimeStatus = openingSession.backend
    const candidate = createBackendConnection({
      factory: () => factory(),
      onAccepted: request => {
        if (connection === candidate) acceptedRequest(request)
        else if (request.stage === "open") ready = true
      },
      onRejected: request => {
        if (connection === candidate) rejectedRequest(request)
      },
      onControlAccepted: request => {
        if (connection === candidate) acceptedTransport(request.control)
      },
      onControlRejected: request => {
        if (connection === candidate) rejectedRequest(request)
      },
      onNoteRejected: () => {
        if (connection === candidate) rejectedNote()
      },
      onStatus: value => {
        status = value
        if (connection === candidate) {
          store.setState(state => ({ session: { ...state.session, backend: value } }))
        }
      },
      onTelemetry: frame => {
        if (connection === candidate) telemetry(frame)
      },
    })
    const abort = () => candidate.dispose()
    signal.addEventListener("abort", abort, { once: true })
    try {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError")
      candidate.open(`project-${crypto.randomUUID()}`, {
        project: projectBackendDocument(next.document),
        control: { ...control(openingState), seekBar: 1, seekGeneration: 0 },
      })
      await candidate.whenIdle()
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError")
      if (!ready) throw new Error(status.error ?? "Backend refused to open this project")
      if (epoch !== projectEpoch()) throw new Error("The current project changed while opening")
      if (
        before.document !== get().document ||
        !sameWorkspacePreferences(before.workspace, get().workspace)
      ) {
        throw new Error("The project was edited while opening; current changes were kept")
      }
      hydrateState(next, false)
      connection = candidate
      isRuntimeDisposed = false
      isBackendRecovered = true
      seekGeneration = 0
      store.setState(state => ({ session: { ...state.session, backend: status } }))
      if (runtimeUsers) stopConnection = candidate.start()
    } catch (error) {
      candidate.dispose()
      throw error
    } finally {
      signal.removeEventListener("abort", abort)
    }
  }

  return {
    get,
    sameWorkspacePreferences,
    setPreciseTransportBar,
    configureProjectBackend,
    startProjectRuntime,
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
    submitControl,
    submitNote,
    document,
    workspace,
    tracks,
    updateTrack,
    editClip,
    beginEdit,
    recordDocument,
    recordDocumentConfirmed,
    endEdit,
    isCurrentEdit,
    cancelEdit,
    undo,
    redo,
    getEffectiveDocument: (
      state: { document: DocumentState; session: Pick<ProjectState["session"], "preview"> } = get()
    ) => projectEffectiveDocument(state),
    beginPreview,
    previewTracks,
    previewMarkers,
    previewLoop,
    commitPreview,
    cancelPreview,
    hydrateState,
    resetProject,
  }
}
