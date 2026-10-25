# 播放核心与时间线逐项评审

核查：2026-10-23。文件名沿用本次迁移批次日期。范围为用户提供的 Rust/Tauri DAW、Canvas、波形和原子零件参考。目录见 [cookbook](daw-cookbook.md)。本轮后半段按用户要求转为评审与计划，不继续扩大核心实现。

## 结论

当前主要问题不是缺一个更快的 Web 框架，而是普通工程编辑与播放对象生命周期耦合。完整工程状态通过单飞 FIFO 进入主线程；结构变化新建 Edit，再 stop/swap/seek/play。应先保留一个 Edit 和稳定原生对象，再拆分控制、事务和遥测通道。Canvas 已有独立播放头层、dirty scheduler、可见轨道和 DPR 处理，不能把这些列成待从零实现。

优先复用现有 Tracktion 的 live graph 更新机制。参考项目提供命令、时钟、缓存和模块经验，但没有证据表明整体替换为另一套 Rust 音频引擎能低成本解决现有问题。

许可仍是发布门槛。shell manifest 声明 Apache-2.0，不会覆盖 Tracktion/JUCE 的独立许可或将 GPL 参考代码自动转为 Apache。尚未核实项目商业授权状态，本轮不改许可声明、不复制 GPL 代码、不作可闭源分发结论。

## 逐项差距

路径以下均相对于仓库根目录。源码证据只证明实现机制，不证明性能数字。

| 主题 | 当前状态与证据 | 参考中的可取机制 | 评审与动作 |
| --- | --- | --- | --- |
| 核心模块分层 | 已具备。`crates/{media,project,browser,engine}`、`packages/project-{core,runtime}`；依赖脚本和 ESLint 已接线 | vibez、Generic DAW workspace；已有 Tracktion 模块 | 保留，不再按参考 crate 名称重复拆空包 |
| 单一设备 owner | 已具备。`EngineSession` 拥有 Tracktion Engine，Rust dispatcher 保持主线程创建和调用 | Tracktion DeviceManager | 保留；不叠加 CPAL/Rodio 设备管理 |
| 媒体身份、保存与取消 | 已具备。`crates/media` 完整指纹；`crates/project` 发布事务；`project-files` 等待 accepted revision | Ardour Source/Region 和 collect | 保留 ID、版本、取消线性化点；不得为减少延迟丢弃保存确认 |
| 控制负载 | 未做到位。`project-runtime.ts::backendState/submit` 对 transport 也全量投影 tracks/clips/notes | daw-tauri `AudioCommand`、Maolan `Action::Play/TransportPosition` | 拆纯 control 输入，最终使用窄 transport wire，保持 fence 和确认语义 |
| 控制优先级 | 未做到位。`backend/connection/connection.ts::drain` 单飞 FIFO，只有 urgentStop 绕过 | 语义命令与有界队列 | control latest slot 优先于未发送事务；不能简单 unshift 旧 sequence |
| 连续参数合并 | 部分具备。同 editId 未派发 preview 已合并；commit/cancel/recover 保序 | vibez 命令与参数发布 | 保留事务屏障，不能把整个队列只留最后一项；MIDI note edge 不可按状态丢弃 |
| mixer 实时更新 | 已具备局部路径。`EngineSession::updateMixer` 原位 volume/pan/mute/solo/send/cue | Tracktion 原生 setter | 保留并扩展分类测试，不全图替换 |
| fade 实时更新 | 本轮修复。`updateEnvelopes` 发布八字段完整快照，三槽 SPSC；音频块读取一次，不分配、不锁、不自旋 | 常见实时快照发布模式；不声称复制某项目代码 | 原生渲染与设备连续更新通过；新桌面二进制仍需用户重启验证 |
| clip gain/mute | 未做到位。fade以外clip data变化仍进入 `sameGraph == false` | Tracktion clip参数和setter | 建立参数/拓扑分类表，避免每加一个旋钮写一个特例 |
| Device处理与meter | 缺失实际接线。Web `Device` 含utility/filter/delay/reverb，但 `BackendTrack` 无devices字段，projection不发送机架；native对device automation报告 `device-unavailable` | Tracktion真实plugin实例、专用host参考 | 先定义并接通稳定Device身份、参数与前后tap；不能复制track meter冒充plugin meter |
| 结构编辑连续性 | 明确缺口。`EngineSession::apply` 新建 Edit，stop/swap/setPosition/play | Tracktion 同 Edit 的 restartPlayback、节点状态复用 | 改稳定 ID 增量 diff；不能宣称把 `prepare` 放 worker 就解决 |
| 失败原子性 | 部分具备。candidate 构造失败保留旧 arrangement；交换后的 loop/seek/play 失败没有完整回滚提交保护 | 预验证、分阶段发布、旧有效状态保留 | 设计失败前不破坏有效输出；区分 applied/accepted/audible |
| Rust 主线程耗时 | 未做到位。`crates/engine/src/service.rs::invoke` 在 main closure 内 JSON/CString、FFI、响应解析 | 控制与准备分离 | 将可独立的编码/纯 diff 移离主线程；Edit/Plugin 操作仍留消息线程 |
| 遥测传输 | 部分具备。`backend/native.ts::schedulePoll` 单飞，完成后再等待约33ms | Tauri ordered Channel、引擎快照 | 不是固定30Hz到达；设计受 lease 管理的推送与背压；设备列表不随每个 position 包重发 |
| 时钟与迟到数据 | 已具备重要约束。connection 检查 session/sequence/seek，早到遥测缓冲；`telemetry.ts` 最大250ms外推 | audio-ui scrub ownership、Maolan native snapshot | 保留；新增 native monotonic stamp、实际应用 generation 与 audible position 的明确语义 |
| 端到端延迟测量 | 缺失完整链。已有 callback/graph/start/seek/gate/capture 计数，未关联 keydown 到首个生效 frame | 分层 tracing、音频 loopback | 不把512/48k约10.7ms当总延迟；跨时钟不直接相减 |
| Browser replacement preview | 当前已复现缺陷。smoke 中 playing=true、positionSeconds=0，旧停止/换代断言失败 | 预热、generation fence 与 context 生命周期 | 必须单独解决，不能把 fade smoke 的通过写成整个播放全绿 |
| 波形真实性与统一外观 | 本轮更新。core `signed-waveform`、Canvas、Audio Editor main/overview、Browser 共用分声道 signed stroke；不再 kind 切换填充/圆点 | wavesurfer/Ardour 多分辨率；gl-waveform extrema | 114 core tests、17相关Web tests通过；最终缩放视觉验收未完成 |
| 波形传输与缓存 | 未做到位。JSON数值数组；native range 每次重新 reader/扫描区间；Web cache按最多64 entry而非字节预算 | peaks层级、分块、Tauri binary Channel | 先测重复解码/IPC字节，再做按source fingerprint+分辨率的分块缓存；大数据不每帧传 |
| 静态/动态层 | 已具备。`TimelineCanvas.tsx` 独立 scene/playhead canvas；scheduler dirty合并 | waveform-playlist 分层 | 保留；需测follow时哪些静态层被重绘，不盲目增加层数 |
| 可见范围与 DPR | 已具备。viewport布局裁剪、可见waveform requests；Canvas按窗口尺寸 | wavesurfer切片、虚拟化 | 当前不是全工程超宽Canvas；“8000px上限”不能直接变项目常数 |
| 主线程波形投影 | 未做到位的风险。`signedWaveformPaths` 逐列搜索range、查询extrema、创建字符串；editor缓存更新触发投影 | 缓存几何、OffscreenCanvas、WebGL | 是否超预算尚未测量；按测量选择geometry缓存/worker，不先承诺GPU重写 |
| 高频 React 更新 | 部分隔离。scheduler/playhead不靠整树每帧setState；editor仍订阅range entries | audio-ui CSS变量 | 先检查实际重绘范围与录制profile，避免“所有React状态都慢”的结论 |
| 长压缩音频内存 | 未闭合。既有研究确认部分 Tracktion compressed proxy 渐进全量PCM | Ardour Butler、有界reader | 保持64MiB/reader冻结门槛；短样本与长素材不同策略 |
| Worker/GPU | 当前未作为统一renderer实现；也非已证实根因 | OffscreenCanvas、gl-waveform | 仅在目标WebView支持与profile证明后采用；gpuix既有方向不被本计划暗中替换 |
| 插件隔离 | 本产品尚未有已验收的完整第三方宿主隔离链 | Maolan OOP、vibez扫描隔离 | 扫描隔离不等于运行隔离；另列后续能力，不混入本轮低延迟修复 |
| PDC | 库已具备、产品验收未完成。vendor `PluginNode::getNodeProperties` 累加插件latency；`SummingNode::createLatencyNodes` 对齐输入，`ConnectedNode` 也创建补偿节点 | Tracktion现有图实现；KVR等仅作算法解释 | 不自写第二套PDC；补齐实际routing/send/bypass/动态latency的impulse验收 |
| WASM/多设备同步 | 非当前直接问题 | SoundCraft、awsm-audio、Beatsync | 作为条件性参考保留，不将NTP或WebAudio时钟用于本地原生transport |

## Tracktion 关键约束

锁定 vendor 的复用链为 `Edit::restartPlayback` → `TransportControl::editHasChanged` → `ensureContextAllocated(true)` → `EditPlaybackContext::createPlayAudioNodes` → `TracktionNodePlayer::setNode` → `LockFreeMultiThreadedNodePlayer::setNode/postNewGraph`。普通图重建不等于显式 stop/play。

当前维护源码位于 `src-tauri/native/tracktion-source/modules/`（原核查使用的 ignored vendor checkout 不再是构建输入）：

- `tracktion_engine/model/edit/tracktion_Edit.cpp` 的 tree watcher 和 restartPlayback。
- `tracktion_engine/playback/tracktion_EditPlaybackContext.cpp` 的 graph创建、prepareForPlaying。
- `tracktion_engine/playback/graph/tracktion_WaveNode.cpp::replaceStateIfPossible` 按稳定 EditItemID 复用 reader/resampler 等状态。
- `tracktion_engine/plugins/tracktion_Plugin.cpp::baseClassInitialise` 有 message-thread断言。
- `tracktion_graph/tracktion_graph/tracktion_LockFreeMultiThreadedNodePlayer.cpp` 准备、发布和旧图回收。

`ReallocationInhibitor` 只批量抑制重建，不提供回滚；Undo transaction 不是失败原子性；`ensureContextAllocated` 是同步准备而非后台任务。双 Edit 的 syncToContext/postPlay/postPosition 能同步启动，但没有自动提供 sample-atomic replacement、crossfade和回滚协议。[官方源码](https://github.com/tracktion/tracktion_engine/tree/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules)

2026-10-26 实际运行 `zoeydaw_mixer_tests --transaction-model`：原位 Edit 的 fader 修改在替换图发布前就把旧图 PCM 从 0.25 改为 0.125。独立候选 Edit 在准备及注入失败后保持旧 PCM 0.25，同一 renderer clock 采用后输出 0.125，但未修改的 Utility 实例被重新创建。因此前者缺少候选参数隔离，后者单独使用不能保留 DSP 实例与历史。后续事务必须同时隔离候选数据并显式保留兼容处理器生命周期；这些探针不是完整事务或 document audioRevision 的验收。

## 本轮实际验证与未完成项

- 模块迁移阶段 `pnpm test` 947项通过，core/runtime/Web类型检查通过，生产构建通过。
- waveform更新后 core 114项、三个相关Web文件17项通过，Web类型检查通过。后续全量回归尚未重新运行。
- 最新 `pnpm check` 通过，包含格式、lint、metrics和Cargo/native边界。
- 原生两项CTest通过，含八个fade字段实际Envelope音频变化、preview/cancel/commit/undo-style恢复。
- 真实设备60次fade更新及cancel保留graph/start/seek计数，播放推进1.41867秒。随后仍命中replacement preview既有失败；完整smoke失败。
- 桌面曾观察到编排、真实素材与编辑器。操作被用户正在使用应用的保护中止，之后窗口消失；未把截图当作最大缩放、保存重开、Gallery全路径通过。
- 未运行这些外部参考项目；无参考项目与本项目的同机性能排名。

历史矩阵中的通过是其记录时版本；本次失败优先用于当前状态判断。原生修改需要用户重启 `tauri:dev`，Agent不代启。
