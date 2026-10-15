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
  /** Whether the close button and ⌘W consult `shouldClose`; only macOS today. */
  readonly supported: boolean
  /** Close the window after the user decided; does not consult `shouldClose`. */
  close(): void
}

export function createWindowCloseGuard(
  renderer: CloseGuardRenderer,
  { shouldClose }: WindowCloseGuardOptions
): WindowCloseGuard {
  const register = renderer.setWindowShouldClose?.bind(renderer)
  const closeWindow = renderer.closeWindow?.bind(renderer)
  let deciding = false
  register?.(() => {
    deciding = true
    try {
      return shouldClose()
    } finally {
      deciding = false
    }
  })
  return {
    supported: register !== undefined,
    close() {
      if (!closeWindow) throw new Error("Renderer does not support closeWindow")
      // AppKit holds GPUI while asking; closing from inside would re-enter it.
      if (deciding) throw new Error("close() must run after shouldClose returns")
      closeWindow()
    },
  }
}
