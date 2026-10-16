# 原生面板

公共入口为 `index.ts`。仅依赖 gpuix、React 与 shared/theme，不依赖 DOM、工程状态或 platform。

## 组件

- `Group` 接收 `orientation="horizontal" | "vertical"`，直接子节点为 `Panel` 与 `Separator` 或 `PanelDivider`。分隔条方向与 Group 垂直。不支持 Fragment、嵌套包装组件或完整 react-resizable-panels API。
- `Panel` 的 `defaultSize`、`minSize`、`maxSize`、`collapsedSize` 中，数值是像素，字符串是百分比。`"25"` 与 `"25%"` 等价，`0` 是零像素。
- `panelRef` 提供 `isCollapsed()`、`expand()`、`collapse()`、`resize(px)` 与 `getSize()`。`onResize` 与 `getSize()` 都返回 `{ inPixels, asPercentage }`，百分比的分母扣除了分隔条。
- 数值 defaultSize 的面板在容器重排时保留当前像素尺寸；百分比面板按剩余空间重新分配。已折叠的面板不会因窗口放大自动展开。
- `PanelShell` 用 `useTheme().project` 的边框与 gap 度量。active 只改变边框颜色，不添加外沿或改变尺寸。原生 mouseDown 向调用方分发激活，子控件的 mouseDown 不会屏蔽它。
- `PanelDivider` 的命中区取 `project.panelGap`，当前为 7px。方向键每次移动 10px，Shift 为 50px。在折叠边界，方向键一次跨越折叠区间。
- `CollapseDivider` 管理 Group 外固定高度区域的显隐。`expandedSize` 的一半是切换阈值，拖回阈值以内恢复按下时的状态。上下方向键分别展开与折叠。
- `CollapseDivider` 的 Home/Up 展开、End/Down 折叠与 Escape 取消只由控件消费（`preventDefault`、`stopPropagation`），不能同时触发窗口 rewind 或关闭 Clip Edit；Space 继续冒泡给播放。原生组合回归见 `ui/verification/r2-controls.test.tsx`。

固定高度 Device 应放在可调 Group 外。画廊用 160px Device 验证 Clip 展开与连续调整不会压缩它。折叠 Browser 时，内部 Group 保留最近的非零布局，固定宽度列表只由外部 Panel 裁剪。

## 布局与手势

`layout/computeLayout.ts` 只接受像素快照、解析后的约束、分隔位置与累计 delta。它保持总像素数，相邻面板先分配，达到 min/max 后才向更远的面板分配。折叠与展开只选择两侧都能容纳的跳变，不能靠挤破邻居约束完成折叠。

`layout/sizes.ts` 解析单位、初始化与重排。空间足够时遵守 min/max；空间不足时只放宽可变面板的 minimum，固定面板不缩小。`ResolvedConstraints.fixed` 只在作者显式声明同单位的 minSize、maxSize 且解析后 max <= min 时成立，不以空间不足时夹取出的 `min === max` 判断固定。像素 minimum 与百分比 maximum 混用时保持弹性。固定区域自身已超过总尺寸的输入抛出 RangeError。所有 maximum 都达到后保留空余，不突破 maximum。

`useElementSize` 是唯一的容器尺寸 owner，只接收固定主干渲染器的 `onLayout` border-box 事件；不再用定时器、窗口尺寸或 `getElementBounds` 采样。事件在 paint 后到达，隐藏未绘制的容器不报告。拖动使用按下时的约束与尺寸快照，尺寸事件不能改变活动拖动的锚点；松开后再重排。

按下、移动、松开都监听同一原生节点，依靠 gpuix pointer capture。没有 onMouseLeave 取消。Esc、元素焦点丢失与注入的窗口失活共用幂等回滚路径。分隔条因折叠而隐藏时提交预览并结束捕获，不把失去节点误判为取消而重新打开面板。

## 窗口失活注入

`PanelEnvironmentProvider` 接收 `environment.subscribeWindowActive(listener): unsubscribe`。应用组合根负责把原生订阅注入，ui/panels 不 import platform。没有注入时只支持元素级焦点检查与 Esc 取消。

窗口激活由原生事件提供(F1 `renderer.onWindowActiveChange`,平台层 `subscribeApplicationActive`,第一条原生值只建立 baseline),组合根把它注入 `subscribeWindowActive`。div 的 onBlur 未在实测焦点切换中发出,`useDividerDrag` 保留 `renderer.getFocusedElementId()` 检查作为元素级兜底。真实窗口失活到 Finder 的端到端回滚需要应用组合根接线后验证,当前独立画廊未接入。

## 运行

工作区根目录先运行 `bash scripts/gpuix-main/build.sh`、`pnpm install --frozen-lockfile` 与 `pnpm native:build`。在 `apps/gpuix` 运行：

```sh
pnpm exec tsc --noEmit
bun test src/ui/panels
bun test
bun --hot src/ui/panels/gallery.tsx
```

`evidence/os-drag.swift` 是 macOS 的真实 CGEventPost 验证工具，先校验目标进程持有名为 `gpuix panel gallery A4` 的窗口。参数为 `PID X Y DX DY drag|escape|windowblur|reverse`，坐标使用 AX 返回的全局屏幕坐标。工具记录按下前、拖动预览与松开后的真实 AX 状态，窗口的位置或进程变化后必须重新读取坐标与 PID。
