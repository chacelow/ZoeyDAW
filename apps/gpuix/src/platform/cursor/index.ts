import { cursorHide, cursorPosition, cursorRestore } from "@zoeydaw/native"

/**
 * Native cursor lock for drag controls; structurally the `CursorLockPort` that
 * `ui/controls` accepts through `ControlEnvironmentProvider`.
 */
export const nativeCursorLock = {
  capture: cursorPosition,
  hide: (): void => {
    cursorHide()
  },
  restore: (point: { readonly x: number; readonly y: number }): void => {
    cursorRestore(point)
  },
}
