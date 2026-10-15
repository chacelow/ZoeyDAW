/**
 * Close-request policy for a single project window.
 *
 * - clean project: the native close proceeds.
 * - dirty project: veto, then ask (save / discard / cancel).
 * - after a successful save or discard the decision is armed: the caller closes through the
 *   native closeWindow port, outside the synchronous should-close callback.
 */
export type UnsavedClosePhase = "idle" | "asking" | "armed"

export type UnsavedCloseChoice = "save" | "discard" | "cancel"

export interface UnsavedCloseState {
  readonly phase: UnsavedClosePhase
}

export const IDLE_CLOSE: UnsavedCloseState = { phase: "idle" }

/** Synchronous answer to the native should-close query plus the next state. */
export function requestClose(
  state: UnsavedCloseState,
  dirty: boolean
): { readonly allow: boolean; readonly next: UnsavedCloseState } {
  if (state.phase === "armed" || !dirty) return { allow: true, next: IDLE_CLOSE }
  return { allow: false, next: { phase: "asking" } }
}

/**
 * Applies the dialog choice. `saved` reports whether a requested save succeeded; a failed
 * save keeps the window open and returns to idle.
 */
export function chooseClose(
  state: UnsavedCloseState,
  choice: UnsavedCloseChoice,
  saved: boolean
): UnsavedCloseState {
  if (state.phase !== "asking") return state
  if (choice === "cancel" || (choice === "save" && !saved)) return IDLE_CLOSE
  return { phase: "armed" }
}
