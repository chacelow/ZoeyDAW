import { initialSession } from "../../stores/slices/session"
import { positionToBar } from "../../model/types"
import { mapClips, reduceDocument } from "../../model/reducers"
import { initialDocument } from "../../stores/slices/document"
import { initialWorkspace } from "../../stores/slices/workspace"
import { projectBackendDocument } from "../backend/projection"
import { createBackendConnection } from "../backend/connection"
import { routeTrack } from "./track-routing"
import { sameWorkspacePreferences } from "./workspace-preferences"
import { getEffectiveDocument as projectEffectiveDocument } from "./effective-document"
import type { BackendConnection } from "../backend/connection"
import type {
  BackendControl,
  BackendRequest,
  BackendState,
  BackendTelemetry,
  PeakReader,
  ProjectBackendFactory,
  ProjectRuntimeStatus,
} from "../../model/backend"
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
} from "../../model/types"
import type { useProjectState } from "../../stores/useProjectState"

export interface ProjectSeed {
  document: DocumentState
  workspace: WorkspaceState
}
export interface ProjectBackendOptions {
  createProject?: (projectId: string) => ProjectSeed
}
const createEmptyProject = (): ProjectSeed => ({
  document: initialDocument(),
  workspace: initialWorkspace(),
})
interface Checkpoint {
  document: DocumentState
  workspace: WorkspaceState
  past: ProjectSeed[]
  future: ProjectSeed[]
  dirty: boolean
}
export interface ProjectRuntimeDependencies {
  store: Pick<typeof useProjectState, "getState" | "setState">
  backendFactory?: ProjectBackendFactory
  createProject?: (projectId: string) => ProjectSeed
}

export class ProjectBackendNotConfiguredError extends Error {
  constructor() {
    super(
      "Project backend is not configured. Call configureProjectBackend at the application composition root."
    )
    this.name = "ProjectBackendNotConfiguredError"
  }
}

const HISTORY_LIMIT = 100

export function createProjectRuntime({
  store,
  backendFactory,
  createProject: projectFactory = createEmptyProject,
}: ProjectRuntimeDependencies) {
  const past: ProjectSeed[] = []
  const future: ProjectSeed[] = []
  let editStart: ProjectSeed | null = null
  let activeEdit: { owner: string; token: ProjectEditToken } | null = null
  let editCounter = 0
  let editDepth = 0
  let isEditDirty = false
  let isWorkspaceDirty = false
  let recordingJournal: ((document: DocumentState) => DocumentState)[] = []
  let recordingPending: { revision: number; apply: (document: DocumentState) => DocumentState }[] =
    []
  let activePreview: ProjectEditToken | null = null
  let previewCounter = 0
  let sessionCounter = 0
  let revision = 0
  let seekGeneration = 0
  let requestedBar = 1
  let observedBar = 1
  let isExactSeekPending = false
  let accepted: Checkpoint
  let acceptedControl: BackendControl
  let isBackendRecovered = false
  const checkpoints = new Map<number, Checkpoint>()
  let factory = backendFactory
  let createProject: (projectId: string) => ProjectSeed = projectFactory
  const backendFactories: {
    factory: ProjectBackendFactory
    createProject: (projectId: string) => ProjectSeed
  }[] = []
  let connection: BackendConnection | null = null
  let runtimeUsers = 0
  let stopConnection: (() => void) | null = null
  let isRuntimeDisposed = true

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
  const backendState = (state = get(), documentState = state.document): BackendState => {
    return {
      project: projectBackendDocument(documentState),
      control: control(state),
    }
  }
  function control(state: ProjectState): BackendControl {
    return {
      playing: state.session.playing,
      recording: state.session.recording,
      seekBar: requestedBar,
      seekGeneration,
      heldNotes: state.session.activeMidiNotes,
      midiVelocity: state.session.midiVelocity,
    }
  }
  function submit(
    stage: "commit" | "preview" | "cancel" | "transport" | "recover",
    editId: string | null = null
  ): void {
    if (isRuntimeDisposed || !connection) {
      return
    }
    if (stage === "commit" || stage === "recover") {
      revision++
      checkpoints.set(revision, checkpoint())
    }
    connection.submit({
      stage,
      revision,
      editId,
      state: backendState(get(), projectEffectiveDocument(get())),
    })
  }
  function acceptedRequest(request: BackendRequest): void {
    if (request.state.control.seekGeneration !== acceptedControl.seekGeneration) {
      observedBar = request.state.control.seekBar
    }
    acceptedControl = request.state.control
    if (request.stage === "commit" || request.stage === "recover" || request.stage === "open") {
      isBackendRecovered = true
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
    recordingPending = recordingPending.filter(entry => entry.revision > request.revision)
    if (request.stage === "recover") {
      flushRecording()
    }
  }
  function rejectedRequest(request: BackendRequest): void {
    isBackendRecovered = false
    checkpoints.clear()
    past.splice(0, past.length, ...accepted.past)
    future.splice(0, future.length, ...accepted.future)
    const currentWorkspace = get().workspace
    acceptedControl = {
      ...acceptedControl,
      heldNotes: get().session.activeMidiNotes,
      midiVelocity: get().session.midiVelocity,
    }
    if (!sameWorkspacePreferences(currentWorkspace, accepted.workspace)) {
      pushHistory({ document: accepted.document, workspace: accepted.workspace })
      isWorkspaceDirty = true
    }
    editStart = null
    activeEdit = null
    editDepth = 0
    activePreview = null
    revision = Math.max(revision, request.revision, get().session.backend.acceptedRevision)
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
          activeMidiNotes: [...acceptedControl.heldNotes],
          midiVelocity: acceptedControl.midiVelocity,
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
        recovered = entry.apply(recovered)
      }
      pushHistory(before)
      store.setState(state => ({ document: recovered, session: flags(state, true) }))
    }
    if (request.stage !== "recover" && request.stage !== "open") {
      submit("recover")
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
    const configuredFactory = factory
    if (!configuredFactory) {
      throw new ProjectBackendNotConfiguredError()
    }
    const isReopening = connection !== null
    isRuntimeDisposed = true
    if (activeEdit) {
      cancelEdit(activeEdit.token)
    }
    if (activePreview) {
      cancelPreview(activePreview)
    }
    flushRecording()
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
    const epoch = sessionCounter
    const sessionId = `project-${crypto.randomUUID()}`
    const next = createBackendConnection({
      factory: configuredFactory,
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
    isRuntimeDisposed = true
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
      isRuntimeDisposed = true
      if (activeEdit) {
        cancelEdit(activeEdit.token)
      }
      if (activePreview) {
        cancelPreview(activePreview)
      }
      factory = backendFactories.at(-1)?.factory ?? backendFactory
      createProject = backendFactories.at(-1)?.createProject ?? projectFactory
      if (runtimeUsers) {
        if (factory) {
          openBackend()
        } else {
          closeBackend()
        }
      }
    }
  }
  function closeBackend(): void {
    isRuntimeDisposed = true
    if (activeEdit) {
      cancelEdit(activeEdit.token)
    }
    if (activePreview) {
      cancelPreview(activePreview)
    }
    flushRecording()
    sessionCounter++
    stopConnection?.()
    stopConnection = null
    connection?.dispose()
    connection = null
    isBackendRecovered = false
    acceptedControl = { ...acceptedControl, playing: false, recording: false, heldNotes: [] }
    checkpoints.clear()
    recordingPending = []
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
  function startProjectRuntime(): () => void {
    if (!factory) {
      throw new ProjectBackendNotConfiguredError()
    }
    if (runtimeUsers === 0) {
      openBackend()
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
      closeBackend()
    }
  }
  function readProjectTelemetry(): BackendTelemetry | null {
    return connection?.readTelemetry() ?? null
  }
  const readProjectPeaks: PeakReader = (sourceId, startBar, endBar, pixels, contentOffsetBars) =>
    connection?.readPeaks(sourceId, startBar, endBar, pixels, contentOffsetBars) ??
    new Float32Array(0)
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
    const current = get().workspace
    return editStart
      ? {
          ...editStart.workspace,
          pxPerBar: current.pxPerBar,
          scrollX: current.scrollX,
          scrollY: current.scrollY,
        }
      : current
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
      was.seekGeneration !== after.seekGeneration ||
      was.heldNotes !== after.heldNotes ||
      was.midiVelocity !== after.midiVelocity
    ) {
      submit("transport")
    }
  }
  function document(next: DocumentState): void {
    const state = get()
    if (next === state.document) {
      return
    }
    if (!editDepth) {
      pushHistory(snapshot(state))
    }
    store.setState({ document: next, session: flags(state, true) })
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
  }
  function tracks(next: Track[]): void {
    document(reduceDocument(get().document, { type: "tracks", tracks: next }))
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
      tracks(mapClips(source, [id], () => next))
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
  function flushRecording(): void {
    if (editDepth || activePreview) {
      return
    }
    const journal = recordingJournal
    recordingJournal = []
    for (const apply of journal) {
      recordDocument(apply)
    }
  }
  function recordDocument(apply: (document: DocumentState) => DocumentState): void {
    if (editDepth || activePreview) {
      recordingJournal.push(apply)
      return
    }
    recordingPending.push({ revision: revision + 1, apply })
    document(apply(get().document))
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
    if (!isActive(token)) {
      return null
    }
    const projected = [...next]
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
  function hydrateState(next: ProjectSeed): void {
    sessionCounter++
    stopConnection?.()
    stopConnection = null
    connection?.dispose()
    connection = null
    isRuntimeDisposed = true
    isBackendRecovered = false
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
    if (runtimeUsers && factory) {
      openBackend()
    }
  }
  function resetProject(projectId: string): void {
    hydrateState(createProject(projectId))
  }

  return {
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
