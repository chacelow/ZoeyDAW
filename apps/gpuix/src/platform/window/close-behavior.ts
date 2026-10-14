export type CloseBehavior = "ask" | "tray" | "quit"
export const DEFAULT_CLOSE_BEHAVIOR: CloseBehavior = "ask"
export type CloseButtonAction = "allow-close" | "hide-to-tray" | "ask"

export function closeButtonAction(behavior: CloseBehavior): CloseButtonAction {
  if (behavior === "quit") return "allow-close"
  return behavior === "tray" ? "hide-to-tray" : "ask"
}

export function actionAfterGuard(
  intent: "close-button" | "explicit-exit",
  behavior: CloseBehavior
) {
  return intent === "explicit-exit" ? "exit-process" : closeButtonAction(behavior)
}
