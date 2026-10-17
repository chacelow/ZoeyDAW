# Gallery 组件目录

Gallery 按组件类别陈列，每个类别只有一个区块（`GallerySection`），同一类的所有 variant 都在这个区块里，一行一个 variant（`GalleryVariant`），各状态横排在该行内（`GalleryState` 标注状态名）。同一组件不在多个区块重复出现；组合示例只放在“组合”类别。

`GallerySection` 按本区块全部 variant 标签的原生最大测宽确定标签列（取 n·u），并按 `GalleryState` 中最大控件的原生布局宽度确定统一状态列；已声明 `columns.width` 的表格保留显式宽度。状态描述只进入可访问性，不额外绘制重复文字。大组合示例不套状态 cell，保持其原有伸缩布局。

| 区块 id | 类别 | 内容 |
| --- | --- | --- |
| `buttons` | 按钮 | Button 全部 variant、tone、size(default/transport)、iconOnly（default/ghost 无框、outline 有框、悬停增大字形、按下/active 填充）；状态：默认、active、disabled、无高亮 |
| `toggles` | 开关与选择 | Switch、Checkbox(含 mixed)、RadioGroup、ToggleGroup(含 segmented)、Chip、DragPadToggle、Badge/count |
| `numeric` | 数值 | DragPadNumber/Bar/Bipolar、PanControl、Knob(单极/双极/着色)、Fader；size 与 disabled |
| `inputs` | 输入 | Input(全部 variant、invalid/disabled/readOnly、leading/trailing/clear)、InlineEdit、Label |
| `menus` | 菜单与弹层 | DropdownButton、PopupButton、ContextMenu、DropdownMenu、OptionGrid、Popover |
| `lists` | 列表与导航 | ListRow、TreeRow、Breadcrumb、MotionTabs、SettingsNav、ScrollArea |
| `meters` | 电平与反馈 | LevelMeter 变体×状态矩阵：track、collapsed、mixer 高与矮、DropdownButton 内联 × 静音、正常、峰值保持、削波、实时；mixer 包含自适应刻度、数字和可点击复位的峰值读数。其余包括 Progress、Loading、Empty、Toast、LoadErrorScreen |
| `surfaces` | 容器 | Card(各 size)、ControlGroup(toolbar/joined)、Separator、DeviceHeader、SettingsShell、Kbd、Tooltip |
| `layout` | 布局 | Group/Panel/PanelDivider/CollapseDivider、PanelShell、DockLayout 组件示例 |
| `composites` | 组合 | Live 风格调音台通道条，含共享非线性刻度 Fader 与可复位峰值读数；设备、工程卡片、拖放预览 |

每个类别一个文件 `gallery/catalog/<id>.tsx`，导出 `<Id>Section(props: GallerySectionProps)`，由 `gallery/catalog/index.tsx` 按上表顺序装配。新组件加入时进它所属类别，不新开区块。

Gallery 是主应用 `/gallery` 路由中的单一表面，共用应用 TitleBar、ThemeProvider、偏好与语言。左侧分类列表和右侧预览位于同一面板，当前 Section 按需挂载；主题编辑继续位于 Settings > Appearance。Gallery 不创建独立窗口、TitleBar、主题面板、语言开关或 DockLayout。

可见界面验收使用主应用窗口；`bun src/main.tsx` 配合 `ZOEYDAW_ROUTE=/gallery` 启动应用路由，性能入口 `bun src/gallery/performance.tsx` 离屏按类别检查当前 Section 的挂载与 renderer flush。

Gallery 的应用入口是主应用 `/gallery` 路由，采用主应用的 `ControlEnvironment`、ThemeProvider 与 pointer observer。类别选择与预览共享一块表面，类别列表使用共享 `List`。`createTestRoot` 离屏测试入口仍用于组件和性能测量。
