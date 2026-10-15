# Arrangement timeline

原生时间线壳：音乐/真实时间标尺、定位点与循环事务、网格、Minimap、工具栏、视口和窗口键盘 owner。车道内容与复合轨道行由组合根经 slot 提供；生产代码不 import `lane` 或 `tracks`。

## 公共接口

入口为 `index.ts`。

| 接口 | 契约 |
| --- | --- |
| `createTimelineController(deps)` | 组合根创建并负责 `dispose()`；内部只有一个 `SceneStore` 投影、一个键盘 owner、标尺事务与自动滚动状态 |
| `ArrangementTimeline({ controller, tracks, overlay, labels, cursor })` | `tracks` 是完整复合行；`overlay` 是单次挂载的跨行叠加层；标签由组合根注入，光标端口来自原生能力 |
| `controller.useViewport()` | React hook，订阅同一个 `ArrangementViewport`；类型来自 B1 `core/scene` |
| `controller.setScroll(x, y)` | 同步更新权威 workspace 并夹取；返回前 `sceneStore.get().viewport` 已是接受后的同一投影；手工导航暂时暂停 Follow |
| `controller.zoomAt(anchorBar, anchorPx, factor)` | 显式音乐位置/像素锚点缩放；边界夹取优先 |
| `controller.fitToProject()` | 使用统一的派生工程范围适配，包括最小编辑范围与当前播放/时间选区；Minimap 不再另算一套 fit |
| `controller.tick(nowMs)` | 由原生帧源驱动边缘滚动与 Follow；本模块不创建定时器或第二走带时钟 |
| `controller.getFrameDemand()` / `subscribeFrameDemand(listener)` | 标尺 autoScroll 的稳定活动读取与通知，直接由 start/update/stop 的活动边界驱动。组合根合并播放与 lane 手势需求后再订阅帧，不读取 TimelineView 细项 |
| `controller.keyboard` | 唯一键盘 owner；`markDrawGesture()` 由实际绘制/拖动消费者调用；组合根不能再创建独立键盘 |
| `TimelineLabels` | 严格的可见文本契约；示例双语数据在 `demo-labels.ts`，不依赖 i18n 包 |

`TimelineView` 仅以 type 导出，供 `ArrangementTimeline` 使用；组合根不得依赖其细项，也没有可独立构造的 view。类型断言在 `public-contract.test.ts` 守住 view 与键盘工厂的运行时出口边界。

### TimelineView

- `rulers`：定位点/循环的按下、移动、提交、取消、键盘与选区循环事务。
- `autoScroll`：`start/update/stop/tick` 的单一状态机；滚动经同步 `setScroll` 后才重算预览。活动由内部 pointer 推导，通知只在空闲/活动边界发出，不建立第二份活动状态。
- `getSnapshot/subscribe`：只持有测量尺寸和 overview 高度，不复制工程数据。
- `measure`：由原生 `onLayout` 提供尺寸；不另做采样或滚轮测量。
- `setOverviewHeight`：共享 32–90px 约束；Panel/Divider 复用 A4。
- `overviewGeometry`：读取 B1 夹取后的同一视口。
- `wheel/stepZoom/suspendFollow`：视口命令；原生 wheel 的负向下/右符号在输入边界转换。
- `registerMinimap/cancelGestures`：统一失活、卸载、Escape 与项目 epoch 取消路径；旧项目回调不能写入新项目。

## 状态与生命周期

工程与 `scrollX/scrollY/pxPerBar` 的权威状态仍在 adapters/stores。controller 只同步只读 Scene 投影；手势保存的是按下基线与编辑 token，不是第二份可写工程。hydration、后端/路由 epoch 变化会取消旧手势。定位点与循环在按下时取得 preview 所有权，提交为一次历史，取消不消费前一条历史。

组合根提供：

1. 同一真实 renderer 的 `createWindowPlatform(renderer).subscribeApplicationActive`，不用旧 A2 采样 singleton。
2. 一份 `WindowKeyboardProvider`，根 `render` 使用同一 bus 的 `rootHandlers`。时间线只在已处理键上 `preventDefault()`；原生元素先处理，窗口回调在后。
3. 一份 `AnimationFrameProvider`，通过 `useAnimationFrame(controller.tick, active)` 喂帧，不保留 JS timer 链。
4. 从 `@/platform/cursor` 注入同一 `nativeCursorLock` 到 `ControlEnvironmentProvider` 与时间线；Panel 环境复用同一窗口失活订阅。sections 不直接 import napi 包。
5. 配置好的真实 project runtime lease、原生快照存储及最后的释放。

## 坐标与布局

B1 的 viewport 高度包含顶部音乐标尺和底部时间标尺，复合轨道行位置沿用同一原点。时间线只裁剪整行 slot，负向内部偏移抵消外层标尺裁剪偏移，不拆开轨道头与车道。Minimap 在独立上方 Panel，纵向滚动不移动它。

音乐 `scrollX` 只有 **Minimap 下的一条 `ControlledScrollbar`**。它与标尺、车道共享逻辑范围，不构造整工程宽度的 native scroll 内容。工具栏自己的横向溢出仅用于访问控件，不是第二条音乐视口。

## 网格的独立层

- `patternRegions`：正常可读缩放逐小节交替；低于 model/grid 的既有 `MIN_GRID_CELL_PX` 时按 2 幂整数小节合并，防止整面密线。合并不跟随标签步长或网格偏好。
- `gridLines.major`：只在整数小节区域边界上；其余线只来自 `gridPlan.cellBars`，不把拍/十六分音符标签变成粗线。
- `rulerTicks`：独立的可读标签层，按真实 `16 / denominator` 换算每拍十六分音符数量。
- `rulerLabel/adjacentMarker`：由批准的 B1 纯函数提供展示位置与邻近定位点，不在组件内排序或拼位置规则。

标签间距的 38/56 默认来自 web，可读性配置集中在 `RULER_LABEL_SPACING`。多档 Live 阈值及极端缩小时的明暗合并未对照 Live，不把估计写成实测结论。

## 键盘 owner

| 键 | owner / 条件 |
| --- | --- |
| Space | 播放；不重复触发，不激活聚焦按钮；输入框/菜单保持自己的输入语义 |
| Ctrl/Cmd+S、Z、Shift+Z | 工程保存/撤销/重做；编辑输入由自身原生 owner 保护 |
| Ctrl/Cmd+1、2 | 调整网格，固定网格可到 1/256 与 16 小节 |
| Ctrl/Cmd+4 | 已核实的 Snap 切换，不改变网格或音乐位置 |
| Ctrl/Cmd+E | 无选中时消费但不改网格；有 Clip 选择时由 lane Split，音乐插入点不取指针 |
| Ctrl/Cmd+L | 时间选区转循环，否则循环开关 |
| Ctrl/Cmd+R、F2、Enter | timeline 焦点下重命名选中定位点；控件 Enter 不会同时重命名 |
| 左右、Delete、Backspace | timeline 焦点下优先定位点/循环；Clip/Automation 由 lane；定位点方向键不 seek |
| M、Z/X、C/V、音符键 | 电脑 MIDI 模式、八度、力度与音符；MIDI 模式 B 不改绘制偏好 |
| B | timeline 唯一持有，含 clip-editor 焦点；轻按锁定一次偏好，绘制手势中仅临时覆盖。文本/菜单与电脑 MIDI 模式仍保留原边界，不新增工具历史 |

Ctrl/Cmd+3（三连音）与 +5（模式切换）超出 web 原行为，本切片未实现，不冒充支持。键盘的选择类分派只在 `focus() === "timeline"`；真实原生控件的已处理按键与 wheel 必须由共享控件/原生命中截住，不能传假的 consumed 标志。

## 来源度量

| 语义 | 来源 |
| --- | --- |
| 标记 6×4、底部 inset 2、文字起点 7 | web `painters/rulers/markers.ts:22–24,34` |
| 编辑器 min-width 60.48 | `MarkerEditor/index.tsx:63` 的 `min-w-24`；web `index.css:14,28` 的 `14px × 0.18rem × 24` |
| 网格线 1、细线 opacity 0.55 | web `painters/grid.ts:144,153`；不再借 `trackBorder` |
| Minimap 32–90、Timeline 最小 160、autoscroll edge 42 | 原 TimelineCanvas/autoScroll 的既有约束，进入共享 PROJECT_METRICS |

## 验证入口

在仓库根先运行 `pnpm native:build`。在 `apps/gpuix` 运行 `pnpm exec tsc --noEmit`、`bun test src/project/sections/arrangement/timeline`；根目录运行对应目录 eslint 与 `node scripts/gpuix-review-scan.mjs`。

外部 store/Scene 更新的原生组件测试必须用真实 `flushSync` 提交 React，再 `renderer.flush()` 绘制；单独 native flush 不能证明 UI 已跟随状态变化。永久测试保留音乐位置/时间缩放、事务/历史、epoch、MIDI/B 模式与真实按键传播，性质测试配实际变异检查。
