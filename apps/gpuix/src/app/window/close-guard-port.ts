/**
 * TEMPORARY: local stand-in for H1's `platform/window` close guard, signature-identical to
 * `createWindowCloseGuard(renderer, { shouldClose })` there. Delete this file and import from
 * `@/platform/window` once H1 merges. It differs only in `close()`: the renderer has no
 * programmatic `closeWindow()` before H1, so a `close()` without one throws and callers ask
 * the user to press close again (the next request is allowed by `shouldClose`).
 */
export interface CloseGuardRenderer {
  /** macOS: asked synchronously on the AppKit thread for the close button and ⌘W. */
  setWindowShouldClose?(callback: () => boolean): void
  /** Closes without asking `setWindowShouldClose`; the last window closing quits. */
  closeWindow?(): void
}

export interface WindowCloseGuardOptions {
  /**
   * Return true to let the close proceed. To ask the user first, return false, open
   * the dialog, and call `close()` once they choose; never call `close()` from here.
   */
  readonly shouldClose: () => boolean
}

export interface WindowCloseGuard {
  readonly supported: boolean
  /** Close the window after the user decided; does not consult `shouldClose`. */
  close(): void
}

/**
 * The vendored renderer's `NativeRenderer` type predates the close-guard patch, so the live
 * object is checked at runtime instead of widened with a cast.
 */
export function supportsCloseGuard(renderer: object): renderer is CloseGuardRenderer {
  return typeof Reflect.get(renderer, "setWindowShouldClose") === "function"
}

export function createWindowCloseGuard(
  renderer: CloseGuardRenderer,
  { shouldClose }: WindowCloseGuardOptions
): WindowCloseGuard {
  const register = renderer.setWindowShouldClose?.bind(renderer)
  const closeWindow = renderer.closeWindow?.bind(renderer)
  if (!register) {
    return {
      supported: false,
      close() {
        throw new Error("Renderer does not support guarded window close")
      },
    }
  }
  let isDeciding = false
  register(() => {
    isDeciding = true
    try {
      return shouldClose()
    } finally {
      isDeciding = false
    }
  })
  return {
    supported: true,
    close() {
      // AppKit holds GPUI while asking; closing from inside would re-enter it.
      if (isDeciding) throw new Error("close() must run after shouldClose returns")
      if (!closeWindow) throw new Error("Renderer cannot close the window programmatically")
      closeWindow()
    },
  }
}
