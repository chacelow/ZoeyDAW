# 播放核心与渲染重构计划

核查：2026-10-23。文件名沿用本次迁移批次日期。状态：待实施评审稿。用户要求先整理三份参考清单、逐项对比，再制定重构计划。此前已完成的模块提取、waveform与fade局部改动见[现状评审](daw-current-review-2026-10-22.md)，不在这里重新宣称为新成果。

本稿保留早期评审记录。当前用户已批准完整实时 DAW 实施，包含真实 device/plugin、输入、Session、录音与 Link，不再受下文“暂缓产品扩展”的范围描述限制。传输主选择已固定为 single-flight binary pull，可靠事件才使用 Channel receipt。最新长期契约见 [实时同步设计](realtime-sync-design.md) 与 [meter 架构纠错](cookbook-meter-references.md)，实现与验收尚未完成。

参考入口：[cookbook](daw-cookbook.md)。本计划保留 React/Tauri、唯一 Tracktion Engine/DeviceManager、现有工程格式、撤销和保存事务。不新增音频后端，不默认为所有列出的 Ableton 模块立刻补齐产品功能。

input、track、device/plugin各级meter与多Dock/Mixer同步采用独立的[统一实时遥测契约](realtime-sync-design.md)。每 WebView 一个 MeterStore，全应用一个原生 MeterHub，按兴趣集单在途拉取 binary 快照。可靠事件独立有序且有界，不为插件临时增加 timer。

## 目标与边界

正常参数编辑不额外 stop、seek、play；最新有效参数在音频块边界采用。普通结构编辑保留 transport、稳定节点身份及可复用DSP状态。输入及时反馈，真实输出和界面状态均由引擎确认，不以假时钟或伪造ack遮掩延迟。

以下不作零中断保证：设备切换/拔插、采样率变化、任意第三方插件故障、未准备好的离线媒体。必须有明确状态和恢复，不能混作正常编辑延迟。量化启动按音乐边界等待，不属于卡顿。

## 先选已有能力

| 决策 | 采用 | 不采用及原因 |
| --- | --- | --- |
| 普通结构更新 | 单 Arrangement Edit + 稳定ID增量更新 + Tracktion图发布 | 每次新Edit stop/swap；丢失reader/plugin状态且准备未完成 |
| 音频参数 | 复用Tracktion setter；自有Envelope使用有界完整快照发布 | 音频线程锁、分配、等待UI；逐字段无一致性更新 |
| 控制调度 | 有序工程事务与latest连续control分开；仍保持明确epoch/sequence | FIFO塞全部full-state；并发full apply共享baseRevision；丢弃commit |
| 遥测/大数据 | meter 固定 single-flight binary pull；事件 Channel receipt；waveform/FFT 独立预算 | meter Channel 历史补播；每帧 JSON PCM；主线程 dispatch 处理 snapshot |
| PDC | 先使用Tracktion PluginNode累计latency及SummingNode补偿 | 自写第二套PDC；delay效果插件不是host补偿 |
| 长文件波形 | 指纹+算法版本+层级/区块缓存，raw样本按可见窗口 | 每次缩放全量decode，或拟合peaks冒充samples |
| UI渲染 | 保留已有静态/动态层与visible range，先profile | 不测就整体改WebGL/OffscreenCanvas/gpuix；这些各有平台约束 |
| 插件/Session/录音 | 作为明确产品扩展，单独验证 | 从参考功能列表推断本轮已授权完整Live功能实现 |

## 模块与接口草图

这里描述目标契约，不新增可编译占位代码。

- `project-runtime` 仍是 authored document、history、preview、revision和recovery owner。提交分成 `submitControl(control)` 与 `submitDocument(transaction)` 两类。UI不直接调用原生transport绕过确认。
- connection 拥有 `epoch`、ordered document queue、latest pending control、唯一inFlight。submission ticket与wire sequence分离；wire sequence按派发顺序生成。
- `zoeydaw-engine` 保留lease、stop fence、main-thread dispatch和native owner。纯编码、diff和媒体准备可离开主线程，活跃Edit/Plugin mutation不得任意移到worker。
- native Arrangement 持有稳定 Track/Clip/Plugin ID映射。分类结果为参数更新、结构diff、整体工程替换、设备操作，四类生命周期不同。
- telemetry 的字段明确区分 engine sample position、monotonic observation time、control generation、applied revision、graph generation和audible adoption。设备累计帧不替代工程位置。
- waveform数据仍归媒体分析，render projection不成为音频数据owner。缓存键包含真实源指纹和算法版本；消费者提交可见窗口需求，不指挥解码线程。

## 实施顺序

### P0：冻结基线和测量口径

复用 `scripts/audio`、native diagnostics/capture、现有connection测试。记录输入→projection→入队→dispatch→Rust入站/main closure→decode/diff/mutation/graph build→ack→音频首次采用的关联ID与各层本地duration。跨进程单调时钟不能直接相减。

独立修复当前replacement preview playing=true但position=0的故障；它是已知未闭合运行门槛，不能让普通编辑优化掩盖它。确认当前测试输入、设备实际配置和输出目录，保留失败前证据。

验收：可复跑命令输出队列驻留、主线程等待、处理时长、首次音频采用和设备前capture；报告p50/p95/p99，不用刷新率替代延迟。缺少电气/声学loopback时只报告设备前延迟。

### P1：连续参数统一分类

在 `model/playback_model` 和 `runtime/engine_session` 建立显式更新分类，扩展现有mixer/fade路径到clip gain/mute、受支持device参数；自动化写入与手动控制的优先级必须明确。不要把八个fade字段例外无限复制成散落条件。

所有参数发布由控制线程写，音频每块只读一致快照，不等待、不重试、不分配。复用已有参数平滑；新平滑必须依据实测点击噪声，不能给手感额外重阻尼。preview/commit/cancel/undo共享同一路径。

验收：每个支持参数都会改变真实音频，而Edit/Plugin身份、transportStarts/Seeks和graphBuilds不变。快速覆盖只采用完整版本，cancel/undo恢复正确输出；无数据竞争、无音频线程析构。

### P2：控制与工程事务解耦

修改 runtime `backendState/submit` 与 connection，控制提交不做完整工程投影。先在同一闭环中实现latest control slot、派发时sequence、恢复屏障，再收敛窄transport IPC；不长期保留两个行为不同的控制API。

当前inFlight完成后优先控制。transport使用最近accepted工程，而非未确认乐观工程；工程事务派发时叠加最新有效control，不能把旧playing/seek恢复回来。commit/cancel/recover保序，preview只在同一事务屏障内合并。Stop→Play即使合并也必须执行Stop fence。未来MIDI note-on/off使用有序事件，不能用latest held-note快照丢失短音。

验收使用deferred backend：阻塞A，排B/C与多个Seek；A结束后先发最后Seek，再B/C；最多一个inFlight，wire sequence递增，revision只由事务推进。拒绝A后旧epoch队列和control均不可越过recover。早到telemetry缓冲、seek旧位置屏蔽、非控制ack滞后仍继续显示实际遥测。保存仍等待真实accepted revision。

### P3：同一Edit的结构diff和图更新

先预验证source、routing、拓扑、参数与不可逆操作，再在短message-thread scope内按稳定ID更新对象。使用 `TransportControl::ReallocationInhibitor` 合并图重建请求；它不提供回滚，必须另有失败策略。优先覆盖Clip移动/resize/新增删除、routing、automation、设备链增删；明确每类的reader/DSP状态复用和失效条件。

由Tracktion原生 `restartPlayback` 图更新链完成新图prepare/post/adopt；不手动stop/seek/play。纯数据diff、媒体检查/预读可worker化；plugin初始化和Edit mutation保持主线程。整体工程替换和设备切换单列，不伪装成普通diff。

失败策略先按操作表审查：可预检失败在mutation前拒绝；可能部分mutation的异常必须恢复一致模型，不能继续ack为成功；无法保证原子性的操作不得开放“无中断”承诺。区分逻辑接受与新图可听，不让保存误认为未应用内容已落地。

验收：持续音源下逐类编辑，capture没有非预期静音间隙/重复片段，playhead按同一时钟推进，未涉及对象保持身份。参数编辑不建图；结构变更允许必要graph rebuild但不增加transportStarts/Seeks。reader未ready、插件失败、连续supersession、stop/release竞态都有失败前有效输出保护。

### P4：引擎快照与UI时钟

非音频 MeterHub 从 graph-owned tap 读取快照，经 lease/session/window 绑定的单在途 binary pull 返回。音频 callback 只发布有界数据，不调用 Tauri 或序列化。events 单独 Channel 和 receipt；订阅销毁、epoch、慢消费者、可覆盖状态与可靠事件分别建模。设备 inventory 只在变化时传。

前端独立播放头层用rAF时间戳插值并按engine sample校正；scrub/seek期间旧generation不能拉回。区分图内与audible位置及驱动延迟；不额外创造可写transport clock。Window隐藏/恢复时重新同步。

验收：慢UI不阻塞音频，退出后无残留publisher；seek与loop不回跳；位置/电平流顺序和内存有界。通过真实输出校准后才能宣称视觉与声音对齐。

### P5：波形缓存和渲染预算

先完成当前共享signed waveform的实际页面验收，再优化数据管线。分析raw source一次生成分声道min/max层级；深缩放读取有界samples。缓存使用字节预算而非只按entry数量，取消旧需求并复用重叠窗口。采用已有分析能力或BBC格式前核实许可证与表示精度；不给demo波形冒充真实源。

量测IPC JSON开销后选择binary响应/Channel；编码保留sampleRate、frame坐标、channels、representation和version。保持小控制包与大数据独立。渲染缓存按source/window/zoom/gain/reverse/theme/DPR失效，静态图与playhead分层；只有profile证明主线程超预算时引入worker或GPU。

验收：相同输入各缩放不丢瞬态、不镜像负峰、不跨loop seam连线；三个视图外观一致，缓存到达正确刷新。长文件与32轨场景满足既有UI/内存阈值；缩放取消不污染当前源；4K/high-DPR测量实际内存。

### P6：集成压力与产品扩展门禁

1/8/32立体声reader持续播放，叠加编辑、波形分析、目录索引、搜索、保存收集与UI缩放。运行冻结30分钟负载；分别记录声音连续性、callback deadline、内存、UI帧时间和操作延迟。

第三份目录中的模块另按条件启用：

| 模块 | 已有能力/缺口 | 独立验收门槛 |
| --- | --- | --- |
| Mixer/send | 现有routing与增量mixer；pre/post/sidechain要按产品契约核对 | 已知输入下总线增益、solo、反馈环拒绝、pre/post语义 |
| PDC | Tracktion已有累计latency与汇合补偿，实际路由未全验收 | 多分支impulse对齐、send路径、bypass/变更latency，无双重补偿 |
| Warp | 当前SoundTouch Better/repitch有效模式明确 | Rubber Band/Bungee候选必须走同语料盲听、瞬态/音高/CPU/许可门禁，不能直接替换 |
| Session/Hybrid | 没有已验收完整launcher状态机 | 一个引擎时钟、量化边界、重触发/取消/stop、Arrangement接管与录制 |
| MIDI/piano roll | Web编辑器已有，native instrument/recording缺口明确 | tick/beat/sample转换、tempo map、note-off与loop边界；不把可视化当编辑器 |
| Automation | 保存曲线和部分mixer播放已有；完整Touch/Latch录制未验收 | 手动gesture所有权、sample时间、模式切换、离线/实时一致 |
| 插件隔离 | 不自动等于完整OOP host | 扫描崩溃与运行崩溃分别测试，IPC预算、state恢复、PDC、GUI生命周期 |
| 录音设备 | 当前native拒绝录音 | 有界ring写盘、overflow显式错误、input/output latency校准、热插拔真实硬件 |
| Link/多设备/WASM | 条件性产品方向 | 单独scope和许可，不进入本地播放修复关键路径 |

## 数值与命令

沿用[冻结契约](audio-acceptance-contract.json)，不重写阈值：UI frame p95≤16.67ms、主线程task≤50ms；callback p99≤deadline的0.7、max≤deadline；30分钟xruns=0；长文件PCM工作集≤64MiB/reader。热/冷试听首声p95≤100/500ms。新控制延迟分层指标先在P0冻结测量和目标，不把试听门槛当所有按键门槛。

已有可执行入口：

```sh
pnpm typecheck:core
pnpm --filter @zoeydaw/web typecheck
pnpm test
pnpm check
pnpm build
cargo check --workspace --locked
cargo test --workspace --locked
cmake --build /tmp/zoeydaw-core-packages-native-build --parallel 6
ctest --test-dir /tmp/zoeydaw-core-packages-native-build --output-on-failure
```

native smoke使用`zoeydaw_playback_smoke REQUEST NEW_CAPTURE.wav 8`，输入必须真实有效、输出必须不存在。它仍包含replacement preview故障断言，不能通过删断言变绿。浏览器/桌面验收使用用户持有应用；Rust/native变更后由用户重启 `tauri:dev`。Windows真机按既有用户决定暂缓，不标通过。

## 依赖与实施授权

P0先行；P1与P2在写入模块分离后可并行；P3依赖P0的capture与P1分类；P4依赖P2的control/epoch语义；P5可独立但压力验收必须与P3/P4整合；P6最后。每阶段必须保留原始输出与回归入口，完成切换后删除旧实现，不能用长期兼容分支维持两套owner。

新增npm依赖、共享UI公共API、Tauri配置、workflow、提交和远程发布仍遵守项目授权规则。外部源码复用前锁定commit与许可证；目录收录不表示已获复制许可。当前仅交付评审和计划，整体重构尚未实施。
