import { create } from "zustand"
import { PREFERENCE_DEFAULTS } from "../defaults/preferences"
import {
  createSessionTemplate,
  createUnopenedDocument,
  createWorkspaceTemplate,
} from "../defaults/template"
import type { ProjectState } from "../model/types"

export const useProjectState = create<ProjectState>(() => ({
  document: createUnopenedDocument(),
  workspace: createWorkspaceTemplate(PREFERENCE_DEFAULTS),
  session: createSessionTemplate(PREFERENCE_DEFAULTS),
}))
