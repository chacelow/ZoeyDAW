# platform/window

组合根把同一个 gpuix renderer 传给 `createWindowPlatform(renderer)` 和 `createWindowCloseGuard(renderer, options)`。本目录不 import `@gpuix/*`。`WindowRenderer` 是结构端口，`renderer-conformance.test.ts` 在编译期核对它与真实 `NativeRenderer` 一致。

## 原生值订阅

`subscribeApplicationActive(listener)` 和 `subscribeSystemAppearance(listener)` 共用 `createNativeValueSubscription`：

- 首个订阅注册**一个**原生 observer，最后一个取消时传 `null` 释放它。
- 原生第一条值只建立基线，不通知监听者；之后只在值变化时通知，经 microtask 投递，不在原生回调里执行。
- 已取消的订阅、以及重新订阅后旧 session 排队的回调都不会再触达监听者。
- renderer 缺少对应方法时，订阅直接抛错，不退回轮询。

`subscribeSystemAppearance` 回报 `"light" | "dark"`，GPUI 的 Vibrant 变体在 Rust 侧已归并。订阅只通知变化，首帧主题要用同步的 `getSystemAppearance()` 取当前值。两者读的都是窗口的有效外观，前提是没有人通过 GPUI `set_window_appearance` 覆盖应用外观，原因见 LESSONS。已知限制(推断，未实测)：开启「增强对比度」后的深色外观名不在 GPUI 的识别表里，会被当作 `"light"`。主题模式 `"system"` 用这两个接口，`"light"`、`"dark"` 不需要订阅。模式持久化在 `platform/settings` 的 `themeMode`，与配色预设 `themePreset` 互相独立。

`getReducedMotion()` / `subscribeReducedMotion(listener)` 读取系统「减少动态效果」，由 `@zoeydaw/native` 提供：Rust 读 `NSWorkspace.accessibilityDisplayShouldReduceMotion`，并监听 `NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification`。它们不依赖 renderer，整个进程只有一个 observer。约定同上：首帧用 getter 取值，订阅只通知变化。GPUI 自带的 `App::reduce_motion` 不从系统读取，不要拿它当来源。只有 macOS 实现，其它平台两个接口都会抛错。

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

- `shouldClose` 在 macOS 上由 AppKit 同步调用，触发来源是关闭按钮和 ⌘W。它必须同步返回，返回 `false` 表示否决。
- `guard.close()` 调用 renderer 的 `closeWindow()`，**不**经过 `shouldClose`，因为用户已经在对话框里做过选择。它关闭窗口之后，最后一个窗口关闭即退出(`QuitMode::LastWindowClosed`，`tick()` 返回 false)。
- 在 `shouldClose` 内部同步调用 `close()` 会重入 GPUI，在 AppKit 回调里 panic，可能直接 abort 进程。守卫会抛错拦住这种调用。对话框必须在 `shouldClose` 返回之后再做选择。
- `supported` 只表示关闭按钮和 ⌘W 能否被否决。目前只有 macOS 为 true，Windows、Linux 的 renderer 没有 `setWindowShouldClose`。`close()` 只依赖 `closeWindow()`，三个平台都可用。renderer 连 `closeWindow` 都没有时，`close()` 会抛错，不会静默不关。
- `actionAfterGuard` / `closeButtonAction` 仍负责根据 `closeBehavior` 决定是问、隐藏到托盘还是直接退出。

外观和关闭的真实窗口验证记录在 `docs/research/gpuix-main-build.md` 的 H1 一节。
