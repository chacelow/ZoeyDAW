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

export const currentCursorPosition: () => ScreenPoint | null = cursorPosition
