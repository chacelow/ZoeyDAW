# gpuix 共享控件

当前实现消费固定 gpuix 主干 `6a5c7c142ac32f9eb0caefe0121be995cfc18631` 及仓库受控补丁。实现位于 `ui/controls`，原生能力由 [`src/gallery/controls.tsx`](../../gallery/controls.tsx) 等组合入口经 platform 端口注入。

## 范围与接口

| 类别 | 公共符号 |
| --- | --- |
| Button | `Button`、`ToolbarIconButton`、`DropdownButton`、`PopupButton`、`IconSlot` |
| 数值 | `DragPadNumber`、`DragPadBar`、`DragPadBipolar`、`DragPadToggle`、`PanControl` |
| Context menu | `ContextMenu`、`ContextMenuTrigger`、`ContextMenuContent`、`ContextMenuItem`、`ContextMenuCheckboxItem`、`ContextMenuLabel`、`ContextMenuSeparator`、`ContextMenuRadioGroup`、`ContextMenuRadioItem`、`ContextMenuOptionGrid`、`ContextMenuOptionGridItem`、`ContextMenuSub`、`ContextMenuSubTrigger`、`ContextMenuSubContent` |
| Dropdown menu | `DropdownMenu`、`DropdownMenuTrigger`、`DropdownMenuContent`、`DropdownMenuItem`、`DropdownMenuCheckboxItem`、`DropdownMenuOptionGrid`、`DropdownMenuOptionGridItem`、`DropdownMenuPortal`、`DropdownMenuSub`、`DropdownMenuSubTrigger`、`DropdownMenuSubContent` |
| Popover | `Popover`、`PopoverTrigger`、`PopoverContent`、`PopoverHeader`、`PopoverTitle` |
| 容器和反馈 | `Card`、`CardHeader`、`CardTitle`、`CardDescription`、`CardContent`、`Empty`、`EmptyHeader`、`EmptyTitle`、`EmptyDescription`、`Separator`、`Progress`、`Loading`、`LoadErrorScreen`、`ScrollArea`、`ControlledScrollbar`、`Toaster`、`toast`、`toastLoading`、`Badge`、`Kbd`、`Tooltip` |
| 表单和导航 | `Label`、`Input`、`InlineEdit`、`RadioGroup`、`RadioGroupItem`、`ToggleGroup`、`ToggleGroupItem`、`SettingsShell`、`SettingsNavItem`、`MotionTabs` |
| 列表 | `ListRow`（Browser、下拉与菜单的共享行容器；Enter 激活，Space 留给 Transport） |
| 环境和拖拽 | `ControlEnvironment`、`ControlEnvironmentProvider`、`ControlGroup`、`ControlInfo`、`useInfoBinding`、`DragPreviewArea` |

组件和专用 Props 位于 family 入口，根入口显式列出被消费的控件与类型。主题、预设和共享度量继续由 `shared/theme` 持有。

- 数值由消费者持有。所有数值变体共享 `useDragPad`、每步 4px 比例和主题度量，Bar/Bipolar 只改变填充外观。没有复制 track-mixer 的早期拖动逻辑。
- `CursorLockPort` 经 `ControlEnvironment.cursorLock` 注入。UI 不依赖 `@zoeydaw/native`。无端口时不隐藏光标；画廊组合入口接入真实 Rust 光标函数。
- `ControlEnvironment.textFocus` 是组合根可选注入的文本焦点 lease 端口，`enter(): () => void` 返回幂等释放函数。Input 与 DragPadNumber 实际编辑 input 在原生 `onFocus` 取得 lease，在 `onBlur`、编辑态退出或卸载时释放。普通数值 spinbutton 不报告文本焦点。lease 不传输入内容，不替代既有 ControlInfo；不查询 host 树、不轮询焦点。renderer 必须为 autoFocus 发出真实 focus 事件。
- `ControlEnvironment.subscribeWindowActive` 复用组合根的原生 activation 源。数值手势失活时走与 Escape 相同的取消路径：恢复按下值和光标、取消事务、清除 anchor；后续 move/up 不再提交。订阅只随源变更，不随数值预览重建；卸载释放订阅。
- `useDragPad` 在按下和活动 move 清除 renderer 的窗口级 SelectionState；`useDividerDrag` 仅在按下清除已有选择与 pending anchor，不在 captured move 重复调用原生接口。数值 shell 与 divider 命中区继承 `userSelect: "none"`，原生 selection-start registry 不会在这些区域 arm；跨过其它文字的 captured move 不启动选择，松手后其它文字仍可正常选择。
- 可聚焦 `readOnly` Input 仍报告文本焦点并隔离可打印快捷键，原生保留选择/复制、使用 Arrow 指针且不绘制插入符。`disabled` 直接交给原生 input，不注册宿主焦点 handle、不进入 Tab 顺序或响应选择/编辑，并使用 not-allowed 指针；共享控件不再叠加禁用 hit shield。禁用视觉状态继续读取主题 token。
- `Input.variant` 使用 outline/filled/ghost（别名 borderless）/underline；`size` 为 default/transport/small，leading/trailing 复用 IconSlot，clearable 配本地化 clearLabel 并在清除后保留 input 焦点。`InlineEdit.value/onCommit` 以 ghost Input 复用原生编辑；点击、Enter/F2 开始，Enter/失焦提交，Escape 取消。详见 [Input](Input/README.md)。
- Button 的 `active/onActiveChange` 为受控状态。`highlight` 默认开启，关闭后不加 hover 高亮。`iconOnly` 使用正方形尺寸，非 outline 变体不画边框，也不画背景 hover 高亮：悬停只作用于图标本身，图标变为前景色并立即放大 `design.icon.hoverGrowth`（svg 的 paint-only `scale`，按基准尺寸光栅化一次，由 GPU 缩放，不重排），移开立即复原，没有动画。只有显式 `variant="outline"` 保留框线，Checkbox 自己选择 outline 以保留空选框。`activeFilled` 让共享 Icon 在 active/按下时由线条切换填充，ToolbarIconButton 支持同一接口。已有直接 Icon children 与 IconSlot children 都走同一路径。active destructive 保持 danger wash、hover 与 focus 层级，不被 primary 覆盖。调用方可配置原生 `role/tabIndex`。
- 文本 Button 按实际字体原生测宽，宽度为容纳文字、IconSlot、gap、有效 padding/border 的最小 n·u；不再固定 4u。显式 width/maxWidth 或父容器空间不足时才截断；iconOnly 与 Transport 的整数网格正方形契约不变。`useMeasuredTextWidth` 同时挂载的重复字符串消费者也必须更新到共享测量结果，不留在初始估算宽度。
- `Button.tone` 的 `neutral/solo/arm/activator` 只影响激活色，使用 `derive` 的 `soloActive/armActive/activatorActive`；预设与自定义 base palette 自动派生，不扩充 base 颜色必填字段。
- `Checkbox.checked` 接受 `boolean | "mixed"`，混合态第一次激活变为选中；Space/Enter 切换，`invalid` 使用 destructive 边框。`Chip.selected/onSelectedChange` 是受控标签选择；高度固定 1u、圆角来自 `design.shape.controlRadius`，边框与选中填色复用 Button。`remove: { label, onRemove }` 的独立 X 按钮位于同一 chip 外框内右侧，主 Button 预留 IconSlot、gap 和 track-pad，移除不触发选择；不再保留独立 chip.radius。
- `LevelMeter.channels` 是两个 `{ rmsDb, peakDb, holdDb }` 声道。颜色按刻度位置决定（Live 做法）：0 dB 以上 `arrangementMeterClip`，0 → `design.editor.meter.warnDb` 由红渐变到 `arrangementMeterWarn`，再到 `goodDb` 渐变到 `arrangementMeterGood`，以下为纯绿；RMS 实色、瞬时 peak 低透明度，二者都只填到实际电平，超过 0 dB 的部分随真实电平上升。hold 为保持线；`holdDb > clipDb` 时顶部亮起至少 `clipMinHeight` 高的过载指示。`main`（Main 输出）以及高度太矮看不出红区的 `inline`/`collapsed` 在过载时把该声道整条填充变红。`track/collapsed/inline` 的过载随 hold 释放，`mixer` 的峰值读数锁存最大值，点击复位为 −∞。
- `design.editor.meter.scale` 保存 Live 的分段线性断点。`meterPosition` 是电平填充、保持线、刻度和 Fader 三角的唯一 dB 位置转换，`meterDbAtPosition` 是其逆函数。`width` 是电平条本身的宽度，保持紧凑；刻度与数字随**高度**出现并附加在条外：表高达到 `ticksMinHeightUnits` 时左侧出现刻度短线，mixer 达到 `numbersMinHeightUnits` 时右侧出现省略负号的 dB 数字和上方峰值读数。碰撞过滤优先保留 0 dB。collapsed 条宽为 track 的一半，inline 用于 DropdownButton 的 `icon` 槽。
- `Fader` 从左到右排列三角、刻度短线、电平表、数字。拖动按共享刻度及其逆函数转换像素位移，滚轮与键盘仍按 dB 步进；失焦回滚和双击 `defaultValue` 复用 `useDragPad`。装饰子树 pointer-transparent，外框拥有唯一拖动命中。`meter.variant="mixer"` 在上方显示可复位峰值读数；无 meter 输入时显示静音底表。
- `ToggleGroupItem` 直接复用 Button 的测宽、padding、字体、状态 chrome 与 n·u 尺寸；default/outline/segmented 相同文案的选项宽度一致。segmented 用零 gap、透明内边框和单一外框连接，不改变选项的有效 padding/border 尺寸。其余 group 使用 track-gap，未选中项仍有 Button 的边框/底色。RadioGroupItem 高度为 u，圆点与文字沿 row 排列并使用 control-gap；选项间统一 track-gap。`TreeRow` 在 `ListRow` 上增加 `depth`、`expanded/onExpandedChange`、Folder 图标与 Left/Right 折叠展开；复合树 owner 仍负责 roving tabindex。`Breadcrumb.segments` 注入可点击路径及标签。
- `DeviceHeader` 持有 activator、collapse、title 与 trailing `actions` 布局；`titleButtonProps` 保留标题的拖放 ref/handlers，Footer DeviceCard 不再手写同一标题栏。
- 控件单元 `u = theme.control["--spacing-control-track"]`；`design.grid` 持有文字/标签/segment/组合 slot 的整数单元数。默认 iconOnly Button 与 Checkbox 为 1u×1u，Switch 为 2u×1u，Knob 直径 2u，Chip 高 1u。Transport 档与测宽型 DragPadNumber/DropdownButton 经 `snapControlWidth` 向上取整到 n·u；Fader 长度、手柄、电平与刻度 slot 由 `design.fader.*Units` 定义。三角作为 slot 内的图形使用独立比例，不改变控件命中尺寸。
- Knob 外框宽度取旋钮直径、实际标签与数值的最大测宽，再取整到 n·u，长于直径的标签不被无谓截断。默认 NumericPad/PanControl 统一至少 `numericWidthUnits·u`，更长数值仍按实际测宽扩展。DragPad 填充默认透明度为 0.55；Bar 的主色填充完整覆盖数值时使用 primaryForeground，避免增强填充后数字失去对比。Gallery 双极示例使用可编辑的非零值，0 仍显示真正的空中心状态。
- Knob 的标签、旋钮与数值都是同一个根 slider 的拖动/滚轮命中区域；文字与图形不拦截根手势，也不进入窗口文本选择。
- `centering.test.tsx` 的离屏原生矩阵测实际字形与控件边界，中心容差 0.5px；覆盖按钮、图标/文字组合、check、radio、chip+close、数值、knob、tabs、segment、menu check/shortcut、列表和输入 adornment。Input、InlineEdit、Label、Radio、ListRow/TreeRow、Dropdown 与 DeviceHeader 标题保持起始对齐；旋钮文字各自在 1u 槽位垂直居中，Fader 刻度亦然，三角尖端仍右对齐。原生 input 内部文字/caret 不作为宿主子节点暴露，矩阵只能测其装饰图标，编辑语义另由原生输入回归覆盖。
- `Badge` 是与 Chip 同高、同方角的非交互计数/状态徽标，支持 neutral/accent/destructive；`Kbd` 是主题等宽字体快捷键键帽；`Tooltip` 复用原生 anchored tooltip，和 TruncatedText 共用 `tooltipChrome`。`Loading inline` 提供紧凑行内状态，沿用真实 label/progress，不增加渲染器不支持的旋转或伪 spinner。
- Switch 用原生 `motion.div` 同步滑动 thumb、交叉淡化 track/border 与 thumb 颜色；时长与缓动来自 `design.motion.switch`。初次挂载直接显示受控状态，`reducedMotion` 与 MotionTabs 一样把 transition duration 设为零。
- `TruncatedText` 统一单行省略与完整文案 Tooltip；width/maxWidth 取整到 n·u，未截断时只保留一个原生 text，不创建 Tooltip 宿主。仅实际测宽超过可用宽度时建立 hover-only Tooltip；Button/Chip/DeviceHeader/Breadcrumb 的文字、ListRow/TreeRow、Menu 行与 GalleryVariant 标签全部复用此入口。交互父控件传入 `hovered` 时，文字绘制树保持 pointer-transparent，由父控件拥有唯一点击/hover 命中；独立文字才拥有自己的 hover 触发器，避免截断文字吞掉按钮或菜单激活。
- Button/ListRow 禁用时不进入文字 hover Tooltip 状态，保持 disabled 的 idle/hover/pressed 整体光栅不变；完整名称仍由 aria 标签提供。测宽型数值控件的 border 改动仍立即改变实际描边，但内容未越过单元边界时 n·u 外框宽度保持稳定。
- GalleryState 仅注入控件的可访问性状态描述；GallerySection 为这些状态建立统一列网格，列宽按区块中最宽控件原生布局测量取 n·u，显式 columns.width 则保持既有表格列宽。所有 GalleryVariant 标签按区块全部标签的原生最大测宽取 n·u，不截断长 variant 名；没有 GalleryState 的大组合示例保留原布局。Buttons 列头只绘制一次；1u 网格示例使用单字符并保留完整 aria 名称。性能入口 `bun src/gallery/catalog/performance.tsx` 对各类别单独挂载，测连续 9 次原生 flush 的 p50；整窗入口为 `bun src/gallery/performance.tsx`。
- `DropdownButton` 复用固定主干 Select。`size` 只控制 trigger；弹层选项与 Menu 共用 `Menu/row` 的固定行高、统一四边 inset、check column、单行省略与完整标签 Tooltip；基础 chrome 来自 `listRowChrome`，不随 Transport 放大。`fill` 同时铺满外层和 trigger，默认仍按内容测宽。工具栏 trigger 的 Space 留给播放，弹层选项 Space 选择并消费。换行折成空格，指示器固定右侧。
- 数值控件只通过 `size` 选择尺寸，不提供 `variant` 尺寸别名。`theme.design.typography.numberFontFamily` 同时控制宽度测量、显示与编辑字体；默认 Menlo，可由组合根的 ThemeProvider design 覆盖。
- `ControlledScrollbar` 是加性的横/纵向受控变体：`value`、`viewport`、`extent` 使用同一逻辑单位，`length` 是绘制长度，`onChange` 写回消费者的唯一 owner。Arrangement 用它实现 **minimap 下 marks 与 timeline 共用的一条横向滚动条**，不另建音乐滚动状态或巨大 native scroll 内容。
- 滚动条导航键只由控件消费，Space 留给窗口播放 owner；悬停滚轮通过原生 `pointerEvents: auto` 命中阻止祖先一起滚动，不伪造已消费事件标志。厚度和最小 thumb 来自共享控件度量，当前逻辑值经 `aria-valuetext` 暴露。
- Menu/Popover 复用固定主干 `FloatingLayer` 与 `renderSlot`。ContextMenu 用原生 `onContextMenu` 事件捕获最近作用域，能跨交互后代，不复制 MouseDown 分发或判断 Ctrl。Menu 按 state/context、trigger、navigation、content、item composition 拆分；根 trigger 的 Space 留给播放，弹层 MenuItem 与 SubTrigger 的 Space 仍选择并消费。
- Menu 的 Home/End、方向导航、Escape 与子菜单 Left/Right 消费默认行为和传播；根 trigger 的 Enter/Up/Down 同样消费，Space 仍交给播放。Tab 关闭菜单后保留原生焦点前进。`MenuTrigger` 保留调用方 `tabIndex`，默认仍为 0，允许编辑面把其从属 context trigger 排除在 Tab 顺序外。
- Menu 每行预留一个 `IconSlot` 的 check column；checkbox/radio/grid 选中使用 `Icon name="Check"`，子菜单使用 `ChevronRight`。`shortcut?: string` 在 Item/CheckboxItem/RadioItem 右侧弱化显示，禁用行不悬停高亮。Separator 水平抵消 menu inset，贯穿表面内边框；上下统一 `design.menu.separatorInset`。
- `ContextMenuOptionGrid`（及 Dropdown 别名）接受正整数 `columns`、受控 `value/onValueChange`，选项使用 `options: { id, label, disabled?, color? }[]` 或 `ContextMenuOptionGridItem value="…"` children，不能同时传两者。每格注册为 `menuitemradio` 并暴露 `aria-checked`；点击、Enter/Space 选择后关闭菜单并归还 trigger 焦点。Up/Down 延续线性顺序；Left/Right 只在当前网格同一行内移动并跳过禁用格，不越行，也不触发子菜单关闭；网格外 Left 仍关闭子菜单。`color` 使用调用方内容色填满格，选中用主题 ring 描边；行高与普通项一致。
- 已处理的局部键盘命令统一调用 `shared/keyboard.consumeKey(event, "handled")`，同时阻止默认行为和窗口传播；未处理的键保持原路径。文字快捷键隔离仍只调用 `stopPropagation`，不阻止原生输入；原生默认激活与调用方 `onKeyDown` 顺序不变，Toolbar/Transport trigger 的 Space 继续冒泡，菜单选项的 Space 继续选择并消费。
- Popover/Menu Trigger 的实际键盘命令由既有父容器在子元素处理后路由；context 只注册唯一 trigger handler，卸载清理，不加 wrapper 或定时器。Button asChild 的 Enter 先执行自己的 `onActiveChange`/`onClick`，再由 Button 消费；原生或普通 asChild 元素未消费时由父 owner 执行并消费触发器命令。按真实 renderer 的 focused element id 判断 trigger 身份，不把祖先事件的 `elementId` 当作原始 target。DropdownButton 自身不暴露 asChild，也没有套 Button 的 trigger 路径。
- DragPad 确实取消 drag/pre-edit、处理 Up/Down、进入编辑或接收预编辑输入时消费键盘事件；idle Escape 放行给弹层或窗口，普通 spinbutton 的 Space 继续冒泡。原生窗口键盘组合回归在 `keyboard-ownership.test.tsx`。
- `toastLoading(message, id?)` 保留原消费者接口。同 id 的 loading 可以被 success/error 替换；通知 store 只有一份，替换、淘汰和关闭清理旧 timer。
- `SettingsShell` 是非模态导航和内容容器，不宣称实现模态 focus trap。RadioGroup 与对话框内 SettingsNavItem 保留标准 Space 选择；工具栏 `MotionTabs` 只用 Enter 激活，Space 不切换。Tabs 使用静态指示器和原生 opacity 过渡。
- `DragPreviewArea` 以显式 `data` 或 `items` 和 `renderPreview(data)` 描述拖动源。预览支持阈值、释放、Esc 和取消；实际资源放置保持禁用。源内容若是带底色的行等会遮挡命中的原生元素，`items[].children` 传函数，把收到的 `DragSourceHandlers` 展开到该元素上。

## 统一样式配置（2026-10-16）

控件经 `useTheme()` 消费完整 `design` 分组：SettingsShell、菜单和浮层尺寸，空态和加载态几何，拖动预览、数值填充/中心标记/预编辑 caret，禁用透明度，语义 cursor，字体权重、图标描边和 tabs 动效。Button destructive 状态与 ListRow hover 使用统一派生颜色，不在消费者重算配方。显式传入的尺寸或偏移 `0` 不触发默认值。

`iconMarkup(name, strokeWidth, filled?)` 是要求显式描边的纯 helper；只有 `<Icon>` 从主题解析默认值。SVG viewBox、百分比换算、布局收缩/拉伸与 reduced-motion 的零时长仍是结构或可访问性常量。

## 文案与通知策略

共享组件不定义自然语言 fallback；显示、朗读、编辑与测宽所需文案由调用方提供。

| 组件              | 必填输入                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| `Loading`         | `label`；有 logo 时配 `logoAlt`，有 progress 时配 `progressValueText`      |
| `Progress`        | `aria-valuetext`，包括加载中与确定进度的本地化表示                         |
| `SettingsShell`   | `closeLabel`、`navigationLabel`                                            |
| `LoadErrorScreen` | `title`；retry 操作配 `retryLabel`，primary 操作配 `primaryLabel`          |
| `PanControl`      | `label`、`format`、`parse`、`widthSamples`                                 |
| `DragPadToggle`   | 纯文字分支配 `labelOn`、`labelOff`；显式 icon 或 children 分支无需无用标签 |
| `Toaster`         | `aria-label`、`dismissLabel`、`loadingLabel`、`policy`                     |

组合根在发布通知前调用 `configureToastPolicy({ defaultDuration, queueLimit, visibleLimit })`。唯一通知 store 持有配置引用、notice 与 timer；`Toaster` 只读 presentation，卸载 owner 调用 `dismissToast()` 释放通知资源。持续通知的 duration=0 是状态语义，不属于动画时长或主题。
