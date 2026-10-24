/**
 * 主窗口关闭按钮的用户偏好.
 *
 *   ask   —— 每次弹出选择对话框 (默认)
 *   tray  —— 静默隐藏到系统托盘, 由 Rust 侧托盘图标恢复
 *   quit  —— 直接退出应用
 *
 * 持久化直接走 window.localStorage，key = CLOSE_BEHAVIOR_KEY，无额外 shim。
 */
export type CloseBehavior = "ask" | "tray" | "quit"

export const CLOSE_BEHAVIOR_KEY = "window-close-behavior"
export const DEFAULT_CLOSE_BEHAVIOR: CloseBehavior = "ask"

const VALUES: readonly CloseBehavior[] = ["ask", "tray", "quit"]

export function getCloseBehavior(): CloseBehavior {
  try {
    if (typeof window === "undefined") return DEFAULT_CLOSE_BEHAVIOR
    const raw = window.localStorage.getItem(CLOSE_BEHAVIOR_KEY)
    return VALUES.find(value => value === raw) ?? DEFAULT_CLOSE_BEHAVIOR
  } catch {
    return DEFAULT_CLOSE_BEHAVIOR
  }
}

export function setCloseBehavior(behavior: CloseBehavior): boolean {
  try {
    window.localStorage.setItem(CLOSE_BEHAVIOR_KEY, behavior)
    return true
  } catch {
    return false
  }
}

export type CloseButtonAction = "allow-close" | "hide-to-tray" | "ask"

export function closeButtonAction(behavior: CloseBehavior): CloseButtonAction {
  if (behavior === "quit") {
    return "allow-close"
  }
  return behavior === "tray" ? "hide-to-tray" : "ask"
}

export function actionAfterGuard(
  intent: "close-button" | "explicit-exit",
  behavior: CloseBehavior
) {
  return intent === "explicit-exit" ? "exit-process" : closeButtonAction(behavior)
}
