# Gallery 组件目录

Gallery 按组件类别陈列，每个类别只有一个区块（`GallerySection`），同一类的所有 variant 都在这个区块里，一行一个 variant（`GalleryVariant`），各状态横排在该行内（`GalleryState` 标注状态名）。同一组件不在多个区块重复出现；组合示例只放在“组合”类别。

| 区块 id | 类别 | 内容 |
|---|---|---|
| `buttons` | 按钮 | Button 全部 variant、tone、size(default/transport)、iconOnly；状态：默认、active、disabled、无高亮 |
| `toggles` | 开关与选择 | Switch、Checkbox(含 mixed)、RadioGroup、ToggleGroup(含 segmented)、Chip、DragPadToggle |
| `numeric` | 数值 | DragPadNumber/Bar/Bipolar、PanControl、Knob(单极/双极/着色)、Fader；size 与 disabled |
| `inputs` | 输入 | Input(默认/invalid/disabled)、Label |
| `menus` | 菜单与弹层 | DropdownButton、PopupButton、ContextMenu、DropdownMenu、OptionGrid、Popover |
| `lists` | 列表与导航 | ListRow、TreeRow、Breadcrumb、MotionTabs、SettingsNav、ScrollArea |
| `meters` | 电平与反馈 | LevelMeter(静态/实时)、Progress、Loading、Empty、Toast、LoadErrorScreen |
| `surfaces` | 容器 | Card(各 size)、ControlGroup(toolbar/joined)、Separator、DeviceHeader、SettingsShell |
| `layout` | 布局 | Group/Panel/PanelDivider/CollapseDivider、PanelShell、DockLayout |
| `composites` | 组合 | Live 风格调音台通道条、设备、工程卡片、拖放预览 |

每个类别一个文件 `gallery/catalog/<id>.tsx`，导出 `<Id>Section(props: GallerySectionProps)`，由 `gallery/catalog/index.tsx` 按上表顺序装配。新组件加入时进它所属类别，不新开区块。

`gallery/states.tsx` 的 `GalleryWorkspace` 持有 DockLayout 工作区：左侧全宽类别导航（`GalleryCategories`）、中央全宽可滚动预览（`GalleryCatalog`）、右侧整体可滚动主题编辑器，以及控件提示与 Toaster。外观与语言 ToggleGroup 统一位于 Theme 面板，不保留顶部重复工具栏。类别选中状态由工作区持有；各 Section 自持演示状态，主题切换不重建 Section。预览 Section 只有标题/说明行，不再嵌套 Card 外框或折叠按钮；类别、预览、Theme 的内容 inset 统一取 `design.dock.contentInset`。隐藏的面板通过 Dock 面板组菜单的 Show panels 恢复。`ProjectComposites` 只提供组合区块内的工程卡片与拖放 variant 行，不创建第二个区块。

Gallery 的独立入口统一为 `gallery/controls.tsx`；面板示例属于 `layout`，不再保留独立 PanelGallery。旧 Clip/Device 分隔器回归使用 `panels.test.tsx` 内的最小测试组合，不作为生产展示入口。

整窗性能入口：在 `apps/gpuix` 执行 `bun src/gallery/performance.tsx`，视口匹配本轮原生截图的 1045×780 内容区，使用实际 GalleryDemo/Theme 面板与原生类别点击。逐类别预热后各采样 9 次完整 renderer flush，输出每类节点数与 p50；任何类别 p50 超过 8ms 时退出码为 1，不用不同类别的总中位数稀释慢点。它不把截图耗时或类别切换延迟混入 flush 指标。
