# Canvas、波形与播放指针参考手册

核查日期：2026-10-23。本文保留用户提供的全部 Canvas 参考项，区分源码事实、作者描述和未定位条目。它是查阅与后续改造配方，不是性能验收报告。本轮只读取源码和公开资料，没有运行示例、测 FPS、构建、测试或修改生产代码。

结论：当前项目已经有场景与播放指针双层 Canvas、按需 rAF、轨道和 Clip 可见范围裁剪，以及原生有符号波形范围接口。后续方案应复用这些能力，先解决失效粒度、可见数据量、位图预算和时钟语义，不应再建一套时间轴引擎。参考项目中的 FPS、延迟和容量描述不构成本项目承诺。

## 证据与许可口径

- `源码核查` 表示读取了下文链接的实现，不表示运行过它。
- `文档核查` 表示读取了仓库 README、官方页面或原作者文章。功能与效果仍是来源方描述。
- `未定位` 保留原始标题。候选链接不会自动升级为用户原先引用的来源。
- 许可证以仓库 LICENSE、COPYING 或包声明为依据。文章、Issue、论坛发言和仓库代码不是同一种授权。`未知` 不等于可自由复制。
- 上游链接使用核查时的 `main` 或 `master`，不是固定提交。实际引入代码前，应重新确认提交、文件头和依赖许可，并保存版权声明。本轮未复制上游实现。

## 全部参考项

| 原始参考与 URL | 已核实范围和证据状态 | 许可依据 | 可用于本项目的经验 | 限制与不能据此作出的结论 |
| --- | --- | --- | --- | --- |
| [naomiaro/waveform-playlist](https://github.com/naomiaro/waveform-playlist) | 源码核查。`Channel.tsx`、`ScrollViewport.tsx`、`AnimatedPlayhead.tsx` 支持可见分块、绘制版本缓存与独立指针更新，详见下节 | [MIT](https://github.com/naomiaro/waveform-playlist/blob/main/LICENSE.md) | 波形块只随数据或样式变化重绘，播放只移动指针 | 当前上游是多包 React 与 Web Components 项目，不能拿旧版实现描述当前版本，也不能把其 Tone.js 播放 owner 搬进现有原生播放链路 |
| [naomiaro.github.io/waveform-playlist](https://naomiaro.github.io/waveform-playlist/) | 文档核查。请求重定向到 `naomiaro.com/waveform-playlist/`，页面链接多 Clip、预计算波形、录音和节拍示例 | 对应仓库 MIT；网站独立内容授权未另行确认 | 用示例目录组织需要观察的交互状态，而非只看首页截图 | 未操作这些 Demo。页面的 sample-accurate、流畅等描述不是本项目测量 |
| [TechSquidTV/Canvas-Timeline](https://github.com/TechSquidTV/Canvas-Timeline) | 源码核查。[Canvas layer](https://github.com/TechSquidTV/Canvas-Timeline/blob/main/packages/renderer/src/useTimelineCanvasLayer.ts) 有视窗、DPR、rAF 合并与可选 playhead 失效，[worker](https://github.com/TechSquidTV/Canvas-Timeline/blob/main/packages/renderer/src/worker.ts) 接收 OffscreenCanvas | [MPL-2.0](https://github.com/TechSquidTV/Canvas-Timeline/blob/main/LICENSE) | 把 renderer 与编辑状态分开，显式定义哪些变化触发静态层重绘 | 通用时间轴不是音频播放调度器。仓库描述中的 60+ FPS 未在本机复测。若修改和分发其文件，需要审查 MPL 文件级义务 |
| [ouestlabs/audio-ui](https://github.com/ouestlabs/audio-ui) | 源码核查。Waveform Canvas 实现可见性停绘、DPR 变化监听、位图边长保护、Path2D 与 frame task，`fitPeaks` 区分对称幅值与有符号极值 | [MIT](https://github.com/ouestlabs/audio-ui/blob/main/LICENSE) | 组件级绘制生命周期、可见性、真实 min/max 和像素密度处理 | 不是多轨 engine。其降采样和放大插值不能恢复已被粗 peaks 丢掉的样本 |
| [katspaugh/wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) | 源码核查。`renderer-utils.ts` 定义分块、可见范围与清理阈值，`renderer.ts` 处理切片及 Canvas 位图 | [BSD-3-Clause](https://github.com/katspaugh/wavesurfer.js/blob/main/LICENSE) | 预计算 peaks 与有界可见渲染分开，避免整段时长变成一个巨型位图 | 波形播放器不是本项目多轨 native transport 的替代品。分块仍可能建立大量 slot 元数据 |
| [wavesurfer.xyz/docs/performance/](https://wavesurfer.xyz/docs/performance/) | 官方文档核查。说明全量 PCM 内存、预计算 peaks、离屏 Canvas 清理和销毁生命周期 | 代码仓库 BSD-3-Clause；网页文字独立许可未知 | 对长文件区分播放缓存、波形缓存和 Canvas 内存 | 页面 `8000 px` 是该实现常量，不是跨浏览器 Canvas 标准上限。其 memory 示例不是本项目实测 |
| [dy/gl-waveform](https://github.com/dy/gl-waveform) | README 与包声明核查。[readme](https://github.com/dy/gl-waveform/blob/master/readme.md) 描述 WebGL 绘制、64K 样本块、保留 peaks 后释放样本；本轮未深入核验 GPU reduction 实现 | [package.json](https://github.com/dy/gl-waveform/blob/master/package.json) 声明 MIT，README 亦声明 MIT；树中未见独立 LICENSE 文件 | 比较 GPU 波形缓存与原生 range 数据的接口成本，关注极值保留而非只换绘图 API | README benchmark 和 60 FPS 是作者报告，不是复测。WebGL 上传、显存和上下文丢失需要单独验证，不能直接推导 gpuix 结果 |
| [geoffmyers/multitrack-audio-visualizer](https://github.com/geoffmyers/multitrack-audio-visualizer) | README 核查。多轨滚动示波器、频谱、共享浏览器和 CLI 绘制、视频导出 | [GPL v3](https://github.com/geoffmyers/multitrack-audio-visualizer/blob/main/LICENSE.md)，README 明示 GPL-3.0-or-later | 对比离线导出与实时视图能否复用纯渲染输入 | 主要是视听可视化，不是 Clip 编辑器。任意轨数和 60 FPS 属作者功能描述，无规模测试证据；GPL 代码不能未经许可评估直接移植 |
| [wavesjs/waves-ui](https://github.com/wavesjs/waves-ui) | README 核查。Timeline→Track→Layer→Shape，统一 offset、zoom、pixelsPerSecond 和交互状态 | [BSD-3-Clause](https://github.com/wavesjs/waves-ui/blob/master/LICENSE) | 时间坐标与交互状态集中管理，音频、标记和自动化共享投影 | 每个 track 和 layer 关联 DOM。不能称它是纯 Canvas 或 GPU 时间轴；维护活跃度与现代框架兼容性未验收 |
| [KEYHAN-A/audiosync](https://github.com/KEYHAN-A/audiosync) | README 与 [WaveformCanvas.vue](https://github.com/KEYHAN-A/audiosync/blob/main/src/components/WaveformCanvas.vue) 核查。有 Tauri、FFT 对齐、drift 功能描述，Canvas 对横向 Clip 做跳过判断 | [GPL v3](https://github.com/KEYHAN-A/audiosync/blob/main/LICENSE) | 区分录制设备的时钟漂移、素材对齐和 UI 播放指针问题 | 其 `draw()` 每次重设 Canvas 宽高，空状态绘制装饰正弦动画。不应把装饰波形或固定线视为真实音频、实时 transport 或高性能模板 |
| [rikard-io/SampleEditorView](https://github.com/rikard-io/SampleEditorView) | README 与 [Waveform.js](https://github.com/rikard-io/SampleEditorView/blob/master/src/Waveform.js) 核查。支持选择、loop、zoom、offset、分辨率配置 | [MIT](https://github.com/rikard-io/SampleEditorView/blob/master/LICENSE) | 单样本编辑器的选择、缩放、标记坐标值得对照 | README 明示早期阶段。实现使用平均值，`avarage()` 最多扫描起点后的 100 个样本，不是完整窗口 min/max，不适合作为保瞬态证据 |
| [developer.chrome.com/blog/offscreen-canvas/](https://developer.chrome.com/blog/offscreen-canvas/) | 官方文章核查，重定向至 [web.dev/articles/offscreen-canvas](https://web.dev/articles/offscreen-canvas)。展示 `transferControlToOffscreen()` 与 worker | 页脚明确文字 CC BY 4.0，示例 Apache-2.0 | 重绘重负载可迁出主线程，DOM 测量和输入仍在主线程 | worker 不能读取 DOM，也不自动解决音频时钟、消息积压和位图过大。文章 Demo 不证明本项目更快 |
| [MDN Visualizations with Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) | 官方文档核查。AnalyserNode 时域与频域数组、复用 typed array、rAF 示波器 | 本轮未单独核查文章与示例授权，记未知 | 用于实时电平、示波器和频谱，不把读取频率绑到 React render | AnalyserNode 提供当前窗口，不能代替完整音频文件的编辑波形极值缓存 |
| [web.dev/profiling-web-audio-apps-in-chrome](https://web.dev/profiling-web-audio-apps-in-chrome) | 官方文章核查。区分设备 callback、audio render deadline、worklet GC 与图诊断 | 页脚明确文字 CC BY 4.0，示例 Apache-2.0 | 将画面卡顿和声音掉音分开取证，记录不同线程 | 2020 年文章中的工具入口需按现用 Chrome 检查；Chromium trace 不能直接证明 Tauri WebKit 内的 native Tracktion callback 状态 |
| [Creating a DAW in Rust - Multi-track Timeline](https://whoisryosuke.com/blog/2026/creating-a-daw-in-rust-multi-track-timeline/) | 原作者文章核查。介绍 Tauri 与 React 时间轴、素材缓存和 Clip 引用分离，以及 backend 与 frontend 模型差异 | 文章许可未知；文章所链 `whoisryosuke/daw-tauri` 的许可本轮未核查 | 共享 source 不等于共享 Clip 位置，前端投影不等于音频 owner | 作者的原生延迟和商业 DAW 类比不是测量。不能因为同为 Tauri 就照搬其 mixer 或替换现有 Tracktion |
| ACE-Step issue1519 → [ACE-Step-DAW #1519](https://github.com/ace-step/ACE-Step-DAW/issues/1519) | 已定位。标题为 Tauri 2.0 Hybrid Architecture，内容是 native engine 与 Web UI 迁移 epic | Issue 发言许可未知，未把仓库许可套到讨论文本 | 高率 peaks、meters 和控制命令分通道，保留同一 UI 与 backend 边界 | 20–50ms、<5ms、95% 代码保留、固定浏览器内存等都是 issue 中的概括或目标，不是验证结果，不收入项目性能预算 |
| `plugin-audioplayer` → [tauri-plugin-audioplayer](https://crates.io/crates/tauri-plugin-audioplayer) | 已定位到用户提供的精确 crate URL。crates.io 元数据与 [0.1.2 文档](https://docs.rs/crate/tauri-plugin-audioplayer/0.1.2) 核查，仓库为 [audioland/tauri-plugin-audioplayer](https://gitlab.com/audioland/tauri-plugin-audioplayer)。README 描述单个已加载音轨、整段解码为 interleaved f32、CPAL 输出、播放进度与 seek | crates.io 元数据和发布 README 均声明 Apache-2.0；本轮未逐文件核查许可 | 可比较 native 播放进度、seek 与 JS 控制边界，不用 Canvas 帧调度音频 | 这是单轨播放插件，不是多轨 timeline 或波形 renderer，也不能代替现有 Tracktion owner。0.1.2 页面显示 docs.rs 构建失败，此为发布站状态，不是本机测试；MSRV 1.90，未安装或运行 |
| `SO Sync Web Audio+Canvas rAF/outputLatency` → [Stack Overflow #78858905](https://stackoverflow.com/questions/78858905/latency-issue-how-to-perfectly-sync-audio-beeps-using-web-audio-api-and-visu) | 已定位到高度匹配的完整问题。问题讨论调度时钟与听到声音之间的设备延迟，回答讨论 baseLatency 与 outputLatency | 本轮未核查该帖版本的内容许可，记未知 | 展示“指针与调度时间一致”仍可能不同步于可听输出的真实问题 | 回答不是 Web Audio 规范，也未测本机驱动。不能不看时钟定义就固定相加或固定减延迟 |
| `Harrison stationary playhead forum` → [Stationary Playhead](https://forum.harrisonconsoles.com/archive/index.php/thread-1614.html) | 已定位。2015 年用户反馈，最后说明还需开启 Follow Playhead；另一回复描述约三分之一处开始跟随 | 论坛文字许可未知 | 固定指针与视图跟随是两个状态，起始边界会影响表现 | 不是当前 Mixbus 规范，也不取代本项目约画布中心的既定行为。不能把“一般从三分之一开始”抄成通用常量 |
| `diffusion 2s bins+IndexedDB` | 未定位。缺原始标题、owner 与 URL。关键词检索未确定唯一来源 | 未知 | 只保留待核查主题：分段波形缓存和持久缓存身份 | 不把“2 秒”认定为最佳块长，不宣称某 diffusion 项目已实现 IndexedDB 波形缓存 |
| `DEV Why multitrack drifts` → [Why your browser multitrack audio drifts out of sync](https://dev.to/alanwest/why-your-browser-multitrack-audio-drifts-out-of-sync-and-how-to-fix-it-48l5) | 已定位并读正文。作者以多个 `<audio>.play()` 对比同一 AudioContext 的未来时间调度 | 文章与代码许可未知 | 使用共同调度时间，不用 UI 帧驱动每条轨开始 | 文中的“No drift. Ever.”、始终加 50–100ms lookahead 和固定内存例子不作通用事实。44.1kHz 双声道一分钟 Float32 PCM 约 21.2 MB，不是文中的约 10 MB |
| `WebCodecs WebAudio Playback` → [WebAudio Playback, WebCodecs Fundamentals](https://webcodecsfundamentals.org/audio/web-audio/) | 已定位并读正文。区分 AudioContext、source 和展示时间，介绍 one-shot source 与 seek | 页面许可未知 | 明确暂停、恢复、源 offset、旧 onended 与新播放实例的关系 | 文中“WebAudio only works on main thread”应限于控制 API 讨论，不能否定 audio render thread 或 AudioWorklet；“参数不可可靠实时更改，需重建链”不可作为本项目 mixer 依据 |
| `easy-dsp DeepWiki` | 原始 DeepWiki URL 未提供且未唯一定位。辅助找到 [LCAV/easy-dsp](https://github.com/LCAV/easy-dsp)，读取其 README，内容是嵌入式麦克风阵列与 WebSocket 浏览器可视化 | 原始 DeepWiki 未知。候选 LCAV README 明示 GPL-3.0-or-later | 若候选就是原项目，可比较流式采样与浏览器展示的职责划分 | 不将自动生成 wiki 当一手源码。不确定原作者所指的是哪个 easy-dsp，候选不是已确认映射 |
| `screenpipe use-audio-playback` | 仓库身份可定位为 [screenpipe/screenpipe](https://github.com/screenpipe/screenpipe)，旧 mediar-ai URL 的 [issue #1088](https://github.com/mediar-ai/screenpipe/issues/1088) 重定向可见。该 issue 不含指定 hook 实现，hook 路径或提交仍缺失 | 指定 hook 文件许可未知，未从仓库名推断 | 精确文件确认后才比较播放实例清理、seek 和过期事件处理 | 本轮 GitHub API 后续请求受 rate limit，搜索未提供唯一 hook 路径。不声称读过或验证了该 hook |

## 三个关键上游的源码事实

### Waveform-playlist 的分块宽度是策略，不是浏览器限制

本轮读取的 [core/constants.ts](https://github.com/naomiaro/waveform-playlist/blob/main/packages/core/src/constants.ts) 将 `MAX_CANVAS_WIDTH` 定为 **1000 CSS px**，不是 8000。

[Channel.tsx](https://github.com/naomiaro/waveform-playlist/blob/main/packages/ui-components/src/components/Channel.tsx) 只挂载 `useVisibleChunkIndices()` 返回的块。位图宽高分别乘传入 DPR，绘图坐标仍使用 CSS px。`drawVersion` 包含数据版本、尺寸、DPR、颜色和 bar 参数，已绘制块通过 `canvas.dataset.drawVersion` 跳过重画。这减少重复绘制的机制已读到，减少多少 CPU 没有测量。

[ScrollViewport.tsx](https://github.com/naomiaro/waveform-playlist/blob/main/packages/ui-components/src/contexts/ScrollViewport.tsx) 使用外部视窗 store 与 selector，左右 overscan 为容器宽的 1.5 倍，滚动阈值为 100px，通知经 rAF 合并。`originX` 把 Clip 局部坐标转换为全局视窗坐标。上述数字是该版本选择，不应直接变成本项目参数。其可见块查询仍遍历总块数，不能据“虚拟滚动”就断言所有查询为 O(可见块数)。

[AnimatedPlayhead.tsx](https://github.com/naomiaro/waveform-playlist/blob/main/packages/browser/src/components/AnimatedPlayhead.tsx) 注册共享动画 callback，以 `visualTime * sampleRate / samplesPerPixel` 更新单个 DOM transform。它不负责重新绘制每条波形，也不单独维护播放时钟。当前项目可以复用这种职责分离，不需要把 Canvas 指针改成 DOM 才获得同样边界。

### Audio-ui 区分 signed peaks、实时 level 和位图预算

[peaks.ts](https://github.com/ouestlabs/audio-ui/blob/main/packages/core/src/primitives/waveform/peaks.ts) 接受标量幅值数组或 `{ min, max }`。标量幅值会镜像成对称波形。有符号输入保留上下差异，`fitPeaks()` 在缩小时取覆盖输入项的最大值和最小值，放大时对既有峰值插值。它不会从粗 peaks 恢复真实 PCM，也不能证明当前采样区间边界算法无误。

[canvas.tsx](https://github.com/ouestlabs/audio-ui/blob/main/packages/ui/src/primitives/waveform/elements/canvas.tsx) 使用 `createFrameTask`、`observeVisibility` 和 `stale` 标记。几何需要时才重新计算，绘制可以复用 path。它在 resize 时优先使用 `devicePixelContentBoxSize`，并通过 `matchMedia(resolution)` 处理 DPR 改变。其 `MAX_BITMAP_SIDE = 16_384` 是代码的保护值，超过时按比例降低位图密度，不能写成所有浏览器保证支持的上限。

[Live playhead source](https://github.com/ouestlabs/audio-ui/blob/main/skills/web-audio/rules/live-playhead-source.md) 要求从实际 source 读取位置，示例在 rAF 中读 `audio.currentTime`。它还区分拖动中的值与 `onValueCommitted` 的 seek。这个分离有用，但 HTMLMediaElement clock 示例不能直接替代本项目 native telemetry。

### Wavesurfer 的 8000 有源码依据，但不等于硬件上限

[renderer-utils.ts](https://github.com/katspaugh/wavesurfer.js/blob/main/src/renderer-utils.ts) 有 `MAX_CANVAS_WIDTH = 8000` 和 `MAX_NODES = 10`。单块宽度先取 `min(MAX_CANVAS_WIDTH, clientWidth, totalWidth)`，再对齐 bar 网格。`shouldClearCanvases()` 判断当前节点数是否超过阈值。因此 10 是清理条件，不是浏览器 DOM 容量，也不保证永远恰好只保留十个 Canvas。

[renderer.ts](https://github.com/katspaugh/wavesurfer.js/blob/main/src/renderer.ts) 将块宽乘像素密度建立位图。[renderer-utils.ts](https://github.com/katspaugh/wavesurfer.js/blob/main/src/renderer-utils.ts) 的 `sliceChannelData()` 在只读且输入是 Float32Array 时使用 `subarray`，其他路径仍可能复制。不能概括为“分块零复制”。

[官方性能页](https://wavesurfer.xyz/docs/performance/) 提醒全量 decode 会持有 PCM，也建议预计算 peaks 与媒体流式播放配合。这对浏览器播放器有效。zoeydaw 的音频 owner 在原生侧，不应为套用此配方增加多条 HTMLAudioElement 或第二套播放链路。

## 与当前项目的对照

下表依据当前工作区文件，不依据 AGENTS.md 中较早的“纯 Web 原型”描述。这里的“已有”只表示读到了实现，未作运行验收。

| 职责 | 当前证据 | 已有能力 | 后续方案应关注的边界 |
| --- | --- | --- | --- |
| 静态场景与动态指针 | [`Timeline/useCanvasPainters.ts`](../../apps/web/src/pages/project/sections/ArrangementPanel/Timeline/useCanvasPainters.ts) `SCENE_ID`、`PLAYHEAD_ID`、`paintScene`、`paintPlayheadLayer` | 两张 Canvas，共享测量尺寸而分别失效。播放层活跃时自标记下一帧，静态层负责 grid、clips、automation | 场景订阅目前同时 invalidates 两层，不能据双层就声称普通播放完全不重绘场景；需要观察真正的 scene 更新来源 |
| 按需 rAF | [`canvas/scheduler.ts`](../../apps/web/src/pages/project/sections/ArrangementPanel/canvas/scheduler.ts) `createScheduler` | painter dirty 合并到下一 tick，不是每个 Clip 各开循环 | 独立的 minimap gesture、autoScroll、MIDI 活动还有局部 rAF，不能写“整个项目只有一个 rAF” |
| 视窗裁剪 | [`painters/clip.ts`](../../apps/web/src/pages/project/sections/ArrangementPanel/canvas/painters/clip.ts) `paintClips` | 先排除视窗外 row，再按 Clip rect 排除横向不可见 Clip | 仍调用 `layoutTrackRows(scene)` 并循环行与行内 clips。这是绘制裁剪，不是已建立区间索引，也不证明布局成本与可见数量成正比 |
| DPR | `useCanvasPainters.ts` `sizeCanvas`、`resize` 和 `paintPlayhead` 的 `setTransform` | CSS 尺寸乘 DPR 分配两张位图，坐标仍是 CSS px，尺寸不变时不重复设置 width/height | 此 hook 没有 audio-ui 式显式 resolution listener 或位图预算。ResizeObserver 是否覆盖跨屏 DPR 变化需要实测，不能只看一次 retina 截图 |
| 指针时钟 | [`canvas/audio/project-telemetry.ts`](../../apps/web/src/pages/project/sections/ArrangementPanel/canvas/audio/project-telemetry.ts)、[`connection/telemetry.ts`](../../packages/project-runtime/src/backend/connection/telemetry.ts)、[`connection.ts`](../../packages/project-runtime/src/backend/connection/connection.ts) | 从 backend telemetry 插值，elapsed 最大 250ms，有 session、sequence 与控制状态门控；不是 `bar += frameDelta` 的自由运行 UI 时钟 | `receivedAt = performance.now()` 是收到消息时间，不是设备输出时间戳。250ms 上限避免无限外推，但 IPC 延迟与显示误差仍需测量 |
| 指针存储与绘制 | [`ring-buffer.ts`](../../apps/web/src/pages/project/sections/ArrangementPanel/canvas/audio/ring-buffer.ts)、[`painters/playhead.ts`](../../apps/web/src/pages/project/sections/ArrangementPanel/canvas/painters/playhead.ts) | ring 保存最新值和 revision，paintPlayhead 读取 bar 后投影屏幕坐标，屏外不画长线 | 这不是采样历史队列。可用 SharedArrayBuffer 不代表当前已跨 native 音频线程传输，更不意味着 float 与 flags 是原子快照 |
| 可见波形请求 | [`canvas/waveform-ranges.ts`](../../apps/web/src/pages/project/sections/ArrangementPanel/canvas/waveform-ranges.ts)、[`backend/waveform-ranges.ts`](../../apps/web/src/pages/project/adapters/backend/waveform-ranges.ts) | 只为可见音频 Clip 请求 source frame 范围；source key 包含 ID、SHA 与位置；有 demand owner、取消与缓存 | 请求 columns 目前来自可见 CSS 宽并限制到 4096，未乘 DPR。缓存按项数尝试清理到 64，但保留 wanted 项，不是严格 64 项或字节上限；精确 range key 在连续缩放时的命中率未测 |
| 原生波形数据 | [`analysis/waveform.cpp`](../../crates/engine/native/analysis/waveform.cpp) `waveform`、`waveformRange` | 总览 `waveform` 聚合全通道绝对值峰。`waveformRange` 按通道扫描真实 PCM、保留 min/max，足够近时返回有符号 samples，支持 generation 取消 | 旧 overview 不能补回正负极性或声道差异；精细 range 不是每帧都应重解码。这里只读实现，未证明所有格式 seek 均廉价 |
| 波形投影 | [`painters/clip-previews.ts`](../../apps/web/src/pages/project/sections/ArrangementPanel/canvas/painters/clip-previews.ts) `paintWaveform`、[`signed-waveform.ts`](../../packages/project-core/src/signed-waveform.ts) 的调用 | 真实 source 走 signed range 路径，fixture 仍走预览峰；按可见区间绘制 Path2D | `paintWaveform` 在每次场景绘制中创建 `new Path2D(path.path)`。是否缓存值得做，需把路径生成、Path2D 构造与 stroke 成本分开测，不把“用了 Canvas”当无分配证明 |

## 后续改造的具体配方

这些步骤用于评审后续方案，不表示本轮已经实现。父级重构计划负责最终顺序、接口和验收入口。

### 配方一：让普通播放只更新动态层

1. 保留 `SCENE_ID` 与 `PLAYHEAD_ID`，列出 document、viewport、theme、selection、hover、telemetry 各自影响的 painter。
2. 将 grid、Clip 底图、波形和 automation 作为静态场景输入。播放位置、选择指示、拖动 guide 与 meter 使用动态输入。拖动造成的 Clip 几何变化仍必须实时画，不要为了省重绘冻结交互。
3. 为同一帧记录失效来源、场景 paint 次数和动态 paint 次数。只移动播放指针时，检查静态 paint 是否意外跟随 session 状态更新。
4. 若需要缓存，先缓存可见 Clip 的波形几何或块，而不是缓存整段工程的巨幅位图。key 应包含 source 内容身份、源窗口、分辨率和通道方式。主题色可与纯几何分开。

机制依据是 waveform-playlist 的 drawVersion 与独立 AnimatedPlayhead，以及当前双层 Canvas。预期收益是减少未变化内容的重复绘制，不是让 native 音频 callback 更快。跟随播放改变 scrollX 时，静态层确实需要更新，不能把这种更新判为错误。

### 配方二：先裁掉数据，再裁绘图

1. 用同一个时间投影求 `visibleStart`、`visibleEnd` 与 row 可见窗口。命中、绘制、波形需求和网格吸附必须使用相同坐标语义。
2. 对可见行中的 Clip 先做时间区间筛选，再计算 fade、waveform path 和标题布局。若实测遍历成本主导，再引入随编辑事务更新的区间索引。不要先建索引后找问题。
3. 对长 Clip 只请求覆盖源窗口的 extrema。按 sample-frame 范围和分辨率复用数据，必要时加少量 overscan，避免每个滚动像素都生成全新 range。
4. 为缓存同时设条目与字节预算，包含声道数、Float32 数据和路径开销。释放不再被任何 owner 需要的 range，不丢失仍可见的请求。

waveform-playlist 证明了可见块与 source origin 的组合方式，wavesurfer 证明了可见 Canvas 清理策略。当前 zoeydaw 已有可见请求与 demand owner，应在这一条路径上改进，不能增加一套 IndexedDB owner 来掩盖现有失效问题。未定位的“diffusion 2s bins”不支持固定两秒块长。

### 配方三：给 DPR 和每层位图明确预算

1. 保持交互坐标为 CSS px，位图为 `round(cssSize * effectiveDpr)`，在绘制入口一次设置 transform。不要将滚动量乘两次 DPR。
2. 在容器 resize 与 DPR 变化时同步更新底图、指针和命中投影。宽高未变时不重新赋值 Canvas width/height，因为赋值会清空画布和 context 状态。
3. 按层统计位图字节。单 RGBA 位图约为 `cssWidth * cssHeight * dpr² * 4` 字节，这只是像素存储估算，不含浏览器额外副本、GPU 和缓存。
4. 大视窗下优先限制缓存区域与块大小。若选择降低 effectiveDpr，需标明这是画质折衷，不能让波形请求与显示比例失配。

audio-ui 的 resolution watcher 与位图缩放保护可参考。wavesurfer 的 8000 和 audio-ui 的 16384 都不是可以无条件复制的设备上限。应在现用 Tauri WebView 与显示器组合下确定预算。

### 配方四：worker 只接收绘制所需快照

1. 只有主线程 trace 显示路径生成或绘制阻塞输入时，才比较 worker。音频解码与 extrema 已由原生范围任务承担，先避免重复在 JS worker 解码同一文件。
2. 主线程保留 DOM 尺寸、主题读取、pointer capture、编辑事务与命中。worker 接收 viewport、绘制 token、必要几何和波形块，不接收整个 React store。
3. 消息带 scene revision、viewport revision 和 source 身份，合并中间视窗请求，只采用当前版本的结果。旧 worker 结果不能回写文档或恢复已取消拖动。
4. Canvas 转交前确定 owner 和销毁流程。能力不可用时保留现有主线程绘图路径，不能在一个 Canvas 上同时争用两个 context。
5. 比较主线程耗时、交互延迟、传输字节、内存和 stale 丢弃数量。不能只比较 worker 内部 drawDuration。

依据是 OffscreenCanvas 官方文章与 Canvas-Timeline 的 worker 协议。worker 隔离主线程工作，不承诺提高所有场景的 FPS，也不提供 native audio 实时优先级。

### 配方五：rAF 读取时钟，不制造时钟

1. native backend 继续拥有 transport、loop、seek 与 session generation。rAF 只选择本次显示时刻并计算投影，不累加上一帧位置。
2. 区分 transport sample position、backend 生成时刻、IPC 接收时刻和屏幕展示时刻。当前 receipt-time 插值不能被命名为“设备输出同步”。
3. 遇到 stop、seek、loop、会话替换和 telemetry stale，重建插值锚点或停止外推。不要为平滑而跨 seek 插值，也不要让长时间主线程暂停补跑累积帧。
4. 若研究纯浏览器目标，可参考 [MDN getOutputTimestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp) 的 `{ contextTime, performanceTime }`，由同一输出时刻的两个坐标映射当前显示时刻。已经使用输出时间戳时，不再盲目减一遍 outputLatency。
5. 对 native 目标，只能使用引擎与设备实际提供且明确语义的时间戳或延迟。用真实音频脉冲与可见指针取证同步误差，分别记录稳定偏移和抖动。

Stack Overflow 条目证明了 latency 语义容易混淆，不能单独决定补偿公式。WebCodecs 文章有用的是区分 source、context 和展示时间，不是其重建播放链建议。DEV 文章有用的是共同 scheduling clock，不是“永不漂移”的保证。

### 配方六：scrub、seek 和跟随不互相冒充

1. pointerdown 保存 source 时间与视窗 anchor，拖动过程中按当前投影更新 scrub 预览。preview 不是 backend 已接受位置。
2. 区分拖动预览、实际 seek、音频 scrub 播放三种语义。只移动指示线不能叫音频 scrub。若连续 seek，需要使用既有 sequence 与 generation 丢弃过期请求，而不是在每次 pointermove 重建完整播放图。
3. pointerup 提交最终位置，pointercancel 与 Escape 恢复对应预览状态。旧异步回调不能在释放后把指针拉回旧位置。
4. 跟随模式只改变 viewport。先按既定中心阈值移动视窗，之后固定指针屏幕位置，让内容向相反方向滚动。loop 回绕、起点边界和手动滚动需各自定义行为。
5. 在不同 zoom、水平 scroll、跨轨拖动和播放中 seek 下比较 source 时间、屏幕 x 与 backend 接受位置。Harrison 的旧论坛只作交互案例，不覆盖项目既定约画布中心规则。

### 配方七：保留真实 extrema，不用平滑假装精度

1. 每个显示列覆盖一个明确的半开 sample-frame 区间，保留该区间每个声道的最小值与最大值。RMS、平均值与绝对值峰各自有用途，但不能冒充有符号 extrema。
2. overview 可用粗层级。放大后请求更细 min/max，接近 sample 时使用原始有符号 samples。不能只把粗 peaks 线性插值后标为 sample-accurate。
3. 让 Clip 的 sourceOffset、循环、stretch 比率和可见 source interval 共用映射。显示裁剪应对应原素材的同一窗口，而不是将整段波形重新压缩进可见部分。
4. 保留 source SHA、sampleRate、totalFrames、channel 和范围信息。对缓存而言，同路径换文件与同素材移动 Clip 是不同事件。
5. 后续验收使用单样本脉冲、正负不对称信号、双声道差异、静音、窗口边界、源末尾和极近 zoom，比较 native range 结果与实际 PCM。这里列的是需要验证的行为，不是已通过测试。

当前 `waveformRange` 已是这一配方的正确接入点。SampleEditorView 的平均值显示可参考交互，却不能替换它。MDN 的 AnalyserNode 配方适合实时示波器，也不能生成完整编辑波形。下一步应测已存在的 native range 与 JS path 成本，再决定是否需要分级缓存或 GPU 绘制。

## 查阅时的决策约束

不以引入库代替当前根因判断。若问题是 scene 无差别失效，先缩小失效；若是 range 反复解码，先处理范围和缓存；若是指针与声音有固定偏移，先确认时钟与输出延迟；若是 callback 超预算，去看原生音频路径，而不是改 Canvas。

GPL、MPL、MIT、BSD 与 Apache-2.0 的行仅记录读到的许可，不是法律意见。尚未定位的 `diffusion 2s bins+IndexedDB`、`easy-dsp DeepWiki` 原文和 `screenpipe use-audio-playback` 精确文件保留在表中，不能在汇总时删去，也不能当作已验证来源计数。`plugin-audioplayer` 已按用户给出的 crates.io URL 确认为 `tauri-plugin-audioplayer`，不再列入未定位项。
