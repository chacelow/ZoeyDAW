export interface CloseGuardRenderer {
  setWindowShouldClose?(callback: () => boolean): void
  closeWindow?(): void
}

export interface WindowCloseGuardOptions {
  readonly shouldClose: () => boolean
}

export interface WindowCloseGuard {
  readonly supported: boolean
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
      if (deciding) throw new Error("close() must run after shouldClose returns")
      closeWindow()
    },
  }
}
