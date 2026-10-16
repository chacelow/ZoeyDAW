# Arrangement 计算核心

B1，2026-10-15。这里只接收坐标、工程模型和显式手势数据，返回几何、命中结果或编辑投影。不读取界面节点，不注册输入，不提交工程事务。

## 所有权与坐标

- 工程数据由既有 project Store/runtime 持有。`createSceneStore(geometry)` 保存实例内的展示投影、选择与预览，不导出全局实例。`setGeometry()` 更新同一实例，不改工程数据。
- 手势 baseline 与累积值由调用方持有。`moveFadeDrag()`、`paintAutomation()` 返回下一状态，不改输入。
- 时间从 bar 1 开始。横坐标统一为 `(bar - 1) * pxPerBar - scrollX`。
- `project/model/grid`、`grid-geometry` 和 `timeline-ticks` 保持唯一模型实现。`rulers/grid-lines.ts` 只把场景已有的 `gridPlan` 投影成有 major/minor 分类的可见线。
- 轨道、标尺、Clip 和命中几何来自同一个 `scene.geometry`。`TrackRow` 与 `ClipRect` 保留 `trackGeometry`、`arrangementGeometry` 引用。纯计算不读取主题数据文件。
- `meters/meter-peak.ts` 保持原来的显式时间输入与原位更新 API。它不读取时钟、不启动采样。
- `SceneStore.setTimeSelection` 只接 timeline 的 committed 投影；lane 使用 `setTimeSelectionPreview`，显示 `timeSelection` 优先取预览，结束或取消传 `null` 恢复当前 committed 值。
- `packGridQuads(lines, left, width, height, majorWidth, minorWidth, uniform?)` 统一半开可见范围过滤与局部 quad 打包。普通细网格透明度取 `theme.project.gridMinorOpacity`。Clip 的 uniform 分批仍保留原始粗细几何。
- `edgeScroll({ viewport, bars, tracks, pointer, axis, edge, elapsed, geometry, policy })` 返回夹取后的 `scrollX/scrollY`。固定轨道不触发垂直滚动。`geometry` 提供轨道与标尺边界，`policy` 提供单帧上限与独立轴速度。调用方拥有手势与帧生命周期。
- `project/defaults/arrangement.ts` 持有编辑策略默认值，共享 pointer 初值来自纯 `project/defaults/preferences` 入口。`resolveArrangementPolicy(source, overrides, pointer)` 在配置边界逐字段解析稀疏偏好，保留合法的零值。controllers 通过 `readPolicy()` 读取最新完整策略，纯计算只接收对应分组。Minimap 保存按下时的策略快照。偏好改变取消正在进行的手势，不重建 SceneStore 或 controllers。
- `createMeterPeak(policy)`、`meterDb(levelDb, policy)`、`advanceMeterPeak(peak, levelDb, nowMs, policy)` 共用 `ArrangementPolicy["meter"]`；没有第二份 meter 范围、hold 或 fall 常量。时间单位换算仍是数学常量。
- App composition 的生命周期由 keyboard/interaction/native renderer 等服务身份决定，不由 `project` 度量值决定。稳定的只读 metrics 视图读取最新受控来源；minimap 上下限、lane 与 ruler autoscroll 的 edge 不冻结初值。度量更新取消活动手势，不替换 SceneStore、controllers 或选择。真实 hook/native backend 回归在 `app/project/live-policy.test.tsx`。

## 公共接口：配置几何

```ts
type ArrangementGeometry = Pick<LayoutTokens, "track" | "arrangement">
createSceneStore(geometry: ArrangementGeometry): SceneStore
SceneStore.setGeometry(geometry: ArrangementGeometry): void
layoutTrackRowsForViewport(tracks: readonly Track[], scrollY: number, height: number, geometry: ArrangementGeometry): TrackRow[]
```

- `ArrangementScene.geometry` 保存组合根注入的只读引用。应用从 `Theme.layout` 创建 SceneStore，来源替换时调用 `setGeometry()`。timeline 重算唯一 viewport 投影，轨道保存的 `heightPx` 不变。
- `scene.geometry.track.controlsWidth` 是轨道控制列总宽的唯一来源。identity/routing 子列仍由 project 提供，Mixer 用总宽减两个子列宽派生剩余宽度。
- `TrackRow`、`ClipRect` 同时携带 `trackGeometry` 与 `arrangementGeometry`。Clip 局部缓存比较两个引用，标题高、Clip 和 fade 配置变化都会使投影失效。
- `TimelineViewportInput`、`PanViewportInput`、`edgeScroll` 要求显式完整 `ArrangementGeometry`。独立 tracks/viewport helper 不为读取配置创建包装 Scene，也不依赖 React context。
- `arrangement` 中标尺、Clip 与 hit 的读取使用注入来源。完整字段与来源规则见 [统一配置契约](../../../../../../../docs/architecture/configuration.md)。

## 计算接口

具体输入结构与导出类型同实现文件。以下签名列出从副作用文件抽出的计算入口。`Point` 为 `{ x: number; y: number }`。

```ts
// clip-alignment.ts
alignmentBar(scene: ArrangementScene): number | null

// interactions/layers.ts
interactionLayer(scene: ArrangementScene, pointer: Point, automationMode: boolean): "ruler" | "clip" | "automation"
dragStarted(origin: Point, current: Point, policy: ArrangementPolicy["pointer"]): boolean

// clip/fade.ts
beginFadeDrag(clip: AudioClip, edge: "in" | "out", handle: "length" | "curve", origin: Point, pxPerBar: number, height: number, fadeHitSize: number): FadeDrag
moveFadeDrag(state: FadeDrag, current: Point, pxPerBar: number): { state: FadeDrag; patch: Partial<AudioClip> | null }

// clip/timeRange.ts
timeRangeSelection(scene: ArrangementScene, startBar: number, trackId: string, previousTrackIds: readonly string[], pointer: Point, snap: boolean, automationMode: boolean): TimeSelection
committedTimeRange(selection: TimeSelection): TimeSelection | null

// automation/hit.ts
hitAutomation(scene: ArrangementScene, pointer: Point): AutomationHit | null

// automation/points.ts
sortedPoints(points: readonly AutomationPoint[]): AutomationPoint[]
selectedPointIds(existing: readonly string[], pointId: string, shift: boolean): string[]
movePoints(input: MovePointsInput): AutomationPoint[]
deletePointOnRelease(cancelled: boolean, moved: boolean, shift: boolean, ids: readonly string[]): boolean

// automation/segment.ts
moveSegment(source: readonly AutomationPoint[], fromId: string, toId: string, delta: number, bend: boolean): AutomationPoint[]
insertSegmentPoint(from: AutomationPoint, to: AutomationPoint, bar: number, snap: boolean, cellBars: number, endBar: number, bypass?: boolean): Omit<AutomationPoint, "id">
shouldInsertSegmentPoint(cancelled: boolean, changed: boolean, bend: boolean, near: boolean): boolean

// automation/selection.ts
marqueePointIds(row: AutomationRow, originBar: number, endBar: number, originY: number, endY: number): string[]

// automation/flat.ts
flatLinePoint(bar: number, value: number, snap: boolean, cellBars: number, endBar: number, bypass?: boolean): Omit<AutomationPoint, "id">
shouldInsertFlatPoint(cancelled: boolean, moved: boolean): boolean

// automation/drawing.ts
paintAutomation(input: PaintInput): PaintResult

// automation/index.ts
automationAction(hit: AutomationHit | null, drawMode: boolean, button: number): AutomationAction | null
automationCursor(hit: AutomationHit | null, drawMode: boolean): "automationDraw" | "grab" | "verticalResize" | undefined

// rulers/grid-lines.ts
numberedRulerPlan(pxPerBar: number, numerator: number, denominator: number, spacing: ArrangementGeometry["arrangement"]["rulerLabelSpacing"]): { mode: "sixteenth" | "beat" | "bar"; stepBars: number }
rulerTicks(scene: ArrangementScene): RulerTick[] // 可读的拍/十六分音符标签，仅供标尺，不产生画布主线
gridLines(scene: ArrangementScene, left?: number, right?: number): GridLine[] // major 仅整数小节边界；不可读时按 2 幂小节合并，minor 仅 gridPlan.cellBars
patternRegions(scene: ArrangementScene): PatternRegion[] // 正常缩放每小节独立；小于 model/grid.MIN_GRID_CELL_PX 时按 2 幂合并，相邻交替，和标签 stepBars 无关
scene.geometry.arrangement.rulerLabelSpacing // 标签可读性阈值；多级 Live 阈值仍未验证
MIN_GRID_CELL_PX // model/grid 的既有最小单元像素，Pattern/major 复用而非另造阈值；极小视图合并尚未对照 Live

// rulers/geometry.ts
rulerLabel(bar: number, numerator: number, denominator: number): string
adjacentMarker(markers: readonly Marker[], position: number, direction: -1 | 1): Marker | null

// viewport/zoom.ts
zoomAtAnchor(input: ZoomAnchorInput & { nextPxPerBar: number }): MinimapViewport
wheelZoom(input: ZoomAnchorInput & { deltaY: number }, policy: ArrangementPolicy["zoom"]): MinimapViewport
stepZoom(input: Omit<ZoomAnchorInput, "anchorX"> & { direction: -1 | 1 }, policy: ArrangementPolicy["zoom"]): MinimapViewport
clampTimelineViewport(input: TimelineViewportInput, policy: ArrangementPolicy["zoom"]): TimelineViewport
panViewport(input: PanViewportInput): { scrollX: number; scrollY: number }
followViewport(input: FollowViewportInput, policy: ArrangementPolicy["follow"]): number
clampScrollX(scrollX: number, bars: number, pxPerBar: number, viewportWidth: number): number

// viewport/minimap.ts
minimapHit(x: number, width: number, geometry: MinimapGeometry): MinimapHit
minimapPointerDown(input: { x: number; width: number; geometry: MinimapGeometry }): MinimapAnchor | null
minimapDragBody(input: { geometry: MinimapGeometry; width: number; initialScrollX: number; zoomAnchorRatio: number; deltaX: number; deltaY: number }): MinimapViewport
```

`paintAutomation()` 的 `idPrefix` 由调用方在手势开始时分配，必须在工程内唯一。`DrawingState.nextId` 是本手势计数器，重绘同一 cell 保留 ID。取消手势直接丢弃返回值，工程提交与撤销仍由 B2 的 runtime 事务负责。freehand 的 `DrawingState.swept` 保存已扫过的合并时间区间：原始点在覆盖区间内删除；回扫替换先前不重合的采样点，未绘制的 viewport 间隙与区间外点保留。新手势以 `{ painted: [], swept: [], last, nextId: 0 }` 初始化；状态及原始点不就地修改。

`PaintInput.policy` 是 `ArrangementPolicy["automation"]`，控制自由画线采样分辨率。网格 cell、音乐端点和归一化计算保持领域语义。

缩放锚点在未撞到工程边界时保持像素位置。到达 scroll clamp 后，边界优先，无法同时保持越界的锚点。Minimap 下拖减小 `pxPerBar`，上拖增大；水平锚点采用按下位置在选区内的比例，不固定中心。

Pattern Ghost 及任一侧 resize 的对齐线均返回当前预览 Clip 的左起点。该规则覆盖 web 右侧 resize 原先画到尾部的行为。
