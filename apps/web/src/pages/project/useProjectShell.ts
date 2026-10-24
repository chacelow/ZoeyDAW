import { useEffect, useMemo, useSyncExternalStore } from "react"
import { useProjectState } from "./adapters"
import { installBraceCursors } from "./sections/ArrangementPanel/braceCursor"
import { WorkspaceController } from "./workspace/WorkspaceController"

export interface ProjectShellApi {
  workspace: WorkspaceController
  toggleBrowser: () => void
}

export function useProjectShell(): ProjectShellApi {
  const workspace = useMemo(() => new WorkspaceController(), [])
  useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot)
  const editorRequest = useProjectState(state => state.session.clipEditorRequest)

  useEffect(() => {
    installBraceCursors()
  }, [])

  useEffect(() => {
    if (!editorRequest) return
    if (useProjectState.getState().session.editingClipId) workspace.show("clip")
    else workspace.close("clip")
  }, [editorRequest, workspace])

  return {
    workspace,
    toggleBrowser: workspace.toggleBrowser,
  }
}
