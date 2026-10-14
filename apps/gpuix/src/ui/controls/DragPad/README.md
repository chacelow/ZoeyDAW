# Native DragPad family

`DragPadNumber`、`DragPadBar`、`DragPadBipolar` 共享 `NumericPad` 外壳、`useDragPad` 状态机和 `DRAG_PIXELS_PER_STEP = 4`。`PanControl` 是 bipolar 的 −1..1、0.01 步进格式化适配。`DragPadToggle` 复用 Button 的激活与键盘行为，不启动拖动。

- 数值由消费者持有。拖动锚点、预编辑、输入草稿只属于短生命周期 UI 状态。
- 上拖 40px 改变 10 个 step，与 range、横向距离和 move 分段无关；wheel 仅作用于命中控件。
- 点击进入 `preEdit`，数字字符进入 live editing；Enter 直接开始/提交编辑；Escape 撤销，失焦提交。
- 方向键按 step 调整；双击还原 defaultValue。拖动 Escape/失焦取消；卸载释放光标和手势资源。
- `onGestureStart`/`onGestureEnd`/`onGestureCancel` 供消费者绑定编辑事务；共享库不认识工程或 Undo Store。
- `useMeasuredTextWidth` 经唯一 `readOuterBounds` 边界测量真实隐藏样本文本，包括 min/max/default/widthSamples，按字体与样本集缓存。首次布局使用估算，测量后修正一次，live value/draft 不参与宽度。自定义格式中间值更宽时须提供 `widthSamples`。
- 紧凑/Transport 度量来自 `useTheme()`，预编辑和编辑保留同样字号、宽度与图标。
- `hideIcon` 默认关闭；开启后，宽度只含实测文本、两侧 track padding 和边框，不预留图标位。该变体的预编辑/编辑指示为叠加在内边距内的 1px 插入符形，不占布局、不遮数值；22px 紧凑壳无法再容纳 10px 图标。普通变体保持原图标。与 Live 对照：Live 窄数值控件无独立图标；未实测 Live 编辑态指示。

## 光标能力注入

UI 层只声明 `CursorLockPort { capture, hide, restore }`，通过 `ControlEnvironmentProvider value.cursorLock` 注入。UI 不 import 原生包；未注入时不隐藏/还原光标，数值拖动仍工作。应用组合根负责接入 `@zoeydaw/native`，示例见 `src/gallery/controls.tsx`。

按下时通过端口捕获屏幕坐标；超过点击阈值后隐藏；释放/取消先还原再显示。手势保存取得锚点时的端口，Provider 更新不能把恢复责任转移给另一个实例。不使用 `CGAssociateMouseAndMouseCursorPosition`：gpuix 0.10 move 来自绝对窗口位置，断开关联会冻结事件。真实光标依旧不可见地移动，因此不是无限屏幕边界拖动。

## 已知限制：极快按下即移动

JS 收到 `mouseDown` 时，OS 可能已经处理首个 `mouseMove`。极快的合成“按下即移动”（远快于人手）会让 `capture()` 读到晚于真实按下点的位置；本轮每步 10pt 的输入实测偏移一个 move 步长：按下 `(805,364)`，捕获/还原 `(805,354)`。本轮没有添加补偿或猜测逻辑。人手速度下仍需真实硬件复测，尚未测。

可靠的后续方向是原生 `CGEventTap` 在事件发生时保存带时间戳的按下屏幕坐标，但这需要辅助功能/输入监控权限，属于待用户决策的产品取舍，本切片不引入。永久测试以 `test.todo` 明确保留无停留情形，不能把它算作通过。

实际窗口回归步骤：

1. 双击 BPM 还原 120。
2. 真实按下 BPM 中心，拖动路径先重复按下点 4 次（同点停留），再上移 10/20/30/40px。
3. 确认 AX 为 130，并在 gallery 的 `onGestureEnd` 中读取真实 `cursorPosition()`；读回应与按下点一致。本轮注入端口先后验证了 `(1299,279)` 与 `(805,364)`，最终截图记录后者。
4. 另跑不含同点停留的路径，记录上述已知偏移；不得更改预期锚点来掩盖它。

`computer.drag` 完成后会恢复用户原光标，因此工具返回后的 OS 坐标不是组件的还原证据；画廊在组件恢复后、工具恢复前采样，并显示真实读回值。

## 运行

根目录先 `pnpm native:build`，然后在 `apps/gpuix` 执行：

```sh
bun --hot src/gallery/controls.tsx
bun test src/ui/controls
bunx tsc --noEmit
```

旧 `features/drag-pad` 已迁走。画廊按协调者授权移到 `ui/` 之外，由组合入口持有原生能力。`evidence/` 内三张图仅是迁移前 DragPad 实验的历史截图；本轮画廊交互证据见上级报告。
