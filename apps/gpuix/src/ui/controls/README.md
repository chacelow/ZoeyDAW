# gpuix 共享控件交付记录

2026-10-15，A3 切片，基于 `@gpuix/react` 和 `@gpuix/native` 0.10.0。实现位于 `ui/controls`，原生能力组合入口位于 [`src/gallery/controls.tsx`](../../gallery/controls.tsx)。画廊移到 `ui/` 外是协调者批准的分层修正，不保留旧入口 shim。

## 范围与接口

| 类别 | 公共符号 |
| --- | --- |
| Button | `Button`、`DropdownButton`、`PopupButton`、`IconSlot` |
| 数值 | `DragPadNumber`、`DragPadBar`、`DragPadBipolar`、`DragPadToggle`、`PanControl` |
| Context menu | `ContextMenu`、`ContextMenuTrigger`、`ContextMenuContent`、`ContextMenuItem`、`ContextMenuLabel`、`ContextMenuSeparator`、`ContextMenuRadioGroup`、`ContextMenuRadioItem`、`ContextMenuSub`、`ContextMenuSubTrigger`、`ContextMenuSubContent` |
| Dropdown menu | `DropdownMenu`、`DropdownMenuTrigger`、`DropdownMenuContent`、`DropdownMenuItem`、`DropdownMenuCheckboxItem`、`DropdownMenuPortal`、`DropdownMenuSub`、`DropdownMenuSubTrigger`、`DropdownMenuSubContent` |
| Popover | `Popover`、`PopoverTrigger`、`PopoverContent`、`PopoverHeader`、`PopoverTitle` |
| 容器和反馈 | `Card`、`CardHeader`、`CardTitle`、`CardDescription`、`CardContent`、`Empty`、`EmptyHeader`、`EmptyTitle`、`EmptyDescription`、`Separator`、`Progress`、`Loading`、`LoadErrorScreen`、`ScrollArea`、`Toaster`、`toast`、`toastLoading` |
| 表单和导航 | `Label`、`Input`、`RadioGroup`、`RadioGroupItem`、`ToggleGroup`、`ToggleGroupItem`、`SettingsShell`、`SettingsNavItem`、`MotionTabs` |
| 环境和拖拽 | `ControlEnvironment`、`ControlEnvironmentProvider`、`ControlGroup`、`ControlInfo`、`useInfoBinding`、`DragPreviewArea` |

组件和专用 Props 位于 family 入口，根入口显式列出被消费的控件与类型。主题、预设和共享度量继续由 `shared/theme` 持有，本切片不新增主题 API、依赖或 Rust 源码。

- 数值由消费者持有。所有数值变体共享 `useDragPad`、每步 4px 比例和主题度量，Bar/Bipolar 只改变填充外观。没有复制 track-mixer 的早期拖动逻辑。
- `CursorLockPort` 经 `ControlEnvironment.cursorLock` 注入。UI 不依赖 `@zoeydaw/native`。无端口时不隐藏光标；画廊组合入口接入真实 Rust 光标函数。
- Button 的 `active/onActiveChange` 为受控状态。`highlight` 默认开启，关闭后不加 hover 高亮。`iconOnly` 使用正方形尺寸，图标继承按钮颜色。
- `DropdownButton` 复用发布版 Select。弹层保留标签换行，紧凑 trigger 把换行折成空格，指示器固定右侧。命令菜单与任意内容 Popover 不借 Select 模拟。
- Menu/Popover 复用发布版 `FloatingLayer` 和 `renderSlot`。没有引入或复制社区库源码。原生子菜单、禁用项、Esc、键盘导航、焦点归还、四向定位和 outside mouseDown 均有行为测试。
- `toastLoading(message, id?)` 保留原消费者接口。同 id 的 loading 可以被 success/error 替换；通知 store 只有一份，替换、淘汰和关闭清理旧 timer。
- `SettingsShell` 是非模态导航和内容容器，不宣称实现模态 focus trap。`MotionTabs` 使用静态指示器位置和原生 opacity 过渡，当前发布版 MotionStyle 不提供 transform。
- `DragPreviewArea` 删除 DOM selector/HTMLElement 接口，改为显式 `data` 或 `items` 和 `renderPreview(data)`。预览支持阈值、释放、Esc 和取消；实际资源放置保持禁用。

## 实跑命令

在本 worktree 执行，未把代理自报作为结果。

| 位置 | 命令 | 观察结果 |
| --- | --- | --- |
| 根目录 | `pnpm install --frozen-lockfile` | 成功，未修改依赖清单或 lockfile |
| 根目录 | `pnpm native:build` | 成功，加载真实 `@zoeydaw/native` 二进制 |
| 根目录 | `cargo check` | 通过，基线 workspace profile warning |
| 根目录 | `cargo test` | 通过，3 个 suite 均为 0 tests；native test target 有 7 个基线 unused warnings |
| `apps/gpuix` | `bunx tsc --noEmit` | 通过 |
| `apps/gpuix` | `bun test src/ui/controls` | 92 pass，1 todo，0 fail |
| `apps/gpuix` | `bun test` | 97 pass，1 todo，0 fail |
| 根目录 | `pnpm exec ultracite fix apps/gpuix/src/ui/controls apps/gpuix/src/gallery` | 通过，无关闭 a11y 规则 |
| 根目录 | `pnpm exec eslint apps/gpuix/src/ui` | 通过，UI 源码无原生包导入 |
| `apps/gpuix` | `bun --hot src/gallery/controls.tsx` | 原生窗口 `zoeydaw native controls`，AX 与截图验证 |

Rust 源码未改。Cargo 检查证明基线兼容，不代替真实光标交互证据。只停止了本轮自己启动的画廊进程，没有启动或停止用户应用，没有 push。

## 实际窗口行为

桌面 helper 的 background 输入存在焦点恢复限制。拖动先收到 `BackgroundUnavailable`，后收到 `InputFailed`。本轮最终改用同一 `computer` API 的 desktop 输入，并按实际 2560×1080 到 1280×540 截图比例换算 AX 全局坐标；没有使用 Bash、AppleScript 或 CGEventPost 代替 UI 验证。

最终画廊将 `Footer info` 和 `Gallery verification` 分成两个 AX 状态节点。最终光标截图中，输入只在原生编辑器中出现，Footer info 仅为 `Info: number`。其余快照来自同轮较早状态，含旧画廊诊断栏的输入副本；`ControlEnvironment` 始终只发布组件类型，最终入口已删除该副本。

| 场景 | 实际观察 | 证据 |
| --- | --- | --- |
| 画廊和 DragPad | 双击还原 120；真实上拖 40px 后 130。最终按下屏幕点 `(805,364)`，画廊 `onGestureEnd` 内真实 `cursorPosition()` 读回 `(805,364)`；输入为 `Scoped native input`，Footer Info 仍仅显示类型 | [截图](evidence/cursor-restored.png)、[AX](evidence/cursor-restored.ax.txt) |
| Button、表单、Tabs | 点击激活按钮后 AX 为 `Active button (on)`；输入为 `Verified native input`；中文 Radio、Snap 切换；Devices Tab 为 true，并显示 Device 内容 | [截图](evidence/forms.png)、[AX](evidence/forms.ax.txt) |
| Select 和子菜单 | Beats 选择为 Tones；Commands → Export → Audio 打开原生子菜单，选择后菜单关闭，状态为 `Audio selected` | [截图](evidence/menus.png)、[AX](evidence/menus.ax.txt) |
| Context menu | 真实右键打开；选择 Rename 关闭菜单。截图含 radio group 和 More 子菜单入口 | [截图](evidence/context-menu.png)、[AX](evidence/context-menu.ax.txt) |
| 任意内容 popup | 内嵌 BPM 130 → 140 的真实拖动后仍打开，再连续 wheel 调整为 138，AX 仍包含 `Continuous adjustment` 和 `Popup BPM` | [截图](evidence/popup-adjustment.png)、[AX](evidence/popup-adjustment.ax.txt) |
| Popover | 内部 action 执行后保持打开；两行文字分别渲染，状态为 `Inside popover` | [截图](evidence/popover.png)、[AX](evidence/popover.ax.txt) |
| Settings | 打开设置，General → Audio，AX 中 Audio 为 true，内容切到 Audio settings，随后关闭 | [截图](evidence/settings.png)、[AX](evidence/settings.ax.txt) |
| 反馈 | Retry 执行后状态为 `Retry requested`；loading toast 被同 id error 替换为 `Load failed` | [截图](evidence/feedback.png)、[AX](evidence/feedback.ax.txt) |
| ScrollArea | 真实 wheel 后第一行 AX y 从 520 到 440，viewport 高度保持 50，截图显示第 5、6、7 行 | [截图](evidence/scroll.png) |
| Drag preview | 真实横向拖动 source 后释放，状态为 `Preview released`。永久测试另覆盖拖动中的预览与取消 | [截图](evidence/drag-preview.png)、[AX](evidence/drag-preview.ax.txt) |

另实测数值编辑：点击 BPM 预编辑，按 `9` 后出现原生 textfield；点击其他控件后提交，数值按 min 钳制为 20。Bar 的 wheel 50 → 49，Bipolar/Pan 的 wheel 从中心到 −0.02/L2，Progress 同步为 49%。这些是 UI 参数，不是音频引擎。

## 依赖上游缺陷的临时代码

| 代码 | 发布版缺口与实测 | 删除或替换条件 |
| --- | --- | --- |
| `readOuterBounds`，与测量 hook 同文件 | 0.10 的 origin 随 padding 与轴对齐偏移，size 只扣 border。100×80、border 1、padding 8，start 原点 9、center 原点 1、end 原点 −7。全部调用经单一函数修正 | 上游 `.changeset/bounds-include-padding.md` 已记录 real box 修复。升级到含该修复的版本后整体删除 shim，从唯一边界切回原生 API |
| `ControlEnvironment` focus sampler | 测试 renderer 的 focus 操作改变 `getFocusedElementId`，没有触发声明的 onFocus/onBlur。每个应用作用域只有一个 32ms sampler，首个订阅者启动，最后一个取消停止，只通知变化；测试断言两个控件共用同一个 timer | 发布版稳定发送元素 focus/blur 事件后删除。它不读取应用激活状态，不依赖 A2 的 50ms activation sampler |
| `useMeasuredTextWidth` | 没有公开 `measureText`。不可见真实文本节点在布局后读取宽度，按字体与样本串缓存。没有新增字体库或改 native 公共契约 | 上游 `measureText` 或可靠 onLayout 是 issue/PR 候选，本轮没有提交远程 issue |
| `useFloatingCenterOffset` | 0.10 center 把浮层末端放到 trigger 中点。共享测量补偿半个 cross-axis 尺寸，并在 minWidth/minHeight 更新后重新采样 | 上游 center 定位修复后删除补偿。12 个 side/align 和 intrinsic-size 回归保持严格几何边界，Select 允许原生像素对齐产生的 0.5pt 差值 |

字体 probe 使用真实 gpuix text layout，结果如下。probe 已删除，永久测试验证样本宽度上界、值位数变化不改宽度、缓存和最多一次宽度修正。

| 样本                    | 首帧估算 | 实测宽度 | 修正 |
| ----------------------- | -------- | -------- | ---- |
| compact BPM，Menlo 9    | 17px     | 17px     | 0px  |
| Transport BPM，Menlo 12 | 23px     | 22px     | −1px |
| compact Pan，Menlo 9    | 23px     | 22px     | −1px |

首次取得截图时测量已经完成，没有捕获估算首帧，因此不能声称修正肉眼不可见。真实布局 probe 证明存在 0px 或 1px 修正。需要完全消除可见修正时，组合入口可预热相同字体和样本缓存后再显示布局；本轮未加入这项产品策略。

## 明确保留的限制

唯一 todo 是极快“按下即移动”的原生屏幕锚点时序。无停留路径在 JS 收到 mouseDown 前，OS 已经处理一个 10pt move，实测锚点从 `(805,364)` 偏到 `(805,354)`。同点停留路径正确。工具结束会另行恢复用户原光标，因此报告只使用组件恢复后、工具恢复前的 `onGestureEnd` 读回值。

协调者批准本轮记录此限制，不加补偿或轮询猜测。可靠的 CGEventTap 捕获需要辅助功能/输入监控权限，留给用户决定。真实硬件速度尚未测，不能把合成输入结果当作人手精度数据。详情与回归步骤见 [DragPad 契约](DragPad/README.md)。
