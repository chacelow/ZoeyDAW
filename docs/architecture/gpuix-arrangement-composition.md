# Arrangement 组合契约

`project/sections/arrangement/` 下四个目录（`core`、`tracks`、`lane`、`timeline`）之间唯一的组合接口。组合根只做装配，不写适配层。

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

- `ArrangementViewport`（`pxPerBar`、`scrollX`、`scrollY`、`width`、`height`、`dpr`）与 `ArrangementScene` 类型**定义在 `core/scene`**，三个目录都从那里取，不各自重新定义。
- `ArrangementViewport.width` 是可编辑时间宽度（`timeViewportWidth`），不含右侧控制列。总宽只取 `scene.geometry.track.controlsWidth`（来源 `Theme.layout.track.controlsWidth`），`project` 不再保留同义字段；`tracks` 的整行与 resize 外框宽度是 viewport.width 与该总宽之和，车道槽宽度直接使用 viewport.width。identity/routing 子列宽继续取 project，Mixer 以总宽减子列宽派生，原生回归核对三列总和。
- `timeline` 拥有视口**状态与操作**，经 `TimelineController` 暴露（见第 3 节）；缩放/平移的纯计算调用 `core/viewport`。`setScroll` 必须同步：返回前共享 `SceneStore` 的 viewport 投影已更新，并返回接受后的 `ArrangementViewport`，这样 lane 的边缘自动滚动在同一帧重算 Ghost 时读到的是新值，不读前一帧。
- `lane` 与 `tracks` 只**读**视口（通过 props 传入同一个对象），不持有第二份。
- 垂直滚动：`tracks` 的表头列与 `lane` 的车道共用同一个 `scrollY`，作为一个整体滚动；Minimap 固定，不随垂直滚动。
- `core/scene` 导出 `ArrangementGeometry = Pick<LayoutTokens, "track" | "arrangement">`，`createSceneStore(geometry)` 的输入必填。组合根从 `theme.layout` 注入，运行时调用同一 store 的 `setGeometry(geometry)`；`ArrangementScene.geometry` 保存只读引用，不另建配置 state、不改写持久轨高。纯 tracks/viewport helper 显式接受 `TrackGeometry`，scene-based core 从 scene 读取，禁止静态 JSON 旁路。具体签名见 [core 公共接口](../../apps/gpuix/src/project/sections/arrangement/core/README.md)。

## 3. 各目录导出的组合接口

```ts
// timeline/index.ts
export interface TimelineController {
  // 由组合根创建并 dispose；内部持有同一个 SceneStore、窗口键盘 owner、视口命令、标尺与自动滚动状态。
  // 「工程 → 场景」投影（music/viewport/playback/projectPreview/timeSelection/选择）只由它订阅 store 后写入，唯一 owner；
  // lane 只写自己的瞬态手势字段（clipDrag/clipResize/hover/targetSelection、setTimeSelectionPreview），不再整份同步。
  // scene.timeSelection 为显示投影：lane 预览优先，否则为 timeline 写入的 committed 选区；结束/取消清除预览。
  readonly sceneStore: SceneStore
  readonly keyboard: KeyboardOwner
  useViewport(): ArrangementViewport // 返回当前 viewport
  setScroll(x: number, y: number): ArrangementViewport // 同步语义：返回前已更新共享 SceneStore 的 viewport 投影，返回「接受后」的 viewport
  zoomAt(anchorBar: number, anchorPx: number, factor: number): ArrangementViewport
  fitToProject(): ArrangementViewport
  readonly view: TimelineView // 命名的视图交互端口，仅供 ArrangementTimeline 消费（标尺、测量、滚轮、暂停跟随、minimap 高度）；组合根与 app-shell 不依赖其细项
  tick(nowMs: number): void // 由组合根的帧源（原生帧回调）喂入，驱动边缘自动滚动与跟随播放
  getFrameDemand(): boolean // 标尺 autoScroll 的实际活动；组合根再合并 playing 与 lane.dragActive
  subscribeFrameDemand(listener: () => void): () => void // 空闲/活动边界通知，不轮询、不把 view 细项泄漏给组合根
  dispose(): void
}
export function createTimelineController(deps: TimelineControllerDeps): TimelineController
export function ArrangementTimeline(props: {
  controller: TimelineController // 取代分散的 scene/viewport/keyboard/cursor 入参
  tracks: ReactNode // 由组合根传入 <TrackRows renderLane={row => <LaneRow .../>} />
  overlay: ReactNode // 由组合根传入 <LaneOverlay .../>，timeline 把它叠在 tracks 上方单次挂载
  labels: TimelineLabels // 双语标签由组合根注入，timeline 不依赖 i18n 包
  cursor: CursorLockPort // 光标锁（Minimap 拖动），组合根传 @/platform/cursor 的 nativeCursorLock
  editSurface?: TimelineEditSurface // renderer-neutral input/ref/wrap port; lane hook supplies it, no timeline → lane import
  interactionOverlay?: ReactNode // tracks injects its only resize strips above the lane input; no timeline → tracks import
}): ReactNode

// lane/index.ts
export function LaneRow(props: {
  row: TrackRow // core/layout.TrackRow（tracks 传结构兼容的 TrackRowGeometry）
  scene: ArrangementScene
  viewport: ArrangementViewport
  readPeaks: PeakReader // 类型来自 project/model/backend；组合根传 adapters 的 readProjectPeaks（与传输、电平同一个工程会话）。(sourceId, startBar, endBar, pixels, contentOffsetBars) => Float32Array；startBar/endBar 是 one-based 的 Clip 局部可见范围（1+visibleOffsetBars），contentOffsetBars=clip.sourceOffsetBars；小节→源帧换算、带符号偏移与跨末尾回绕都在 Rust；返回布局为 **channel-major，其次 pixel-major，每项 [min,max]**（立体声共 pixels*4 个 f32，先左声道全部像素的 [min,max]，再右声道），声道数=length/(2*pixels)，不转置不复制；后端未打开时返回空数组。lane 不假设采样率、不自己换算
}): ReactNode
// 跨行的叠加层：全画布播放头、Pattern Ghost 起点对齐长线、停止时的行内插入线与标尺三角。
// 它们必须跨越多行与空白区域，不能塞进单行，所以独立导出，由 ArrangementTimeline 在 tracks 上方单次挂载。
export function LaneOverlay(props: {
  scene: ArrangementScene
  viewport: ArrangementViewport
  transportBar: () => number // 当前播放位置（小节），来自 runtime 的 readTransportBar
}): ReactNode
export function createLaneController(deps: LaneControllerDeps): LaneController
// Stable input owner, menu and inline editors; originY defaults to BAR_RULER_HEIGHT.
export function useLaneSurface(
  controller: LaneController,
  labels: LaneLabels,
  originY?: number
): TimelineEditSurface

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
export function TrackResizeOverlay(props: {
  scene: ArrangementScene
  viewport: ArrangementViewport
  labels: TrackLabels
}): ReactNode
```

- **复合轨道行归 `tracks`**：每条轨道是一个整体组件 `TrackRow`（产品规则：左、中、右三段；**Live 实测：车道在左，轨道头在窗口右侧**，头部从左到右是颜色标题条、路由列、Mixer 列，整体很窄）。三段的具体排布以 Live 的观察为准，由 `tracks` 决定；车道槽的位置由 `tracks` 摆放，外层**唯一**的轨道边框与分组外框（含折叠组向下包住子轨、围栏层级在轨道边框之上、高度分隔条不截断围栏）都由 `tracks` 画。中间的车道槽由 `renderLane(row)` 填充，`lane` 只提供行内内容，不画轨道边框。
- 因此 `lane` 不再单独铺满整块区域：它导出 `LaneRow`，只渲染**一条轨道的车道内容**（Clip、Pattern、Automation、行内网格线），行的可见范围裁剪与屏外卸载由 `tracks` 的 `TrackRows` 做；`lane` 仍拥有手势 controller（跨行拖动靠 controller 持有的 scene，不靠 DOM）。
- 屏外只保留 `focusedTrackId` 对应行的表头部分（输入框焦点不丢），其车道内容仍按可见范围卸载。
- 焦点：`focusedTrackId` 来自 store 的 `session.selectedTrackIds` 与 `trackSelectionSurface`，不靠 JS 轮询查询原生焦点。原生输入焦点由共享 `Input` 控件自己持有；`tracks` 在表头名称编辑态时通过 `onFocusTrack` 报告 id。
- 二维编辑面只有一个稳定的 `timeline-viewport` Tab owner：它是覆盖车道可编辑区域的持续挂载透明输入层，原生指针捕获不依附虚拟行。`useLaneSurface` 归一化输入到同一 Scene 坐标，调用 lane controller；唯一 `LaneContextMenu` 包住这个 owner，inline editors 在输入层之上。行与 Clip 只保留绘制及 AX 描述，不注册鼠标/键盘，不进入 Tab 顺序。`timeline-viewport.onBlur` 调 `lane.interrupt()`，Tab 离开后释放不提交；滚动卸载 source row 不结束跨行捕获。标尺和轨道头仍拥有各自独立的交互区域。
- `TrackResizeOverlay` 是 tracks 唯一的高度分隔条 owner，`TrackRow` 不再挂载 resize handle/hook。组合根把它注入 `interactionOverlay`，在 lane 输入层之上绘制分隔条 hitbox，横跨车道与表头。空闲时按共享行布局裁剪；活动时保留按下 hitbox 和 owner 到释放或取消，不能因自身高度变化使边界离屏而卸载。不覆盖车道其他区域。
- 滚轮只由全宽 `timeline-layout.onScroll` 分派。透明 lane 输入层不注册第二个滚轮入口，车道与表头使用同一平移量、缩放比例。

## 4. 键盘 owner（避免双触发）

窗口键盘事件在同一次按键的所有元素事件**之后**触发（见 LESSONS）。每个 render root 保持唯一 `WindowKeyboard`，`ArrangementTimeline` 订阅 timeline owner；组合根的先行订阅只关联本次 `keystrokeId`，不执行第二套窗口快捷键。

| 命令 / 键 | owner |
| --- | --- |
| `project.save`、`transport.togglePlay`、`arrangement.draw`（Cmd/Ctrl+S、Space、B） | timeline 的项目级命令；非文本 Clip Editor 同样生效 |
| `edit.undo/redo`、`grid.narrow/widen/toggleSnap`、`edit.cancel`、`transport.rewind/seekLeft/seekRight`、电脑 MIDI、Automation | timeline 的 Arrangement 命令；只在 timeline/control 上下文解析 |
| `browser.focusSearch`（Cmd/Ctrl+F） | 同一 timeline 命令注册表；组合根注入 Browser 可用性与实际 `focusSearch`，文本上下文允许查找，菜单不允许 |
| Clip/Automation 选择、split、duplicate、rename、delete、复制剪切粘贴、拖动取消；定位点与 Loop 命令 | 仍由 lane / rulers 的既有 owner 执行；timeline 上下文的局部命令先让这些 owner 认领，未认领才执行对应全局后备；项目级保存、播放和 B 不进入认领链 |
| 轨道名称输入、Mixer 数值编辑、菜单导航与共享控件操作 | 对应元素 owner；只消费实际处理的命令，不消费原生文本默认输入 |

- **命令**：`platform/keyboard` 的 `CommandId` 是字符串字面量联合；`createCommandRegistry` 为每个 id 注册真实双语 `commands.${id}` 标题 key 与返回 `handled | pass` 的处理函数。业务仍调用原有 `projectActions`；命令表不是第二份工程状态。
- **绑定**：`DEFAULT_BINDINGS` 是唯一默认键位数据，元素为 `{ keys, command, context }`。`Mod` 表示 Cmd 或 Ctrl，`Shift?` 明确保留原快捷键允许 Shift 的规则。`createKeymap` 在构造时检查同一键、修饰键交集与上下文交集；冲突抛错，不按条目顺序覆盖。
- **上下文**：`focus` 为互斥的 text/menu/clip-editor/timeline/control，来自组合根已有 text/modal lease 与同次 `keystrokeId` 关联；computerKeyboard 与 browserSearch 为当前 workspace 与组合根能力的谓词。不重建原生焦点树。保存、播放、B 的 Clip Editor 例外由数据声明，而非提前 return 的位置决定。
- **默认消费**：窗口和共享控件统一经 `shared/keyboard.consumeKey(event, result)`；`handled` 同时调用 `preventDefault` 与 `stopPropagation`，`pass` 不改变事件。文本输入的 shortcut isolation 仍只停止传播，不阻止文字默认输入；Menu Tab 仍保留默认焦点移动。
- **Space**：工具栏、Transport、表头按钮与切换控件不激活、不进入按下样式、不消费 Space；事件到窗口执行播放。菜单选项 Space 由选项消费，输入框 Space 由原生编辑器输入。
- **状态生命周期**：B 的轻按锁定、按住绘制与松键释放，电脑 MIDI noteOn/noteOff，以及失活/关闭电脑键盘/editEpoch/dispose 释放仍由同一 timeline keyboard owner 持有；松键按按下时的键身份释放，不因中途修饰键或焦点变化漏释放。
- **显示**：已有快捷键文字使用 `keymap.formatKeys(command)`；共享菜单只接收格式化结果，不依赖 project/platform。用户 keymap 文件、命令面板、renderer 级焦点身份不在本次范围：后续分别接 `createKeymap`、命令注册表、composition 的上下文输入，不另起窗口 owner。
- Cmd/Ctrl+3（三连音）与 +5（固定网格模式切换）仍未实现。

## 5. 组合根

`app/project/composition.ts` 创建共享 scene、timeline 和 lane controllers，注入完整 `geometry`、唯一键盘、同步 setScroll 与 markDrawGesture。`useProjectComposition` 读取 theme.layout，首次构造传入，运行时更新同一 SceneStore 的 `setGeometry`；timeline 仍是 viewport 的唯一 owner。`app/project/ArrangementPanel.tsx` 读取这些 controller、viewport、scene、telemetry 与峰值，注入 labels，并组合 `TrackRows`、`LaneRow`、`LaneOverlay`、`useLaneSurface` 和 `TrackResizeOverlay`。timeline 不 import lane 或 tracks。Pattern 区域明暗仍只来自 core 的 `patternRegions(scene)`，车道不复制计算。

## 6. 变更规则

- 本文是契约：改接口时先改本文，再同步改 `core`、`tracks`、`lane`、`timeline` 与组合根。
- 新增导出符号写进各目录 README 的「公共接口」小节，并保持与本文一致。
