import { parseProject, stringifyProject } from "../model/persistence"
import { isProjectFile } from "../model/project-file"
import { useProjectState } from "../stores/useProjectState"
import type { ProjectState } from "../model/types"
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

export interface ProjectFiles {
  read(path: string): string | null
  write(path: string, json: string): void
}

export function createMemoryProjectFiles(): ProjectFiles & {
  readonly entries: Map<string, string>
} {
  const entries = new Map<string, string>()
  return {
    entries,
    read: path => entries.get(path) ?? null,
    write: (path, json) => {
      entries.set(path, json)
    },
  }
}

const owner: { files: ProjectFiles | null; projectId: string | null } = {
  files: null,
  projectId: null,
}
const savedPaths = new Map<string, string>()

export function setProjectFiles(files: ProjectFiles | null): void {
  owner.files = files
}

export function openNewProject(id: string): void {
  if (owner.projectId === id) {
    return
  }
  resetProject(id)
  owner.projectId = id
}
export function serializeProject(): string {
  return stringifyProject(getCommittedDocument(), getCommittedWorkspace())
}
export function hydrateProject(json: string): void {
  hydrateState(parseProject(json))
}

export function canSaveProjectFile(state: Pick<ProjectState, "session">): boolean {
  return !state.session.saveBlocked
}

function readProjectFile(path: string): string | null | undefined {
  try {
    if (!owner.files) throw new Error("Project files are not configured")
    return owner.files.read(path)
  } catch {
    return undefined
  }
}

export function openProjectFile(id: string): boolean {
  const path = isProjectFile(id) ? id : (savedPaths.get(id) ?? null)
  if (owner.projectId === id) resetProject(id)
  else openNewProject(id)
  if (path === null) {
    session({ fileError: null, saveBlocked: false })
    return true
  }
  const saved = readProjectFile(path)
  if (saved === undefined) {
    session({ filePath: path, fileError: "read", saveBlocked: true })
    return false
  }
  if (saved === null) {
    session({ filePath: path, fileError: "missing", saveBlocked: false })
    return false
  }
  try {
    hydrateProject(saved)
  } catch {
    session({ filePath: path, fileError: "invalid", saveBlocked: true })
    return false
  }
  session({ filePath: path, fileError: null, saveBlocked: false })
  return true
}

function writeProject(path: string): void {
  const epoch = projectEpoch()
  const revision = projectRevision()
  const document = getCommittedDocument()
  const workspace = getCommittedWorkspace()
  const files = owner.files
  const id = owner.projectId
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
      if (!files) {
        throw new Error("Project files are not configured")
      }
      files.write(path, stringifyProject(document, workspace))
      if (id !== null) savedPaths.set(id, path)
      const current = get()
      const clean =
        projectRevision() === revision &&
        current.document === document &&
        sameWorkspacePreferences(current.workspace, workspace)
      session({
        ...(clean && { dirty: false }),
        filePath: path,
        fileError: null,
        saveBlocked: false,
      })
      markProjectSaved(document, workspace)
    } catch {
      session({ fileError: "write" })
    }
  }
  unsubscribe = useProjectState.subscribe(finish)
  finish()
}

export const projectFileActions = {
  save(): void {
    const path = get().session.filePath
    if (path === null) {
      projectFileActions.requestSaveAs()
      return
    }
    if (canSaveProjectFile(get())) writeProject(path)
  },
  saveAs(path: string): void {
    writeProject(path)
  },
  requestSaveAs(): void {
    session({ saveAsRequest: get().session.saveAsRequest + 1 })
  },
  requestOpen(): void {
    session({ openRequest: get().session.openRequest + 1 })
  },
}
