import type { BackendDocumentRequest, ProjectBackendFactory } from "@zoeydaw/project-core/backend"
import type { DocumentState, ProjectState, WorkspaceState } from "@zoeydaw/project-core/types"
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
export interface ProjectRuntimeDependencies {
  store: Pick<StoreApi<ProjectState>, "getState" | "setState" | "subscribe">
  backendFactory: ProjectBackendFactory
  defaultTrackHeight: number
  createProject?: (projectId: string) => ProjectSeed
}
export interface Checkpoint extends ProjectSeed {
  past: ProjectSeed[]
  future: ProjectSeed[]
  dirty: boolean
}
export type DocumentStage = Exclude<BackendDocumentRequest["stage"], "open">
