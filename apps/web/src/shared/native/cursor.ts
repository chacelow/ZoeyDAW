import { LogicalPosition } from "@tauri-apps/api/dpi"
import { getCurrentWindow } from "@tauri-apps/api/window"

export function hasNativeCursor(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export function moveWindowCursor(clientX: number, clientY: number): void | Promise<void> {
  if (!hasNativeCursor()) return
  return getCurrentWindow().setCursorPosition(new LogicalPosition(clientX, clientY))
}
