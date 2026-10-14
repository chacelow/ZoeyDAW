import { parseProject, stringifyProject } from "../model/persistence"
import { useProjectState } from "../stores/useProjectState"
import {
  get,
  hydrateState,
  resetProject,
  session,
  projectEpoch,
  projectRevision,
  markProjectSaved,
  canSaveProject,
  getCommittedDocument,
  sameWorkspacePreferences,
} from "./context"
import { withWaveformPreview } from "./visuals"

export interface SnapshotStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

export function createMemorySnapshotStorage(): SnapshotStorage {
  const entries = new Map<string, string>()
  return {
    get: key => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value)
    },
  }
}

let snapshotStorage: SnapshotStorage | null = null

export function setSnapshotStorage(storage: SnapshotStorage | null): void {
  snapshotStorage = storage
}

let storageId: string | null = null
const storageKey = () => `zoeydaw:project:snapshot:v1:${encodeURIComponent(storageId ?? "default")}`

/**
Changing project route isolates its in-memory editing session and snapshot key.
*/
export function setProjectStorageId(projectId: string): void {
  if (storageId === projectId) {
    return
  }
  resetProject(projectId)
  storageId = projectId
}
export function serializeProject(): string {
  const state = get()
  return stringifyProject(getCommittedDocument(), state.workspace)
}
export function hydrateProject(json: string): void {
  const parsed = parseProject(json)
  hydrateState({
    ...parsed,
    document: {
      ...parsed.document,
      tracks: parsed.document.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => (clip.kind === "audio" ? withWaveformPreview(clip) : clip)),
      })),
    },
  })
}
export const snapshotActions = {
  saveSnapshot(): void {
    const epoch = projectEpoch()
    const revision = projectRevision()
    const document = getCommittedDocument()
    const { workspace } = get()
    const key = storageKey()
    const storage = snapshotStorage
    let isFinished = false
    let unsubscribe: () => void
    const finish = () => {
      if (isFinished) {
        return
      }
      const state = get()
      if (
        projectEpoch() !== epoch ||
        (state.session.backend.error &&
          (state.session.backend.acceptedRevision > revision ||
            (!canSaveProject() && state.session.backend.pending === 0)))
      ) {
        isFinished = true
        unsubscribe()
        return
      }
      if (!canSaveProject() || state.session.backend.acceptedRevision !== revision) {
        return
      }
      isFinished = true
      unsubscribe()
      try {
        if (!storage) {
          throw new Error("Snapshot storage is not configured")
        }
        storage.set(key, stringifyProject(document, workspace))
        const current = get()
        const clean =
          projectRevision() === revision &&
          current.document === document &&
          sameWorkspacePreferences(current.workspace, workspace)
        session({ ...(clean && { dirty: false }), snapshotError: null })
        markProjectSaved(document, workspace)
      } catch {
        session({
          snapshotError: "Could not save the local snapshot. Check storage availability.",
        })
      }
    }
    unsubscribe = useProjectState.subscribe(finish)
    finish()
  },
  restoreSnapshot(): boolean {
    let saved: string | null
    try {
      if (!snapshotStorage) {
        throw new Error("Snapshot storage is not configured")
      }
      saved = snapshotStorage.get(storageKey())
    } catch {
      session({ snapshotError: "Could not read snapshot storage." })
      return false
    }
    if (saved === null) {
      session({ snapshotError: "No local snapshot exists for this project." })
      return false
    }
    try {
      hydrateProject(saved)
      return true
    } catch {
      session({
        snapshotError: "The local snapshot is invalid or unsupported. Current project was kept.",
      })
      return false
    }
  },
}
