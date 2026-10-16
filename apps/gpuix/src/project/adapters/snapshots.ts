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
  getCommittedWorkspace,
  sameWorkspacePreferences,
} from "./context"

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
let failedOpenKey: string | null = null
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
  failedOpenKey = null
}
export function serializeProject(): string {
  return stringifyProject(getCommittedDocument(), getCommittedWorkspace())
}
export function hydrateProject(json: string): void {
  hydrateState(parseProject(json))
}

/** Failed opens protect the saved bytes until a successful reopen or identity change. */
export function canSaveSnapshot(): boolean {
  return failedOpenKey !== storageKey()
}

/** Route opening treats absent snapshots as a new empty project, unlike explicit Restore. */
export function openProjectSnapshot(projectId: string): boolean {
  if (storageId === projectId) resetProject(projectId)
  else setProjectStorageId(projectId)
  const key = storageKey()
  failedOpenKey = key
  let saved: string | null
  try {
    if (!snapshotStorage) throw new Error("Snapshot storage is not configured")
    saved = snapshotStorage.get(key)
  } catch {
    session({ snapshotError: "Could not read snapshot storage." })
    return false
  }
  if (saved !== null) {
    try {
      hydrateProject(saved)
    } catch {
      session({
        snapshotError: "The local snapshot is invalid or unsupported. Current project was kept.",
      })
      return false
    }
  }
  failedOpenKey = null
  session({ snapshotError: null })
  return true
}
export const snapshotActions = {
  saveSnapshot(): void {
    if (!canSaveSnapshot()) return
    const epoch = projectEpoch()
    const revision = projectRevision()
    const document = getCommittedDocument()
    const workspace = getCommittedWorkspace()
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
