# Arrangement 组合契约

2026-10-14。`project/sections/arrangement/` 下四个目录（`core`、`tracks`、`lane`、`timeline`）由不同切片并行实现，本文规定它们之间唯一的组合接口。各切片对着同一份接口写，集成步骤（`app-shell`）只做装配，不写适配层。

## 1. 依赖方向

```
app-shell ──▶ ArrangementPanel (composition root, 在 app-shell 或 arrangement/index.tsx)
                ├─▶ timeline  (标尺、Minimap、工具栏、视口、窗口键盘 owner)
                ├─▶ lane      (车道渲染、Clip/Automation 手势 controller)
                └─▶ tracks    (表头、Mixer、路由、电平表)
                         └─▶ core (纯计算)  ◀── 三者都只依赖 core、不互相 import
```

- `tracks`、`lane`、`timeline` **互不 import**。组合只发生在组合根，通过下面的 props/slot 与共享 store 完成。
- `core` 是纯计算，不含任何渲染或状态。

## 2. 唯一的共享视口状态

视口（`scrollX`、`scrollY`、`pxPerBar`、可见行范围）只有一个 owner：`timeline`。

- `ArrangementViewport`（`pxPerBar`、`scrollX`、`scrollY`、`width`、`height`、`dpr`）与 `ArrangementScene` 类型**定义在 `core/scene`（B1，已合入）**，三个切片都从那里取，不各自重新定义。
- `timeline` 拥有视口**状态与操作**，经 `TimelineController` 暴露（见第 3 节）；缩放/平移的纯计算调用 `core/viewport`。`setScroll` 必须同步：返回前共享 `SceneStore` 的 viewport 投影已更新，并返回接受后的 `ArrangementViewport`，这样 lane 的边缘自动滚动在同一帧重算 Ghost 时读到的是新值，不读前一帧。
- `lane` 与 `tracks` 只**读**视口（通过 props 传入同一个对象），不持有第二份。
- 垂直滚动：`tracks` 的表头列与 `lane` 的车道共用同一个 `scrollY`，作为一个整体滚动；Minimap 固定，不随垂直滚动。

## 3. 各目录导出的组合接口

```ts
// timeline/index.ts
export interface TimelineController {
  // 由组合根创建并 dispose；内部持有同一个 SceneStore、窗口键盘 owner、视口命令、标尺与自动滚动状态
  readonly sceneStore: SceneStore
  readonly keyboard: KeyboardOwner
  useViewport(): ArrangementViewport // 返回当前 viewport
  setScroll(x: number, y: number): ArrangementViewport // 同步语义：返回前已更新共享 SceneStore 的 viewport 投影，返回「接受后」的 viewport
  zoomAt(anchorBar: number, anchorPx: number, factor: number): ArrangementViewport
  fitToProject(): ArrangementViewport
  tick(nowMs: number): void // 由组合根的帧源（F1 合入后为原生帧回调）喂入，驱动边缘自动滚动与跟随播放
  dispose(): void
}
export function createTimelineController(deps: TimelineControllerDeps): TimelineController
export function ArrangementTimeline(props: {
  controller: TimelineController // 取代分散的 scene/viewport/keyboard/cursor 入参
  tracks: ReactNode // 由组合根传入 <TrackRows renderLane={row => <LaneRow .../>} />
  overlay: ReactNode // 由组合根传入 <LaneOverlay .../>，timeline 把它叠在 tracks 上方单次挂载
  labels: TimelineLabels // 双语标签由组合根注入，timeline 不依赖 i18n 包
  cursor: CursorLockPort // 光标锁（Minimap 拖动），默认委托 @zoeydaw/native
}): ReactNode

// lane/index.ts
export function LaneRow(props: {
  row: TrackRow // core/layout.TrackRow（tracks 传结构兼容的 TrackRowGeometry）
  scene: ArrangementScene
  viewport: ArrangementViewport
  controller: LaneController // createLaneController() 的返回值，由组合根创建
  readPeaks: PeakReader // (sourceId, startBar, endBar, pixels, contentOffsetBars) => Float32Array；startBar/endBar 是 one-based 的 Clip 局部可见范围（1+visibleOffsetBars），contentOffsetBars=clip.sourceOffsetBars，适配层用 (bar-1+contentOffsetBars) 换源 frame；返回每像素每声道 min/max，声道数=length/(2*pixels)；采样率换算由 platform/engine 适配函数负责，lane 不假设采样率
  clipboard: NativeClipboard // 来自 platform/clipboard
  labels: LaneLabels // 菜单/名称编辑/数值编辑的双语标签，由组合根注入，lane 不依赖 i18n 包
}): ReactNode
// 跨行的叠加层：全画布播放头、Pattern Ghost 起点对齐长线、停止时的行内插入线与标尺三角。
// 它们必须跨越多行与空白区域，不能塞进单行，所以独立导出，由 ArrangementTimeline 在 tracks 上方单次挂载。
export function LaneOverlay(props: {
  scene: ArrangementScene
  viewport: ArrangementViewport
  transportBar: () => number // 当前播放位置（小节），来自 runtime 的 readTransportBar
}): ReactNode
export function createLaneController(deps: LaneControllerDeps): LaneController

// tracks/index.ts
export function TrackRows(props: {
  scene: ArrangementScene
  viewport: ArrangementViewport // 只读 scrollY 与可见行范围
  focusedTrackId: string | null
  onFocusTrack(id: string): void
  telemetry: TelemetryReader // () => BackendTelemetry | null，用于电平；不造模拟值
  renderLane(row: TrackRowGeometry): ReactNode // 由组合根传入：lane 在该行中间槽里的内容
  labels: TrackLabels // 轨道头文字的双语标签，由组合根注入，tracks 不依赖 i18n 包
}): ReactNode
```

- **复合轨道行归 `tracks`**：每条轨道是一个整体组件 `TrackRow`（产品规则：左、中、右三段；**Live 实测：车道在左，轨道头在窗口右侧**，头部从左到右是颜色标题条、路由列、Mixer 列，整体很窄）。三段的具体排布以 Live 的观察为准，由 `tracks` 决定；车道槽的位置由 `tracks` 摆放，外层**唯一**的轨道边框与分组外框（含折叠组向下包住子轨、围栏层级在轨道边框之上、高度分隔条不截断围栏）都由 `tracks` 画。中间的车道槽由 `renderLane(row)` 填充，`lane` 只提供行内内容，不画轨道边框。
- 因此 `lane` 不再单独铺满整块区域：它导出 `LaneRow`，只渲染**一条轨道的车道内容**（Clip、Pattern、Automation、行内网格线），行的可见范围裁剪与屏外卸载由 `tracks` 的 `TrackRows` 做；`lane` 仍拥有手势 controller（跨行拖动靠 controller 持有的 scene，不靠 DOM）。
- 屏外只保留 `focusedTrackId` 对应行的表头部分（输入框焦点不丢），其车道内容仍按可见范围卸载。
- 焦点：`focusedTrackId` 来自 store 的 `session.selectedTrackIds` 与 `trackSelectionSurface`，不靠 JS 轮询查询原生焦点。原生输入焦点由 A3 的 `Input` 控件自己持有；`tracks` 在表头名称编辑态时通过 `onFocusTrack` 报告 id。

## 4. 键盘 owner（避免双触发）

窗口键盘事件在同一次按键的所有元素事件**之后**触发（见 LESSONS）。

| 键 | owner |
| --- | --- |
| Space（播放）、M、A、B、Ctrl/Cmd+1..5（网格）、Ctrl/Cmd+Z/Shift+Z、Ctrl/Cmd+S | `timeline`（`createTimelineKeyboard`，窗口根监听） |
| Clip/Automation 选择、split（Ctrl/Cmd+E，有选中时）、duplicate、rename、delete、复制剪切粘贴、拖动中 Escape | `lane`（`LaneController.keyDown`） |
| 轨道名称输入、Mixer 数值编辑 | `tracks`（控件自己） |

- 同一个 keyDown 序列只被一个 owner 处理，有一条跨切片测试在集成步骤证明。
- 输入框聚焦时，元素对可打印键 `stopPropagation`，窗口 owner 不处理。

## 5. 组合根

`ArrangementPanel`（`arrangement/index.tsx`）负责：创建 `createLaneController`、`createTimelineKeyboard`，取 viewport、scene、telemetry，注入 labels，把三个目录的组件按上面的 props 装配。**它由 `app-shell` 切片拥有**；在 `app-shell` 派发之前，各切片用各自 demo 里的最小组合根验证，不要抢先写它。

## 6. 变更规则

- 本文是契约：任何切片需要改接口，先 ask，由协调者统一修改本文并通知所有相关切片。
- 新增导出符号写进各目录 README 的「公共接口」小节，并保持与本文一致。
