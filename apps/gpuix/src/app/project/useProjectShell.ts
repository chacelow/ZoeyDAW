import { useCallback, useLayoutEffect, useReducer, useRef } from "react"
import { useProjectState } from "@/project/adapters"
import { INITIAL_PROJECT_SHELL, reduceProjectShell } from "./project-shell"
import type { PanelImperativeHandle } from "@/ui/panels"
import type { FooterView, ProjectShellState, SectionId } from "./project-shell"

export interface ProjectShellApi extends ProjectShellState {
  readonly browserHandleRef: React.RefObject<PanelImperativeHandle | null>
  readonly clipHandleRef: React.RefObject<PanelImperativeHandle | null>
  readonly setActiveSection: (section: SectionId) => void
  readonly toggleBrowser: () => void
  readonly toggleFooter: () => void
  readonly setFooterCollapsed: (collapsed: boolean) => void
  readonly selectFooterView: (view: FooterView) => void
}

/**
 * Owns the project view's panel chrome. Clip Edit lives in a resizable Panel, so its
 * collapse is driven through the panel handle and reported back by `onResize`; Affect Chain
 * collapse is the footer's own two-state divider and only needs the state.
 */
export function useProjectShell(): ProjectShellApi {
  const [state, dispatch] = useReducer(reduceProjectShell, INITIAL_PROJECT_SHELL)
  const browserHandleRef = useRef<PanelImperativeHandle | null>(null)
  const clipHandleRef = useRef<PanelImperativeHandle | null>(null)
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
    dispatch({ type: "clip-editor-request", editing: editing.current !== null })
  }, [editorRequest])

  const clipPanel = state.footerView === "clip"
  useLayoutEffect(() => {
    const handle = clipHandleRef.current
    if (!clipPanel || !handle) return
    if (state.footerCollapsed && !handle.isCollapsed()) handle.collapse()
    else if (!state.footerCollapsed && handle.isCollapsed()) handle.expand()
  }, [clipPanel, state.footerCollapsed])

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
    toggleFooter: useCallback(() => dispatch({ type: "toggle-footer" }), []),
    setFooterCollapsed: useCallback(
      collapsed => dispatch({ type: "set-footer-collapsed", collapsed }),
      []
    ),
    selectFooterView: useCallback(view => dispatch({ type: "select-footer-view", view }), []),
  }
}
