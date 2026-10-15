# Arrangement Lane

消费 gpuix Arrangement 组合契约。工程写入只走 `project/adapters`，纯几何消费 B1 `arrangement/core` 与 `project/model`；这里不拥有工程、视口或轨道外边框。

## 公共接口

`index.ts` 是唯一组合入口。

| 导出 | 职责 |
| --- | --- |
| `LaneRow`、`LaneRowProps` | 一条轨道的 Clip/Pattern/Automation、行内网格与输入副作用；`row` 使用 B1 `TrackRow`。行放置、可见行卸载、边框及分组围栏由 `tracks` 持有 |
| `LaneOverlay`、`LaneOverlayProps` | 全画布播放头、Ghost 左起点对齐线、停止时行内插入点及标尺三角；由 timeline 的 overlay slot 单次挂载 |
| `createLaneController`、`LaneControllerDeps`、`LaneController` | 跨行手势、阈值、预览事务、Clip/Automation 键盘与系统剪贴板路由；由组合根创建并 dispose |
| `LaneInteractionState` | `getSnapshot` / `subscribe` 的稳定交互快照；`dragActive` 标记需要帧驱动的拖动 |
| `LaneKey`、`LanePointer` | 归一化输入；指针使用共享画布坐标，不是行内坐标 |
| `PeakReader` | 黑盒只读音乐范围峰值查询，不传 PCM，不在 lane 假设采样率 |
| `LaneLabels`、`LaneMessageKey` | 组合根注入的严格双语标签；demo 标签不作为应用默认翻译 |

`LaneRow` 接收同一份 `scene` / `viewport`、controller、PeakReader 与标签。剪贴板仅通过 `LaneControllerDeps.clipboard` 注入，权威类型来自 `platform/clipboard`；行不接受第二个 clipboard 端口。`LaneOverlay.transportBar` 是读取函数，由内部 `useAnimationFrame` 在播放期间采样，不要求父组件逐帧重渲染。F3 恢复边界另经 `useResumeFrame`，在回调内部 `flushSync` 读取最新位置并提交，普通帧语义不变；停止或卸载同时释放普通帧与恢复订阅。

`LaneControllerDeps.setScroll(x, y)` 由 timeline 提供：返回前共享 SceneStore 的 viewport 投影必须已更新，并返回接受后的 ArrangementViewport。`step(timestampMs)` 只调用该命令并重算当前手势，不创建计时器、不拥有另一份 viewport。`interrupt()` 回滚未完成的手势；`dispose()` 释放订阅并拒绝之后的编辑输入。

工程到共享 SceneStore 的投影只有 timeline controller 一个产品 owner。lane 的 preview、选择与播放命令只改工程 store；lane 仅写自身的拖动、缩放、悬停、targetSelection 与手势进行中的 timeSelection。独立 demo 无 timeline 时，由 demo/runtime 的一个订阅投影并在 dispose 时退订。

卡片展示几何使用行内坐标，轨道行自身承担垂直滚动位移。`ClipCardView` 只拥有位置、透明度、AX 与键盘宿主，`ClipContentsView` 默认 memo 只消费局部内容。原有 display projector 在 source/Ghost 分离的可见 Clip 缓存内派生局部几何、网格与裁剪范围，横向纯位置变化复用内容引用；缩放、裁剪、编辑、选择、悬停和折叠仍使内容失效。loop tick 使用局部序号 key，不随全局 x 变动。网格继续调用 B1 范围接口，左侧 1px overscan 经 hook 可见边界过滤，行网格与交替区域共用横向投影缓存。没有第二个工程 owner、新缓存层或 React 深比较器。production 分段口径、所有重复轮与节点变化说明见 [滚动剖析](PROFILING.md)。

窗口键盘 owner 在 timeline。lane 只消费选择、Ctrl/Cmd+E 裁剪、创建副本、重命名、删除、复制/剪切/粘贴与拖动 Escape；Space 不激活 Clip，并继续传播给窗口播放 owner。Clip 标题设插入点到左起点；内容点击设到点击位置；普通激活不打开 Clip View。

右键目标只由 F2 归一化后的 `onContextMenu` payload 设置，不再从 `onMouseDown` 的 button/ctrl 猜测右键。Shift+F10 保留独立的原生焦点 bounds 定位。回归只发送 context 事件，再通过真实菜单动作验证删除的是目标 Clip，而不是之前的选择；Ctrl+左键按平台归一化后的右键 payload 注入。

`evidence/context-*` 保存实际窗口证据：先选中 Pattern，再右键 Audio，菜单标题与 Rename 字段均为该 Audio Clip。物理 Ctrl+左键的后台修饰输入被 computer 拒绝，foreground 控制申请超时且没有确认批准，未发送前台点击；该物理路径未验证，归一化事件行为以回归与 F2 平台证据为准。

## 迁入清单

源路径相对于 `apps/web/src/pages/project/sections/ArrangementPanel/`，目标相对于本目录。

| Web 源 | 原生目标与职责 |
| --- | --- |
| `canvas/painters/clip.ts` | `ClipCard.tsx`、`LaneRow/Contents.tsx`：标题、选中、hover、网格与可见卡片 |
| `canvas/painters/clip-fades.ts` | `ClipFades/index.tsx`：遮罩、外侧压暗与三类锚点；几何消费 B1 |
| `canvas/painters/clip-previews.ts` | `render-projection.ts`、`WaveformPreview.tsx`：MIDI/Pattern 可见预览与真实峰值；波形复用共享 `PeakColumns` |
| `canvas/painters/group.ts` | `LaneRow/Contents.tsx`：按叶子轨道顺序投影分段色带，仅占第一行；Clip 几何复用 B1 |
| `canvas/painters/automation.ts` | `AutomationLayer.tsx`：曲线、选区、断点与命中反馈 |
| `canvas/painters/playhead.ts` | `LaneOverlay/index.tsx`：播放长线、停止插入点、标尺三角与 Ghost 左起点线 |
| `canvas/interactions/controller.ts` | `interactions/controller.ts`：跨行输入、阈值、捕获中断、自动滚动和剪贴板路由 |
| `canvas/interactions/clip/{index,move,resize,NameEditor}` | `interactions/clip/`：选择、移动、裁剪、fade、时间选区和原生名称输入 |
| `canvas/interactions/automation/{commands,ValueEditor,preview}` | `interactions/automation/`：编辑命令、预览事务与原生数值输入 |
| `canvas/interactions/project-preview` | `interactions/project-preview.ts`：仅管理 store preview token；工程投影移交 timeline |
| `canvas/ContextMenu/**` | `ContextMenu/`：复用共享菜单、颜色菜单与控制器端口 |
| `Timeline/{TimelineCanvas,useCanvasPainters,TrackHeaderViewport}` | 按协调者修订拆为 `LaneRow` / `LaneOverlay` 插槽；画布、窗口键盘、轨道放置分别由 timeline / tracks 持有，不复制这些 owner |
| 早期 `features/{clip-render,waveform-automation}` | 已删除两套副本；拖动、裁剪、波形与卸载行为由本目录原生回归覆盖 |

与 Web 的明确差异：不保留 Canvas 2D 兼容层；卡片仍为可见范围的原生交互元素，网格、预览音符与波形列经 `useQuadBatch` 上传并由原生批绘制，fade/Automation 等曲线继续复用共享向量 Shape。fade 锚点按已批准的 Live 观察改为 5px 空心方点/菱形，不回退 Web 旧实心圆形。真实峰值来自当前工程会话，不保留早期合成峰值后备路径。

## 峰值与坐标

工程时间从 bar 1 开始。`PeakReader(sourceId, startBar, endBar, pixels, contentOffsetBars)` 中 start/end 是 one-based Clip 局部可见范围，contentOffsetBars 是保留素材偏移；原生适配层将 `(bar - 1 + contentOffsetBars)` 换成源 frame。

返回值是 channel-major → pixel-major → `[min,max]` 的 Float32Array：先一个声道的全部像素，再下一个声道；声道数为 `length / (2 * pixels)`。渲染器直接索引，不转置或复制。空音频片段不生成假波形。

原生元素只为相交 Clip 挂载；B1 像素取整之后再裁剪一次，避免亚像素交集最终落到屏外仍挂载。标题实心，下半部透明；网格位于下半部填色之上。fadeMask 常驻：折叠时在标题、展开时在 body；显式曲线与锚点只在展开音频片段的下半内容悬停时出现。锚点按 Live 仲裁采用 5px 空心方点与菱形，1px 描边，内部使用 Clip 体填充色。

## probe.wav 实源波形回归

lane 在彩色 Clip 主体上使用 `theme.colors.arrangementClipInk`，与 Web 参考一致。clip-edit 在编辑器底色上使用 Clip 派生色，两种语境不互换。原先提出的 lane 颜色改动已撤回，`ClipCard` 与共享 `PeakColumns` 的产品绘制未改变，也未增加 lane 特判。

`native-waveform.test.tsx` 使用同一个 `crates/engine/spikes/assets/probe.wav`、真实工程后端与 1280×800 Native PNG，在深浅主题分别检查左右声道包络与源峰值的独立原生 div 参考一致，并断言 lane 像素等于主题 Clip 墨色。SourceWaveform 同源对照单独检查编辑器派生色和自身 inset 语义。左声道是恒幅 ±0.4 正弦，当前缩放每像素 min/max 稳定，连续色带符合素材，不是声道几何错误。

交换共享 PeakColumns 的声道偏移会使两条主题回归失败。将 lane 墨色误改为 Clip 派生色也会使两条回归失败。PNG 解码由测试专用 `shared/waveform/testing/native-png.ts` 与 SourceWaveform-runtime 共用，测试结束删除临时图片。独立 Standards 复审按撤回后的契约检查，无新增 findings。

## 产品规则与 Live 对照

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| fade 锚点与遮罩的视觉 | 先前已批准的 Live 悬停对照，原图在 `scripts/gpuix-main/evidence/live-fade-hover/` | 5px 空心方点/菱形、常驻遮罩、展开 body 悬停才显示曲线 | 本轮 batch 迁移未重新操作 Live；不把静态观察当作 Live 拖动证明 |
| 只有顶部 fade 锚点独立可拖，极端释放不重置 | 原任务明确产品规则；本轮未在 Live 编辑工程 | B1 几何及 preview/commit 手势；原生状态转换回归 | Live 行为未复验，实际桌面拖动仍按工具限制记录 |
| 网格与落点对齐同一份 1/4 网格 | 原产品规则；本轮未取 Live 网格截图 | 全部位置消费 B1 `gridLines`，仅替换批量画面，不改 snap | Native 整体视觉与满量帧验收仍需本轮取证 |
| 标题实心、body 透明、折叠只占第一行 | Web 源与既定产品契约；本轮未另取 Live 折叠截图 | 原生 Clip 外壳、分轨摘要与主题角色；batch 保持图层次序 | 不将 Web 源码等同于 Live 实测 |
| 点击 Clip 不展开编辑器，Space 控制播放 | 产品规则优先；本轮未对 Live 快捷键复验 | 唯一窗口键盘 owner，Clip Enter 激活与 Space 透传；已有真实 normal 窗口记录 | 新 batch 全量组合窗口尚待验收 |
| 播放头到中心后轨道移动，停止无长线 | 原产品规则；本轮未对 Live follow 复验 | timeline 视口 owner、F1 帧采样与 overlay；已有 Native 播放/滚动记录 | 不把 Native 记录称为 Live 行为证据 |

## 验证状态

已验证 B1 投影性质、原生 TestRoot 的裁剪与节点身份、Clip 预览/提交/撤销、跨轨 Automation 区间移动、播放期间在静止插入点裁剪、剪贴板端口当前文本优先（测试注入内存实现）、名称输入提交/取消、fade 极端释放持久与裁剪两锚点同移、停止与播放引导层、Clip 节点 Space 传播、channel-major 立体声几何。

引用稳定增量已在真实 normal 窗口验证：Pattern 点击不请求编辑器、Space 播放/停止与长播放线、原生横向滚轮、body 悬停 fade 锚点、Automation 行对齐、折叠标题遮罩、右键菜单和原生 Rename 输入后 Enter 提交。`evidence/identity-*` 是该历史增量的 AX/截图；native frames 14→3042，状态变化确有新帧，所有自启窗口取证后均已关闭。OS 拖动仍受此前工具限制，不以 TestRoot 代替。当前代码已迁 QuadBatch，F4b 设备像素吸附后的原生波形 PNG 对照通过。满量离屏六轮结果见下表，性能仍未达标；新的组合窗口验收尚未完成，不把历史 p90 139.14ms 或 F4 合成性能当作当前验收。

外部 owner 的未实现项：Automation 映射拖动时的全局目标高亮，归 `ui/controls/ControlEnvironment` 与 app-shell 注入，协调者已登记，lane 不实现第二套遮罩；B 键手势后释放不锁定偏好的跨切片证明归 app-shell 集成测试。lane 已在手势起点调用注入的 `markDrawModeGesture`，不添加 callback 计数假测。

命令在 `apps/gpuix` 执行：

| 命令 | 结果 |
| --- | --- |
| `bun test src/project/sections/arrangement/lane/interactions/controller.test.tsx -t 'fade mask between'` | 1 pass，0 fail，10 assertions；折叠→展开→再折叠 |
| `bun test src/project/sections/arrangement/lane` | 局部内容回归后 baseline 30 pass，0 fail |
| `bun src/project/sections/arrangement/lane/verification/mutations.mjs` | baseline 30 pass，0 fail；16 个变异命中预期失败；源目标 SHA-256 前后相同 |
| `bun test` | A 阶段历史结果 1071 pass，1 todo，0 fail；当前交付另跑 `pnpm verify:gpuix` |
| lane、共享 PeakColumns 与 SourceWaveform-runtime 受影响测试 | 35 pass，0 fail，103112 assertions；8 files |

变异通过 Bun runtime preload 在内存替换模块，不写源文件；脚本验证预期用例确实失败，不能以语法错误代替变异被捕获。

| 变异                                     | 失败用例数 |
| ---------------------------------------- | ---------: |
| 移除屏外 Clip 裁剪                       |          1 |
| 忽略 MIDI 保留源偏移                     |          1 |
| 将 channel-major 峰值错读成交错声道      |          1 |
| 移除 collapsed 标题遮罩分支              |          1 |
| 不再复用未变 ClipCard 引用               |          1 |
| 将原生 context 目标退回 mouseDown 旧路径 |          2 |
| 移除恢复帧订阅                           |          1 |
| 恢复回调不再同步提交位置                 |          1 |
| 停止后仍保持恢复订阅                     |          1 |
| 移除小数网格边界 overscan                |          1 |
| 将局部网格左边界扩大到整视口             |          1 |
| 将真实波形第 16 列渲染成静音             |          1 |
| 交换 probe.wav 声道偏移                  |          2 |
| 将 lane Clip 墨色误改为派生色            |          2 |
| 强制未变局部内容产生新对象               |          1 |
| 将全局x、viewport与grid放回局部内容输入  |          1 |

F3 原生回归 `presents the latest playhead on resume and releases frame leases when stopped or unmounted` 在修复前读取到 x=96，期望最新 x=416；修复后不等待普通帧、不在测试外包 flushSync，立即读到 x=416。停止、重启、卸载同时验证播放线与订阅生命周期，单用例 1 pass、12 assertions。它验证 NativeTestRoot 的首恢复采样布局，不冒充本轮已经重做 OS 遮挡恢复窗口验收。

## 2026-10-15 QuadBatch 满量离屏测量

协调者授权 UTC 10:31:05 至 10:41:05 静默时段。先运行波形原生 PNG 对照，再在 10:33:22 至 10:33:34 交替运行 development、production 各三轮。每轮保持 976×758 视口、200 条可编辑轨道、每轨 50 个 Clip、真实 timeline controller 与工程后端、同一十步滚动和缩放。没有减少内容，没有只保留最好一轮。

| 模式 | 轮次 | CPU p50 ms | CPU p90 ms | CPU max ms | Native draw p90 ms | Native draw p99 ms | Native draw max ms |
| --- | --: | --: | --: | --: | --: | --: | --: |
| development | 1 | 397.64 | 539.72 | 1081.77 | 34.30 | 35.17 | 52.40 |
| production | 1 | 35.65 | 68.07 | 77.60 | 34.32 | 37.49 | 37.95 |
| development | 2 | 230.23 | 397.44 | 458.44 | 27.52 | 29.11 | 33.78 |
| production | 2 | 40.76 | 48.45 | 86.05 | 26.79 | 28.25 | 37.33 |
| development | 3 | 266.84 | 497.84 | 527.28 | 23.97 | 28.85 | 30.65 |
| production | 3 | 38.80 | 59.10 | 65.76 | 28.64 | 29.16 | 42.37 |

所有轮的 `getDebugFrameOverlayStats()` 均为 29 frames、21 samples；retained 节点范围为 2274 至 3999。入口在卸载后断言节点数为 0，六轮 JSON 本身不包含这个数值。Native 指标来自 GPUI draw 计时，不是 GPU present 或桌面交互帧率。结果不足以宣称滚动、缩放流畅。production 每步上传约 0.29 至 0.92ms、applyBatch 约 1 至 3ms，单次 Native flush 约 11 至 38ms；每步还包含探针额外的一次 flush，不将两次相加称为单帧。

本轮仅暂停了其他 Agent 的重任务，整机仍有内存压力。前后 `sysctl vm.swapusage hw.memsize && vm_stat` 显示 16GiB 内存，swap 使用 10505.50 至 10778.25MiB；compressor 占用 445828 至 442428 个 16KiB 页。完整六轮各步数据与前后原始输出保存在本次运行的 `evidence/verification/quiet-all-rounds.json.local`，SHA-256 为 `17aa33700ecc905a3449b282bef9ad834d30ceb6c4c959a5633aa353f2ba9ccd`，由已有 `*.local` 规则忽略，不提交完整 trace。

复跑每轮使用 `NODE_ENV=development bun src/project/sections/arrangement/lane/verification/render-cost.tsx` 或 `NODE_ENV=production bun src/project/sections/arrangement/lane/verification/render-cost.tsx`。新增满量性能批次仍须协调者安排静默窗口；本批均为有限离屏进程，结束已释放资源，无桌面输入。

小规模诊断使用 `LANE_PROFILE_VIEWPORT_HEIGHT=196`，仍保留 200×50 工程，只缩小可见视口。80px 仅显示固定 Main 的尝试不含 Clip，已判无效，入口现有非空 Clip 守卫。`react-profile-preload.ts` 可配 `LANE_MEASURE_LOG` 透明记录 React DEV 的原始 `performance.measure`，不关闭 DEV tracing。原反事实 `LANE_PROFILE_NARROW_GRID` 已在 A 切换后删除，局部网格成为产品投影。`LANE_PROFILE_CAPTURE` 保存当前 Native PNG。

同一单编辑车道 A/B 的 CPU p90 从 48.04ms 变为 11.81ms；节点数均为 507，Native PNG 的 SHA-256 均为 `4537a50fa02125502cb0ab135efa0abde8e2f27a6a646dc8f7735a59ac215579`。`GridQuads` 与 `ClipCardView` 的 DEV changed-props 条目从合计 580429 减到 35639，原始 measure 调用耗时从合计 104.06ms 减到 8.68ms。根因是约 488 条整视口网格经每个 Clip 的两层 props 反复遍历，而实际每个 Clip 只显示约 8 条。Native draw 未随这项诊断明显下降，仍需减少行背景、卡片装饰与批绘制宿主节点。原始 A/B 见 `evidence/verification/grid-{base,narrow}-profile.json.local`，不将小视口结果外推为满量达标。

## 2026-10-15 A 结构收敛与 Native 归因

A 已缓存 Clip 局部网格，打包与上传改为 `useGridQuads`，卡片不再接收完整 Track。行级 QuadBatch 替换交替 Pattern 背景，label 的裁切与 padding 合并到 text 宿主。waveform 原本已直接返回 `PeakColumns`，没有额外 div 包装，不新增修改。单编辑车道节点从 507 减到 387，再减到 356。三张业务 Native PNG 的 SHA-256 均为 `4537a50fa02125502cb0ab135efa0abde8e2f27a6a646dc8f7735a59ac215579`。这些小视口数据不是满量验收。

Native 归因均为 976×196、完整 200×50 文档、同一十步输入、DEV。每轮 32 frames、21 samples。下表保留全部重复轮，时长单位为 ms。

| 诊断 | 三轮 Native draw p90 | 初始 div / batch / text / svg | 像素条件 |
| --- | --- | --- | --- |
| A 基线 | 2.75 / 4.09 / 3.07 | 195 / 68 / 62 / 31 | 正常内容 |
| 去文字 | 1.56 / 1.48 / 1.29 | 195 / 68 / 0 / 31 | 仅诊断，文字刻意移除 |
| 合并 title/body div，第一组 | 6.06 / 2.86 / 2.55 | 133 / 70 / 62 / 31 | Native PNG 与基线相同，保留首轮长尾 |
| 只合并 Clip 网格 batch，已拒绝 | 2.79 / 3.10 / 2.61 | 195 / 38 / 62 / 31 | 层级改变使 PNG 不同，不用于归因结论 |
| 合并 div，配对控制组 | 2.71 / 2.58 / 2.79 | 133 / 70 / 62 / 31 | Native PNG 与基线相同 |
| 在配对控制组上合并网格 batch | 2.27 / 2.59 / 3.68 | 133 / 40 / 62 / 31 | div 数不变，Native PNG 与基线相同 |

文字移除有一致下降信号。div 与 batch 合并没有稳定收益，不将宿主数量按比例换算成帧耗时，也不把 SVG 未单独测过的成本分摊为百分比。修正后的 batch 实验先与控制组共同合并填色，再只改变网格 batch 数，避免网格落到 body 填色下方。全部 18 轮、被拒绝原因和后组机器压力见忽略文件 `evidence/verification/native-attribution.json.local`。将 `LANE_NATIVE_ATTRIBUTION` 设为 `base`、`no-text`、`merge-divs` 或 `merge-batches`，在原 render-cost 入口预载 `native-attribution-preload.ts` 复跑。诊断不进入产品路径，不扩共享原生 API。

经协调者授权，clip-edit 的 `SourceWaveform-runtime.test.tsx` 只迁移截图观察 helper。PNG 解码后读取首个立体声声道的实际列包络，原会话开关、tempo、meter 与 reopen 的 14 条断言保留。第 16 列静音变异在画面产生 1px 包络，使 `opened > 1` 失败，证明 helper 不读 quad 内部结构。修复后整套测试恢复通过。

A 以 `86a9de4` 为审查固定点，由两个独立只读 reviewer 上下文分别审 Standards 与 Spec，两轴新增必修、仲裁与判断项均为 0。授权测试 helper 的后续 Standards 复审同样无 findings。不声称跨模型信号。原始六轮属于 A 之前，A 后的原视口离屏结果见下节，OS 组合界面仍待单独验证。

## 2026-10-15 A 后原视口离屏结果

固定单元为 `13b5267`。UTC 2026-10-15T13:58:41Z 至 2026-10-15T14:08:41Z 的 JSON 授权内，先运行 5 个 Native PNG fixture，5 pass、0 fail，再交替运行 DEV 与 production 各三轮。视口固定 976×758，工程保持 200 条轨道、每轨 50 个 Clip。全部轮与命令回执均保留，无失败，不取最好一轮。

| 模式 | 轮次 | 首视图 CPU ms | CPU p50 ms | CPU p90 ms | CPU max ms | Native p90 ms | Native p99 ms | Native max ms | Native pre max ms |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| development | 1 | 176.83 | 37.92 | 53.34 | 63.89 | 21.59 | 22.51 | 30.16 | 60.79 |
| production | 1 | 61.81 | 25.19 | 35.93 | 42.87 | 16.38 | 19.97 | 21.92 | 29.58 |
| development | 2 | 74.69 | 36.71 | 48.52 | 48.82 | 18.00 | 19.37 | 20.94 | 28.05 |
| production | 2 | 57.93 | 25.67 | 35.81 | 41.00 | 17.93 | 20.79 | 23.71 | 27.19 |
| development | 3 | 76.84 | 38.03 | 45.04 | 58.19 | 17.39 | 18.90 | 20.91 | 28.23 |
| production | 3 | 74.02 | 25.07 | 33.73 | 38.85 | 17.32 | 17.59 | 20.88 | 32.94 |

每轮 Native 为 29 frames、21 samples。`Native pre` 是首视图完成前累计 8 个 draw samples 的统计，包含初始化绘制，不等于单独的首次 OS presentation。初始 retained 节点从 A 前的 3615 减到 2736，滚动期间为 1632 至 3018。CPU 与 Native 指标仍超出 16ms 门槛，不能宣称滚动、缩放达标。

前后 swap 使用 9668.25 至 9612.25MiB，compressor 占用 241544 至 286360 个 16KiB 页。A 前后两个时段的系统压力不同，这不是严格近邻 A/B。完整六轮、fixture、首视图统计与内存输出位于忽略文件 `evidence/verification/A-quiet-all-rounds.json.local`，SHA-256 为 `0948e0ab7d28df7c169e4e0b48fc02116e8bc4180f4f6464ac95671c358ff3d6`。

协议边界：这些结果来自有限 headless `createTestRoot` 进程，固定的是 A 单元 `13b5267`，不是协调者后续指定的 `a9bc471` 主干，也不是命名 `bun --hot` 窗口验收。未将它们标为正式主干窗口通过。已同步后续主干，下一步按协调者决策拆分 production JS、commit 与 Native layout，暂不扩 Native text API。修复后另申请同协议满量和真实窗口时段。

## 2026-10-15 引用稳定增量

新增原生回归 `scrolls an already-visible unchanged Clip without rerendering its content`：修复前，垂直滚动后 Clip 内容执行 2 次，预期 0；修复后，原节点随行移动且内容不重渲染。`card-identity` 变异把复用改为新对象，回归变红。

探针使用真实 `createTimelineController`、同一工程 runtime 与 `readProjectPeaks`，不以离屏成本代替真实窗口帧验收。命令：

```sh
bun --preload ./src/project/sections/arrangement/lane/verification/react-profile-preload.ts src/project/sections/arrangement/lane/verification/render-cost.tsx
```

近邻 A/B 在同一十步滚动/缩放输入下运行，关闭复用使用内存变异，不改磁盘源文件。完整数据：`evidence/render-profile-identity-disabled.json`、`evidence/render-profile-identity-stable.json`。

| 观测                                      | 关闭复用 | 启用复用 |
| ----------------------------------------- | -------: | -------: |
| 垂直滚动一：可见 279 个 Clip，执行 render |      279 |      155 |
| 垂直滚动二：可见 216 个 Clip，执行 render |      216 |      144 |
| 垂直滚动三：可见 180 个 Clip，执行 render |      180 |      126 |
| 垂直滚动四：可见 279 个 Clip，执行 render |      279 |      124 |
| React 行子树 p90（ms）                    |    36.32 |    37.12 |
| CPU render/flush p90（ms）                |   265.05 |   260.56 |

此处是引用稳定增量的历史 A/B：未变化且仍挂载的卡片执行 render 为 0，剩余为新进入视口或横向位置/比例确实改变的卡片；当时没有可确认耗时收益，不宣称提速。其后的 QuadBatch 迁移已实现，独立满量性能结论另行实测，不能由这张历史表推出。

## F4 自审结果

F4 初期审查以 `496a17d` 为固定点，命令为 `git diff 496a17d -- apps/gpuix/src/project/sections/arrangement/lane apps/gpuix/src/shared/waveform/PeakColumns.tsx apps/gpuix/src/shared/waveform/PeakColumns.test.tsx`，并另读新文件 `GridQuads/index.tsx`。当时变更尚未提交，两个独立只读上下文分别审查 Standards 与 Spec。下表保留该阶段的处置记录，A 的新审查结论见前节，不声称跨模型信号。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| view 第二次计算局部 fade，raw rect 泄漏进 card | 必修 | projection 统一产出 nullable fadeGeometry，仅非Ghost音频计算，按局部输入缓存；view不倒推flag | Standards 复审确认无新增必修；`projectLocalFadeGeometry`、`sameLocalGeometry` |
| 像素 probe 重复共享有效测试 | 必修 | 删除独立 probe，以共享4条与consumer1条 Native PNG 行为测试为准 | 相关5测试通过；未复制第二套产品波形 |
| README 把已迁 batch 写成“等待F4” | 必修 | 区分历史引用A/B与当前QuadBatch，明确当前满量验收尚待实测 | Spec 文档项已改；F4b历史证据改指可复核报告 |
| quad 与 div 的分数像素不等价 | 汇报仲裁 | 协调者派F4b原生吸附，未做TS舍入、未放宽像素门槛 | 当前3个固定PNG参考完全相同；共享/consumer像素测试通过 |
| preview先产Rect数组再打包f32、批次命名、诊断method binding | 记录 | 不为未证实收益扩大producer API；诊断绑定按实际测试renderer已绑定方法工作 | 上传计时已实测，geometry/颜色/裁剪语义由Spec核对 |
| 网格与notes没有额外PNG矩阵 | 记录 | 复用B1投影与F4b原生div oracle；组合窗口整体审查，不补逐控件矩阵 | 用户最新Gallery规则；波形严格PNG单独保留 |

## 错题

- 错：将“每像素每声道 min/max”理解为交错声道。对：核对 C1 实际 channel-major 布局，按声道连续区间索引。因：交错会把左右声道的像素位置打散；原生立体声 PNG 回归覆盖此差异。
- 错：只按浮点 ClipRect 相交判断挂载。对：复用 B1 `clipVisualGeometry` 后再判断取整几何。因：小于半像素的交集可能取整为零可见宽度；固定种子性质测试捕获该边界。
- 错：让有填色或 absolute 的展示容器使用默认命中规则。对：纯展示层明确 `pointerEvents: "none"`，鼠标输入由唯一车道 host 捕获。因：固定主干的 `should_occlude` 默认阻断这些容器后面的鼠标事件；完整 LaneRow 回归与 native hitbox 探针先确认 host 未收到 down/move，修复后手势通过。
- 错：照搬 Web 输入框的 Enter keydown 提交。对：原生 Input 使用 `onSubmit`，Escape 留在 keydown，并在文本编辑期间阻止窗口快捷键传播。因：GPUI 输入动作会消费 Enter；真实名称输入提交与原生回归覆盖此路径。
- 错：用全局行 y 坐标与每次新建的 card/geometry 作为 memo 入参。对：行内几何按 clipId 缓存、只保留可见项，行容器负责垂直位移。因：不变的内容曾在每次垂直滚动时重渲染；native 标签渲染回归和 `card-identity` 变异锁定此行为。
- 错：看到 SVG 减少节点就认为性能改善。对：同时记录 React/原生耗时、节点数与完整内容。因：两次网格 SVG 实验降低节点数，却使总 render/flush p90 回退，实验代码已撤回，仅保留测量数据。
- 错：把浮点 quad 原样绘制当作 div 像素等价。对：由 F4b 在原生层复用 GPUI 设备像素吸附，不在 TS 复刻舍入。因：分数高度曾多画一个像素；原生 PNG oracle 捕获并验证修复。可复核的已修复历史证据见仓库 `scripts/gpuix-main/quad-batch/PIXEL-SNAP-REPORT.md`。
- 错：把约 488 条整视口网格逐 Clip 传过两层 React props。对：先用保持 DEV tracing 的小规模 A/B 定位，再由投影 owner 缓存局部网格或合成行级批绘制。因：React DEV changed-props 会递归格式化变化数组，单车道产生约 58 万条属性记录；Native 上传亚毫秒不代表 JS 没有遍历成本。产品结构修复仍待协调者审定。
- 错：只订阅普通帧，认为恢复时自然会赶上播放头。对：恢复边界经 `useResumeFrame` 同步读当前时钟并 `flushSync` 提交。因：首 present 在下一普通帧之前，旧位置会闪现；缺恢复、缺同步、停止后不退订三种变异均被原生回归捕获。

## 已验证做法

- 悬停仅在 Clip ID 或 title/body 区域变化时更新 scene；不为同一区域的每次 mouseMove 重建展示投影。
- source 与 Ghost 按 clipId 分别缓存；局部 fade 几何由 projection 产出并复用，view 不倒推输入、不再计算第二份几何。
- 绘制 quad 的 `Float32Array` 作为不可变快照，经 `useQuadBatch` 的 ref/setQuads 命令上传，不进入 React props/state；颜色和 opacity 仍由主题与节点 style 决定。
- 波形验证比较真实 Native PNG 与固定 div 参考，不以 native 子节点数量或转发 mock 代替像素正确性。
- 语言服务器抽取类型后先确认实际生成的扩展名与导入；只含类型也可能生成 `.tsx`，不能假设不存在 `.ts` 就没有新文件。
