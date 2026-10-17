# Gallery 组件目录

Gallery 按组件类别陈列，每个类别只有一个区块（`GallerySection`），同一类的所有 variant 都在这个区块里，一行一个 variant（`GalleryVariant`），各状态横排在该行内（`GalleryState` 标注状态名）。同一组件不在多个区块重复出现；组合示例只放在“组合”类别。

`GallerySection` 按本区块全部 variant 标签的原生最大测宽确定标签列（取 n·u），并按 `GalleryState` 中最大控件的原生布局宽度确定统一状态列；已声明 `columns.width` 的表格保留显式宽度。状态描述只进入可访问性，不额外绘制重复文字。大组合示例不套状态 cell，保持其原有伸缩布局。

| 区块 id | 类别 | 内容 |
|---|---|---|
| `buttons` | 按钮 | Button 全部 variant、tone、size(default/transport)、iconOnly（default/ghost 无框、outline 有框、悬停增大字形、按下/active 填充）；状态：默认、active、disabled、无高亮 |
| `toggles` | 开关与选择 | Switch、Checkbox(含 mixed)、RadioGroup、ToggleGroup(含 segmented)、Chip、DragPadToggle、Badge/count |
| `numeric` | 数值 | DragPadNumber/Bar/Bipolar、PanControl、Knob(单极/双极/着色)、Fader；size 与 disabled |
| `inputs` | 输入 | Input(全部 variant、invalid/disabled/readOnly、leading/trailing/clear)、InlineEdit、Label |
| `menus` | 菜单与弹层 | DropdownButton、PopupButton、ContextMenu、DropdownMenu、OptionGrid、Popover |
| `lists` | 列表与导航 | ListRow、TreeRow、Breadcrumb、MotionTabs、SettingsNav、ScrollArea |
| `meters` | 电平与反馈 | LevelMeter 变体×状态矩阵：track、collapsed、mixer 高与矮、DropdownButton 内联 × 静音、正常、峰值保持、削波、实时；mixer 包含自适应刻度、数字和可点击复位的峰值读数。其余包括 Progress、Loading、Empty、Toast、LoadErrorScreen |
| `surfaces` | 容器 | Card(各 size)、ControlGroup(toolbar/joined)、Separator、DeviceHeader、SettingsShell、Kbd、Tooltip |
| `layout` | 布局 | Group/Panel/PanelDivider/CollapseDivider、PanelShell、DockLayout；TitleBar 在 Gallery 窗口顶部直接展示 |
| `composites` | 组合 | Live 风格调音台通道条，含共享非线性刻度 Fader 与可复位峰值读数；设备、工程卡片、拖放预览 |

每个类别一个文件 `gallery/catalog/<id>.tsx`，导出 `<Id>Section(props: GallerySectionProps)`，由 `gallery/catalog/index.tsx` 按上表顺序装配。新组件加入时进它所属类别，不新开区块。

Gallery 根使用同一 `ui/panels/DockLayout`：Categories、Preview 与 Theme 都在注册表中；主题、外观、语言统一位于 Theme 面板，不保留重复工具栏。类别选中状态由工作区持有，各 Section 自持演示状态。预览 Section 只有标题/说明行，不嵌套 Card 外框；类别、预览与 Theme 的内容 inset 复用 `design.cards.controls.inset`。已关闭或隐藏面板可从顶部 View 菜单或组菜单恢复。工作区没有外层 padding，面板间只保留 1px 分割线。`ProjectComposites` 只提供组合区块内的工程卡片与拖放 variant 行，不创建第二个区块。

Gallery 默认仅 Preview 留在编辑区，Categories 在左 rail 的 split 面板中默认打开，Theme 在右 rail 中默认收起（overlay），底部 rail 为空且可见。三条 rail 共用横/竖 variant；底 rail 夹在左右 rail 之间。rail 内侧始终保留 1px 线，打开面板后在主区边界另有一条兼作 resize highlight 的 1px 线；面板本身不再重复绘制该边线。overlay 不改变主区 bounds，split 为面板及单像素边线让出空间。

rail 图标分为 `tabs` 起始组与 `end` 末端组，拖放按光标所在半区与图标中点确定组及插入索引，侧栏选项按钮固定在末端组之后。旧 JSON 缺省 `end=[]`、`visible=true`、`hoverReveal=false`；标题栏三个 ghost 图标和 View 菜单共用 `toggleBorderVisible`，隐藏整块 rail/panel 并回收空间，不丢失选择或尺寸。开启状态仅用图标侧栏填充表示。

侧栏选项和图标右键菜单复用“抽屉模式 / 悬停展开”两个 checkbox 项；非抽屉模式保留 hover 设置但禁用其效果。悬停展开按 rail 与抽屉合并 bounds 判断离开，收起延迟由 `design.motion.dockHoverCloseDelayMs` 控制；抽屉内打开的嵌套菜单维持展开。native hover payload 补丁提供窗口坐标；未重建的 renderer 继续使用 enter/leave 退化逻辑。标题栏布局按钮、侧栏选项及组头 actions 共用 `ToolbarIconButton`；hover 显示仅改变 opacity、不切换到 `pointerEvents:auto`，避免 GPUI 子命中遮挡祖先后反复 enter/leave。侧栏菜单朝内、底栏菜单向上，菜单浮层使用 `fit=switch` 翻转而不是覆盖触发器。

生产入口 `main.tsx` / `gallery/controls.tsx` 将 root `onEvent` 的坐标事件交给 `createWindowPointerObserver`，经 `PanelEnvironment.subscribePointer` 注入 UI。rail、tab 栏与 tab 关闭按钮用该指针流核对自身 bounds，抽屉核对 rail/panel 合并 bounds；不修改 renderer 内部状态，也不让 UI 依赖 platform。`createTestRoot` 通过同一 `onEvent` 接口验收；未注入 observer 的组合继续兼容 enter/leave。

Gallery 的独立入口统一为 `gallery/controls.tsx`；面板示例属于 `layout`，不再保留独立 PanelGallery。旧 Clip/Device 分隔器回归使用 `panels.test.tsx` 内的最小测试组合，不作为生产展示入口。

整窗性能入口：在 `apps/gpuix` 执行 `bun src/gallery/performance.tsx`，视口匹配本轮原生截图的 1045×780 内容区，使用实际 GalleryDemo/Theme 面板与原生类别点击。逐类别预热后各采样 9 次完整 renderer flush，输出每类节点数与 p50；任何类别 p50 超过 8ms 时退出码为 1，不用不同类别的总中位数稀释慢点。它不把截图耗时或类别切换延迟混入 flush 指标。
