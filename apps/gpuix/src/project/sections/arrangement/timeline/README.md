# Arrangement timeline

原生时间线壳：音乐/真实时间标尺、定位点与循环事务、网格、Minimap、工具栏、视口和窗口键盘 owner。车道内容与复合轨道行由组合根经 slot 提供；生产代码不 import `lane` 或 `tracks`。

## 公共接口

入口为 `index.ts`。

| 接口 | 契约 |
| --- | --- |
| `createTimelineController(deps)` | 组合根创建并负责 `dispose()`；内部只有一个 `SceneStore` 投影、一个键盘 owner、标尺事务与自动滚动状态 |
| `ArrangementTimeline({ controller, tracks, overlay, labels, cursor, editSurface?, interactionOverlay? })` | `tracks` 是完整复合行；`overlay` 是跨行叠加层；lane 注入 `editSurface`，tracks 注入位于其上方的唯一 resize strips；timeline 不依赖两个切片 |
| `controller.useViewport()` | React hook，订阅同一个 `ArrangementViewport`；类型来自 B1 `core/scene` |
| `controller.setScroll(x, y)` | 同步更新权威 workspace 并夹取；返回前 `sceneStore.get().viewport` 已是接受后的同一投影；手工导航暂时暂停 Follow |
| `controller.zoomAt(anchorBar, anchorPx, factor)` | 显式音乐位置/像素锚点缩放；边界夹取优先 |
| `controller.fitToProject()` | 使用统一的派生工程范围适配，包括最小编辑范围与当前播放/时间选区；Minimap 不再另算一套 fit |
| `controller.tick(nowMs)` | 由原生帧源驱动边缘滚动与 Follow；本模块不创建定时器或第二走带时钟 |
| `controller.getFrameDemand()` / `subscribeFrameDemand(listener)` | 标尺 autoScroll 的稳定活动读取与通知，直接由 start/update/stop 的活动边界驱动。组合根合并播放与 lane 手势需求后再订阅帧，不读取 TimelineView 细项 |
| `controller.keyboard` | 唯一键盘 owner；`markDrawGesture()` 由实际绘制/拖动消费者调用；组合根不能再创建独立键盘 |
| `TimelineLabels` | 严格的可见文本契约；双语数据在 `app/locales/sections/timeline.ts`，由组合根注入 |
| `TimelineEditSurface` | 单一保留输入层的 ref、pointer/key/blur handlers、光标 style 与稳定菜单/inline editor `wrap` slot；owner 是 `timeline-viewport` |

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

Save 按钮通过 `useProjectState(canSaveSnapshot)` 读取当前 session 的快照保存许可。打开损坏快照时禁用；切换到可保存工程后恢复。键盘保存仍调用同一 `saveSnapshot`，由 adapters 的 session fence 防止覆盖原 key，timeline 不持有第二份许可状态。

Minimap 选框复用 scrollbar 默认、hover、pressed 色层。pressed 从有效按下保持到释放或取消，即使指针离开选框、overview 或手势中发生 store 提交也不回落到 hover；epoch/失活取消同步恢复视觉与光标。静态 Minimap Overview 只订阅 tracks/markers，并按 bars/width/height/theme 失效；独立 Playhead 只订阅音乐位置。播放、viewport 和 hover 更新不会重建全工程 Clip 投影。`minimap/render-cost.test.tsx` 在 16/1024 Clip 下断言播放头实际移动、静态几何不变且不再读取未变 Clip 几何。

组合根提供：

1. 同一真实 renderer 的 `createWindowPlatform(renderer).subscribeApplicationActive`，不用旧 A2 采样 singleton。
2. 一份 `WindowKeyboardProvider`，根 `render` 使用同一 bus 的 `rootHandlers`。时间线的命令注册表经 `DEFAULT_KEYMAP` 解析上下文，窗口订阅用 `consumeKey` 默认消费已处理键；原生元素先处理，窗口回调在后。
3. 一份 `AnimationFrameProvider`。普通帧通过 `useAnimationFrame` 喂 `tick`，恢复 prepaint 通过同一 demand 的 `useResumeFrame` 显式 `flushSync` 同一个 tick；不保留 JS timer 链或第二帧源。
4. 从 `@/platform/cursor` 注入同一 `nativeCursorLock` 到 `ControlEnvironmentProvider` 与时间线；Panel 环境复用同一窗口失活订阅。sections 不直接 import napi 包。
5. 配置好的真实 project runtime lease、原生快照存储及最后的释放。

## 坐标与布局

B1 的 viewport 高度包含顶部音乐标尺和底部时间标尺，复合轨道行位置沿用同一原点。时间线只裁剪整行 slot，负向内部偏移抵消外层标尺裁剪偏移，不拆开轨道头与车道。Minimap 在独立上方 Panel，纵向滚动不移动它。

标尺高度与可编辑区域偏移读取 `theme.layout.arrangement`，组合根把同一 layout 注入 Scene。`barRulerHeight` 决定音乐标尺与编辑面起点，`timeRulerHeight` 决定底部裁剪。`MarkerEditor` 使用 `markerRulerHeight`；Minimap clip 行内距使用 `minimapClipInset`。

标尺与 Minimap 的分界线、标记线、loop 边框和播放头读取 `design.editor` 的语义线宽。标记标签的 padding 扣除实际 `markerLineWidth`，保持文字起点。指针状态保存在组件内，原生 cursor 统一由 `design.cursors` 解析。

音乐 `scrollX` 只有 **Minimap 下的一条 `ControlledScrollbar`**。它与标尺、车道共享逻辑范围，不构造整工程宽度的 native scroll 内容。工具栏自己的横向溢出仅用于访问控件，不是第二条音乐视口。全宽 `timeline-layout` 是唯一滚轮入口，透明 `timeline-viewport` 只处理 lane 指针、键盘与失焦。`interactionOverlay` 在它之上挂载 tracks 的分隔条矩形，不覆盖车道其他区域。原生组合回归覆盖一次 wheel 的平移量、车道与表头缩放比例，以及车道侧分隔条拖动。

## 网格的独立层

- `patternRegions`：正常可读缩放逐小节交替；低于 model/grid 的既有 `MIN_GRID_CELL_PX` 时按 2 幂整数小节合并，防止整面密线。合并不跟随标签步长或网格偏好。
- `gridLines.major`：只在整数小节区域边界上；其余线只来自 `gridPlan.cellBars`，不把拍/十六分音符标签变成粗线。
- `rulerTicks`：独立的可读标签层，按真实 `16 / denominator` 换算每拍十六分音符数量。
- `rulerLabel/adjacentMarker`：由批准的 B1 纯函数提供展示位置与邻近定位点，不在组件内排序或拼位置规则。

网格与音乐标尺的 Pattern 背景统一使用 `useQuadBatch` 命令式上传；网格按主题的粗/细线材质分批，不逐线挂载节点。可见几何仍来自 B1，不将 Float32Array 放入 React props/state。`grid/parity.test.tsx` 用固定的旧 div 绘制 oracle 对照深浅主题、标尺/车道高度、分数滚动与极端缩放的原生 PNG。标尺文字保留原生文本布局，时间刻度的短线与文字仍共用原位置节点；没有为少量文字标签另建绘制系统。

GridLine 的半开可见范围过滤与 quad 打包由 `core/rulers/grid-quads.packGridQuads` 唯一实现，调用方显式传入粗线与细线宽度。粗线读取 `project.arrangementGridMajorLineWidth`，细线读取 `design.editor.gridMinorStrokeWidth`，细线透明度与 lane 共用 `project.gridMinorOpacity`。边缘滚动调用 `core/viewport/edge-scroll`，timeline 只持有活动指针、axis 与 last-frame 生命周期。Ruler 不再镜像写 `projectPreview/timeSelection`，这些工程投影仅由 TimelineController 订阅更新。

标签间距的 38/56 默认来自 web，可读性配置集中在 `RULER_LABEL_SPACING`。多档 Live 阈值及极端缩小时的明暗合并未对照 Live，不把估计写成实测结论。

## 键盘 owner

| 键 | owner / 条件 |
| --- | --- |
| Space | 播放；不重复触发，不激活聚焦按钮；输入框/菜单保持自己的输入语义 |
| Ctrl/Cmd+S、Z、Shift+Z | 保存先于 Clip Editor 局部命令隔离；Clip Editor 非文本焦点也保存。撤销/重做保留编辑器 owner，文本/菜单仍保护自身输入 |
| Ctrl/Cmd+1、2 | 调整网格，固定网格可到 1/256 与 16 小节 |
| Ctrl/Cmd+4 | 已核实的 Snap 切换，不改变网格或音乐位置 |
| Ctrl/Cmd+E | 无选中时消费但不改网格；有 Clip 选择时由 lane Split，音乐插入点不取指针 |
| Ctrl/Cmd+L | 时间选区转循环，否则循环开关 |
| Ctrl/Cmd+R、F2、Enter | timeline 焦点下重命名选中定位点；控件 Enter 不会同时重命名 |
| 左右、Delete、Backspace | timeline 焦点下优先定位点/循环；Clip/Automation 由 lane；定位点方向键不 seek |
| M、Z/X、C/V、音符键 | 电脑 MIDI 模式、八度、力度与音符；MIDI 模式 B 不改绘制偏好 |
| B | timeline 唯一持有，含 clip-editor 焦点；轻按锁定一次偏好，绘制手势中仅临时覆盖。文本/菜单与电脑 MIDI 模式仍保留原边界，不新增工具历史 |

Ctrl/Cmd+3（三连音）与 +5（模式切换）超出 web 原行为，仍未实现。窗口键位只有 `platform/keyboard.DEFAULT_BINDINGS` 一份；保存、播放、B 的 Clip Editor 范围由绑定 context 声明，不靠 if 顺序。局部选择类命令只在 timeline 上下文先交 rulers/lane 认领；共享控件的已处理键经 `shared/keyboard.consumeKey` 截住，文本输入只停传播而保留原生默认。已有 A/B 提示来自 `DEFAULT_KEYMAP.formatKeys`。

## 来源度量

| 语义 | 来源 |
| --- | --- |
| 标记 6×4、底部 inset 2、文字起点 7 | web `painters/rulers/markers.ts:22–24,34` |
| 编辑器 min-width 60.48 | `MarkerEditor/index.tsx:63` 的 `min-w-24`；web `index.css:14,28` 的 `14px × 0.18rem × 24` |
| 网格线 1、细线 opacity 0.55 | web `painters/grid.ts:144,153`；不再借 `trackBorder` |
| Minimap 32–90、Timeline 最小 160、autoscroll edge 42 | 原 TimelineCanvas/autoScroll 的既有约束，进入共享 PROJECT_METRICS |

## 验证入口

在仓库根先运行 `pnpm native:build`。在 `apps/gpuix` 运行 `pnpm exec tsc --noEmit`、`bun test src/project/sections/arrangement/timeline`；根目录运行对应目录 eslint 与 `node scripts/gpuix-review-scan.mjs`。

本轮跨目录修复、红绿变异、自审及组合截图边界见 [R2 验证报告](../R2-VERIFICATION.md)。

外部 store/Scene 更新的原生组件测试必须用真实 `flushSync` 提交 React，再 `renderer.flush()` 绘制；单独 native flush 不能证明 UI 已跟随状态变化。永久测试保留音乐位置/时间缩放、事务/历史、epoch、MIDI/B 模式与真实按键传播，性质测试配实际变异检查。

`style-layout.test.tsx` 覆盖原生标尺、Minimap 与完整时间线组合的 design/layout 覆盖输入。`grid/parity.test.tsx` 分别覆盖粗线宽、细线宽与细线透明度，用 div oracle 对照原生 PNG，并要求覆盖结果不同于默认图。新增回归的执行结果由协调者集成验证记录，不在此预先声明通过。

A3b 消费回归复用 `ui/controls/Menu/{interaction,pointer}.test.tsx`、`DragPad/{DragPadNumber,variants}.test.tsx`、`platform/keyboard/keyboard-native.test.tsx`；最终文本焦点 lease 由 `app/project/composition.test.tsx` 的真实 DragPad→timeline 组合回归覆盖。`bun src/project/sections/arrangement/timeline/verification/mutations.ts` 运行内存变异，不写共享源码；每个变异必须实际加载且使行为断言失败。

`bun src/app/verification/timeline/layout-smoke.tsx` 输出真实原生 toolbar、文字和图标的 bounds。1.5px padding 在 scale=1 的 GPUI pre-layout metric snapping 中按中点向零舍入为 1px，不是 AX 丢精度；不以业务实例补偿改变共享密度 token。
