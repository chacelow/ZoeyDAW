import { create } from "zustand"
import type { ProjectState } from "../model/types"
import { initialDocument } from "./slices/document"
import { initialWorkspace } from "./slices/workspace"
import { initialSession } from "./slices/session"
export { initialSession } from "./slices/session"

/** The single project root; adapters alone issue commands and own simulation. */
export const useProjectState = create<ProjectState>(() => ({
  document: initialDocument(),
  workspace: initialWorkspace(),
  session: initialSession(),
}))
