# Native DragPad family

`DragPadNumber`、`DragPadBar`、`DragPadBipolar` 共享 `NumericPad` 外壳、`useDragPad` 状态机和注入的 `ControlInputPolicy`。`PanControl` 固定 bipolar 的 −1..1 范围、0.01 步进和归零值，显示与输入格式由调用方持有。`DragPadToggle` 复用 Button 的激活与键盘行为，不启动拖动。

- 数值由消费者持有。拖动锚点、预编辑、输入草稿只属于短生命周期 UI 状态。
- `PanControl` 必须注入 `label`、`format`、`parse` 和 `widthSamples`；显示、输入与测宽使用同一份业务格式配置，共享控件不定义方向文字或解析别名。
- `DragPadToggle` 的纯文字状态必须成对注入 `labelOn`/`labelOff`；提供显式 `icon` 或 `children` 时不需要状态文字，不内置默认文案。
- 拖动与滚轮灵敏度由 `ControlEnvironmentProvider value.inputPolicy` 注入：`dragPixelsPerStep`、`wheelPixelsPerStep`、`wheelLinePixels`、`dragThresholdPixels`。应用组合读取 `numericInput` 与 `pointer` 偏好；Gallery/独立验证组合使用纯 `PREFERENCE_DEFAULTS`。UI 没有默认策略，实际指针/滚轮输入要求已注入；纯展示及键盘编辑不要求策略。嵌套环境只继承这一能力，其余字段继续由最近 Provider 替换。
- 默认偏好下，上拖 40px 改变 10 个 `dragStep`，与 range、横向距离和 move 分段无关。`dragStep` 默认等于 `step`。按下时快照策略，偏好更新不改变当前手势的阈值或比例；下一次按下与滚轮读取新策略。
- 点击进入 `preEdit`，数字字符进入 live editing；Enter 直接开始/提交编辑；Escape 撤销，失焦提交。
- 方向键按 step 调整；双击还原 defaultValue。拖动 Escape/失焦取消；卸载释放光标和手势资源。
- `step` 决定键入量化、格式化与方向键精度，`dragStep` 只决定拖动和滚轮。运动沿用零起点的量化网格，例如 `.25` 起始、`dragStep=1` 上拖 4px 得到 `1`，Escape 仍恢复 `.25`。
- `onGestureStart`/`onGestureEnd`/`onGestureCancel` 供消费者绑定编辑事务；共享库不认识工程或 Undo Store。
- `useMeasuredTextWidth` 用原生 `onLayout` 测量已挂载的不可见样本文本，包括 min/max/default/widthSamples，按字体与样本集缓存。首次布局使用估算，测量后修正一次，live value/draft 不参与宽度。自定义格式中间值更宽时须提供 `widthSamples`。
- 紧凑/Transport 度量来自 `useTheme()`，预编辑和编辑保留同样字号与宽度。
- 默认不画图标，与 Live 窄数值控件一致：宽度只含实测文本、两侧 track padding 和边框。预编辑/编辑指示为叠加在内边距内的 1px 插入符，不占布局、不遮数值。传入 `icon` 时才预留图标位并替代插入符。
- 默认宽度只由内容测量决定。铺满父容器时，fill 和 bipolar 中线使用根节点 `onLayout` 的实际内宽，并扣除实际边框。数值根节点通过原生 `pointerEvents: "auto"` 独占滚轮命中，fill 与指示器不拦截指针；控件外仍可滚动祖先。

## 光标能力注入

UI 层只声明 `CursorLockPort { begin(), end(release?) }`，通过 `ControlEnvironmentProvider value.cursorLock` 注入。UI 不 import 原生包或 platform；未注入时不隐藏光标，数值拖动仍工作。组合根注入 `@/platform/cursor` 的 `createNativeCursorLock(renderer)`，它包装 renderer 的 `beginRelativeDrag` / `endRelativeDrag`。

超过点击阈值时调用 `begin()`：renderer 隐藏并固定光标，之后的 mouseMove/mouseUp 报告由相对位移累加出的窗口坐标，所以拖到屏幕边缘也不会停。松手或取消调用 `end()`；原地调值控件不传 `release`，光标留在按下点。会位移的控件（Minimap）传松手时的窗口坐标，光标出现在实际移动后的位置。手势保存开始拖动时的端口，Provider 更新不能把结束责任转移给另一个实例。按下事件缺坐标时不固定光标。

## 与 Live 对照

2026-10-17 在 Windows 上用 Frida 挂 Live 12 记录光标调用：拖 BPM、旋钮时按下即 `SetCapture` + `ShowCursor(false)`，之后每次移动都 `SetCursorPos` 回按下点（一次 1 秒的拖动 161 次），松手 `ShowCursor(true)` + `ReleaseCapture`，光标留在原处。macOS 版 Live 导入 `CGAssociateMouseAndMouseCursorPosition` 与 `CGWarpMouseCursorPosition`。补丁 `zed-relative-pointer.patch` 照此实现：macOS 断开关联、按 `NSEvent.deltaX/deltaY` 累加；Windows 每次 `WM_MOUSEMOVE` 取相对锚点的偏移后 `SetCursorPos` 回锚点；窗口失活时结束相对模式。

实际窗口回归：按下 BPM 往上拖，越过屏幕上边缘后数值继续增加；松手后光标在按下点。

## 运行

根目录先 `pnpm native:build`，然后在 `apps/gpuix` 执行：

```sh
bun --hot src/gallery/controls.tsx
bun test src/ui/controls
bunx tsc --noEmit
```
