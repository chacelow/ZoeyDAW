import { useCallback, useLayoutEffect, useReducer, useRef } from "react"
import { flushSync } from "@gpuix/react"
import { useProjectState } from "@/project/adapters"
import { INITIAL_PROJECT_SHELL, reduceProjectShell } from "./project-shell"
import type { PanelImperativeHandle } from "@/ui/panels"
import type { FooterView, ProjectShellAction, ProjectShellState, SectionId } from "./project-shell"

export interface ProjectShellApi extends ProjectShellState {
  readonly browserHandleRef: React.RefObject<PanelImperativeHandle | null>
  readonly clipHandleRef: React.RefObject<PanelImperativeHandle | null>
  readonly setActiveSection: (section: SectionId) => void
  readonly toggleBrowser: () => void
  readonly toggleFooter: () => void
  readonly setFooterCollapsed: (collapsed: boolean) => void
  readonly selectFooterView: (view: FooterView) => void
  readonly reportClipCollapsed: (collapsed: boolean) => void
}

/**
 * Clip panel commands drive its imperative handle once; resize reports only publish accepted
 * geometry. Feeding reports back into another imperative layout effect creates a collapse loop.
 */
export function useProjectShell(): ProjectShellApi {
  const [state, dispatch] = useReducer(reduceProjectShell, INITIAL_PROJECT_SHELL)
  const currentState = useRef(state)
  currentState.current = state
  const browserHandleRef = useRef<PanelImperativeHandle | null>(null)
  const clipHandleRef = useRef<PanelImperativeHandle | null>(null)
  const command = useCallback((action: ProjectShellAction) => {
    flushSync(() => {
      const next = reduceProjectShell(currentState.current, action)
      const handle = clipHandleRef.current
      if (next.footerView === "clip" && handle) {
        if (next.footerCollapsed) handle.collapse()
        else handle.expand()
      }
      dispatch(action)
    })
  }, [])
  const editorRequest = useProjectState(current => current.session.clipEditorRequest)
  const editingClipId = useProjectState(current => current.session.editingClipId)

  // Only an explicit request opens or closes Clip Edit; selecting a Clip does not, so the
  // editing id is read at request time rather than tracked. The request counter seen at
  // mount belongs to whatever ran before this view (e.g. the previous project), so it is
  // the baseline, not a request.
  const editing = useRef(editingClipId)
  editing.current = editingClipId
  const handledRequest = useRef(editorRequest)
  useLayoutEffect(() => {
    if (editorRequest === handledRequest.current) return
    handledRequest.current = editorRequest
    if (editorRequest === 0) return
    const open = editing.current !== null
    const handle = clipHandleRef.current
    if (handle) {
      if (open) handle.expand()
      else handle.collapse()
    }
    dispatch({ type: "clip-editor-request", editing: open })
  }, [editorRequest])

  return {
    ...state,
    browserHandleRef,
    clipHandleRef,
    setActiveSection: useCallback(section => dispatch({ type: "activate", section }), []),
    toggleBrowser: useCallback(() => {
      const handle = browserHandleRef.current
      if (handle?.isCollapsed()) handle.expand()
      else handle?.collapse()
    }, []),
    toggleFooter: useCallback(() => command({ type: "toggle-footer" }), [command]),
    setFooterCollapsed: useCallback(
      collapsed => command({ type: "set-footer-collapsed", collapsed }),
      [command]
    ),
    selectFooterView: useCallback(view => command({ type: "select-footer-view", view }), [command]),
    reportClipCollapsed: useCallback(
      collapsed => dispatch({ type: "set-footer-collapsed", collapsed }),
      []
    ),
  }
}
