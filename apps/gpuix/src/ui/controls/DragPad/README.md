# Native DragPad family

`DragPadNumber`、`DragPadBar`、`DragPadBipolar` 共享 `NumericPad` 外壳、`useDragPad` 状态机和 `DRAG_PIXELS_PER_STEP = 4`。`PanControl` 是 bipolar 的 −1..1、0.01 步进格式化适配。`DragPadToggle` 复用 Button 的激活与键盘行为，不启动拖动。

- 数值由消费者持有。拖动锚点、预编辑、输入草稿只属于短生命周期 UI 状态。
- 上拖 40px 改变 10 个 `dragStep`，与 range、横向距离和 move 分段无关。`dragStep` 默认等于 `step`；拖动每步 4px，滚轮每步等效 16px，不改变共享比例。
- 点击进入 `preEdit`，数字字符进入 live editing；Enter 直接开始/提交编辑；Escape 撤销，失焦提交。
- 方向键按 step 调整；双击还原 defaultValue。拖动 Escape/失焦取消；卸载释放光标和手势资源。
- `step` 决定键入量化、格式化与方向键精度，`dragStep` 只决定拖动和滚轮。运动沿用零起点的量化网格，例如 `.25` 起始、`dragStep=1` 上拖 4px 得到 `1`，Escape 仍恢复 `.25`。
- `onGestureStart`/`onGestureEnd`/`onGestureCancel` 供消费者绑定编辑事务；共享库不认识工程或 Undo Store。
- `useMeasuredTextWidth` 用原生 `onLayout` 测量已挂载的不可见样本文本，包括 min/max/default/widthSamples，按字体与样本集缓存。首次布局使用估算，测量后修正一次，live value/draft 不参与宽度。自定义格式中间值更宽时须提供 `widthSamples`。
- 紧凑/Transport 度量来自 `useTheme()`，预编辑和编辑保留同样字号、宽度与图标。
- `hideIcon` 默认关闭；开启后，宽度只含实测文本、两侧 track padding 和边框，不预留图标位。该变体的预编辑/编辑指示为叠加在内边距内的 1px 插入符形，不占布局、不遮数值；22px 紧凑壳无法再容纳 10px 图标。普通变体保持原图标。与 Live 对照：Live 窄数值控件无独立图标；未实测 Live 编辑态指示。
- 默认宽度只由内容测量决定。铺满父容器时，fill 和 bipolar 中线使用根节点 `onLayout` 的实际内宽，并扣除实际边框。数值根节点通过原生 `pointerEvents: "auto"` 独占滚轮命中，fill 与指示器不拦截指针；控件外仍可滚动祖先。

## 光标能力注入

UI 层只声明 `CursorLockPort { capture(pressPoint), hide, restore }`，通过 `ControlEnvironmentProvider value.cursorLock` 注入。UI 不 import 原生包或 platform；未注入时不隐藏或还原光标，数值拖动仍工作。画廊等组合根注入 `@/platform/cursor` 的 `nativeCursorLock`，读回验证使用同一端口模块的 `currentCursorPosition`。

按下时把 mouseDown 事件自身的 `x/y`（窗口内容区左上原点，pt）交给 `capture`，端口换算成屏幕锚点；事件缺坐标时不锁光标。超过点击阈值后隐藏；释放/取消先还原再显示。手势保存取得锚点时的端口，Provider 更新不能把恢复责任转移给另一个实例。不使用 `CGAssociateMouseAndMouseCursorPosition`：gpuix move 来自绝对窗口位置，断开关联会冻结事件。真实光标依旧不可见地移动，因此不是无限屏幕边界拖动。

## 锚点为什么取事件坐标

gpuix 事件经 ThreadsafeFunction 异步投递，JS 处理 `mouseDown` 时 OS 可能已处理后续 move。原实现在此刻读 OS 当前光标，合成“按下即移动”实测按下 `(805,364)`、还原 `(805,354)`。GPUI 在事件时刻由 `NSEvent.locationInWindow` 算出 `x/y`，所以按下事件坐标不受处理延迟影响。原生 `windowPointToScreen`（`crates/native/src/window_geometry.rs`）取 key 窗口（无则 main 窗口）的 frame 与内容区高度，按 `screenX = frame.x + x`、`screenY = 主屏高 − (frame.y + 内容区高 − y)` 换算成 CG 全局坐标；全程用点，不乘 Retina 缩放。没有可用窗口时返回 null，不锁光标。`cursorPosition` 只经 `platform/cursor` 的 `currentCursorPosition` 供画廊读回验证，不再是锚点来源。

实际窗口回归步骤：

1. 双击 BPM 还原 120。
2. 按下 BPM 中心，无停留路径每步 10pt 上移到 40pt；另跑先在按下点重复 4 次再上移的停留路径。
3. 两条路径都确认 AX 为 130，并在 gallery 的 `onGestureEnd` 中读取真实 `currentCursorPosition()`；读回须与按下点一致。2026-10-15 实测按下 `(412,293)`，两条路径读回均为 `(412,293)`，误差 0pt：[截图](evidence/press-anchor-restored-2026-10-15.png)、[AX](evidence/press-anchor-restored-2026-10-15.ax.txt)。

`computer.drag` 完成后会恢复用户原光标，因此工具返回后的 OS 坐标不是组件的还原证据；画廊在组件恢复后、工具恢复前采样，并显示真实读回值。未验证：人手真实硬件速度、多显示器与全屏实机。

## 运行

根目录先 `pnpm native:build`，然后在 `apps/gpuix` 执行：

```sh
bun --hot src/gallery/controls.tsx
bun test src/ui/controls
bunx tsc --noEmit
```

旧 `features/drag-pad` 已迁走。画廊按协调者授权移到 `ui/` 之外，由组合入口持有原生能力。`evidence/` 内 `press-anchor-restored-2026-10-15.*` 是 G1 锚点复测证据，其余三张图是迁移前 DragPad 实验的历史截图。
