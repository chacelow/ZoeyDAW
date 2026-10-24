import { LogicalPosition } from "@tauri-apps/api/dpi"
import { getCurrentWindow } from "@tauri-apps/api/window"

export function hasNativeCursor(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export function moveWindowCursor(clientX: number, clientY: number): void | Promise<void> {
  if (!hasNativeCursor()) {
    return
  }
  let owner: Window = window
  let x = clientX
  let y = clientY
  while (owner !== owner.parent) {
    const frame = owner.frameElement
    if (!frame) break
    const bounds = frame.getBoundingClientRect()
    const width = frame.clientWidth + frame.clientLeft * 2
    const height = frame.clientHeight + frame.clientTop * 2
    const scaleX = width ? bounds.width / width : 1
    const scaleY = height ? bounds.height / height : 1
    x = bounds.left + (frame.clientLeft + x) * scaleX
    y = bounds.top + (frame.clientTop + y) * scaleY
    owner = owner.parent
  }
  return getCurrentWindow().setCursorPosition(new LogicalPosition(x, y))
}
