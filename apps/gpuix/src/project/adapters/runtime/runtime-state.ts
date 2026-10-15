import { initialDocument } from "../../stores/slices/document"
import { initialWorkspace } from "../../stores/slices/workspace"
import { createCheckpoint, historyFlags } from "./history"
import type { Checkpoint } from "./history"
import type { BackendConnection } from "../backend/connection"
import type { BackendControl, ProjectBackendFactory } from "../../model/backend"
import type {
  DocumentState,
  WorkspaceState,
  ProjectEditToken,
  ProjectState,
} from "../../model/types"
import type { useProjectState } from "../../stores/useProjectState"

export interface ProjectSeed {
  document: DocumentState
  workspace: WorkspaceState
}
export interface ProjectBackendOptions {
  createProject?: (projectId: string) => ProjectSeed
}
export interface ProjectRuntimeDependencies {
  store: Pick<typeof useProjectState, "getState" | "setState">
  backendFactory?: ProjectBackendFactory
  createProject?: (projectId: string) => ProjectSeed
}

export const createEmptyProject = (): ProjectSeed => ({
  document: initialDocument(),
  workspace: initialWorkspace(),
})

export class ProjectBackendNotConfiguredError extends Error {
  constructor() {
    super(
      "Project backend is not configured. Call configureProjectBackend at the application composition root."
    )
    this.name = "ProjectBackendNotConfiguredError"
  }
}

export class RuntimeOwner {
  past: ProjectSeed[] = []
  future: ProjectSeed[] = []
  editStart: ProjectSeed | null = null
  activeEdit: { owner: string; token: ProjectEditToken } | null = null
  editCounter = 0
  editDepth = 0
  isEditDirty = false
  isWorkspaceDirty = false
  recordingJournal: ((document: DocumentState) => DocumentState)[] = []
  recordingPending: { revision: number; apply: (document: DocumentState) => DocumentState }[] = []
  activePreview: ProjectEditToken | null = null
  previewCounter = 0
  sessionCounter = 0
  revision = 0
  seekGeneration = 0
  requestedBar = 1
  observedBar = 1
  isExactSeekPending = false
  accepted!: Checkpoint
  acceptedControl!: BackendControl
  isBackendRecovered = false
  checkpoints = new Map<number, Checkpoint>()
  factory: ProjectBackendFactory | undefined
  createProject: (projectId: string) => ProjectSeed
  backendFactories: {
    factory: ProjectBackendFactory
    createProject: (projectId: string) => ProjectSeed
  }[] = []
  connection: BackendConnection | null = null
  runtimeUsers = 0
  stopConnection: (() => void) | null = null
  isRuntimeDisposed = true
  readonly store: ProjectRuntimeDependencies["store"]
  readonly backendFactory: ProjectBackendFactory | undefined
  readonly projectFactory: (projectId: string) => ProjectSeed

  constructor({
    store,
    backendFactory,
    createProject: projectFactory = createEmptyProject,
  }: ProjectRuntimeDependencies) {
    this.store = store
    this.backendFactory = backendFactory
    this.projectFactory = projectFactory
    this.factory = backendFactory
    this.createProject = projectFactory
  }

  get = (): ProjectState => this.store.getState()

  checkpoint(): Checkpoint {
    return createCheckpoint(this.get(), this.past, this.future)
  }

  pushHistory(entry: ProjectSeed): void {
    this.past.push(entry)
    if (this.past.length > 100) this.past.shift()
    this.future.length = 0
  }

  flags(state: ProjectState, dirty: boolean): ProjectState["session"] {
    return historyFlags(state, dirty, this.past, this.future)
  }

  projectEpoch = (): string => this.get().session.editEpoch
}
