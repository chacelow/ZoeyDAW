# 原生面板

公共入口为 `index.ts`。仅依赖 gpuix、React 与 shared/theme，不依赖 DOM、工程状态或 platform。

## 组件

- `Group` 接收 `orientation="horizontal" | "vertical"`，直接子节点为 `Panel` 与 `Separator` 或 `PanelDivider`。分隔条方向与 Group 垂直。不支持 Fragment、嵌套包装组件或完整 react-resizable-panels API。
- `Panel` 的 `defaultSize`、`minSize`、`maxSize`、`collapsedSize` 中，数值是像素，字符串是百分比。`"25"` 与 `"25%"` 等价，`0` 是零像素。
- `panelRef` 提供 `isCollapsed()`、`expand()`、`collapse()`、`resize(px)` 与 `getSize()`。`onResize` 与 `getSize()` 都返回 `{ inPixels, asPercentage }`，百分比的分母扣除了分隔条。
- 数值 defaultSize 的面板在容器重排时保留当前像素尺寸；百分比面板按剩余空间重新分配。已折叠的面板不会因窗口放大自动展开。
- `PanelShell` 与 Dock group 不绘制边框或圆角，面板内容直接贴边。active 只改变语义描述，不添加外沿或改变尺寸。调用方必须注入 `aria-label` 与 `activeDescription`；机器 `id` 只用于激活和 testId，不作为用户名称。原生 mouseDown 向调用方分发激活，子控件的 mouseDown 不会屏蔽它。
- `PanelHeader` 使用 Dock 标题条的高度、表面、排版、内边距，并支持尾随操作。
- `Separator` 在布局树里只绘制 `design.shape.separatorWidth` 的 `colors.border` 细线；Group 的可用空间只扣除这条线，不扣除命中宽度。`PanelDivider` 与 Dock sash 复用同一实现。命中区取 `project.panelGap`（当前 7px），以细线为中心，两侧覆盖面板内容但不制造 gutter。
- `DividerLayer` 的嵌套实例将命中层 portal 到最外层末尾层，并按本地 bounds 转换坐标，保证 Dock 的稳定内容层无法覆盖 sash。hover/focus 只改 1px 线的颜色，不改命中几何。拖动每次 move 计算真实尺寸，在下一帧实时提交最新快照；不会只移动 outline。方向键立即提交，松手同步 flush 最终快照，取消清除待提交帧并恢复按下值。
- `CollapseDivider` 管理 Group 外固定高度区域的显隐，包含它与相邻内容的容器必须使用 `DividerLayer`，以复用同一末尾命中层。`expandedSize` 的一半是切换阈值，拖回阈值以内恢复按下时的状态。上下方向键分别展开与折叠。调用方必须提供 `aria-label` 与 `formatAccessiblePixels`，朗读当前展开尺寸或折叠后的零值，共享组件不拼接英文单位。
- `CollapseDivider` 的 Home/Up 展开、End/Down 折叠与活动拖动的 Escape 取消只由控件消费（`preventDefault`、`stopPropagation`），不能同时触发窗口 rewind 或关闭 Clip Edit；idle Escape 与 Space 继续冒泡给窗口。`useDividerDrag.cancel` 从唯一 anchor 判断并返回是否实际取消；视觉拖动状态不作为手势真值。原生组合回归见 `ui/verification/r2-controls.test.tsx`。
- `TitleBar` 是 App 固定窗口 chrome：`title`、`left`、`actions`、本地化 `labels` 与可选 `window: TitleBarWindow`。UI 不读取 platform；组合根注入 `platform`、`minimize/zoom/close/doubleClick` 与可清理的 `subscribeActive`。未注入 window 的离屏组合不绘制窗口按钮。标题经 `TruncatedText` 在中间弹性区域截断，左右槽与窗口按钮不收缩；空白表面是原生 drag hitbox，交互按钮单独阻挡命中。
- macOS 预留 `project.trafficLightInset`，保留系统 traffic lights，不重复绘制菜单栏；双击调用系统偏好动作。Windows/Linux 在右侧绘制 `project.windowControlWidth × project.titlebarHeight` 的窗口按钮；关闭悬停使用主题 destructive 色。标题栏高 `project.titlebarHeight` 默认 30（2u），菜单与设置按钮沿用默认控件尺度。Windows 的双击交给 HTCAPTION，不同时注册 JS zoom。窗口失活仅将标题颜色改为 mutedForeground。
- App 的 TitleBar 由 `AppFrame` 持有，位于路由错误边界之外；工程加载失败不移除窗口按钮或设置入口。`ProjectLayout.renderViewMenu` 只将既有 DockViewMenu portal 到标题栏的 View slot，不把窗口 chrome 放进工程内容，也不创建第二份 Dock 状态。Windows/Linux 通过 Help 菜单进入 Gallery；macOS 保留原生菜单栏而不重复绘制应用菜单，Gallery 从 Settings > About 打开。

固定高度 Device 应放在可调 Group 外。项目布局用 160px Device 验证 Clip 展开与连续调整不会压缩它。折叠 Browser 时，内部 Group 保留最近的非零布局，固定宽度列表只由外部 Panel 裁剪。

## 布局与手势

`layout/computeLayout.ts` 只接受像素快照、解析后的约束、分隔位置与累计 delta。它保持总像素数，相邻面板先分配，达到 min/max 后才向更远的面板分配。折叠与展开只选择两侧都能容纳的跳变，不能靠挤破邻居约束完成折叠。

`layout/sizes.ts` 解析单位、初始化与重排。空间足够时遵守 min/max；空间不足时只放宽可变面板的 minimum，固定面板不缩小。`ResolvedConstraints.fixed` 只在作者显式声明同单位的 minSize、maxSize 且解析后 max <= min 时成立，不以空间不足时夹取出的 `min === max` 判断固定。像素 minimum 与百分比 maximum 混用时保持弹性。固定区域自身已超过总尺寸的输入抛出 RangeError。所有 maximum 都达到后保留空余，不突破 maximum。

`useElementSize` 是唯一的容器尺寸 owner，只接收固定主干渲染器的 `onLayout` border-box 事件；不再用定时器、窗口尺寸或 `getElementBounds` 采样。事件在 paint 后到达，隐藏未绘制的容器不报告。拖动使用按下时的约束与尺寸快照，尺寸事件不能改变活动拖动的锚点；松开后再重排。

按下、移动、松开都监听同一原生节点，依靠 gpuix pointer capture。没有 onMouseLeave 取消。Esc、元素焦点丢失与注入的窗口失活共用幂等回滚路径。分隔条因折叠而隐藏时提交预览并结束捕获，不把失去节点误判为取消而重新打开面板。

## 窗口失活注入

`PanelEnvironmentProvider` 接收 `environment.subscribeWindowActive(listener): unsubscribe`。应用组合根负责把原生订阅注入，ui/panels 不 import platform。没有注入时只支持元素级焦点检查与 Esc 取消。

窗口激活由原生事件提供(`renderer.onWindowActiveChange`,平台层 `subscribeApplicationActive`,第一条原生值只建立 baseline),组合根把它注入 `subscribeWindowActive`。div 的 onBlur 未在实测焦点切换中发出,`useDividerDrag` 保留 `renderer.getFocusedElementId()` 检查作为元素级兜底。真实窗口失活到 Finder 的端到端回滚需要应用组合根接线后验证,当前独立画廊未接入。

## Dock 工作区

`DockLayout` 是受控原生停靠组件：`layout: DockLayoutJSON`、`registry: DockPanelRegistry`、`onLayoutChange`、调用方注入的 `labels`；不认识工程或固定的 Transport/状态栏。注册表按 panel id 提供 `title`、`icon`、`render()`、`minimumSize`。所有注册面板都可以关闭并从 View 菜单恢复。同一个布局里的每个 panel 只出现一次，注册表必须覆盖布局内和隐藏的 panel。

`DockLayoutJSON` 的 `version: 2` 包含 `root`、`hidden`、`activeGroup`、`maximizedGroup` 与 `borders`。`borders` 按 left/right/bottom 保存 `{tabs, selected, size, type}`，type 为 `split | overlay`；旧 v2 未提供 type 时默认为 split，不升版本。多个 split border 可以同时选中，只允许一个 overlay 展开。`fromJSON` 校验唯一 ownership、selected 成员、正有限 size 与合法 type，非法数据抛 TypeError。

Dock split uses Group's controlled `weights`, derived `extent/bounds`, and size snapshots. During split or border sash drags Dock keeps a local preview layout and projects group and rail geometry from it; controlled `onLayoutChange` runs once on release. Escape, blur, and injected window deactivation discard the preview without parent commits. GroupContext and resize callbacks are stable across moves, and the fixed `DockContent` layer prevents content subtree commits while geometry previews update.

Tab/group handles use native capture and show drop previews only after `ControlEnvironment.inputPolicy.dragThresholdPixels`; they commit on release. Escape, blur, and injected window deactivation cancel. Without inputPolicy, drag does not start. Geometry receives only native `onLayout` events; bounds are not polled. The fixed root content layer mounts each panel by id and preserves it across move, tab switch, maximize, and hide; closing removes it, and hidden panels return through `addPanel`.

Tab 使用 roving tabindex，Left/Right 只移动焦点，Enter 激活；点击可见内容区会把该组设为 `activeGroup`，不强制把焦点移到 Tab。`ref: DockLayoutHandle` 的 `executeCommand` 接收 `moveLeft/Right/Up/Down`（移动活动 panel 至相邻组）、`toggleMaximize`、`close`、`hide`，返回是否处理；`onFocusChange` 由组合层提供 keymap focus。`platform/keyboard` 的 `dock.*` 命令与 K1 默认表拥有快捷键，ui 不 import platform。`gallery/catalog/layout.tsx` 的 LayoutSection 给出完整注册表、K1 接线、隐藏恢复、重置、普通嵌套 Group、PanelShell 与 CollapseDivider 示例，所有布局类组件在同一个目录区块。浮动/弹出窗口不在此模块范围。

所有 Tab 都提供关闭按钮：active tab 常显，其他 tab 在 hover 时显示；按钮占位始终保留。组本身无边框与圆角，Tab 条只绘制一条 `separatorWidth` 底线。Tab 列表横向滚动，组握柄、最大化/恢复和「更多」固定在右侧，不随溢出滚动。右键 Tab 和组「更多」复用同一组 ContextMenu 操作；其「显示面板」子菜单列出不在主布局或 border 中的已注册 panel，使用 `addPanel` 恢复。顶部 `DockViewMenu` 复用同一注册表与布局操作。

Tab 的原生 bounds 来自包含标题按钮与关闭按钮的完整 wrapper。插入位置以 wrapper 的中点为界，插入线画在前一个 Tab 的真实右边缘（第一槽画在第一个 Tab 左边缘），不能用标题按钮宽度或下一个 Tab 左边缘代替。

组头 compact 模式只读取父布局投影的 group 宽度，与 `design.dock.compactActionsBelow` 比较；进入 compact 后，超过阈值加一个 control unit 才退出。动作按钮始终占位，仅 opacity 随 active/hover 改变，不切换命中节点。窄主布局组保留「更多」，最大化仍可从菜单访问；pin 命令只属于边缘 rail。

`DockTab` 是独立原生组件，不复用 Button。small/default/large 高度分别为 `u/2u/3u`，横向 Tab 与 Tab 条同高 `2u`，整个外壳可选择、聚焦和拖动。相邻横向 Tab 只有一条 separatorWidth 竖线。标题内侧 padding 取 track-gap，图文 gap 取 control-gap；关闭区域 1u 见方、始终占位，active 常显、其余 hover 显示。边缘 rail 使用独立的 `DockRailButton`（button 语义），所有方向均为 stripHeight 见方的纯图标，无关闭槽、无项目间分隔线。组头动作继续使用 1u Button，左右 inset 取 track-pad；内容 inset 复用 cards.controls.inset。

仅窗口 left/right/bottom 可配置 border。配置的 rail 始终占位，即使 tabs 为空也保留 drop target 和末端 pin/unpin 图标按钮；右键 rail 图标提供相同模式命令。pin/unpin 不出现在 `DockGroupActions`、文档 Tab 或展开面板的 header。展开的 border 只显示当前选中 panel，header 为小号大写标题及 hover-only 最大化/更多，不重复绘制 tablist、Tab 或关闭按钮。主布局保留原有 active/hover 动作规则。`setBorderType` 在 split/overlay 间切换：split 预留 size + separatorWidth，不因外部点击/Escape 收起；overlay 不挤占布局并自动收起。两者均实时 resize。Drawer 与 rail 使用 card 表面，主内容使用 background；rail 关闭时与主区有单条 border 细线，打开时与自身面板贴合无分隔线，只在面板与主区间画细线。rail 图标有 hover 高亮，选中图标使用 dock.activeIndicatorWidth 强调条。overlay 的 dock.drawerShadow 通过末尾 portal 绘制，避免阴影被主内容覆盖。Gallery Theme 默认 overlay 且未打开时不挂载编辑器，首次打开后收起保留状态。

### dockview 参考对应

先评估了 [gridview.ts](https://github.com/dockview/dockview/blob/master/packages/dockview-core/src/gridview/gridview.ts)、[splitview.ts](https://github.com/dockview/dockview/blob/master/packages/dockview-core/src/splitview/splitview.ts)、[dockviewComponent.ts](https://github.com/dockview/dockview/blob/master/packages/dockview-core/src/dockview/dockviewComponent.ts) 与 [droptarget.ts](https://github.com/dockview/dockview/blob/master/packages/dockview-core/src/dnd/droptarget.ts)。它们直接依赖 HTMLElement/DocumentFragment、DOM class 和指针后端，不能作为无 DOM 的 gpuix 模型直接引用；未新增依赖，以下为独立实现，不是源代码拷贝或格式兼容层。

| dockview-core | gpuix Dock |
| --- | --- |
| Gridview branch/leaf + Splitview | DockSplit/DockGroup + 已有 Group/Panel/PanelDivider |
| addPanel / component registry | addPanel + DockPanelRegistry（render、minimumSize） |
| moveGroupOrPanel from.groupId/panelId, to.position/index | moveGroupOrPanel source.groupId/tabId, targetId, position, index |
| toJSON/fromJSON，activeGroup | 版本化 DockLayoutJSON，toJSON/fromJSON |
| calculateQuadrantAsPercentage，默认 20% 边缘 | resolveDropPosition + design.dock.edgeFraction；角落取最近归一化边缘，而非固定左右优先 |
| maximize/restore、panel visibility | toggleMaximize、hideTab/addPanel；固定根内容层保持 React 状态 |

回归覆盖空组折叠、同组拆分、整个组迁移、中心合并、四边缘拆分、Tab 重排、最小尺寸 sash 调整、版本/唯一性边界、固定种子操作序列，以及原生拖动/取消/组件状态保留。分割线拖动时 `useResizeCommit` 在指针事件里直接提交每次移动，不等下一帧：等帧回调会让每次移动晚一帧提交、再晚一帧绘制，画面落后手约两帧；原生指针移动本就每帧最多一次，无需合并。The performance regression `bun test src/ui/panels/Dock/resize-performance.test.tsx` measures each native move with one flush/dispatch: lightweight Dock p50 ≤ 8ms, heavy Dock scenarios use a higher CI-aware budget, and mounted content Profiler commits remain zero per move.

## 运行

工作区根目录先运行 `git submodule update --init --recursive`、`node scripts/gpuix-main/build.mjs runtime`、`pnpm install --frozen-lockfile` 与 `pnpm native:build`。在 `apps/gpuix` 运行：

```sh
pnpm exec tsc --noEmit
bun test src/ui/panels
bun test
pnpm dev
```
