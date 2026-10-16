# T2：双击标题栏执行系统动作（缩放/全屏/最小化）

## 用户要求（2026-10-16）

双击标题栏没有反应。要求按 macOS 通用行为：双击透明标题栏的空白处执行系统设置里的动作（「系统设置 → 桌面与程序坞 → 双击窗口标题栏时」：缩放 / 填充 / 最小化 / 不执行）。

## 已查证

- 我们用透明标题栏（`titlebar_transparent`），自己画的 `apps/gpuix/src/app/shell/TitleBar.tsx`，原生拖动保留，但没有任何双击处理。
- GPUI 已有正确实现：`zed/crates/gpui/src/window.rs:6320` `Window::titlebar_double_click()` → `gpui_macos/src/window.rs:1983` 读 `NSGlobalDomain/AppleActionOnDoubleClick`（None/Minimize/Maximize/Fill，缺省为缩放）并在 `is_resizable/is_minimizable` 前提下执行。Zed 自己在 `zed/crates/platform_title_bar/src/platform_title_bar.rs:224-230` 用 `on_click` + `click_count == 2` 调用它；Linux 改调 `zoom_window()`；Windows 由平台处理。
- `@gpuix/native` renderer 只暴露了 `zoomWindow()`、`toggleFullscreen()`（`packages/native/src/renderer.rs:2699/2719`，macOS 走 `update_window`，Windows/Linux 走 `UiCommand`），**没有暴露 `titlebar_double_click`**。
- 应用侧窗口端口：`apps/gpuix/src/platform/window/index.ts` 的 `WindowRenderer`（可选方法的结构类型）与 `createWindowPlatform` 返回 `zoom/toggleFullscreen/minimize`。
- 原生鼠标事件已带 `clickCount`（lane 用 `event.clickCount === 2`）。

## 要做

1. vendor 补丁（新文件登记进 `scripts/gpuix-main/config.json` 的补丁序列，在独立 vendor 根构建，不覆盖共享 vendor）：renderer 增加 `#[napi] titlebar_double_click()`。macOS 调 `window.titlebar_double_click()`；Linux 调 `zoom_window()`（与 Zed 一致）；Windows 原生标题栏由系统处理，透明标题栏情况下调 `zoom_window()`，并在注释写明依据。沿用 `zoom_window` 的 `update_window` / `UiCommand` 结构，加 Rust 单测（如有现成模式）。
2. `platform/window`：`WindowRenderer` 加 `titlebarDoubleClick?(): void`，`createWindowPlatform` 加 `titlebarDoubleClick`。
3. `TitleBar.tsx`：标题栏空白区域（含居中标题文字）在 `onMouseDown`/`onClick` 的 `clickCount === 2` 时调用；设置按钮等控件上的双击不触发（控件自己消费事件或用命中判断）。从组合根注入，不在 TitleBar 里直接 import 渲染器。拖动窗口保持原生行为，不受影响。
4. 新的 native 方法合入后需要重建共享 vendor（由协调者做），你的分支用独立 vendor 验证。

## 验收

- 单测：TitleBar 双击空白处调用一次 `titlebarDoubleClick`，单击不调用，双击设置按钮不调用；带变异（去掉 clickCount 判断）被抓。
- 离屏原生：真实 renderer 上调用 `titlebarDoubleClick` 不抛错（macOS）。
- 真实窗口：用 `computer.window` 对自己启动的窗口双击标题栏，截图前后窗口 bounds 变化（缩放）；本机 `defaults read -g AppleActionOnDoubleClick` 当前未设置，缺省即缩放。验完关闭窗口。
- 按 `common.md`：本地只跑轻量检查；报告 `apps/gpuix/src/app/shell/T2-REPORT.md`；自审后发 merge_ready。
