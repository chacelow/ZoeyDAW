# DragPadNumber 验证记录

2026-10-14，基于 `@gpuix/react` 和 `@gpuix/native` 0.10.0。仅支持 macOS：光标隐藏与恢复通过 `native-cursor.ts` 调用系统 CoreGraphics，其他平台该部分为 no-op，拖动取值本身不受影响。

## 光标隐藏与原位恢复

gpuix 公共 JS API 没有隐藏、warp 光标或读取屏幕坐标的方法（已读取安装包声明并查询 Context7 `/remorses/gpuix`）。gpuix 应用是真原生进程而非 WebView，因此不依赖 gpuix 封装，直接调用系统 API。实现见 [native-cursor.ts](native-cursor.ts)。

- **不使用** `CGAssociateMouseAndMouseCursorPosition`（FPS 式 pointer lock，断开光标与硬件移动后读原始 delta）。GPUI macOS 事件源（[events.rs](https://github.com/zed-industries/zed/blob/main/crates/gpui_macos/src/events.rs) 的 `NSMouseMoved` 分支）所有 move 事件都由 `NSEvent.locationInWindow()` 绝对位置构造，没有原始 delta 路径。断开关联会冻结该位置，拖动期间 `mouseMove` 将完全停止触发。
- 实际方案：`mouseDown` 时读取并保存屏幕光标坐标；确认进入拖动（超过点击阈值）后才隐藏光标；真实光标继续不可见地移动，gpuix 照常通过 pointer capture 收到 move/up；松手时先 warp 回保存的坐标，再显示光标。点击、双击、wheel 不隐藏光标。
- 锚点必须在 `mouseDown` 读取，不能在首个越过阈值的 `mouseMove` 里读：实测延后读取会锚定到拖动中途的点，而非真实按下位置。
- 使用 `osascript -l JavaScript`（JXA）而非 `bun:ffi`：`CGEventGetLocation`/`CGPointMake` 按值传递 `CGPoint`，Bun 的 `FFIType` 没有 struct 类型，原始 FFI 读返回值会得到垃圾数据。代价是每次 `mouseDown`（捕获）和每次拖动结束（恢复）各一次同步子进程启动，数十毫秒量级；`mouseMove` 路径不受影响。

来源：[native API](https://github.com/remorses/gpuix/blob/main/_autodocs/api-reference/native-gpuix-renderer.md)、[capture 实现](https://github.com/remorses/gpuix/blob/main/packages/native/src/renderer.rs)。

## 已实现的交互

数值由调用方持有。组件持有按下锚点和 `idle`、`preEdit`、`editing` 会话状态，不持有另一份长期数值状态。

- 纵向距离按 `-deltaY / DRAG_PIXELS_PER_STEP × step` 计算增量，然后量化并限制范围。共享常量为每步 4px，不依赖 range、速度或 move 事件频率。
- `onScroll` 经原生命中测试，仅调整指针下的控件。wheel 不修改光标。
- 无拖动的点击进入边框高亮预编辑，鼠标为 text cursor。首个有效字符开始 live editing。Enter 或失焦提交，Escape 恢复编辑前数值。
- 原生双击事件的 `clickCount >= 2` 重置到 `defaultValue`，退出预编辑。
- icon 始终显示。预编辑和编辑不切换背景色。
- 宽度由格式化端点和 default 的字符数量预留，不依赖当前数值或 draft。数字使用 Menlo，宽度采用字符宽度估算；不是原生字体实测。特殊自定义 formatter 的最宽中间值不在此保证内。

## 命令与结果

在仓库根目录通过 Orca 管理的独立 terminal 启动：

```sh
orca terminal create --worktree path:/Users/caishilong/orca/workspaces/zoeydaw/gpuix-drag-pad --title "DragPad native demo" --command "bun --hot apps/gpuix/src/features/drag-pad/demo.tsx" --json
```

窗口为 `DragPadNumber demo`，640×348，包含 28px 原生标题栏。Orca terminal handle 为 `term_6f94779d-6d3a-4263-830f-3325392f6cf9`。实际 desktop screenshot 和 AX tree 均确认窗口已打开。

在 `apps/gpuix/` 运行：

```sh
bun test src/features/drag-pad
bun run typecheck
```

结果为 26 pass、0 fail、49 次断言，`tsc --noEmit` 通过。原生行为测试覆盖跨 hitbox 拖动、move 事件分段不改变结果、小 range 共享比例、hover wheel、live editing、Enter 提交、Escape 撤销、icon 常驻和宽度稳定；另有 3 个 `native-cursor` 接线测试（点击只捕获不隐藏、wheel 不隐藏、拖动确认后隐藏并以 mouseDown 时锚点恢复）。测试文件 mock 了 `./native-cursor`，不会在 `bun test` 时真实触碰宿主光标；已实测整套测试运行前后光标坐标完全一致。

真实窗口操作通过 `computer.window('44224')` 完成：

- 点击 BPM 后 AX 保留数值 120 并显示 focus，截图为预编辑状态。
- 按 `9` 后 AX 出现值为 `9` 的原生 textfield，再按 `9` 和 Enter 后显示 99。
- 对 BPM 的 AX 元素执行 `doubleClick()` 后，AX 数值从 99 恢复到 120。原生 TestRenderer 模拟事件始终报告 clickCount 1，因此双击使用真实窗口验证。
- 背景 drag 返回 `BackgroundUnavailable` 后，使用 `win.drag([[76,141],[76,131],[76,121],[76,111],[76,101]], {takeover:true})`。AX 数值由 120 变为 130，证明真实 OS 输入的 40px 上拖对应 10 步。
- 光标隐藏与恢复的真实验证（不经 `computer` 工具，用 `CGEventPost` 注入真实鼠标事件）：光标置于 (1036, 567) 按下，向上拖 40px 后释放，BPM 120→130，释放后光标读回 (1036, 567)，与按下坐标一致，而非拖动终点 (1036, 527)。首次实现把锚点延后到 `mouseMove` 内读取，读回 (1036, 542)（拖动中途），据此改为 `mouseDown` 时读取。

截图保存于本目录：

| 状态     | 证据                                  |
| -------- | ------------------------------------- |
| Default  | [default.png](evidence/default.png)   |
| Pre-edit | [pre-edit.png](evidence/pre-edit.png) |
| Edit     | [edit.png](evidence/edit.png)         |

截图已在最终版本（移除旧"未实现"警告后）重新拍摄。服务已停止。
