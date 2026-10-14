import type { PathPromptOptions } from "@gpuix/native"
import type { NativeRenderer } from "@gpuix/native/host"
export { actionAfterGuard, closeButtonAction, DEFAULT_CLOSE_BEHAVIOR } from "./close-behavior"
export type { CloseBehavior, CloseButtonAction } from "./close-behavior"

export interface WindowCloseGuard {
  readonly supported: boolean
}

export function createWindowCloseGuard(): WindowCloseGuard {
  return { supported: false }
}

export function createWindowPlatform(renderer: NativeRenderer) {
  return {
    setTitle: (title: string) => renderer.setWindowTitle?.(title),
    minimize: () => renderer.minimizeWindow?.(),
    zoom: () => renderer.zoomWindow?.(),
    toggleFullscreen: () => renderer.toggleFullscreen?.(),
    activate: () => renderer.activateWindow?.(),
    promptForPaths: (options?: PathPromptOptions) => renderer.promptForPaths?.(options),
  }
}
