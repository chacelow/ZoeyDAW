# C1 主题与布局来源迁移

## 范围与决策

实际派发基线：`a4a9d11c927e71ea69ab8299d89d29fe996ba03b`（本 worktree 与 `gpuix-migration` 的 merge-base）。本切片建立来源与完整对象 Provider，默认数值、颜色、交互语义不变；业务样式的接线由 C2/C3 完成。

协调者另行授权的最小完整切换：

- 删除 `project/layout` 的静态常量导出，显式注入轨道几何；迁移所有调用、测试、demo、verification 与可执行 mutation 字符串。
- `SceneStore` 构造接受 `ArrangementGeometry`（`Pick<LayoutTokens, "track" | "arrangement">`）；应用组合根传入 `theme.layout`，运行时 `setGeometry()` 更新同一 SceneStore。`ArrangementScene.geometry` 保存只读引用，行与 Clip 投影的 `trackGeometry` 引用同一输入。
- `trackHeight`、`trackControlRows`、`resizeTrackHeight` 的几何参数必填。既有 tracks/viewport 纯函数接收几何，scene-based 函数从 scene 取得几何。布局模块声明自己的最小结构输入端口，不 import React/theme；这是分层边界，不是第二份配置数据。
- 原生滚动、命中、轨道标题、resize、行可见性都使用注入几何；几何改变不写回保存的 `heightPx`。时间线和轨道 resize 会清理旧几何下的活动手势；lane 交互策略仍由 C3 维护。
- `addTrack(kind, heightPx, parentId?)`、`groupTracks(ids, heightPx)` 由 UI 注入新轨高，adapter 不再读 theme JSON。
- 盘点外的 `contentFill` 固定 32% tint 改为 `design.colorRecipes.contentPaperTint`，最小迁移 Arrangement 的 `ClipContents`、`GroupRails`、`TrackIdentity`、`TrackMenu`、`TrackRows`、demo 与 verification 参数；默认画面不变。
- Gallery design 与 Transport/DragPad 字体测试补展开完整子对象，仅适配新增类型字段，不改外观与断言。
- 独立审查后按协调者仲裁删除 `project.controlsWidth`，总宽唯一来源改为 `layout.track.controlsWidth`。TrackRows、resize 与 core 共用解析几何，Mixer 从总宽减 identity/routing 派生；所有旧读取均迁移，不留兼容字段。非轨道组件保留原借用行为，专用语义来源由 C2 接线。Home 已直接读取 `layout.home.maxWidth`。
- core README 与 Arrangement 组合契约已同步 `createSceneStore(geometry)`、`setGeometry()`、`edgeScroll` 必填几何参数。键盘 owner 未改变。

Provider 的 `design/layout/control/transportControl/project` 均接受完整对象，不做 partial merge、不持有配置 state。省略 layout 时从当前 control/project 派生；显式 layout 按原对象使用。默认颜色复用预设缓存，覆盖配方时按 scheme 重新派生。

## 盘点组 ID → 来源

下表只列来源，不把尚待 C2/C3 接线的条目算成已接通业务。

| 组 ID | 来源（`theme.` 前缀省略） | 默认值或处置 |
| --- | --- | --- |
| 1.1 | `layout.project.panels.{browserDefaultSize,browserMaxSize,arrangementMinWidth,clipDefaultSize,clipMinSize,clipMaxSize}` | 25% / 50% / 30% / 40% / 20% / 70% |
| 1.2 | 用户窗口设置 | C4；不在 layout/settings 重复建窗口初值 |
| 1.3 | `design.settings.{shellWidth,shellHeight,navigationWidth}` | 720 / 520 / 168 |
| 1.4 | `project.maxTrackHeight` → `layout.track.maxHeight` | 280；删除旧 4× 轨高常量 |
| 1.5 | `design.settings.presetGrid.{columnWidth,swatchHeight,scrollHeight}` | 200 / 26 / 280 |
| 1.6 | `layout.home.maxWidth` | 912，独立于轨道控制列宽 |
| 2.1 | `design.menu.maxWidth`、`design.dragPreview.maxWidth` | 分别 320，不混用语义 |
| 2.2 | `design.menu.maxHeight` | 300 |
| 2.3 | `design.overlay.sideOffset` | 4 |
| 2.4 | `design.overlay.collisionPadding` | 8 |
| 2.5 | `design.menu.width`、`design.popover.width` | 130 / 156 |
| 2.6 | 既有 `design.popover.inset`；`design.dragPreview.gap` | 8 / 8 |
| 2.7 | `design.empty.{gap,inset,radius,contentGap,headerMaxWidth}` | 16 / 24 / 12 / 8 / 304 |
| 2.8 | `design.loading.{gap,brandWidth,brandHeight}` | 12 / 60 / 39 |
| 2.9 | `design.toast.{edgeInset,stackGap,inset,radius,width}`；`design.loading.progressWidth` | 12 / 8 / 12 / 8 / 304；304 |
| 3.1 | 既有 `design.shape.{controlBorderWidth,cardBorderWidth}` | A 组由调用方按语义复用，不另建副本 |
| 3.2 | `design.shape.separatorWidth` | 1 |
| 3.3 | `design.menu.{dropdownSeparatorInset,contextSeparatorInset}` | 3 / 4，保留两种现有菜单的像素 |
| 3.4 | 既有 `design.shape.focusRingWidth` | 1；offset 由同一宽度取坐标反向 |
| 3.5 | `design.editor.{dividerStrokeWidth,loopStrokeWidth,selectionStrokeWidth}`；MIDI note 复用 `design.shape.controlBorderWidth` | 各 1；没有新增 note border 副本 |
| 3.6 | `design.editor.{playheadLineWidth,insertionLineWidth,selectionLineWidth,markerLineWidth,loopLineWidth,velocityLineWidth}` | 各 1 |
| 3.7 | 既有 `design.shape.controlBorderWidth`；`design.editor.{gridMinorStrokeWidth,noteInset}` | 1 / 1 / 1 |
| 3.8 | `design.editor.inlineRadius`、`design.tabs.footerJoinedGroupGap` | 各 0；C2 原生判别证明 Footer 圆角是同色背景上的死配置，协调者批准删除该来源与 local override，不新增圆角裁剪语义 |
| 4.1 | C4 的轨道创建色映射 | 按最新仲裁由 C4 放入 Theme 并注入 RuntimeOwner；C1 不重复添加，已保存内容色不回写 |
| 4.2 | preset `baseColors.{arrangementClipSelected,arrangementClipPaper}` | 原 OKLCH 值；各预设可独立声明 |
| 4.3 | `design.colorRecipes.destructive.{active,highlight,focusBorder,focusOutline}` → `colors.destructive*` | active light10/dark20；highlight light20/dark30；border40；outline light20/dark40 |
| 4.4 | `design.colorRecipes.listRowHover` → `colors.listRowHover` | 90 |
| 4.5 | `design.colorRecipes.dialogBackdrop` → `colors.dialogBackdrop` | foreground 10% transparent；独立于 scrollbar |
| 4.6 | `design.colorRecipes.editor.{overviewViewport,audioLoop,markerHover,marquee}` → `colors.editor*` | 12 / 45 / 30 / 20 |
| 4.7 | `design.colorRecipes.editor.{pianoIvoryDark,pianoEbony}` → `colors.pianoIvory/pianoEbony` | 75 / 80；明暗配方保留 |
| 4.8 | `design.colorRecipes.editor.{velocityNoteBorder,velocitySelected,velocityUnselected}`；`velocityNoteBorder/velocityNoteFill` | 60；55+velocity/127×45；35+velocity/127×65；127 是 MIDI 协议 |
| 4.9 | `design.colorRecipes.{editorShell,canvasScrollbar,canvasScrollbarHover,canvasScrollbarActive,scrollbarTrack,arrangementSurfaceSelected,arrangementSurface,arrangementSurfaceAlt,arrangementFadeMask,aliases}`；preset `success` | 原比例 30/10/18/26/4/78/86/84/50；语义别名可改，success 可独立于 chart2 |
| 5.1 | `design.states.disabledOpacity` | 0.5 |
| 5.2 | `design.editor.{clipGhostOpacity,rangeOpacity}` | 0.5 / 0.5，独立于 disabled |
| 5.3 | `design.states.dragSourceOpacity`、`design.editor.waveformAxisOpacity` | 0.4 / 0.4 |
| 5.4 | `design.dragPreview.opacity`、`design.editor.groupClipPreviewOpacity` | 0.85 / 0.85 |
| 5.5 | `design.editor.drawPreviewOpacity` | 0.2 |
| 5.6 | `design.editor.clipLoopShadeOpacity` | 0.1 |
| 5.7 | `design.editor.midiLoopOpacity` | 0.35 |
| 5.8 | `project.{gridMajorOpacity,gridMinorOpacity}` | 0.45 / 0.55；完整 opacity 端点仍按结构/状态处理 |
| 5.9 | `design.dragPad.fillOpacity` | 0.3 |
| 5.10 | `design.progress.{indeterminateOpacity,widthFraction}` | 0.5 / 0.3 |
| 6.1 | `design.typography.weights.semibold` | 600 |
| 6.2 | `design.typography.weights.medium` | 500 |
| 6.3 | 既有 `design.typography.numberFontFamily` | Menlo；没有产品普通字体字面量副本 |
| 6.4 | `design.icon.strokeWidth` | 2 |
| 6.5 | `project.deviceResponseStrokeWidth` | 2 |
| 6.6 | device curve 的 SVG/viewBox 基准 | C；坐标域由 C2 核对并注释，不建屏幕尺寸副本 |
| 7.1 | `layout.arrangement.{markerRulerHeight,loopRulerHeight,timeRulerHeight,barRulerHeight}` | 17 / 17 / 18 / marker+loop |
| 7.2 | `layout.arrangement.hit.{clipResizeEdge,clipFadeHandle}`；`layout.arrangement.automationPointRadius` | 6 / 7；绘制半径 4，与点命中 x6/y7 分开 |
| 7.3 | `layout.arrangement.clip.{minWidth,minHeight,verticalInset,bodyThresholdInset,fadeHandleMargin}` | 2 / 4 / 1 / 4 / 3；边框补偿引用对应 stroke |
| 7.4 | minimap interaction 策略 | C3 defaults；不是主题绘制尺寸 |
| 7.5 | adaptive grid 密度策略 | C3/C4 defaults；节拍分割是领域常量 |
| 7.6 | `design.dragPad.centerMarker.{inset,width}`；`layout.arrangement.minimapClipInset` | 2 / 1；1 |
| 8.1 | `design.motion.tabs.{duration,easing}` | 0.16 / easeOut；easing 类型从 renderer 的 motion transition 派生，允许有效覆盖 |
| 8.2 | notifications.duration | C4 用户偏好，不属于动画时长 |
| 8.3 | notification 队列/展示策略 | C4 defaults；持续通知 duration=0 为语义常量 |
| 8.4 | `design.cursors.{default,action,disabled,text}` | default / pointer / not-allowed / text |
| 8.5 | `design.cursors.{grab,grabbing,verticalResize,horizontalResize,rowResize}` | grab / grabbing / ns-resize / ew-resize / row-resize |
| 8.6 | `design.cursors.{grabbing,verticalResize,automationDraw,default,fadeCurve,horizontalResize}` | controller 语义状态由 C3 接线，不只迁 JSX |
| 盘点外 content tint | `design.colorRecipes.contentPaperTint` | 32；C1 已接全部现有调用 |
| 盘点外 meter | `design.editor.meter.{channelGap,peakWidth,zeroWidth,warningStop}` | 1 / 1 / 1 / 0.3；方向角 180 留 C |
| 盘点外 automation hit | `layout.arrangement.hit.{automationPointX,automationPointY,automationSegmentMax,automationSegmentHeightFraction,automationNear}` | 6 / 7 / 14 / 0.125 / 4 |
| 既有轨道总宽 | `layout.track.controlsWidth` | 304；删除 `project.controlsWidth`，子列剩余宽度从总宽派生 |
| 追加设备拖动源 | `design.states.deviceDragSourceOpacity` | 0.5，与普通拖动源 0.4、disabled 0.5 分开 |
| 追加列 resize 指针 | `design.cursors.columnResize` | col-resize，与 ew-resize 分开 |
| 追加拖动预览偏移 | `design.dragPreview.pointerOffset.{x,y}` | 12 / 12 |
| 追加 tabs 与插入符 | `design.tabs.width`、`design.dragPad.caretWidth` | 120 / 1 |
| 追加淡化描边 | `design.editor.fadeStrokeWidth` | 1，Audio 与 ClipFades 共用 |
| 追加 Clip body 状态 | `design.editor.{clipBodySelectedOpacity,clipBodyAutomationOpacity,clipBodyOpacity}` | 0.9 / 0.25 / 0.55 |
| 追加 Clip 网格与预览 | `design.editor.{clipGridHoveredOpacity,clipGridOpacity,clipAutomationPreviewOpacity}` | 0.3 / 0.4 / 0.4 |
| 追加标尺命中 | `layout.arrangement.hit.{rulerMarker,rulerLoopEdge}` | 9 / 5 |
| 追加标签密度 | `layout.arrangement.rulerLabelSpacing.{subdivision,beat,bar}`；`gridMinSubdivisionWidth` | 38 / 56 / 56；2 |
| 追加 Clip 名称内缩 | `layout.arrangement.clip.{nameEditorLeftInset,nameEditorRightInset}` | 1 / 2，保留非对称关系 |
| 独立反馈布局 | `design.feedback.{maxWidth,gap,inset,actionGap}` | 304 / 12 / 24 / 8 |
| 独立确认框宽 | `design.dialog.confirmationWidth` | 304 |
| 独立近期卡片宽 | `layout.home.recentCardWidth` | 304 |
| 独立 Gallery 宽度 | `layout.gallery.{cardWidth,settingsPreviewWidth}` | 304 / 608 |

## 已运行证据

- `pnpm exec tsc --noEmit`：通过；定向主题、轨道几何、scene 与 composition 测试：170 pass、0 fail。
- 离屏 Gallery：`bun scripts/gpuix-main/ci-geometry/gallery.tsx <输出目录>`，深浅 × 中英共 4 张。
- 真实后端业务：`B2_EVIDENCE_DIR=<输出目录> bun --preload ./apps/gpuix/src/app/verification/native-fixture.ts apps/gpuix/src/app/verification/r1c-surfaces.tsx <输出目录>`，深浅 × 中英 × MIDI/audio 共 8 张。
- 迁移前后 12 张 PNG 全部 `cmp` 字节一致，故像素差为 0。证据根目录：`/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/zoeydaw-c1-evidence.oCo1XVV2I3`，子目录 `before-gallery/after-gallery/before-business/after-business`。
- 受控分组回归用真实 Button 与 TrackIdentity：control/transport 高度、project identity 宽度、layout 标题高度、design 圆角与内容 tint 随来源改变，并可恢复默认。
- `track.test.ts` 证明源变更影响折叠高、控件行数、reveal 阈值、resize 步长与 cap；`scene.test.ts` 证明 runtime geometry 更新同时移动行投影与命中 owner，不替换 music/selection。
- 颜色回归覆盖所有新增 mix/alias、明暗分支与 MIDI velocity；`bun apps/gpuix/src/shared/theme/verification/mutations.mjs`：52/52 source-bypass 变异均触发目标回归失败，含缓存键、4 条总宽读取及 Home 最大宽度旁路。临时源码副本退出即清理，不修改工作区进行变异。
- 后台真实窗口：命名 service `c1-theme-background`，`GPUIX_BACKGROUND=1 bun --hot apps/gpuix/src/shared/theme/demo.tsx`；窗口 960×448（含系统 chrome），focused=false，AX 可见标题。后台未出业务帧，未宣称窗口视觉/性能验收；8.1 秒内关闭。AX：证据目录的 `native-window-ax.txt`。
- 修复前的完整 `pnpm verify:gpuix` 已两次返回 0：805 个跟踪源码绝对路径门禁 0 hard；renderer 身份、native build、tsc、eslint 通过；架构 87/87、工具 CLI 81/81；Bun 1325 pass / 1 todo / 0 fail（205 文件）；文档路由、UI map 与真实后端 Home→工程→恢复首帧 smoke 通过。
- 最新 `node scripts/gpuix-review-scan.mjs`：72 source / 41 test，0 HARD / 10 WARN；逐条处置见下表。
- P1 先红后绿：`bun test src/project/sections/arrangement/lane/LaneRow/LaneRow.test.tsx -t 'refreshes a cached mounted Clip title'`，修复前 Expected32/Received21，修复后 1 pass；相邻 LaneRow/render-projection 12 pass。缓存键变异会重现该失败。
- P2 先红后绿：`bun test src/app/project/composition.test.tsx -t 'explicit layout control width'`，修复前整行 Expected1280/Received1184，修复后同宽与三列和断言通过。composition 与 runtime-overrides 共 12 pass，tsc 通过；Home 实际宽度随独立布局来源 912→600。
- P1/P2 修复后重新捕获全部 12 张组合 PNG，与迁移前基线仍字节一致。
- N1 两个既有变异入口也在隔离副本实测：app 的 `track rails deduct` 触发 1 个目标回归失败，timeline 的 `TIMELINE_MUTATION=collapsed-group-width` 触发 800/200px 两个 summary 可见性回归失败，没有 NaN 或语法失败。临时副本与烟测脚本均已清理。
- 可重跑默认核对：`bun apps/gpuix/src/shared/theme/verification/defaults-audit/index.ts a4a9d11c927e71ea69ab8299d89d29fe996ba03b apps/gpuix/src/shared/theme/verification/C1-DEFAULTS.md`，580 个来源叶子、0 差异。旧设计对象、度量与 palette 从原 Git 文件加载，算式按旧默认度量求值；未知新叶子会直接失败。完整「字段 / 原表达式 / 原值 / 新默认值 / 一致」表见 [C1-DEFAULTS.md](C1-DEFAULTS.md)。默认忠实核对与消费者回归分开，不用截图零差冒充未接线字段的默认值证明。

## UI 规范第 13 节

| 检查 | 结论与证据 |
| --- | --- |
| Gallery 与业务整体布局 | 4 个 Gallery 与 8 个真实后端业务组合完整截图，前后 PNG 字节一致 |
| 跨区域对齐与居中 | 默认像素无变化；真实控制/轨道标题 native bounds 随来源覆盖的回归通过 |
| 间距与内边距 | 默认像素无变化；保留 dropdown/context separator 3/4，未以统一之名改变画面 |
| 统一设计入口 | 真 Button/TrackIdentity 验证 design、control、transportControl、project、layout 的覆盖；没有局部补偿样式 |
| 尺寸与紧凑感 | 默认控制 13、Transport 20；Live 只读参考见下表；未改变既有密度 |
| 深浅主题与中英文 | 同组合截图覆盖四种组合；业务额外覆盖 audio/MIDI |
| 状态与键盘 | 既有 composition 原生行为回归通过；Provider 配方切换不重置子树计数；未宣称重新前台验收全部状态 |
| 拖动、滚轮、弹层与性能 | 轨道 resize/scene 命中与滚动注入纳入既有测试；前台交互与实际窗口帧性能留协调者收尾，不把离屏数据当窗口帧证据 |

## 产品规则 → Live 观察 → 实现 → 差异/未验证

本轮不重新定义 Live 行为；迁移前以已运行 gpuix 基线为零差参照，Live 只做只读观察，没有输入、播放或工程修改。

| 产品规则 | Live 只读观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 工作站紧凑控制行 | Live 窗口 AX 1463×1049；速度 ref=e8 bounds 44×19 | gpuix Transport 默认高 20，普通控件高 13 | AX 原始单位；未换算显示器 scale，不声称绝对像素相同 |
| 轨道路由紧凑且与标题同列 | 输入类型 ref=e174 bounds 72×15；Arrangement 标题与 routing 同处右侧 | 默认 routing/track 绘制保持基线；新几何不分叉命中与绘制 | 只读观察，未在用户 Live 拖轨高测阈值 |
| 自定义主题不得改写内容或工程 | Live 当前播放=0、录制=0；本次无写入操作 | Provider/scene 几何不重建工程，保存轨高不变 | 配方覆盖是本项目配置能力，不声称 Live 有同样 Provider API |

Live 截图：`/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/omp-computer-15a838bb442e2188.png`，由 1463×1049 缩为 1250×896，仅作整体参考。

## 边界与未实现项

- 新 layout/design 条目尚未全部接到业务调用；这是 C1 来源切片与 C2/C3 接线切片的明确边界。消费者新增回归和字面量变异由实际接线的切片逐项补，不写只测字段转发的伪回归。
- 窗口/settings、通知行为与工程默认文案归 C4；门禁新增规则归 C5。
- 用户更新本机验证规则后，不再本地运行完整 `pnpm verify:gpuix`。后续交付按 tsc、改动范围测试与 eslint、切片变异、必要 smoke 验证；完整门禁交协调者合入后在 Actions 执行。上文两次完整门禁为规则更新前的实际历史结果。
- `layout.track.mainHeight` 与轨道创建色映射按最新通知改由 C4 实现，C1 未添加这两项。
- 剩余产品直接 metrics 读取仅 `main.tsx` 的 render 前原生 titlebar 启动配置（旧架构明文例外）；已上报协调者供 C4 启动配置接线。C1 不越界改启动窗口。
- 没有 Rust 源码变化；原生二进制已构建并用于业务像素 smoke，不另外把 cargo check/test 声称为本轮已运行。
- 前台窗口视觉、交互状态全量复核与帧性能未运行，按后台验收约定交协调者串行收尾。

## 错题

- 错：alias 回归把 `success` 指向默认同值的 `chart2`，恢复字面别名的变异仍通过。对：用独立 success fixture，确保不同语义输入不相等；对应变异已杀死。
- 错：velocity 选中回归在近白色前景之间混色，系数变化被 hex8 量化吞掉。对：覆盖系数回归用高对比红/蓝输入，保持生产公式不变；恢复每条 velocity 配方的变异已杀死。
- 错：纯 `project/layout` 直接 import 主题类型，触发分层门禁。对：在布局模块声明最小只读结构端口，由组合根传入符合形状的 theme 几何，运行时配置仍只有一份。
- 错：来源先行时把 Toast padding 误按 stack gap 填成 8，截图因消费者尚未迁移而不会发现。对：逐项核对实际调用表达式；`Toaster` 的 gap=4、padding=gap×3，来源已修为 12，不依靠未来接线时的截图才纠错。

## 已验证做法

- 在修改前跑现有完整组合入口，迁移后对同组合 PNG 做字节对比；这次 12/12 一致，证明默认渲染不变。
- Provider 完整对象替换配合原生 bounds 与实际消费者样式，比读 context 字段更能发现静态旁路。
- SceneStore 保存只读几何引用，切换时同时更新 viewport/命中/投影而不改写文档。
- 变异只在临时源码副本执行，并链接同一份 React/native 依赖，避免共享 worktree WIP 与 runtime 身份冲突。

## 自审结果

审查 diff：`git diff a4a9d11c927e71ea69ab8299d89d29fe996ba03b...HEAD`。实现提交：`aa257ba3`、`803aa5e6`、`c7e65b10`、`b573d291`、`f39b1ec8`；ultracite/UI map 预提交门禁均通过，没有 `--no-verify`。独立 pstack-reviewer 完整审查及修复复核确认 P1/P2/S1/N1 均 closed，无剩余必修项。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| `presets.data.ts` 2354 行 file-size WARN | 记录 | 保留既有集中预设数据 owner；基线已 2332 行，新增语义 normalization，不是将短文件推过 1000，也没有新业务流程塞入数据表 | 43 个预设 × 2 模式；`presets.test.ts` 与完整门禁通过 |
| `app/verification/design-surfaces.tsx` 6 个 px WARN | 记录 | 固定离屏验收视口与测试内容尺寸，非产品设计值；本轮仅注入几何 | scan 0 HARD；文件为 verification 入口 |
| `arrangement/lane/demo/index.tsx` 2 个 px WARN | 记录 | 固定 demo 视口，保留，不移为用户配置；本轮仅替换旧几何 API | scan 条目 width1280 |
| `arrangement/timeline/verification/layout-smoke.tsx` 2 个 px WARN | 记录 | 固定离屏 smoke 视口，非产品配置 | scan 条目 width1280 |
| `arrangement/tracks/demo.tsx` 2 个 px WARN | 记录 | 固定 demo 窗口，非产品配置 | scan 条目 width1120 |
| `arrangement/tracks/verification/appearance-smoke.tsx` 2 个 px WARN | 记录 | 固定外观验收视口，非产品配置 | scan 条目 width760 |
| `arrangement/tracks/verification/render-cost.tsx` 2 个 px WARN | 记录 | 固定性能探针视口，非产品配置 | scan 条目 width1000 |
| `footer/demo.tsx` 2 个 px WARN | 记录 | 固定 demo 窗口；本轮仅适配 addTrack 高度参数 | scan 条目 width1280 |
| `footer/verification/measure.tsx` 6 个 px WARN | 记录 | 固定测量夹具/视口；本轮仅适配 addTrack 高度参数 | scan 条目 width320 |
| `footer/verification/states.tsx` 8 个 px WARN | 记录 | 固定状态验收视口；本轮仅适配 addTrack 高度参数 | scan 条目 width1800 |
| 纯布局 import 主题类型违反分层 | 必修 | 改为本地只读结构输入端口；数值来源仍只在 theme，未扩大 lint 例外 | tsc、eslint、完整 verify 通过 |
| Toast 来源 inset 错填成 stack gap | 必修 | 按原消费者 padding=4×3 修为 12 | `803aa5e6`；`Toaster/index.tsx:128,167` |
| 颜色 alias/velocity 变异未红 | 必修 | 改用不同语义、足够对比的 fixture，不改生产配方 | 52/52 source-bypass 变异触发目标回归失败 |
| P1：Clip 缓存漏了 trackGeometry 依赖 | 必修 | 缓存键加入几何引用，连同 body/fade/content 一起失效 | `c7e65b10`；挂载后轨高不变的 native label 回归先红后绿，移除键的变异被杀死 |
| P2：显式 layout 总宽与 project 总宽分叉 | 汇报仲裁 | 协调者确定 layout.track.controlsWidth 唯一权威，删除 project 同义字段，迁移全部调用；原非轨道借用行为由 C2 继续收敛 | `b573d291`；400 总宽、226 Mixer、core/row/resize 同宽原生回归及四处变异通过 |
| S1：core README 与组合契约仍写旧构造签名 | 汇报仲裁 | 协调者授权补两份公共接口文档，已同步，不动键盘 owner | `b573d291`；`node scripts/check-doc-routes.mjs` 通过 |
| N1：两个旧 mutation 字符串仍引用已删除字段 | 必修 | 载荷改用 scene.geometry.track.controlsWidth，保留“重复扣宽”语义，不以 NaN 冒充失败 | `f39b1ec8`；既有 app filter 与 timeline preload 实测目标回归失败，独立复核 closed |

## 进程清理

已执行 `ps -axo pid,etime,command`，按 `bun .*--hot|cargo run|gallery|demo` 同正则筛选。完整输出未截断，筛选结果：

```text
(no matching native demo/gallery processes)
```

只启动过 `c1-theme-background`，取 AX 后立即关闭；没有启动、停止或移动用户已有服务。
