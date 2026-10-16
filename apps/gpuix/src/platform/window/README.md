# platform/window

组合根把同一个 gpuix renderer 传给 `createWindowPlatform(renderer)` 和 `createWindowCloseGuard(renderer, options)`。本目录不 import `@gpuix/*`。`WindowRenderer` 是结构端口，`renderer-conformance.test.ts` 在编译期核对它与真实 `NativeRenderer` 一致。

## 原生值订阅

`subscribeApplicationActive(listener)` 和 `subscribeSystemAppearance(listener)` 共用 `createNativeValueSubscription`：

- 首个订阅注册**一个**原生 observer，最后一个取消时传 `null` 释放它。
- 原生第一条值只建立基线，不通知监听者；之后只在值变化时通知，经 microtask 投递，不在原生回调里执行。
- 已取消的订阅、以及重新订阅后旧 session 排队的回调都不会再触达监听者。
- renderer 缺少对应方法时，订阅直接抛错，不退回轮询。

`subscribeSystemAppearance` 回报 `"light" | "dark"`，GPUI 的 Vibrant 变体在 Rust 侧已归并。订阅只通知变化，首帧主题要用同步的 `getSystemAppearance()` 取当前值。两者读的都是窗口的有效外观，前提是没有人通过 GPUI `set_window_appearance` 覆盖应用外观，原因见 LESSONS。已知限制(推断，未实测)：开启「增强对比度」后的深色外观名不在 GPUI 的识别表里，会被当作 `"light"`。主题模式 `"system"` 用这两个接口，`"light"`、`"dark"` 不需要订阅。模式持久化在 `platform/settings` 的 `themeMode`，与配色预设 `themePreset` 互相独立。

`getReducedMotion()` / `subscribeReducedMotion(listener)` 读取系统「减少动态效果」，由 `@zoeydaw/native` 提供。macOS 保持 `NSWorkspace.accessibilityDisplayShouldReduceMotion` 与 `NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification`。Windows 取反 `SPI_GETCLIENTAREAANIMATION`，独立消息线程的隐藏顶层 HWND 接收 `WM_SETTINGCHANGE`，不依赖 JS timer；注册替换、移除及所属 Env cleanup 会停止线程并 join，销毁 HWND/注销 window class。它们不依赖 renderer，整个进程只有一个 observer。约定同上：首帧用 getter 取值，订阅只通知变化。GPUI 自带的 `App::reduce_motion` 不从系统读取，不要拿它当来源。Windows 实际设置切换广播尚未经过实机验收；macOS 断言不放宽，其它平台接口仍抛错。

## 标题栏双击

`titlebarDoubleClick()` 调用同一 renderer 的原生系统动作，缺少对应能力时抛错，不退回 `zoom()` 或 JS 偏好读取。macOS/Linux/FreeBSD 的 `NativeRoot` 将该命令经 `AppShell` 注入 `TitleBar`。Windows 不注入该回调，由原生 caption 处理双击，避免 JS 与系统各切换一次；不拥有原生窗口的离屏 shell 也可以省略回调。

macOS 由 GPUI 读取 `NSGlobalDomain/AppleActionOnDoubleClick`，尊重窗口的 resizable/minimizable 能力。`None` 不执行，`Minimize` 最小化，`Maximize` 或缺省缩放。固定版本 GPUI 因缺少公开 Fill API，将 `Fill` 降级为缩放，不声称实现完整的原生填充；双击标题栏不是进入全屏。Linux/FreeBSD 的自绘标题栏经既有 UI command 执行 zoom。Windows 的显式 `titlebarDoubleClick()` 命令仍可执行 maximize，但不是标题栏手势的入口。

`window-control-area.patch` 将 `Style.windowControlArea: "drag"` 接到 GPUI `WindowControlArea::Drag`。`TitleBar` 标记这个原生拖动区；居中标题用 `pointerEvents: "none"`，设置按钮用 `pointerEvents: "auto"`。GPUI 命中遍历遇到按钮的 BlockMouse 就停止，父拖动 hitbox 不在命中集合内，因此 Windows 在按钮上返回 HTCLIENT，在空白区返回 HTCAPTION。原生 resize border 保持 GPUI 的既有处理。

只有注入双击动作时，`TitleBar` 才注册 mouse-down handler，并只接受左键且 `clickCount === 2`。它不自行计时、捕获鼠标或模拟拖窗。鼠标 payload 没有键盘事件的 `stopPropagation()` 包装，不能拿后者控制鼠标传播。

## 关闭守卫

```ts
const guard = createWindowCloseGuard(renderer, {
  shouldClose: () => {
    if (!project.dirty) return true
    queueMicrotask(() => openUnsavedDialog()) // 用户选择后调用 guard.close()
    return false
  },
})
```

- `shouldClose` 在 macOS 上由 AppKit 同步调用，触发来源是关闭按钮和 ⌘W。它必须同步返回，返回 `false` 表示否决。Windows 原生关闭先 veto，独立 UI 线程非阻塞投递 JS predicate，只有当前 generation/token 的 true 确认才能关闭，重复请求合并；UI 线程不会等待 JS。
- `guard.close()` 调用 renderer 的 `closeWindow()`，**不**经过 `shouldClose`，因为用户已经在对话框里做过选择。它关闭窗口之后，最后一个窗口关闭即退出(`QuitMode::LastWindowClosed`，`tick()` 返回 false)。
- 在 `shouldClose` 内部同步调用 `close()` 会重入 GPUI，在 AppKit 回调里 panic，可能直接 abort 进程。守卫会抛错拦住这种调用。对话框必须在 `shouldClose` 返回之后再做选择。
- `supported` 表示 renderer 是否提供可否决关闭的 `setWindowShouldClose`；macOS 和 Windows 源码已提供，Windows 桌面流程仍待实机验证。`close()` 依赖 `closeWindow()`，是用户确认后的 bypass。renderer 连 `closeWindow` 都没有时，`close()` 会抛错，不会静默不关。
- `actionAfterGuard` / `closeButtonAction` 仍负责根据 `closeBehavior` 决定是问、隐藏到托盘还是直接退出。
