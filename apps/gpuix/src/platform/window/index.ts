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

/** `@gpuix/native` 的 renderer 在结构上满足它;各方法在旧版本里可能缺失,所以都是可选。 */
export interface WindowRenderer {
  setWindowTitle?(title: string): void
  minimizeWindow?(): void
  zoomWindow?(): void
  toggleFullscreen?(): void
  activateWindow?(): void
  promptForPaths?(options?: PathPromptOptions): Promise<string[] | null>
}
export { actionAfterGuard, closeButtonAction, DEFAULT_CLOSE_BEHAVIOR } from "./close-behavior"
export type { CloseBehavior, CloseButtonAction } from "./close-behavior"

export interface WindowCloseGuard {
  readonly supported: boolean
}

export function createWindowCloseGuard(): WindowCloseGuard {
  return { supported: false }
}

export function createWindowPlatform(renderer: WindowRenderer) {
  return {
    setTitle: (title: string) => renderer.setWindowTitle?.(title),
    minimize: () => renderer.minimizeWindow?.(),
    zoom: () => renderer.zoomWindow?.(),
    toggleFullscreen: () => renderer.toggleFullscreen?.(),
    activate: () => renderer.activateWindow?.(),
    promptForPaths: (options?: PathPromptOptions) => renderer.promptForPaths?.(options),
  }
}
