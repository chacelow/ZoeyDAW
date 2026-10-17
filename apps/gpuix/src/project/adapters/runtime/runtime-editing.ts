import { mapClips, reduceDocument } from "../../model/reducers"
import { routeTrack } from "./track-routing"
import { sameWorkspacePreferences } from "./workspace-preferences"
import {
  getEffectiveDocument as projectEffectiveDocument,
  previewChangesDocument,
} from "./effective-document"
import { snapshot } from "./history"
import type { RuntimeOwner, ProjectSeed } from "./runtime-state"
import type { BackendRequest } from "../../model/backend"
import type {
  Clip,
  DocumentState,
  LoopRegion,
  Marker,
  ProjectEditToken,
  ProjectPreview,
  Track,
  WorkspaceState,
} from "../../model/types"

interface RuntimeSubmission {
  submit(stage: Exclude<BackendRequest["stage"], "open">, editId?: string | null): void
}

export function createRuntimeEditing(runtime: RuntimeOwner, backend: RuntimeSubmission) {
  function document(next: DocumentState): void {
    const state = runtime.get()
    if (next === state.document) {
      return
    }
    if (!runtime.editDepth) {
      runtime.pushHistory(snapshot(state))
    }
    runtime.store.setState({ document: next, session: runtime.flags(state, true) })
    backend.submit(
      runtime.editDepth ? "preview" : "commit",
      runtime.editDepth ? (runtime.activeEdit?.token.id ?? null) : null
    )
  }

  function workspace(next: WorkspaceState): void {
    const state = runtime.get()
    if (next === state.workspace || JSON.stringify(next) === JSON.stringify(state.workspace)) {
      return
    }
    if (!runtime.editDepth) {
      runtime.pushHistory(snapshot(state))
    }
    runtime.store.setState({ workspace: next, session: runtime.flags(state, true) })
    runtime.isWorkspaceDirty = true
  }

  function tracks(next: Track[]): void {
    document(reduceDocument(runtime.get().document, { type: "tracks", tracks: next }))
  }

  function updateTrack(id: string, patch: Partial<Track>): void {
    const next = routeTrack(runtime.get().document.tracks, id, patch)
    if (next) {
      tracks(next)
    }
  }

  function editClip(id: string, apply: (clip: Clip) => Clip | null): void {
    const source = runtime.get().document.tracks
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
    if (runtime.activePreview) {
      cancelPreview(runtime.activePreview)
    }
    if (runtime.activeEdit && runtime.activeEdit.owner !== owner) {
      finishEdit()
    }
    if (runtime.activeEdit) {
      runtime.editDepth++
      return runtime.activeEdit.token
    }
    const token = { sessionId: runtime.projectEpoch(), id: `edit-${++runtime.editCounter}` }
    runtime.activeEdit = { owner, token }
    runtime.editDepth = 1
    runtime.editStart = snapshot(runtime.get())
    runtime.isEditDirty = runtime.get().session.dirty
    return token
  }

  function flushRecording(): void {
    if (runtime.editDepth || runtime.activePreview) {
      return
    }
    const journal = runtime.recordingJournal
    runtime.recordingJournal = []
    for (const apply of journal) {
      recordDocument(apply)
    }
  }

  function recordDocument(apply: (document: DocumentState) => DocumentState): void {
    if (runtime.editDepth || runtime.activePreview) {
      runtime.recordingJournal.push(apply)
      return
    }
    runtime.recordingPending.push({ revision: runtime.revision + 1, apply })
    document(apply(runtime.get().document))
  }

  function endEdit(token?: ProjectEditToken): void {
    if (token && !isCurrentEdit(token)) {
      return
    }
    if (runtime.editDepth === 0 || --runtime.editDepth !== 0) {
      return
    }
    finishEdit()
  }

  function isCurrentEdit(token: ProjectEditToken): boolean {
    return (
      runtime.activeEdit?.token.id === token.id &&
      runtime.activeEdit.token.sessionId === token.sessionId &&
      runtime.projectEpoch() === token.sessionId
    )
  }

  function finishEdit(): void {
    runtime.editDepth = 0
    const editId = runtime.activeEdit?.token.id ?? null
    runtime.activeEdit = null
    const start = runtime.editStart
    runtime.editStart = null
    const isDocumentChanged =
      start !== null && JSON.stringify(start.document) !== JSON.stringify(runtime.get().document)
    const isWorkspaceChanged =
      start !== null && !sameWorkspacePreferences(start.workspace, runtime.get().workspace)
    const isChanged = isDocumentChanged || isWorkspaceChanged
    if (isChanged && start) {
      runtime.pushHistory(start)
    }
    runtime.store.setState(state => ({
      session: runtime.flags(state, runtime.isEditDirty || isChanged),
    }))
    if (isDocumentChanged) {
      backend.submit("commit", editId)
    } else if (start && start.document !== runtime.get().document) {
      runtime.store.setState({ document: start.document })
      backend.submit("cancel", editId)
    }
    flushRecording()
  }

  function cancelEdit(token?: ProjectEditToken): void {
    if (token && !isCurrentEdit(token)) {
      return
    }
    if (!runtime.editStart) {
      return
    }
    const before = runtime.editStart
    const editId = runtime.activeEdit?.token.id ?? null
    runtime.activeEdit = null
    runtime.editStart = null
    runtime.editDepth = 0
    const isChanged = runtime.get().document !== before.document
    runtime.store.setState(state => ({
      document: before.document,
      workspace: {
        ...before.workspace,
        pxPerBar: state.workspace.pxPerBar,
        scrollX: state.workspace.scrollX,
        scrollY: state.workspace.scrollY,
        dockLayout: state.workspace.dockLayout,
      },
      session: runtime.flags(state, runtime.isEditDirty),
    }))
    if (isChanged) {
      backend.submit("cancel", editId)
    }
    flushRecording()
  }

  function restoreSnapshot(next: ProjectSeed): void {
    runtime.store.setState(state => {
      return {
        document: next.document,
        workspace: {
          ...next.workspace,
          pxPerBar: state.workspace.pxPerBar,
          scrollX: state.workspace.scrollX,
          scrollY: state.workspace.scrollY,
          dockLayout: state.workspace.dockLayout,
        },
        session: {
          ...runtime.flags(state, true),
          selectedClipIds: [],
          editingClipId: next.document.tracks.some(track =>
            track.clips.some(clip => clip.id === state.session.editingClipId)
          )
            ? state.session.editingClipId
            : null,
        },
      }
    })
    backend.submit("commit")
  }

  function undo(): void {
    if (runtime.editDepth || runtime.activePreview) {
      return
    }
    const previous = runtime.past.pop()
    if (!previous) {
      return
    }
    runtime.future.push(snapshot(runtime.get()))
    restoreSnapshot(previous)
  }

  function redo(): void {
    if (runtime.editDepth || runtime.activePreview) {
      return
    }
    const next = runtime.future.pop()
    if (!next) {
      return
    }
    runtime.past.push(snapshot(runtime.get()))
    restoreSnapshot(next)
  }

  function beginPreview(): ProjectEditToken {
    if (runtime.editDepth) {
      finishEdit()
    }
    if (runtime.activePreview) {
      cancelPreview(runtime.activePreview)
    }
    const token = { sessionId: runtime.projectEpoch(), id: `preview-${++runtime.previewCounter}` }
    runtime.activePreview = token
    return token
  }

  function isActive(token: ProjectEditToken): boolean {
    return (
      runtime.activePreview?.id === token.id &&
      runtime.activePreview.sessionId === token.sessionId &&
      runtime.projectEpoch() === token.sessionId
    )
  }

  function setPreview(token: ProjectEditToken, preview: ProjectPreview): void {
    runtime.store.setState(state => ({ session: { ...state.session, preview } }))
    backend.submit("preview", token.id)
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
    const { preview } = runtime.get().session
    runtime.activePreview = null
    if (preview?.token.id === token.id) {
      const next = projectEffectiveDocument(runtime.get())
      const isChanged = previewChangesDocument(runtime.get().document, preview)
      runtime.store.setState(state => ({ session: { ...state.session, preview: null } }))
      if (isChanged) {
        document(next)
      } else {
        backend.submit("cancel", token.id)
      }
    }
    flushRecording()
  }

  function cancelPreview(token: ProjectEditToken): void {
    if (!isActive(token)) {
      return
    }
    runtime.activePreview = null
    const isHadPreview = runtime.get().session.preview !== null
    runtime.store.setState(state => ({ session: { ...state.session, preview: null } }))
    if (isHadPreview) {
      backend.submit("cancel", token.id)
    }
    flushRecording()
  }

  return {
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
    beginPreview,
    previewTracks,
    previewMarkers,
    previewLoop,
    commitPreview,
    cancelPreview,
    flushRecording,
  }
}
