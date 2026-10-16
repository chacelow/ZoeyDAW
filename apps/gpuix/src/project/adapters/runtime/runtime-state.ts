import { getPreferences } from "@/platform/settings"
import type { PreferenceValues } from "@/platform/settings"
import { createProjectTemplate } from "../../defaults/template"
import type { CreationNames, TrackCreationAppearance } from "../../defaults/template"
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
export interface ProjectCreationConfiguration {
  names(): CreationNames
  appearance(): TrackCreationAppearance
  preferences(): PreferenceValues
}
export interface ProjectRuntimeDependencies {
  store: Pick<typeof useProjectState, "getState" | "setState">
  backendFactory?: ProjectBackendFactory
  createProject?: (projectId: string) => ProjectSeed
  creation?: ProjectCreationConfiguration
}

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
  createProject: ((projectId: string) => ProjectSeed) | undefined
  backendFactories: {
    factory: ProjectBackendFactory
    createProject: ((projectId: string) => ProjectSeed) | undefined
  }[] = []
  connection: BackendConnection | null = null
  runtimeUsers = 0
  stopConnection: (() => void) | null = null
  isRuntimeDisposed = true
  readonly store: ProjectRuntimeDependencies["store"]
  readonly backendFactory: ProjectBackendFactory | undefined
  readonly projectFactory: ((projectId: string) => ProjectSeed) | undefined
  creation: ProjectCreationConfiguration | undefined

  constructor({
    store,
    backendFactory,
    createProject: projectFactory,
    creation,
  }: ProjectRuntimeDependencies) {
    this.store = store
    this.backendFactory = backendFactory
    this.projectFactory = projectFactory
    this.factory = backendFactory
    this.createProject = projectFactory
    this.creation = creation
  }

  get = (): ProjectState => this.store.getState()

  checkpoint(): Checkpoint {
    return createCheckpoint(this.get(), this.past, this.future)
  }

  pushHistory(entry: ProjectSeed): void {
    this.past.push(entry)
    const capacity = this.preferences().historyCapacity
    if (this.past.length > capacity) this.past.splice(0, this.past.length - capacity)
    this.future.length = 0
  }

  flags(state: ProjectState, dirty: boolean): ProjectState["session"] {
    return historyFlags(state, dirty, this.past, this.future)
  }

  configureProjectCreation = (creation: ProjectCreationConfiguration): (() => void) => {
    const previous = this.creation
    this.creation = creation
    return () => {
      if (this.creation === creation) this.creation = previous
    }
  }

  requireCreation = (): ProjectCreationConfiguration => {
    if (!this.creation) {
      throw new Error(
        "Project creation is not configured. Call configureProjectCreation before initializing a project route or creating tracks."
      )
    }
    return this.creation
  }

  preferences = (): PreferenceValues => this.creation?.preferences() ?? getPreferences()

  creationValues = () => {
    const creation = this.requireCreation()
    return { names: creation.names(), appearance: creation.appearance() }
  }

  newProject(projectId: string): ProjectSeed {
    if (this.createProject) return this.createProject(projectId)
    return createProjectTemplate({ ...this.creationValues(), preferences: this.preferences() })
  }

  projectEpoch = (): string => this.get().session.editEpoch
}
