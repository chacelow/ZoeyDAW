/**
 * Panel chrome state for the single project view. It is view state, not project data:
 * nothing here enters the document, history or snapshots.
 *
 * The footer hosts one of two mutually exclusive views (Affect Chain / Clip Edit), following
 * the footer section's contract; StatusStrip consumes the same `footer` state.
 */
export type SectionId = "browser" | "arrangement" | "footer"
export type FooterView = "devices" | "clip"

export interface ProjectShellState {
  readonly activeSection: SectionId
  readonly footerView: FooterView
  readonly footerCollapsed: boolean
}

export const INITIAL_PROJECT_SHELL: ProjectShellState = {
  activeSection: "arrangement",
  footerView: "devices",
  footerCollapsed: false,
}

export type ProjectShellAction =
  | { readonly type: "activate"; readonly section: SectionId }
  | { readonly type: "toggle-footer" }
  | { readonly type: "set-footer-collapsed"; readonly collapsed: boolean }
  | { readonly type: "select-footer-view"; readonly view: FooterView }
  /** Explicit Open/close Clip View request from the project session (`clipEditorRequest`). */
  | { readonly type: "clip-editor-request"; readonly editing: boolean }

export function reduceProjectShell(
  state: ProjectShellState,
  action: ProjectShellAction
): ProjectShellState {
  switch (action.type) {
    case "activate":
      return state.activeSection === action.section
        ? state
        : { ...state, activeSection: action.section }
    case "toggle-footer":
      return { ...state, footerCollapsed: !state.footerCollapsed }
    case "set-footer-collapsed":
      return state.footerCollapsed === action.collapsed
        ? state
        : { ...state, footerCollapsed: action.collapsed }
    case "select-footer-view":
      return { ...state, footerView: action.view, footerCollapsed: false }
    case "clip-editor-request":
      if (action.editing) return { ...state, footerView: "clip", footerCollapsed: false }
      return state.footerView === "clip" ? { ...state, footerCollapsed: true } : state
  }
}
