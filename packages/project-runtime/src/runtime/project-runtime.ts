import { initialSession } from "../state/session"
import { positionToBar } from "@zoeydaw/project-core/types"
import {
  ensureOrdinaryTrack,
  isOrdinaryTrack,
  mapClips,
  reduceDocument,
  uniqueId,
} from "@zoeydaw/project-core/reducers"
import { isAutomationTarget } from "@zoeydaw/project-core/automation-target"
import { replaceClip } from "@zoeydaw/project-core/clip-edits"
import { initialDocument } from "../state/document"
import { initialWorkspace } from "../state/workspace"
import { projectBackendDocument } from "../backend/projection"
import { createBackendConnection } from "../backend/connection"
import { withWaveformPreview } from "../visuals"
import { routeTrack } from "./track-routing"
import { sameWorkspacePreferences } from "./workspace-preferences"
import { getEffectiveDocument as projectEffectiveDocument } from "./effective-document"
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
  LoopRegion,
  Marker,
  ProjectEditToken,
  ProjectPreview,
  ProjectState,
  Track,
  WorkspaceState,
} from "@zoeydaw/project-core/types"
import type { StoreApi } from "zustand/vanilla"

export interface ProjectSeed {
  document: DocumentState
  workspace: WorkspaceState
}
export interface ProjectSaveCapture extends ProjectSeed {
  epoch: string
  revision: number
  rejectionGeneration: number
}
export interface ProjectBackendOptions {
  createProject?: (projectId: string) => ProjectSeed
}
interface Checkpoint {
  document: DocumentState
  workspace: WorkspaceState
  past: ProjectSeed[]
  future: ProjectSeed[]
  dirty: boolean
}
type RecordingReceipt = Pick<BackendDocumentRequest, "sessionId" | "revision">
interface RecordingEntry {
  apply: (document: DocumentState) => DocumentState
  epoch: string
  revision: number | null
  receipt: {
    settled: boolean
    resolve: (value: RecordingReceipt) => void
    reject: (error: unknown) => void
  } | null
}
export interface ProjectRuntimeDependencies {
  store: Pick<StoreApi<ProjectState>, "getState" | "setState" | "subscribe">
  backendFactory: ProjectBackendFactory
  defaultTrackHeight: number
  createProject?: (projectId: string) => ProjectSeed
}

const HISTORY_LIMIT = 100

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
  const past: ProjectSeed[] = []
  const future: ProjectSeed[] = []
  let editStart: ProjectSeed | null = null
  let activeEdit: { owner: string; token: ProjectEditToken } | null = null
  let editCounter = 0
  let editDepth = 0
  let isEditDirty = false
  let isWorkspaceDirty = false
  let recordingJournal: RecordingEntry[] = []
  let recordingPending: RecordingEntry[] = []
  let activePreview: ProjectEditToken | null = null
  let previewCounter = 0
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

  const snapshot = (state: ProjectState): ProjectSeed => {
    return {
      document: state.document,
      workspace: state.workspace,
    }
  }
  const checkpoint = (): Checkpoint => {
    return {
      workspace: get().workspace,
      document: get().document,
      past: [...past],
      future: [...future],
      dirty: get().session.dirty,
    }
  }
  const pushHistory = (entry: ProjectSeed): void => {
    past.push(entry)
    if (past.length > HISTORY_LIMIT) {
      past.shift()
    }
    future.length = 0
  }
  const flags = (state: ProjectState, dirty: boolean): ProjectState["session"] => {
    return {
      ...state.session,
      dirty,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
    }
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
      for (const entry of recordingPending) {
        if (entry.revision === null) entry.revision = revision
      }
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
    recordingPending = recordingPending.filter(entry => {
      if (entry.revision === null || entry.revision > request.revision) return true
      if (entry.epoch !== projectEpoch()) {
        rejectRecording(entry, new Error("Project changed before recording was accepted"))
      } else {
        resolveRecording(entry, { sessionId: request.sessionId, revision: request.revision })
      }
      return false
    })
    if (request.stage === "recover") {
      flushRecording()
    }
  }
  function rejectedRequest(request: BackendDocumentRequest | BackendControlRequest): void {
    rejectionGeneration++
    isBackendRecovered = false
    checkpoints.clear()
    past.splice(0, past.length, ...accepted.past)
    future.splice(0, future.length, ...accepted.future)
    const currentWorkspace = get().workspace
    if (!sameWorkspacePreferences(currentWorkspace, accepted.workspace)) {
      pushHistory({ document: accepted.document, workspace: accepted.workspace })
      isWorkspaceDirty = true
    }
    editStart = null
    activeEdit = null
    editDepth = 0
    activePreview = null
    revision = Math.max(
      revision,
      "revision" in request ? request.revision : 0,
      get().session.backend.acceptedRevision
    )
    const bar = connection?.readTelemetry()?.clock.bar ?? observedBar
    seekGeneration = acceptedControl.seekGeneration
    isExactSeekPending = false
    requestedBar = acceptedControl.seekBar
    const unreconciledRecording = recordingPending
    recordingPending = []
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
    if (unreconciledRecording.length) {
      const before = snapshot(get())
      let recovered = accepted.document

      for (const entry of unreconciledRecording) {
        if (entry.epoch !== projectEpoch()) {
          rejectRecording(entry, new Error("Project changed before recording recovery"))
          continue
        }
        try {
          const next = entry.apply(recovered)
          if (!next.tracks.some(isOrdinaryTrack)) {
            throw new Error("Recorded document must retain an ordinary track")
          }
          recovered = next
          entry.revision = null
          recordingPending.push(entry)
        } catch (error) {
          if (!entry.receipt) throw error
          rejectRecording(entry, error)
        }
      }
      if (recovered !== accepted.document) {
        pushHistory(before)
        store.setState(state => ({ document: recovered, session: flags(state, true) }))
      }
    }
    if (!("stage" in request) || (request.stage !== "recover" && request.stage !== "open")) {
      submit("recover")
    } else {
      rejectRecordingReceipts(new Error("Project backend rejected recording recovery"))
      recordingPending = []
      recordingJournal = recordingJournal.filter(entry => entry.receipt === null)
    }
  }
  function telemetry(frame: BackendTelemetry): void {
    observedBar = frame.clock.bar
    const current = get()
    const levels: Record<string, [number, number]> = {}
    for (const [id, value] of Object.entries(frame.levels)) {
      levels[id] = [value[0], value[1]]
    }
    store.setState({
      session: {
        ...current.session,
        levels,
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
    if (activeEdit) {
      cancelEdit(activeEdit.token)
    }
    if (activePreview) {
      cancelPreview(activePreview)
    }
    sessionCounter++
    stopConnection?.()
    isRuntimeDisposed = false
    stopConnection = null
    connection?.dispose()
    connection = null
    checkpoints.clear()
    revision = 0
    seekGeneration = 0
    activePreview = null
    editStart = null
    activeEdit = null
    editDepth = 0
    recordingJournal = []
    recordingPending = []
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
    if (activeEdit) {
      cancelEdit(activeEdit.token)
    }
    if (activePreview) {
      cancelPreview(activePreview)
    }
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
      if (activeEdit) {
        cancelEdit(activeEdit.token)
      }
      if (activePreview) {
        cancelPreview(activePreview)
      }
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
      if (activeEdit) {
        cancelEdit(activeEdit.token)
      }
      if (activePreview) {
        cancelPreview(activePreview)
      }
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
      recordingPending = []
      recordingJournal = []
      editStart = null
      activeEdit = null
      editDepth = 0
      activePreview = null
      store.setState(state => ({
        session: {
          ...state.session,
          editEpoch: crypto.randomUUID(),
          playing: false,
          recording: false,
          levels: {},
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
        !editDepth &&
        revision === current.session.backend.acceptedRevision &&
        current.document === document &&
        sameWorkspacePreferences(current.workspace, workspace)
      accepted = { ...(historyMatchesSave ? checkpoint() : accepted), workspace, dirty: false }
    }
    if (sameWorkspacePreferences(get().workspace, workspace)) {
      isWorkspaceDirty = false
    }
    if (
      editStart?.document === document &&
      sameWorkspacePreferences(editStart.workspace, workspace)
    ) {
      isEditDirty = false
    }
  }
  function canSaveProject(): boolean {
    return isBackendRecovered
  }
  function getCommittedDocument(): DocumentState {
    return editStart?.document ?? get().document
  }
  function getCommittedWorkspace(): WorkspaceState {
    return editStart?.workspace ?? get().workspace
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
    return new Promise<void>((resolve, reject) => {
      let unsubscribe = () => {}
      function finish(error?: Error) {
        unsubscribe()
        signal.removeEventListener("abort", abort)
        if (error) reject(error)
        else resolve()
      }
      function abort() {
        finish(new DOMException("Cancelled", "AbortError"))
      }
      const check = () => {
        const backend = get().session.backend
        if (signal.aborted) return abort()
        if (
          capture.epoch !== projectEpoch() ||
          capture.rejectionGeneration !== rejectionGeneration
        ) {
          return finish(new Error("Project changed or its backend rejected the saved revision"))
        }
        if (canSaveProject() && backend.acceptedRevision >= capture.revision) return finish()
        if (backend.phase === "error" && backend.pending === 0) {
          finish(new Error(backend.error ?? "Project backend is unavailable"))
        }
      }
      unsubscribe = store.subscribe(check)
      signal.addEventListener("abort", abort, { once: true })
      check()
    })
  }
  function completeProjectSave(capture: ProjectSaveCapture): void {
    if (capture.epoch !== projectEpoch()) return
    const clean =
      getCommittedDocument() === capture.document &&
      sameWorkspacePreferences(getCommittedWorkspace(), capture.workspace)
    markProjectSaved(capture.document, capture.workspace)
    if (clean && !editDepth) session({ dirty: false })
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
  function document(next: DocumentState): void {
    const state = get()
    if (next === state.document || !next.tracks.some(isOrdinaryTrack)) {
      return
    }
    if (!editDepth) {
      pushHistory(snapshot(state))
    }
    const automationLanes = Object.fromEntries(
      Object.entries(state.workspace.automationLanes).flatMap(([id, targets]) => {
        const track = next.tracks.find(item => item.id === id)
        return track ? [[id, targets.filter(target => isAutomationTarget(target, track))]] : []
      })
    )
    store.setState({
      document: next,
      workspace: { ...state.workspace, automationLanes },
      session: {
        ...flags(state, true),
        automationTargets: Object.fromEntries(
          Object.entries(state.session.automationTargets).flatMap(([id, target]) => {
            const track = next.tracks.find(item => item.id === id)
            return track ? [[id, target && isAutomationTarget(target, track) ? target : null]] : []
          })
        ),
      },
    })
    submit(editDepth ? "preview" : "commit", editDepth ? (activeEdit?.token.id ?? null) : null)
  }
  function workspace(next: WorkspaceState): void {
    const state = get()
    if (next === state.workspace || JSON.stringify(next) === JSON.stringify(state.workspace)) {
      return
    }
    if (!editDepth) {
      pushHistory(snapshot(state))
    }
    store.setState({ workspace: next, session: flags(state, true) })
    isWorkspaceDirty = true
    if (state.workspace.metronome !== next.metronome) {
      submitControl(control(get()))
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
  function beginEdit(owner = "batch"): ProjectEditToken {
    if (activePreview) {
      cancelPreview(activePreview)
    }
    if (activeEdit && activeEdit.owner !== owner) {
      finishEdit()
    }
    if (activeEdit) {
      editDepth++
      return activeEdit.token
    }
    const token = { sessionId: projectEpoch(), id: `edit-${++editCounter}` }
    activeEdit = { owner, token }
    editDepth = 1
    editStart = snapshot(get())
    isEditDirty = get().session.dirty
    return token
  }
  function resolveRecording(entry: RecordingEntry, value: RecordingReceipt): void {
    if (!entry.receipt || entry.receipt.settled) return
    entry.receipt.settled = true
    entry.receipt.resolve(value)
  }
  function rejectRecording(entry: RecordingEntry, error: unknown): void {
    if (!entry.receipt || entry.receipt.settled) return
    entry.receipt.settled = true
    entry.receipt.reject(error)
  }
  function rejectRecordingReceipts(error: Error): void {
    for (const entry of recordingJournal) rejectRecording(entry, error)
    for (const entry of recordingPending) rejectRecording(entry, error)
  }
  function flushRecording(): void {
    if (editDepth || activePreview) {
      return
    }
    while (recordingJournal.length) {
      const entry = recordingJournal.shift()
      if (entry) applyRecording(entry)
    }
  }
  function applyRecording(entry: RecordingEntry): void {
    if (entry.epoch !== projectEpoch()) {
      rejectRecording(entry, new Error("Project changed before recording publication"))
      return
    }
    try {
      const current = get().document
      const next = entry.apply(current)
      if (!next.tracks.some(isOrdinaryTrack)) {
        if (!entry.receipt) return
        throw new Error("Recorded document must retain an ordinary track")
      }
      if (next === current) {
        if (!entry.receipt) return
        if (acceptedReceipt && next === accepted.document && isBackendRecovered) {
          resolveRecording(entry, acceptedReceipt)
          return
        }
      }
      recordingPending.push(entry)
      if (next === current) submit("commit")
      else document(next)
    } catch (error) {
      recordingPending = recordingPending.filter(pending => pending !== entry)
      if (!entry.receipt) throw error
      rejectRecording(entry, error)
    }
  }
  function queueRecording(entry: RecordingEntry): void {
    if (editDepth || activePreview) recordingJournal.push(entry)
    else applyRecording(entry)
  }
  function recordDocument(apply: (document: DocumentState) => DocumentState): void {
    queueRecording({ apply, epoch: projectEpoch(), revision: null, receipt: null })
  }
  function recordDocumentConfirmed(
    apply: (document: DocumentState) => DocumentState,
    expectedEpoch: string
  ): Promise<RecordingReceipt> {
    return new Promise((resolve, reject) => {
      if (expectedEpoch !== projectEpoch()) {
        reject(new Error("Project changed before recording publication"))
        return
      }
      const backend = get().session.backend
      if (
        isRuntimeDisposed ||
        !connection ||
        (!isBackendRecovered && backend.phase === "error" && backend.pending === 0)
      ) {
        reject(new Error("Project backend is unavailable for recording publication"))
        return
      }
      queueRecording({
        apply,
        epoch: expectedEpoch,
        revision: null,
        receipt: { settled: false, resolve, reject },
      })
    })
  }
  function endEdit(token?: ProjectEditToken): void {
    if (token && !isCurrentEdit(token)) {
      return
    }
    if (editDepth === 0 || --editDepth !== 0) {
      return
    }
    finishEdit()
  }

  function isCurrentEdit(token: ProjectEditToken): boolean {
    return (
      activeEdit?.token.id === token.id &&
      activeEdit.token.sessionId === token.sessionId &&
      projectEpoch() === token.sessionId
    )
  }

  function finishEdit(): void {
    editDepth = 0
    const editId = activeEdit?.token.id ?? null
    activeEdit = null
    const start = editStart
    editStart = null
    const isDocumentChanged =
      start !== null && JSON.stringify(start.document) !== JSON.stringify(get().document)
    const isWorkspaceChanged =
      start !== null && !sameWorkspacePreferences(start.workspace, get().workspace)
    const isChanged = isDocumentChanged || isWorkspaceChanged
    if (isChanged && start) {
      pushHistory(start)
    }
    store.setState(state => ({ session: flags(state, isEditDirty || isChanged) }))
    if (isDocumentChanged) {
      submit("commit", editId)
    } else if (start && start.document !== get().document) {
      store.setState({ document: start.document })
      submit("cancel", editId)
    }
    flushRecording()
  }
  function cancelEdit(token?: ProjectEditToken): void {
    if (token && !isCurrentEdit(token)) {
      return
    }
    if (!editStart) {
      return
    }
    const before = editStart
    const editId = activeEdit?.token.id ?? null
    activeEdit = null
    editStart = null
    editDepth = 0
    const isChanged = get().document !== before.document
    store.setState(state => ({
      document: before.document,
      workspace: {
        ...before.workspace,
        pxPerBar: state.workspace.pxPerBar,
        scrollX: state.workspace.scrollX,
        scrollY: state.workspace.scrollY,
      },
      session: flags(state, isEditDirty),
    }))
    if (isChanged) {
      submit("cancel", editId)
    }
    flushRecording()
  }
  function restoreSnapshot(next: ProjectSeed): void {
    store.setState(state => {
      return {
        document: next.document,
        workspace: {
          ...next.workspace,
          pxPerBar: state.workspace.pxPerBar,
          scrollX: state.workspace.scrollX,
          scrollY: state.workspace.scrollY,
        },
        session: {
          ...flags(state, true),
          selectedClipIds: [],
          editingClipId: next.document.tracks.some(track =>
            track.clips.some(clip => clip.id === state.session.editingClipId)
          )
            ? state.session.editingClipId
            : null,
        },
      }
    })
    submit("commit")
  }
  function undo(): void {
    if (editDepth || activePreview) {
      return
    }
    const previous = past.pop()
    if (!previous) {
      return
    }
    future.push(snapshot(get()))
    restoreSnapshot(previous)
  }
  function redo(): void {
    if (editDepth || activePreview) {
      return
    }
    const next = future.pop()
    if (!next) {
      return
    }
    past.push(snapshot(get()))
    restoreSnapshot(next)
  }
  function beginPreview(): ProjectEditToken {
    if (editDepth) {
      finishEdit()
    }
    if (activePreview) {
      cancelPreview(activePreview)
    }
    const token = { sessionId: projectEpoch(), id: `preview-${++previewCounter}` }
    activePreview = token
    return token
  }
  function isActive(token: ProjectEditToken): boolean {
    return (
      activePreview?.id === token.id &&
      activePreview.sessionId === token.sessionId &&
      projectEpoch() === token.sessionId
    )
  }
  function setPreview(token: ProjectEditToken, preview: ProjectPreview): void {
    store.setState(state => ({ session: { ...state.session, preview } }))
    submit("preview", token.id)
  }
  function previewTracks(token: ProjectEditToken, next: readonly Track[]): readonly Track[] | null {
    if (!isActive(token) || !next.some(isOrdinaryTrack)) {
      return null
    }
    const projected = projectTrackWaveforms(next)
    setPreview(token, { kind: "tracks", token, tracks: projected })
    return projected
  }
  function previewMarkers(
    token: ProjectEditToken,
    markers: readonly Marker[]
  ): readonly Marker[] | null {
    if (!isActive(token)) {
      return null
    }
    const projected = [...markers]
    setPreview(token, { kind: "markers", token, markers: projected })
    return projected
  }
  function previewLoop(token: ProjectEditToken, loop: LoopRegion): LoopRegion | null {
    if (!isActive(token)) {
      return null
    }
    const projected = { ...loop }
    setPreview(token, { kind: "loop", token, loop: projected })
    return projected
  }
  function commitPreview(token: ProjectEditToken): void {
    if (!isActive(token)) {
      return
    }
    const { preview } = get().session
    activePreview = null
    if (preview?.token.id === token.id) {
      const next = projectEffectiveDocument(get())
      const isChanged =
        preview.kind === "tracks"
          ? JSON.stringify(preview.tracks) !== JSON.stringify(get().document.tracks)
          : preview.kind === "markers"
            ? JSON.stringify(preview.markers) !== JSON.stringify(get().document.markers)
            : JSON.stringify(preview.loop) !== JSON.stringify(get().document.transport.loop)
      store.setState(state => ({ session: { ...state.session, preview: null } }))
      if (isChanged) {
        document(next)
      } else {
        submit("cancel", token.id)
      }
    }
    flushRecording()
  }
  function cancelPreview(token: ProjectEditToken): void {
    if (!isActive(token)) {
      return
    }
    activePreview = null
    const isHadPreview = get().session.preview !== null
    store.setState(state => ({ session: { ...state.session, preview: null } }))
    if (isHadPreview) {
      submit("cancel", token.id)
    }
    flushRecording()
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
    past.length = 0
    future.length = 0
    editStart = null
    activeEdit = null
    editDepth = 0
    isEditDirty = false
    isWorkspaceDirty = false
    isExactSeekPending = false
    activePreview = null
    recordingJournal = []
    recordingPending = []
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
