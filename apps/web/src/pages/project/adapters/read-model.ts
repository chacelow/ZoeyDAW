import { useProjectState as useProjectStore } from "../stores/useProjectState"
import type { ProjectState } from "@zoeydaw/project-core/types"

export const useProjectState = Object.assign(
  function useProjectState<T>(selector: (state: ProjectState) => T): T {
    return useProjectStore(selector)
  },
  {
    getState: useProjectStore.getState,
    subscribe: useProjectStore.subscribe,
  }
)
