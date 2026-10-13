import { useProjectState, initialSession } from "../stores/useProjectState"
import type { Clip, DocumentState, ProjectState, Track, WorkspaceState } from "../model/types"
import { mapClips, reduceDocument } from "../model/reducers"
import { createMockDocument, createMockWorkspace } from "./fixtures"

interface Snapshot {
  document: DocumentState
  workspace: WorkspaceState
}
const past: Snapshot[] = []
const future: Snapshot[] = []
let editStart: Snapshot | null = null
let editDepth = 0
let editDirty = false

export const get = () => useProjectState.getState()
export function session(patch: Partial<ProjectState["session"]>): void {
  useProjectState.setState(state => ({ session: { ...state.session, ...patch } }))
}
const snapshot = (state: ProjectState): Snapshot => ({
  document: structuredClone(state.document),
  workspace: structuredClone(state.workspace),
})
const flags = (state: ProjectState, dirty: boolean): ProjectState["session"] => ({
  ...state.session,
  dirty,
  canUndo: past.length > 0,
  canRedo: future.length > 0,
})

export function document(next: DocumentState): void {
  const state = get()
  if (next === state.document) return
  if (!editDepth) {
    past.push(snapshot(state))
    future.length = 0
  }
  useProjectState.setState({ document: next, session: flags(state, true) })
}
export function workspace(next: WorkspaceState): void {
  const state = get()
  if (next === state.workspace) return
  if (!editDepth) {
    past.push(snapshot(state))
    future.length = 0
  }
  useProjectState.setState({ workspace: next, session: flags(state, true) })
}
export function tracks(next: Track[]): void {
  document(reduceDocument(get().document, { type: "tracks", tracks: next }))
}
export function updateTrack(id: string, patch: Partial<Track>): void {
  const source = get().document.tracks
  const target = source.find(track => track.id === id)
  if (!target) return
  if (patch.output !== undefined && patch.output !== target.output) {
    if (
      patch.output === id ||
      (patch.output !== "none" &&
        patch.output !== "external" &&
        !source.some(
          track => track.id === patch.output && (track.kind === "group" || track.kind === "main")
        ))
    )
      return
    const descendants = new Set<string>()
    function collect(parentId: string) {
      for (const child of source.find(track => track.id === parentId)?.childTrackIds ?? []) {
        descendants.add(child)
        collect(child)
      }
    }
    collect(id)
    if (descendants.has(patch.output)) return
    const route = new Set([id])
    let destination = patch.output
    while (destination !== "none" && destination !== "external") {
      if (route.has(destination)) return
      route.add(destination)
      const next = source.find(track => track.id === destination)
      if (!next) return
      destination = next.output
    }
    tracks(
      source.map(track => {
        if (track.id === id)
          return { ...track, ...structuredClone(patch), id: track.id, kind: track.kind }
        if (track.id === target.output && track.kind === "group")
          return { ...track, childTrackIds: track.childTrackIds?.filter(child => child !== id) }
        if (track.id === patch.output && track.kind === "group")
          return { ...track, childTrackIds: [...(track.childTrackIds ?? []), id] }
        return track
      })
    )
    return
  }
  tracks(
    source.map(track =>
      track.id === id
        ? { ...track, ...structuredClone(patch), id: track.id, kind: track.kind }
        : track
    )
  )
}
export function editClip(id: string, apply: (clip: Clip) => Clip | null): void {
  const source = get().document.tracks
  const track = source.find(item => item.clips.some(clip => clip.id === id))
  const original = track?.clips.find(clip => clip.id === id)
  if (!original) return
  const next = apply(original)
  if (next !== original) tracks(mapClips(source, [id], () => next))
}
export function beginEdit(): void {
  if (editDepth++ === 0) {
    editStart = snapshot(get())
    editDirty = get().session.dirty
  }
}
export function endEdit(): void {
  if (editDepth === 0 || --editDepth !== 0) return
  const changed =
    editStart !== null &&
    (JSON.stringify(editStart.document) !== JSON.stringify(get().document) ||
      JSON.stringify(editStart.workspace) !== JSON.stringify(get().workspace))
  if (changed && editStart) {
    past.push(editStart)
    future.length = 0
  }
  editStart = null
  useProjectState.setState(state => ({ session: flags(state, editDirty || changed) }))
}
export function cancelEdit(): void {
  if (!editStart) return
  const before = editStart
  editStart = null
  editDepth = 0
  useProjectState.setState(state => ({ ...before, session: flags(state, editDirty) }))
}
function restoreSnapshot(next: Snapshot): void {
  useProjectState.setState(state => ({
    ...next,
    session: {
      ...flags(state, true),
      selectedClipIds: [],
      editingClipId: next.document.tracks.some(track =>
        track.clips.some(clip => clip.id === state.session.editingClipId)
      )
        ? state.session.editingClipId
        : null,
    },
  }))
}
export function undo(): void {
  if (editDepth) return
  const previous = past.pop()
  if (!previous) return
  future.push(snapshot(get()))
  restoreSnapshot(previous)
}
export function redo(): void {
  if (editDepth) return
  const next = future.pop()
  if (!next) return
  past.push(snapshot(get()))
  restoreSnapshot(next)
}
export function hydrateState(next: Snapshot): void {
  past.length = 0
  future.length = 0
  editStart = null
  editDepth = 0
  useProjectState.setState({ ...next, session: initialSession() })
}
export function resetProject(): void {
  hydrateState({ document: createMockDocument(), workspace: createMockWorkspace() })
}
