import type { CloseGuardRenderer } from "./close-guard"
import { createNativeValueSubscription } from "./native-value-subscription"
import type { NativeObserverRegistration } from "./native-value-subscription"

export interface PathPromptOptions {
  readonly files?: boolean
  readonly directories?: boolean
  readonly multiple?: boolean
  readonly prompt?: string
}

export type SystemAppearance = "light" | "dark"

export interface WindowRenderer extends CloseGuardRenderer {
  onWindowActiveChange?: NativeObserverRegistration<boolean>
  onWindowAppearanceChange?: NativeObserverRegistration<SystemAppearance>
  getWindowAppearance?(): SystemAppearance
  setWindowTitle?(title: string): void
  minimizeWindow?(): void
  zoomWindow?(): void
  toggleFullscreen?(): void
  activateWindow?(): void
  promptForPaths?(options?: PathPromptOptions): Promise<string[] | null>
}
export { actionAfterGuard, closeButtonAction, DEFAULT_CLOSE_BEHAVIOR } from "./close-behavior"
export type { CloseBehavior, CloseButtonAction } from "./close-behavior"
export { createWindowCloseGuard } from "./close-guard"
export type { WindowCloseGuard, WindowCloseGuardOptions } from "./close-guard"
export { getReducedMotion, subscribeReducedMotion } from "./reduced-motion"
export { LAUNCH_FOCUS } from "./launch"

export function createWindowPlatform(renderer: WindowRenderer) {
  return {
    subscribeApplicationActive: createNativeValueSubscription(
      renderer.onWindowActiveChange?.bind(renderer),
      "window activation events"
    ),
    subscribeSystemAppearance: createNativeValueSubscription(
      renderer.onWindowAppearanceChange?.bind(renderer),
      "window appearance events"
    ),
    getSystemAppearance(): SystemAppearance {
      if (!renderer.getWindowAppearance) {
        throw new Error("Renderer does not support window appearance queries")
      }
      return renderer.getWindowAppearance()
    },
    setTitle: (title: string) => renderer.setWindowTitle?.(title),
    minimize: () => renderer.minimizeWindow?.(),
    zoom: () => renderer.zoomWindow?.(),
    toggleFullscreen: () => renderer.toggleFullscreen?.(),
    activate: () => renderer.activateWindow?.(),
    promptForPaths: (options?: PathPromptOptions) => renderer.promptForPaths?.(options),
  }
}
