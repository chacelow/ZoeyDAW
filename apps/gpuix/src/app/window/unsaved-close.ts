export type UnsavedClosePhase = "idle" | "asking" | "armed"

export type UnsavedCloseChoice = "save" | "discard" | "cancel"

export interface UnsavedCloseState {
  readonly phase: UnsavedClosePhase
}

export const IDLE_CLOSE: UnsavedCloseState = { phase: "idle" }

export function requestClose(
  state: UnsavedCloseState,
  dirty: boolean
): { readonly allow: boolean; readonly next: UnsavedCloseState } {
  if (state.phase === "armed" || !dirty) return { allow: true, next: IDLE_CLOSE }
  return { allow: false, next: { phase: "asking" } }
}

export function chooseClose(
  state: UnsavedCloseState,
  choice: UnsavedCloseChoice,
  saved: boolean
): UnsavedCloseState {
  if (state.phase !== "asking") return state
  if (choice === "cancel" || (choice === "save" && !saved)) return IDLE_CLOSE
  return { phase: "armed" }
}
