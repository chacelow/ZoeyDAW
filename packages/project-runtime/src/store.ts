import { createStore } from "zustand/vanilla"
import type { StoreApi } from "zustand/vanilla"
import type { ProjectState } from "@zoeydaw/project-core/types"
import type { ProjectSeed } from "./runtime/project-runtime"
import { initialSession } from "./state/session"

export function createProjectStore(seed: ProjectSeed): StoreApi<ProjectState> {
  return createStore<ProjectState>(() => ({ ...seed, session: initialSession() }))
}
