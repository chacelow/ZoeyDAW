import type { CloseGuardRenderer } from "./close-guard"
import { createNativeValueSubscription } from "./native-value-subscription"
import type { NativeObserverRegistration } from "./native-value-subscription"

/**
 * 窗口平台端口。这里**自己声明**需要的最小能力(结构类型),不 import `@gpuix/native`:
 * platform 层不依赖渲染器包(`architecture/gpuix-layers` 规则会拦),换渲染器只需让新的
 * 渲染器满足这个形状,应用组合根把真实的 renderer 传进来即可。
 */
export interface PathPromptOptions {
  readonly files?: boolean
  readonly directories?: boolean
  readonly multiple?: boolean
  readonly prompt?: string
}

/** GPUI 的四种外观在 Rust 侧归并为二态(Vibrant* 并入 light/dark)。 */
export type SystemAppearance = "light" | "dark"

/** `@gpuix/native` 的 renderer 在结构上满足它;各方法在旧版本里可能缺失,所以都是可选。 */
export interface WindowRenderer extends CloseGuardRenderer {
  onWindowActiveChange?: NativeObserverRegistration<boolean>
  onWindowAppearanceChange?: NativeObserverRegistration<SystemAppearance>
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

export function createWindowPlatform(renderer: WindowRenderer) {
  return {
    subscribeApplicationActive: createNativeValueSubscription(
      renderer.onWindowActiveChange?.bind(renderer),
      "window activation events"
    ),
    /**
     * 窗口的有效外观。它跟随系统,前提是没有人调用 GPUI 的 `set_window_appearance`
     * 覆盖应用外观(见 LESSONS),否则「跟随系统」会读到被覆盖的值。
     */
    subscribeSystemAppearance: createNativeValueSubscription(
      renderer.onWindowAppearanceChange?.bind(renderer),
      "window appearance events"
    ),
    setTitle: (title: string) => renderer.setWindowTitle?.(title),
    minimize: () => renderer.minimizeWindow?.(),
    zoom: () => renderer.zoomWindow?.(),
    toggleFullscreen: () => renderer.toggleFullscreen?.(),
    activate: () => renderer.activateWindow?.(),
    promptForPaths: (options?: PathPromptOptions) => renderer.promptForPaths?.(options),
  }
}
