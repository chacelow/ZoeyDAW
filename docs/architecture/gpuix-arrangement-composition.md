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
- `timeline` 拥有视口**状态与操作**：导出 `useArrangementViewport()`，返回 `{ viewport: ArrangementViewport, setScroll(x, y), zoomAt(anchorBar, anchorPx, factor), fitToProject() }`；缩放/平移的纯计算调用 `core/viewport`。
- `lane` 与 `tracks` 只**读**视口（通过 props 传入同一个对象），不持有第二份。
- 垂直滚动：`tracks` 的表头列与 `lane` 的车道共用同一个 `scrollY`，作为一个整体滚动；Minimap 固定，不随垂直滚动。

## 3. 各目录导出的组合接口

```ts
// timeline/index.ts
export interface TimelineSlots {
  toolbar?: ReactNode
  overview?: ReactNode // Minimap，timeline 自己提供默认实现
}
export function ArrangementTimeline(props: {
  scene: ArrangementScene // 来自 core/scene
  viewport: ArrangementViewport
  lane: ReactNode // 由组合根传入 <ArrangementLane/>
  trackHeaders: ReactNode // 由组合根传入 <TrackHeaderColumn/>
  labels: TimelineLabels // 双语标签由组合根注入，timeline 不依赖 i18n 包
}): ReactNode
export function createTimelineKeyboard(deps: TimelineKeyboardDeps): KeyboardOwner
export { useArrangementViewport } // 返回 { viewport, setScroll, zoomAt, fitToProject }

// lane/index.ts
export function ArrangementLane(props: {
  scene: ArrangementScene
  viewport: ArrangementViewport
  controller: LaneController // createLaneController() 的返回值，由组合根创建
  readPeaks: PeakReader // (sourceId, startFrame, endFrame, pixels) => Float32Array，来自 platform/engine
  clipboard: NativeClipboard // 来自 platform/clipboard
}): ReactNode
export function createLaneController(deps: LaneControllerDeps): LaneController

// tracks/index.ts
export function TrackHeaderColumn(props: {
  scene: ArrangementScene
  viewport: ArrangementViewport // 只读 scrollY 与行范围
  focusedTrackId: string | null
  onFocusTrack(id: string): void
  telemetry: TelemetryReader // () => BackendTelemetry | null，用于电平；不造模拟值
}): ReactNode
```

- `TrackHeaderRow`/Mixer/路由控件由 `tracks` 提供，`lane` 不实现表头。`lane` 里原有的 `TrackHeaderViewport` 职责收缩为：**只负责把表头列按 `scrollY` 与可见行范围裁剪放置**，行内容由 `trackHeaders` 这个 slot 渲染；屏外只保留 `focusedTrackId` 对应表头（输入框焦点不丢）。
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
