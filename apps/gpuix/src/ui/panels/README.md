# 原生面板

公共入口为 `index.ts`。仅依赖 gpuix、React 与 shared/theme，不依赖 DOM、工程状态或 platform。

## 组件

- `Group` 接收 `orientation="horizontal" | "vertical"`，直接子节点为 `Panel` 与 `Separator` 或 `PanelDivider`。分隔条方向与 Group 垂直。不支持 Fragment、嵌套包装组件或完整 react-resizable-panels API。
- `Panel` 的 `defaultSize`、`minSize`、`maxSize`、`collapsedSize` 中，数值是像素，字符串是百分比。`"25"` 与 `"25%"` 等价，`0` 是零像素。
- `panelRef` 提供 `isCollapsed()`、`expand()`、`collapse()`、`resize(px)` 与 `getSize()`。`onResize` 与 `getSize()` 都返回 `{ inPixels, asPercentage }`，百分比的分母扣除了分隔条。
- 数值 defaultSize 的面板在容器重排时保留当前像素尺寸；百分比面板按剩余空间重新分配。已折叠的面板不会因窗口放大自动展开。
- `PanelShell` 用 `useTheme().project` 的边框与 gap 度量。active 只改变边框颜色，不添加外沿或改变尺寸。调用方必须注入 `aria-label` 与 `activeDescription`；机器 `id` 只用于激活和 testId，不作为用户名称。原生 mouseDown 向调用方分发激活，子控件的 mouseDown 不会屏蔽它。
- `PanelDivider` 与 Dock sash 共用 `Separator`、`useDividerDrag` 和 `dividerChrome`。命中区始终取 `project.panelGap`（当前 7px），hover 与拖动以 ring 高亮，不扩大命中区；方向键每次移动 10px，Shift 为 50px。在折叠边界，方向键一次跨越折叠区间。
- `CollapseDivider` 管理 Group 外固定高度区域的显隐。`expandedSize` 的一半是切换阈值，拖回阈值以内恢复按下时的状态。上下方向键分别展开与折叠。调用方必须提供 `aria-label` 与 `formatAccessiblePixels`，朗读当前展开尺寸或折叠后的零值，共享组件不拼接英文单位。
- `CollapseDivider` 的 Home/Up 展开、End/Down 折叠与活动拖动的 Escape 取消只由控件消费（`preventDefault`、`stopPropagation`），不能同时触发窗口 rewind 或关闭 Clip Edit；idle Escape 与 Space 继续冒泡给窗口。`useDividerDrag.cancel` 从唯一 anchor 判断并返回是否实际取消；视觉拖动状态不作为手势真值。原生组合回归见 `ui/verification/r2-controls.test.tsx`。

固定高度 Device 应放在可调 Group 外。画廊用 160px Device 验证 Clip 展开与连续调整不会压缩它。折叠 Browser 时，内部 Group 保留最近的非零布局，固定宽度列表只由外部 Panel 裁剪。

## 布局与手势

`layout/computeLayout.ts` 只接受像素快照、解析后的约束、分隔位置与累计 delta。它保持总像素数，相邻面板先分配，达到 min/max 后才向更远的面板分配。折叠与展开只选择两侧都能容纳的跳变，不能靠挤破邻居约束完成折叠。

`layout/sizes.ts` 解析单位、初始化与重排。空间足够时遵守 min/max；空间不足时只放宽可变面板的 minimum，固定面板不缩小。`ResolvedConstraints.fixed` 只在作者显式声明同单位的 minSize、maxSize 且解析后 max <= min 时成立，不以空间不足时夹取出的 `min === max` 判断固定。像素 minimum 与百分比 maximum 混用时保持弹性。固定区域自身已超过总尺寸的输入抛出 RangeError。所有 maximum 都达到后保留空余，不突破 maximum。

`useElementSize` 是唯一的容器尺寸 owner，只接收固定主干渲染器的 `onLayout` border-box 事件；不再用定时器、窗口尺寸或 `getElementBounds` 采样。事件在 paint 后到达，隐藏未绘制的容器不报告。拖动使用按下时的约束与尺寸快照，尺寸事件不能改变活动拖动的锚点；松开后再重排。

按下、移动、松开都监听同一原生节点，依靠 gpuix pointer capture。没有 onMouseLeave 取消。Esc、元素焦点丢失与注入的窗口失活共用幂等回滚路径。分隔条因折叠而隐藏时提交预览并结束捕获，不把失去节点误判为取消而重新打开面板。

## 窗口失活注入

`PanelEnvironmentProvider` 接收 `environment.subscribeWindowActive(listener): unsubscribe`。应用组合根负责把原生订阅注入，ui/panels 不 import platform。没有注入时只支持元素级焦点检查与 Esc 取消。

窗口激活由原生事件提供(`renderer.onWindowActiveChange`,平台层 `subscribeApplicationActive`,第一条原生值只建立 baseline),组合根把它注入 `subscribeWindowActive`。div 的 onBlur 未在实测焦点切换中发出,`useDividerDrag` 保留 `renderer.getFocusedElementId()` 检查作为元素级兜底。真实窗口失活到 Finder 的端到端回滚需要应用组合根接线后验证,当前独立画廊未接入。

## Dock 工作区

`DockLayout` 是受控原生停靠组件：`layout: DockLayoutJSON`、`registry: DockPanelRegistry`、`onLayoutChange`、调用方注入的 `labels`；不认识工程或固定的 Transport/状态栏。注册表按 panel id 提供 `title`、`icon`、`render()`、`minimumSize`、`closable`。同一个布局里的每个 panel 只出现一次。注册表必须覆盖布局内和隐藏的 panel。

`DockLayoutJSON` 有 `version: 1`、`root`、`hidden`、`activeGroup`、`maximizedGroup`。root 是 `split {id, orientation, children, sizes}` 或 `group {id, tabs, active}`；全关闭时为 null。`toJSON` 返回可保存的独立 JSON 对象，`fromJSON(unknown)` 校验版本、唯一 id、非空组、至少两个 split 子节点、正尺寸权重和有效活动面板后返回可信模型；非法数据抛 TypeError，不改变当前布局。工作区持久化由调用方拥有。

纯操作：`activateTab`、`closeTab`、`closeOtherTabs`、`hideTab`、`addPanel`（包含显示隐藏面板）、`moveTab`、`splitGroup`、`moveGroupOrPanel`、`reorderTab`、`resizeSplit`、`toggleMaximize`。移动/关闭会删除空组并折叠单子 split；整体组移动保留组 id。尺寸分配全部交给现有 Group/Panel，Panel 的 `onResize` 收集完整百分比快照回写 split 权重，不另写尺寸求解器。

Tab/组握柄用原生 capture，超过 `ControlEnvironment.inputPolicy.dragThresholdPixels` 才显示落点预览，释放时才提交；中心合并、边缘拆分、Tab 条按指针中点插入。Escape/失焦/注入的窗口失活取消。没有 inputPolicy 时不启动拖动。几何只接收原生 `onLayout`，不轮询 bounds。内容层由固定根节点按 panel id 挂载，移动、换 Tab、最大化、隐藏不重新挂载；关闭移除该内容，显示隐藏项用 `addPanel`。

Tab 使用 roving tabindex，Left/Right 只移动焦点，Enter 激活；点击可见内容区会把该组设为 `activeGroup`，不强制把焦点移到 Tab。`ref: DockLayoutHandle` 的 `executeCommand` 接收 `moveLeft/Right/Up/Down`（移动活动 panel 至相邻组）、`toggleMaximize`、`close`、`hide`，返回是否处理；`onFocusChange` 由组合层提供 keymap focus。`platform/keyboard` 的 `dock.*` 命令与 K1 默认表拥有快捷键，ui 不 import platform。`gallery/catalog/layout.tsx` 的 LayoutSection 给出完整注册表、K1 接线、隐藏恢复、重置、普通嵌套 Group、PanelShell 与 CollapseDivider 示例，所有布局类组件在同一个目录区块。浮动/弹出窗口不在此模块范围。

Tab 标题区区分活动/非活动 tab，获得焦点的组以 ring 描边；可关闭 tab 的关闭按钮在活动或悬停时可见。Tab 列表横向滚动，组握柄、最大化/恢复和「更多」固定在右侧，不随溢出滚动。右键 tab 和组「更多」复用同一组 ContextMenu 操作，后者用 DropdownMenu 触发；其「显示面板」子菜单从注册表列出所有未出现在布局中的 panel（隐藏项及已关闭项），在当前组用 `addPanel` 恢复，包括不可关闭但可隐藏的 panel。`labels.more` 与 `labels.showPanels` 由调用方提供本地化文案。Dock sash 和普通 PanelDivider 共用 7px 命中区与 hover/拖动高亮。拖放预览对边缘、中心、Tab 插入分别使用 `edgeOverlayOpacity`、`centerOverlayOpacity`、`insertionOpacity`；几何与交互不因视觉状态改变。

组头部根据原生 `onLayout` 的宽度与 `design.dock.compactActionsBelow` 比较：窄组只保留「更多」，最大化/还原仍在其菜单中；宽组显示拖动握柄和最大化按钮。Tab 文本交给共享 Button 的实测文字宽度规则，不用固定按钮宽度截掉标题。`design.dock.contentInset` 是内容消费者的统一 inset；Dock 不强制给 Arrangement 等自行管理精确几何的内容再套一层 padding。

### dockview 参考对应

先评估了 [gridview.ts](https://github.com/dockview/dockview/blob/master/packages/dockview-core/src/gridview/gridview.ts)、[splitview.ts](https://github.com/dockview/dockview/blob/master/packages/dockview-core/src/splitview/splitview.ts)、[dockviewComponent.ts](https://github.com/dockview/dockview/blob/master/packages/dockview-core/src/dockview/dockviewComponent.ts) 与 [droptarget.ts](https://github.com/dockview/dockview/blob/master/packages/dockview-core/src/dnd/droptarget.ts)。它们直接依赖 HTMLElement/DocumentFragment、DOM class 和指针后端，不能作为无 DOM 的 gpuix 模型直接引用；未新增依赖，以下为独立实现，不是源代码拷贝或格式兼容层。

| dockview-core | gpuix Dock |
| --- | --- |
| Gridview branch/leaf + Splitview | DockSplit/DockGroup + 已有 Group/Panel/PanelDivider |
| addPanel / component registry | addPanel + DockPanelRegistry（render、minimumSize、closable） |
| moveGroupOrPanel from.groupId/panelId, to.position/index | moveGroupOrPanel source.groupId/tabId, targetId, position, index |
| toJSON/fromJSON，activeGroup | 版本化 DockLayoutJSON，toJSON/fromJSON |
| calculateQuadrantAsPercentage，默认 20% 边缘 | resolveDropPosition + design.dock.edgeFraction；角落取最近归一化边缘，而非固定左右优先 |
| maximize/restore、panel visibility | toggleMaximize、hideTab/addPanel；固定根内容层保持 React 状态 |

回归覆盖空组折叠、同组拆分、整个组迁移、中心合并、四边缘拆分、Tab 重排、最小尺寸 sash 调整、版本/唯一性边界、固定种子操作序列，以及原生拖动/取消/组件状态保留与 Gallery 命令路径。Dock 外观与拖动命中高度同用 `useTheme().design.dock`；默认 Dock token 在 ThemeProvider 中由当前 `control` 派生（显式 `design` 覆盖不被改写），tab 间距与插入标记宽度直接取 `project.panelBorder`，sash 命中区取 `project.panelGap`。

## 运行

工作区根目录先运行 `bash scripts/gpuix-main/build.sh`、`pnpm install --frozen-lockfile` 与 `pnpm native:build`。在 `apps/gpuix` 运行：

```sh
pnpm exec tsc --noEmit
bun test src/ui/panels
bun test
bun --hot src/gallery/controls.tsx
```
