# gpuix 共享控件交付记录

当前实现消费固定 gpuix 主干 `6a5c7c142ac32f9eb0caefe0121be995cfc18631` 及仓库受控补丁。实现位于 `ui/controls`，原生能力由 [`src/gallery/controls.tsx`](../../gallery/controls.tsx) 等组合入口经 platform 端口注入。下方 A3 的命令、字体数值和窗口记录属于 0.10.0 迁移时的历史证据，不代表最新主干逐状态复核。

A3b 的当前窗口补证、历史状态索引、像素与 token 对照、Live 对比、门禁和未验证项见[最终证据报告](../../../../../scripts/gpuix-main/evidence/a3b-gallery-polish/REPORT.md)。当前已观察到部分状态与四组主题语言基线，但未完成完整逐控件逐状态视觉矩阵，不以代码门禁替代该验收。

## 范围与接口

| 类别 | 公共符号 |
| --- | --- |
| Button | `Button`、`DropdownButton`、`PopupButton`、`IconSlot` |
| 数值 | `DragPadNumber`、`DragPadBar`、`DragPadBipolar`、`DragPadToggle`、`PanControl` |
| Context menu | `ContextMenu`、`ContextMenuTrigger`、`ContextMenuContent`、`ContextMenuItem`、`ContextMenuLabel`、`ContextMenuSeparator`、`ContextMenuRadioGroup`、`ContextMenuRadioItem`、`ContextMenuSub`、`ContextMenuSubTrigger`、`ContextMenuSubContent` |
| Dropdown menu | `DropdownMenu`、`DropdownMenuTrigger`、`DropdownMenuContent`、`DropdownMenuItem`、`DropdownMenuCheckboxItem`、`DropdownMenuPortal`、`DropdownMenuSub`、`DropdownMenuSubTrigger`、`DropdownMenuSubContent` |
| Popover | `Popover`、`PopoverTrigger`、`PopoverContent`、`PopoverHeader`、`PopoverTitle` |
| 容器和反馈 | `Card`、`CardHeader`、`CardTitle`、`CardDescription`、`CardContent`、`Empty`、`EmptyHeader`、`EmptyTitle`、`EmptyDescription`、`Separator`、`Progress`、`Loading`、`LoadErrorScreen`、`ScrollArea`、`ControlledScrollbar`、`Toaster`、`toast`、`toastLoading` |
| 表单和导航 | `Label`、`Input`、`RadioGroup`、`RadioGroupItem`、`ToggleGroup`、`ToggleGroupItem`、`SettingsShell`、`SettingsNavItem`、`MotionTabs` |
| 列表 | `ListRow`（Browser、下拉与菜单的共享行容器；Enter 激活，Space 留给 Transport） |
| 环境和拖拽 | `ControlEnvironment`、`ControlEnvironmentProvider`、`ControlGroup`、`ControlInfo`、`useInfoBinding`、`DragPreviewArea` |

组件和专用 Props 位于 family 入口，根入口显式列出被消费的控件与类型。主题、预设和共享度量继续由 `shared/theme` 持有，本切片不新增主题 API、依赖或 Rust 源码。

- 数值由消费者持有。所有数值变体共享 `useDragPad`、每步 4px 比例和主题度量，Bar/Bipolar 只改变填充外观。没有复制 track-mixer 的早期拖动逻辑。
- `CursorLockPort` 经 `ControlEnvironment.cursorLock` 注入。UI 不依赖 `@zoeydaw/native`。无端口时不隐藏光标；画廊组合入口接入真实 Rust 光标函数。
- `ControlEnvironment.textFocus` 是组合根可选注入的文本焦点 lease 端口，`enter(): () => void` 返回幂等释放函数。Input 与 DragPadNumber 实际编辑 input 在原生 `onFocus` 取得 lease，在 `onBlur`、编辑态退出或卸载时释放。普通数值 spinbutton 不报告文本焦点。lease 不传输入内容，不替代既有 ControlInfo；不查询 host 树、不轮询焦点。renderer 必须为 autoFocus 发出真实 focus 事件。
- Button 的 `active/onActiveChange` 为受控状态。`highlight` 默认开启，关闭后不加 hover 高亮。`iconOnly` 使用正方形尺寸，图标经共享 `Icon` 与主题 token 着色。active destructive 保持 web Record 的 danger wash、hover 与 focus 层级，不被 primary 覆盖。调用方可配置原生 `role/tabIndex`。
- `DropdownButton` 复用固定主干 Select。`fill` 同时铺满外层和 trigger，默认仍按内容测宽。工具栏 trigger 不激活 Space，弹层选项 Space 选择并消费，不同时触发播放。标签保留换行，紧凑 trigger 把换行折成空格，指示器固定右侧。
- `ControlledScrollbar` 是加性的横/纵向受控变体：`value`、`viewport`、`extent` 使用同一逻辑单位，`length` 是绘制长度，`onChange` 写回消费者的唯一 owner。Arrangement 用它实现 **minimap 下 marks 与 timeline 共用的一条横向滚动条**，不另建音乐滚动状态或巨大 native scroll 内容。
- 滚动条导航键只由控件消费，Space 留给窗口播放 owner；悬停滚轮通过原生 `pointerEvents: auto` 命中阻止祖先一起滚动，不伪造已消费事件标志。厚度和最小 thumb 来自共享控件度量，当前逻辑值经 `aria-valuetext` 暴露。
- Menu/Popover 复用固定主干 `FloatingLayer` 与 `renderSlot`。ContextMenu 用 F2 原生 `onContextMenu` 事件捕获最近作用域，能跨交互后代，不复制 MouseDown 分发或判断 Ctrl。Menu 按 state/context、trigger、navigation、content、item composition 拆分；根 trigger 的 Space 留给播放，弹层 MenuItem 与 SubTrigger 的 Space 仍选择并消费。
- `toastLoading(message, id?)` 保留原消费者接口。同 id 的 loading 可以被 success/error 替换；通知 store 只有一份，替换、淘汰和关闭清理旧 timer。
- `SettingsShell` 是非模态导航和内容容器，不宣称实现模态 focus trap。RadioGroup 与对话框内 SettingsNavItem 保留标准 Space 选择；工具栏 `MotionTabs` 只用 Enter 激活，Space 不切换。Tabs 使用静态指示器和原生 opacity 过渡。
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

## 已完成的 0.10 临时路径切换

| 原路径 | 当前唯一 owner | 状态 |
| --- | --- | --- |
| `readOuterBounds` border/padding 修正及后续转发层 | 生产和测试直接调用 renderer 的原生 `getElementBounds` | API、调用和导入均已删除，原有几何断言未放宽 |
| `ControlEnvironment` 32ms focus sampler | 原生 `onFocus/onBlur` 发布控件种类，原生 `focusVisible` 绘制内沿焦点环 | sampler、register/ref 兼容路径与 timer 断言已删除，保留真实焦点/隐私行为回归 |
| 隐藏文本定时测量 | 已挂载样本的原生 `onLayout`，按字体与样本集缓存 | 无采样 timer。尚未取得首帧测量时保留估算，值与编辑 draft 不改变宽度 |
| `useFloatingCenterOffset` | F1 原生零尺寸点锚与 center 定位 | 补偿函数、调用和采样均已删除，side/align 与 intrinsic size 几何回归通过 |

`Input` 与数值编辑框只隔离可打印快捷键，不阻止原生文字编辑。原生已消费的删除、移动、撤销与提交不补发给工程窗口，完整契约见 [Input 键盘契约](Input/README.md)。`hideIcon`、`dragStep`、实际内宽与滚轮命中契约见 [DragPad](DragPad/README.md)。

字体 probe 使用真实 gpuix text layout，结果如下。probe 已删除，永久测试验证样本宽度上界、值位数变化不改宽度、缓存和最多一次宽度修正。

| 样本                    | 首帧估算 | 实测宽度 | 修正 |
| ----------------------- | -------- | -------- | ---- |
| compact BPM，Menlo 9    | 17px     | 17px     | 0px  |
| Transport BPM，Menlo 12 | 23px     | 22px     | −1px |
| compact Pan，Menlo 9    | 23px     | 22px     | −1px |

首次取得截图时测量已经完成，没有捕获估算首帧，因此不能声称修正肉眼不可见。真实布局 probe 证明存在 0px 或 1px 修正。需要完全消除可见修正时，组合入口可预热相同字体和样本缓存后再显示布局；本轮未加入这项产品策略。

## 已修复：按下即移动的光标锚点（G1，2026-10-15）

原限制：JS 处理 `mouseDown` 时读 OS 当前光标，合成“按下即移动”实测锚点从 `(805,364)` 偏到 `(805,354)`。现在锚点取按下事件自身的窗口坐标，经原生 `windowPointToScreen` 换算，不加补偿、轮询或 CGEventTap。`CursorLockPort.capture` 改为接收按下点；事件缺坐标时不锁光标。

真实画廊复测：按下屏幕点 `(412,293)`（AX 窗口原点 `(383,152)` + 窗口内 `(29,141)`）。无停留每步 10pt 上移 40pt 与同点停留 4 次后上移，两条路径的 `onGestureEnd` 读回都是 `(412,293)`，误差 0pt，BPM 均为 130。证据：[截图](DragPad/evidence/press-anchor-restored-2026-10-15.png)、[AX](DragPad/evidence/press-anchor-restored-2026-10-15.ax.txt)。仍未验证：人手真实硬件速度、多显示器与全屏实机（换算单测覆盖副屏负坐标）。细节见 [DragPad 契约](DragPad/README.md)。
