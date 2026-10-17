# gpuix 共享控件

当前实现消费固定 gpuix 主干 `6a5c7c142ac32f9eb0caefe0121be995cfc18631` 及仓库受控补丁。实现位于 `ui/controls`，原生能力由 [`src/gallery/controls.tsx`](../../gallery/controls.tsx) 等组合入口经 platform 端口注入。

## 范围与接口

| 类别 | 公共符号 |
| --- | --- |
| Button | `Button`、`DropdownButton`、`PopupButton`、`IconSlot` |
| 数值 | `DragPadNumber`、`DragPadBar`、`DragPadBipolar`、`DragPadToggle`、`PanControl` |
| Context menu | `ContextMenu`、`ContextMenuTrigger`、`ContextMenuContent`、`ContextMenuItem`、`ContextMenuCheckboxItem`、`ContextMenuLabel`、`ContextMenuSeparator`、`ContextMenuRadioGroup`、`ContextMenuRadioItem`、`ContextMenuOptionGrid`、`ContextMenuOptionGridItem`、`ContextMenuSub`、`ContextMenuSubTrigger`、`ContextMenuSubContent` |
| Dropdown menu | `DropdownMenu`、`DropdownMenuTrigger`、`DropdownMenuContent`、`DropdownMenuItem`、`DropdownMenuCheckboxItem`、`DropdownMenuOptionGrid`、`DropdownMenuOptionGridItem`、`DropdownMenuPortal`、`DropdownMenuSub`、`DropdownMenuSubTrigger`、`DropdownMenuSubContent` |
| Popover | `Popover`、`PopoverTrigger`、`PopoverContent`、`PopoverHeader`、`PopoverTitle` |
| 容器和反馈 | `Card`、`CardHeader`、`CardTitle`、`CardDescription`、`CardContent`、`Empty`、`EmptyHeader`、`EmptyTitle`、`EmptyDescription`、`Separator`、`Progress`、`Loading`、`LoadErrorScreen`、`ScrollArea`、`ControlledScrollbar`、`Toaster`、`toast`、`toastLoading` |
| 表单和导航 | `Label`、`Input`、`RadioGroup`、`RadioGroupItem`、`ToggleGroup`、`ToggleGroupItem`、`SettingsShell`、`SettingsNavItem`、`MotionTabs` |
| 列表 | `ListRow`（Browser、下拉与菜单的共享行容器；Enter 激活，Space 留给 Transport） |
| 环境和拖拽 | `ControlEnvironment`、`ControlEnvironmentProvider`、`ControlGroup`、`ControlInfo`、`useInfoBinding`、`DragPreviewArea` |

组件和专用 Props 位于 family 入口，根入口显式列出被消费的控件与类型。主题、预设和共享度量继续由 `shared/theme` 持有。

- 数值由消费者持有。所有数值变体共享 `useDragPad`、每步 4px 比例和主题度量，Bar/Bipolar 只改变填充外观。没有复制 track-mixer 的早期拖动逻辑。
- `CursorLockPort` 经 `ControlEnvironment.cursorLock` 注入。UI 不依赖 `@zoeydaw/native`。无端口时不隐藏光标；画廊组合入口接入真实 Rust 光标函数。
- `ControlEnvironment.textFocus` 是组合根可选注入的文本焦点 lease 端口，`enter(): () => void` 返回幂等释放函数。Input 与 DragPadNumber 实际编辑 input 在原生 `onFocus` 取得 lease，在 `onBlur`、编辑态退出或卸载时释放。普通数值 spinbutton 不报告文本焦点。lease 不传输入内容，不替代既有 ControlInfo；不查询 host 树、不轮询焦点。renderer 必须为 autoFocus 发出真实 focus 事件。
- `ControlEnvironment.subscribeWindowActive` 复用组合根的原生 activation 源。数值手势失活时走与 Escape 相同的取消路径：恢复按下值和光标、取消事务、清除 anchor；后续 move/up 不再提交。订阅只随源变更，不随数值预览重建；卸载释放订阅。
- 可聚焦 `readOnly` Input 仍报告文本焦点并隔离可打印快捷键，只有 `disabled` 排除。只读不等于非文本，选择/复制仍由原生编辑器拥有。
- Button 的 `active/onActiveChange` 为受控状态。`highlight` 默认开启，关闭后不加 hover 高亮。`iconOnly` 使用正方形尺寸，图标经共享 `Icon` 与主题 token 着色。active destructive 保持 web Record 的 danger wash、hover 与 focus 层级，不被 primary 覆盖。调用方可配置原生 `role/tabIndex`。
- 文本 Button 按实际字体原生测宽，宽度为容纳文字、IconSlot、gap、有效 padding/border 的最小 n·u；不再固定 4u。显式 width/maxWidth 或父容器空间不足时才截断；iconOnly 与 Transport 的整数网格正方形契约不变。`useMeasuredTextWidth` 同时挂载的重复字符串消费者也必须更新到共享测量结果，不留在初始估算宽度。
- `Button.tone` 的 `neutral/solo/arm/activator` 只影响激活色，使用 `derive` 的 `soloActive/armActive/activatorActive`；预设与自定义 base palette 自动派生，不扩充 base 颜色必填字段。
- `Checkbox.checked` 接受 `boolean | "mixed"`，混合态第一次激活变为选中；Space/Enter 切换，`invalid` 使用 destructive 边框。`Chip.selected/onSelectedChange` 是受控标签选择；`remove: { label, onRemove }` 的独立 X 按钮不会触发选择。
- `Fader` 只保留 Live 式竖向形态：左侧 `Shape` 三角手柄、中央 `LevelMeter`、右侧 `ticks: { value, label }[]` 分贝刻度；不再提供轨道/横杠外观或 orientation API。拖动手柄或电平区域共用 `useDragPad` 的相对垂直拖动、滚轮、失焦回滚与双击 `defaultValue` 复位。Up/Down 调值，Home/End 到边界；三角位置、ARIA slider 值与 `aria-valuetext` 来自同一受控 value。无 meter 输入时显示静音底表，不伪造活动电平。
- Fader 刻度按文字行高剔除碰撞标签，优先保留 0 dB；三角尖端对齐 handle slot 的右边缘，和电平之间仅使用 `handleGapUnits·u` 间距。
- `ToggleGroup variant="segmented"` 用单一外框和零间距连接子项。文字型 `ToggleGroupItem` 按原生测宽加有效 padding/border 向上取最小 n·u；文字节点可收缩并从右侧省略，不再把长文案放进固定 segment 宽度后居中裁掉左边。非文字复合项仍由调用方布局。`TreeRow` 在 `ListRow` 上增加 `depth`、`expanded/onExpandedChange`、Folder 图标与 Left/Right 折叠展开；复合树 owner 仍负责 roving tabindex。`Breadcrumb.segments` 注入可点击路径及标签。
- `DeviceHeader` 持有 activator、collapse、title 与 trailing `actions` 布局；`titleButtonProps` 保留标题的拖放 ref/handlers，Footer DeviceCard 不再手写同一标题栏。
- 控件单元 `u = theme.control["--spacing-control-track"]`；`design.grid` 持有文字/标签/segment/组合 slot 的整数单元数。默认 iconOnly Button 与 Checkbox 为 1u×1u，Switch 为 2u×1u，Knob 直径 2u，Chip 高 1u。Transport 档与测宽型 DragPadNumber/DropdownButton 经 `snapControlWidth` 向上取整到 n·u；Fader 长度、手柄、电平与刻度 slot 由 `design.fader.*Units` 定义。三角作为 slot 内的图形使用独立比例，不改变控件命中尺寸。
- Knob 外框宽度取旋钮直径、实际标签与数值的最大测宽，再取整到 n·u，长于直径的标签不被无谓截断。默认 NumericPad/PanControl 统一至少 `numericWidthUnits·u`，更长数值仍按实际测宽扩展。DragPad 填充默认透明度为 0.55；Bar 的主色填充完整覆盖数值时使用 primaryForeground，避免增强填充后数字失去对比。Gallery 双极示例使用可编辑的非零值，0 仍显示真正的空中心状态。
- `TruncatedText` 统一单行省略与完整文案 Tooltip；width/maxWidth 取整到 n·u，未截断时只保留一个原生 text，不创建 Tooltip 宿主。仅实际测宽超过可用宽度时建立 hover-only Tooltip；Button/Chip/DeviceHeader/Breadcrumb 的文字、ListRow/TreeRow、Menu 行与 GalleryVariant 标签全部复用此入口。交互父控件传入 `hovered` 时，文字绘制树保持 pointer-transparent，由父控件拥有唯一点击/hover 命中；独立文字才拥有自己的 hover 触发器，避免截断文字吞掉按钮或菜单激活。
- Button/ListRow 禁用时不进入文字 hover Tooltip 状态，保持 disabled 的 idle/hover/pressed 整体光栅不变；完整名称仍由 aria 标签提供。测宽型数值控件的 border 改动仍立即改变实际描边，但内容未越过单元边界时 n·u 外框宽度保持稳定。
- GalleryState 默认不创建原生 wrapper/重复状态标签，仅保留控件及状态的可访问性描述；显式 `width` 用于表格 cell（如 Buttons 的 iconOnly 状态列）以保留控件方形。Buttons 列宽按最长原生列头测宽取 n·u，文字按钮显式跟随列宽，列头只绘制一次；1u 网格示例使用单字符并保留完整 aria 名称。性能入口 `bun src/gallery/catalog/performance.tsx` 对各类别单独挂载，测连续 9 次原生 flush 的 p50；整窗入口为 `bun src/gallery/performance.tsx`。
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
