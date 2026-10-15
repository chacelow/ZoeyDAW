# platform/window

组合根把同一个 gpuix renderer 传给 `createWindowPlatform(renderer)` 和 `createWindowCloseGuard(renderer, options)`。本目录不 import `@gpuix/*`。`WindowRenderer` 是结构端口，`renderer-conformance.test.ts` 在编译期核对它与真实 `NativeRenderer` 一致。

## 原生值订阅

`subscribeApplicationActive(listener)` 和 `subscribeSystemAppearance(listener)` 共用 `createNativeValueSubscription`：

- 首个订阅注册**一个**原生 observer，最后一个取消时传 `null` 释放它。
- 原生第一条值只建立基线，不通知监听者；之后只在值变化时通知，经 microtask 投递，不在原生回调里执行。
- 已取消的订阅、以及重新订阅后旧 session 排队的回调都不会再触达监听者。
- renderer 缺少对应方法时，订阅直接抛错，不退回轮询。

`subscribeSystemAppearance` 回报 `"light" | "dark"`，GPUI 的 Vibrant 变体在 Rust 侧已归并。它读的是窗口的有效外观，前提是没有人通过 GPUI `set_window_appearance` 覆盖应用外观，原因见 LESSONS。主题模式 `"system"` 用它，`"light"`、`"dark"` 不需要订阅。模式持久化在 `platform/settings` 的 `themeMode`，与配色预设 `themePreset` 互相独立。

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
- 在 `shouldClose` 内部同步调用 `close()` 会重入 GPUI，守卫会直接抛错。对话框必须在 `shouldClose` 返回之后再做选择。
- renderer 不支持时 `supported === false`，此时调用 `close()` 抛错，不会静默不关。
- `actionAfterGuard` / `closeButtonAction` 仍负责根据 `closeBehavior` 决定是问、隐藏到托盘还是直接退出。

从仓库根运行 `bun --hot scripts/gpuix-main/probe.mjs` 可以看激活事件。外观和关闭的真实窗口验证记录在 `docs/research/gpuix-main-build.md` 的 H1 一节。
