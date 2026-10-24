import { useStore } from "zustand"
import { createProjectStore } from "@zoeydaw/project-runtime/store"
import { initialDocument, initialWorkspace } from "@zoeydaw/project-runtime/state"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import type { ProjectState } from "@zoeydaw/project-core/types"

const store = createProjectStore({
  document: initialDocument(DEFAULT_TRACK_HEIGHT),
  workspace: initialWorkspace(),
})

export const useProjectState = Object.assign(
  function useProjectState<T>(selector: (state: ProjectState) => T): T {
    return useStore(store, selector)
  },
  { getState: store.getState, setState: store.setState, subscribe: store.subscribe }
)
