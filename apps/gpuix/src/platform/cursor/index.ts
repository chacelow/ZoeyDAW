import type { ScreenPoint } from "@zoeydaw/native"
import { cursorHide, cursorPosition, cursorRestore, windowPointToScreen } from "@zoeydaw/native"

/**
 * Native cursor lock for drag controls; structurally the `CursorLockPort` that
 * `ui/controls` accepts through `ControlEnvironmentProvider`. The anchor is the
 * press event's own window position converted to screen points, so OS moves
 * processed before JS handles mouseDown cannot shift it.
 */
export const nativeCursorLock = {
  capture: windowPointToScreen,
  hide: (): void => {
    cursorHide()
  },
  restore: (point: ScreenPoint): void => {
    cursorRestore(point)
  },
}

/** Live OS cursor position; for read-back verification only, never a drag anchor. */
export const currentCursorPosition: () => ScreenPoint | null = cursorPosition
