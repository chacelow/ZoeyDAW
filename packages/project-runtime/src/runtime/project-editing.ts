import { locateClip } from "@zoeydaw/project-core/clip-content"
import { isAutomationTarget } from "@zoeydaw/project-core/automation-target"
import { isOrdinaryTrack } from "@zoeydaw/project-core/reducers"
import type {
  DocumentState,
  LoopRegion,
  Marker,
  ProjectEditToken,
  ProjectPreview,
  ProjectState,
  Track,
  WorkspaceState,
} from "@zoeydaw/project-core/types"
import { getEffectiveDocument as projectEffectiveDocument } from "./effective-document"
import { sameWorkspacePreferences } from "./workspace-preferences"
import type {
  Checkpoint,
  DocumentStage,
  ProjectRuntimeDependencies,
  ProjectSeed,
} from "./runtime-contracts"

interface ProjectEditingDependencies {
  store: ProjectRuntimeDependencies["store"]
  submit(stage: DocumentStage, editId?: string | null): void
  flushRecording(): void
  projectTrackWaveforms(tracks: readonly Track[]): Track[]
  metronomeChanged(): void
}
const HISTORY_LIMIT = 100

export function createProjectEditing({
  store,
  submit,
  flushRecording,
  projectTrackWaveforms,
  metronomeChanged,
}: ProjectEditingDependencies) {
  const get = () => store.getState()
  const projectEpoch = () => get().session.editEpoch
  const past: ProjectSeed[] = []
  const future: ProjectSeed[] = []
  let editStart: ProjectSeed | null = null
  let activeEdit: { owner: string; token: ProjectEditToken } | null = null
  let editCounter = 0
  let editDepth = 0
  let isEditDirty = false
  let isWorkspaceDirty = false
  let activePreview: ProjectEditToken | null = null
  let previewCounter = 0

  function snapshot(state: ProjectState): ProjectSeed {
    return { document: state.document, workspace: state.workspace }
  }
  function checkpoint(): Checkpoint {
    return { ...snapshot(get()), past: [...past], future: [...future], dirty: get().session.dirty }
  }
  function pushHistory(entry: ProjectSeed): void {
    past.push(entry)
    if (past.length > HISTORY_LIMIT) past.shift()
    future.length = 0
  }
  function flags(state: ProjectState, dirty: boolean): ProjectState["session"] {
    return { ...state.session, dirty, canUndo: past.length > 0, canRedo: future.length > 0 }
  }
  function document(next: DocumentState): void {
    const state = get()
    if (next === state.document || !next.tracks.some(isOrdinaryTrack)) return
    if (!editDepth) pushHistory(snapshot(state))
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
    if (next === state.workspace || JSON.stringify(next) === JSON.stringify(state.workspace)) return
    if (!editDepth) pushHistory(snapshot(state))
    store.setState({ workspace: next, session: flags(state, true) })
    isWorkspaceDirty = true
    if (state.workspace.metronome !== next.metronome) metronomeChanged()
  }
  function beginEdit(owner = "batch"): ProjectEditToken {
    if (activePreview) cancelPreview(activePreview)
    if (activeEdit && activeEdit.owner !== owner) finishEdit()
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
  function endEdit(token?: ProjectEditToken): void {
    if (token && !isCurrentEdit(token)) return
    if (editDepth === 0 || --editDepth !== 0) return
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
    if (isChanged && start) pushHistory(start)
    store.setState(state => ({ session: flags(state, isEditDirty || isChanged) }))
    if (isDocumentChanged) submit("commit", editId)
    else if (start && start.document !== get().document) {
      store.setState({ document: start.document })
      submit("cancel", editId)
    }
    flushRecording()
  }
  function cancelEdit(token?: ProjectEditToken): void {
    if (token && !isCurrentEdit(token)) return
    if (!editStart) return
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
    if (isChanged) submit("cancel", editId)
    flushRecording()
  }
  function restoreSnapshot(next: ProjectSeed): void {
    store.setState(state => ({
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
        editingClipId: locateClip(next.document.tracks, state.session.editingClipId)
          ? state.session.editingClipId
          : null,
      },
    }))
    submit("commit")
  }
  function undo(): void {
    if (editDepth || activePreview) return
    const previous = past.pop()
    if (!previous) return
    future.push(snapshot(get()))
    restoreSnapshot(previous)
  }
  function redo(): void {
    if (editDepth || activePreview) return
    const next = future.pop()
    if (!next) return
    past.push(snapshot(get()))
    restoreSnapshot(next)
  }
  function beginPreview(): ProjectEditToken {
    if (editDepth) finishEdit()
    if (activePreview) cancelPreview(activePreview)
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
    if (!isActive(token) || !next.some(isOrdinaryTrack)) return null
    const projected = projectTrackWaveforms(next)
    setPreview(token, { kind: "tracks", token, tracks: projected })
    return projected
  }
  function previewMarkers(
    token: ProjectEditToken,
    markers: readonly Marker[]
  ): readonly Marker[] | null {
    if (!isActive(token)) return null
    const projected = [...markers]
    setPreview(token, { kind: "markers", token, markers: projected })
    return projected
  }
  function previewLoop(token: ProjectEditToken, loop: LoopRegion): LoopRegion | null {
    if (!isActive(token)) return null
    const projected = { ...loop }
    setPreview(token, { kind: "loop", token, loop: projected })
    return projected
  }
  function commitPreview(token: ProjectEditToken): void {
    if (!isActive(token)) return
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
      if (isChanged) document(next)
      else submit("cancel", token.id)
    }
    flushRecording()
  }
  function cancelPreview(token: ProjectEditToken): void {
    if (!isActive(token)) return
    activePreview = null
    const isHadPreview = get().session.preview !== null
    store.setState(state => ({ session: { ...state.session, preview: null } }))
    if (isHadPreview) submit("cancel", token.id)
    flushRecording()
  }
  function clearTransient(): void {
    editStart = null
    activeEdit = null
    editDepth = 0
    activePreview = null
  }
  return {
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
    hasEdit: () => editDepth !== 0,
    isBusy: () => editDepth !== 0 || activePreview !== null,
    getCommittedDocument: () => editStart?.document ?? get().document,
    getCommittedWorkspace: () => editStart?.workspace ?? get().workspace,
    cancelActive() {
      if (activeEdit) cancelEdit(activeEdit.token)
      if (activePreview) cancelPreview(activePreview)
    },
    clearTransient,
    reset() {
      clearTransient()
      past.length = 0
      future.length = 0
      isEditDirty = false
      isWorkspaceDirty = false
    },
    restoreAccepted(accepted: Checkpoint): boolean {
      past.splice(0, past.length, ...accepted.past)
      future.splice(0, future.length, ...accepted.future)
      if (!sameWorkspacePreferences(get().workspace, accepted.workspace)) {
        pushHistory({ document: accepted.document, workspace: accepted.workspace })
        isWorkspaceDirty = true
      }
      clearTransient()
      return isWorkspaceDirty
    },
    markSaved(document: DocumentState, workspace: WorkspaceState) {
      if (sameWorkspacePreferences(get().workspace, workspace)) isWorkspaceDirty = false
      if (
        editStart?.document === document &&
        sameWorkspacePreferences(editStart.workspace, workspace)
      )
        isEditDirty = false
    },
  }
}
