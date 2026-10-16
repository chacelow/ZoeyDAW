import type { ScreenPoint } from "@zoeydaw/native"
import { cursorHide, cursorPosition, cursorRestore, windowPointToScreen } from "@zoeydaw/native"

interface CursorRenderer {
  hideCursorForDrag(): void
  restoreCursorAfterDrag(x: number, y: number): void
}

function isCursorRenderer(value: unknown): value is CursorRenderer {
  return (
    typeof value === "object" &&
    value !== null &&
    "hideCursorForDrag" in value &&
    typeof value.hideCursorForDrag === "function" &&
    "restoreCursorAfterDrag" in value &&
    typeof value.restoreCursorAfterDrag === "function"
  )
}

/** Event anchors are macOS screen points or Windows virtual-desktop physical pixels. */
export function createNativeCursorLock(renderer: unknown) {
  if (process.platform === "win32") {
    return {
      capture: windowPointToScreen,
      hide: (): void => {
        if (!isCursorRenderer(renderer))
          throw new Error("Renderer does not support Windows cursor dragging")
        renderer.hideCursorForDrag()
      },
      restore: (point: ScreenPoint): void => {
        if (!isCursorRenderer(renderer))
          throw new Error("Renderer does not support Windows cursor dragging")
        renderer.restoreCursorAfterDrag(point.x, point.y)
      },
    }
  }
  return {
    capture: windowPointToScreen,
    hide: (): void => {
      cursorHide()
    },
    restore: (point: ScreenPoint): void => {
      cursorRestore(point)
    },
  }
}

/** Live OS cursor position; for read-back verification only, never a drag anchor. */
export const currentCursorPosition: () => ScreenPoint | null = cursorPosition
