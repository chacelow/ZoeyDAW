# 统一实时控制与遥测设计

核查：2026-10-26。状态：唯一 Rust MeterHub、native 输入与 graph observer、窗口 stream、Web MeterSession、电平与 source observation 已接入。levels v2 将 Audio、Stopped 与 Unavailable transport 一并传给 Web，native adapter 通过同一 MeterStore 向既有 BackendTelemetry 消费者提供位置。原 JSON transport clock 已删除。完整 document audioRevision、精确 source 块时戳及真实桌面 WebView 交互和吞吐仍未验收。

入口：[cookbook](daw-cookbook.md)、[整体计划](daw-refactor-plan-2026-10-22.md)。统一的是身份、生命周期、订阅和调度，不是把所有流量塞进同一个FIFO。

## 当前缺口

生产轨头和路由电平直接读取 `adapters/realtime.ts` 暴露的 MeterStore，兴趣按挂载消费者取并集。`MeterSession` 处理打开期间卸载、隐藏代际、事件 gap、registry 更新与关闭，`MeterPull` 只在现有 scheduler tick 采纳和绘制单在途 binary 响应。registry 通过原有 backend poll 至多每 250ms 刷新，命令先安装 native 当前图并等待首个快照；换图期间不会把尚未发布的快照当作错误基线。

`BackendTelemetry` 是连接层保留的 transport 接口，其 native 输入来自同一 binary Hub snapshot。recording preview 和设备状态仍用原状态查询。`BackendTelemetry.levels`、`SessionState.levels`、native `inputLevels` JSON 和旧 JSON transport clock 均已删除。生产和显式 Gallery mock 都通过 MeterStore 分发电平，Gallery 不产生音频。Device 前后级和路由复用 `ProjectMeter`，source observation 与 transport 同帧发送；精确 source 块时戳和 source UI 切换仍保留在第 3 项。播放头只保留本地投影。

四种内置 Device 已经由 `BackendTrack.devices` 和 `projectBackendDocument` 投影至原生稳定实例链，参数与 Device 自动化能够影响真实处理。Utility、Filter、Delay、Reverb 的 DSP 回归及 Utility 设备前采集通过；混响采用固定版本 Signalsmith，decay 是名义尾音时间，不保证完整脉冲精确 RT60。Device 前后级 tap 直接观察 PluginNode 与其输入样本，不复制轨道输出；显示通过二进制帧和实际 React/DOM 回归，真实 WKWebView 尚未验收。

## 一套入口，三类语义

| 类别 | 数据 | 交付与拥塞规则 | 不可混用 |
| --- | --- | --- | --- |
| 控制/事务 | transport、参数gesture、文档事务、订阅配置 | 优先控制与有序事务按整体计划处理；生成号和ack明确 | 不能排在meter/波形后面；不可丢commit或note edge |
| 最新快照 | transport observation、input/track/plugin/bus峰值、RMS、CPU负载 | 每session保留最新待发快照，慢消费者覆盖旧值；有明确最大在途量和恢复握手 | 不积压历史帧，不把旧meter依次动画出来 |
| 有序事件/大数据 | device/plugin fault、clip/overload累计状态；waveform/FFT chunks | 小事件带序号与重同步协议；大数据独立预算、取消与流控 | 错误不可悄悄丢失；FFT不能占用transport快路径 |

生产 meter 固定使用 single-flight binary pull。每 WebView 一个调度器，rAF 限 60Hz，降级 30Hz，最多一个 invoke 在途。promise 完成只保存 pending ArrayBuffer，下一 rAF 校验、采纳、绘制并请求下一帧。同 seq 返回空 Response。隐藏或 pause 代际改变丢旧响应；rAF 间隔超过 250ms 时先标 stale，丢暂停期间 pending 与旧在途响应，不补播。请求超过 500ms 标 stalled，但不并发补发或假称已取消。可靠事件独立使用有序 Channel，每批最多 64 条、每 stream 一批在途、service 保留 4096 条，receipt 只回收事件。溢出报告 event-gap、累计 counter 和 latch。依据见 [meter 架构纠错](cookbook-meter-references.md)。

## 身份与数据布局

控制面发布 `MeterRegistry { sessionEpoch, graphGeneration, registryRevision, endpoints }`。字符串ID只在registry和变更中传输，高率帧使用紧凑slot编号。

每个endpoint包含：

- 稳定owner身份，分input port、track、device/plugin、bus/send、master/cue。
- 明确tap位置，pre/post plugin、pre/post fader、input/output；不让一个`level`含糊代表不同位置。
- channel layout及slot range，支持mono/stereo和多声道，不把所有plugin固定为左右两值。
- 指标能力，host peak/RMS、true-peak、gain reduction、plugin自报meter分别声明。host不能从音频幅度猜测压缩器gain reduction；不支持时显示unavailable。

levels v2 使用 192-byte header、每声道 48-byte record 和每 source observation 48 bytes，全部 little-endian。header 保留 registry、stream、设备、revision 和 reset 身份，并新增 appliedSequence、ownerEpoch、rendered bar/rate、audible bar/rate、observedMonotonicNs、transportKind 和 transportFlags。Audio 明确提供 sample clock；Stopped 只提供主线程停止位置和控制身份；Unavailable 不携带可用位置。无音频时钟字段填零并由 kind 判为 unavailable，不解释成设备出声时刻。controlValid 独立于 revision availability；生产 acceptedRevision/audioRevision 仍 unavailable。u64 在 JSON 中为十进制字符串，在二进制和 Web 中分别为 u64 与 BigInt。`protocol/realtime.json` 生成 TS、Rust、C++ 和 metadata schema，独立 `levels-v2.hex` 约束三语言布局及超过 2^53 的整数。

图删除或重排时，先发布对应registry再采用该generation数据。旧generation不能写进已复用slot。前端未收到registry时丢弃/请求基线，不把未知slot映射到下一插件。

`SourceRegistry` 在 document/audition 接受前准备身份，成功后才安装。多个 arrangement clip 共用 sourceHandle、各有 clipHandle；同 session 重排/删除不回收 handle，替换内容增加 sourceGeneration。Browser 无 SHA 的源使用明确的 temporary-preview 身份，记录路径、size、mtime 和实际 decoder metadata，不按路径与 authored SHA 源合并。preview stop 清活动映射，seek 恢复当前 generation，session 更换重新绑定存活 preview。`source_observations.cpp` 将当前身份与已有 `AudioClipPlayhead` 绑定为不可变投影，由现有 Hub reader 读取，沿生成的 48-byte source codec 编码，不按 timeline position 推算 sourceFrame，也不新增线程或音频回调。

`sourceFrame` 是已有播放图写入的源时间乘实际 sourceRate。该 API 最多接受 50ms 内的值，因此 `positionAgeSamples` 记录 `ceil(deviceRate * 0.05)` 的保守上界，不能当作精确源采样时刻或据此反推延迟。`observedDeviceSample` 是 Hub 此次读取使用的最近 graph/device 锚点，不是新增的源 reader 块时间戳。Arrangement 的 valid 还受实际音频 transport playing 约束，停止后的新鲜但不活跃位置不得显示为正在播放；Preview 独立于该 playing 位。超期、缺失、身份未就绪的记录显式 unavailable。精确块级源时间关联及 UI 切换仍待完成。

source metadata 变化可发生在同一 graph generation 内。Hub 仅替换不可变 registry，保留 meter reader、RMS 与 reset 状态；发布与 metadata 更换共享现有控制边界，旧快照不能重新出现。窗口 read permit 持有同一份 Arc registry，在 registry 尚未更新时拒绝包含新 source 身份的数据。Preview 添加和移除不会替换 Arrangement 图，已通过真实输出探针验证。

## 原生采集和发布所有权

1. graph 准备阶段预分配每 tap/声道状态。现有 `LevelMeasurer::Client` 含 SpinLock 和声道 resize，不作为无锁采集路径。input bank 按 deviceEpoch 独立，graph 更换不能清除其历史。
2. audio callback 只累计本块 max、sumSquares、count、clipCount，不做 sqrt、dB 或 ballistics。每 tap 一个 writer，graph worker 迁移依赖执行屏障，Hub 是唯一 consumer。
3. 每 tap 两个采集 epoch 与三槽 SPSC mailbox。旧 epoch 未确认不得复用。Hub 按 epoch 去重和累计差归并，保留最近至少 300ms 的完整 epoch 统计，不按比例插值能量。不足 300ms 为 rmsInitializing；超长量超过 50ms 为 rmsStale 并重新积窗。两种状态的 RMS 字段填有限 0，消费者不得解释为有效静音。
4. 唯一非实时 MeterHub 在有可见兴趣时 120Hz 聚合，无兴趣时 20Hz 维护状态。固定 arc-swap 1.9.3 仅发布 HubSnapshot，Arc 分配和析构不进入 audio。窗口从同一快照筛选，不建多份量测时钟。graph lane 在旧 worker 结束及 read handle 释放前不回收。
5. Hub 以真实单调 dt 维护瞬时 attack、24dB/s release、600ms hold 后 24dB/s 衰减。sessionPeak 和 clipCount 锁存至 reset。选择性 reset 在音频块生效后广播 affected endpoint、slotIds 和 slotResetEpoch。header.resetEpoch 为全局操作顺序，不要求所有 slot 相等。reset(A) 不清 B，旧 pull 不降低 expected epoch。设备停机时显示衰减但 valid=false，不冒充新输入。reset 意图以每类操作的累计代际发布，不只保留最后一个 kind。clip reset 不删除未消费的能量 epoch；hold reset 使用每个 current/completed epoch 内独立的 displayPeak 与 holdResetEpoch，保留 reset 后的短脉冲且不复活旧峰。非 finite 输入污染的 epoch 单独 valid=false，后续干净 epoch 可恢复，Hub 不得因当前 available 就忽略 completed.valid。MeterReadHandle 是 bank 的唯一消费入口。
6. input监测不等于监听输出。只有用户授权的设备输入和已有record/monitor策略决定音频路由；订阅meter不偷偷开启麦克风或监听。

`DeviceClock` 现把已打开设备的输入块交给独立 `InputMeter`。准备阶段按实际输入声道分配 bank，设备重开递增 deviceEpoch，graph 重建不改输入历史；stop 不伪造新样本。该接线不打开输入设备、不请求权限、不建立监听路由。独立真实样本测试覆盖 mono/stereo、换代和退役引用，硬件输入与 WebView 显示仍未验收。

外部音频监听已复用 Tracktion input instance/target 与 WaveInputDeviceNode，在 clips 合流之前通过 `wrapLiveInput` 加每轨 In/Auto/Off。监听仅绑定已经显式配置启用的输入，不因文档或 meter 订阅请求权限。Hosted Audio 的真实 DeviceManager 回调链验证共享输入、独立模式、Auto Clip 区间抑制、停止监听、context 重建与硬停止 fence；物理麦克风和真实 WebView 尚未验收。

现有 API 复核后，生产 meter 插入已改用已有 per-output hook 与 graph observer，删除新增每轨 factory 字段和三个 vendor 插入调用。observer 在初始化前将被观察节点登记为真实依赖；多输出按实际 Node 身份分配唯一 writer。原生测试覆盖 2 workers、memory sharing/pooling 四种组合、五种输出状态、共享节点的多输出不重复累计。graphBuilt/graphPosted 的精确生命周期和 legacy master meter 抑制仍是独立扩展，不因 observer 成功而假称可一并删除。observer 依赖当前应用的最终 fence 和唯一 mute 节点结构，不承诺任意 Tracktion 拓扑；拓扑变化必须通过相同样本测试。完整依据见 [现有 API 复核](cookbook-meter-references.md#2026-10-23-现有-api-复核)。

Device meter 使用 `device/<id>/in` 与 `device/<id>/out`，owner 为稳定 Device ID。相邻插件输出和输入可能是同一 Node，但各 endpoint 有独立 bank；同一 endpoint 被多个输出根发现时只创建一个 writer。双 worker、sharing/pooling 四种组合的样本回归覆盖两个串联 Utility 的独立输入输出能量。当前 collector 仍在原生进程内，未新增每插件 timer 或 IPC。

Rust `realtime/rms.rs` 按累计 epoch 替换能量并维护有界窗口，`ballistics.rs` 维护 hold/release，`channel.rs` 编码声道记录。`NativeMeterReader` 是 graph mailbox 的唯一 Hub 消费入口；其私有 `native_reader/sources.rs` 校验已有 playhead 的源记录。`PlaybackService` 持有单一 MeterHub，窗口从同一 HubSnapshot 取得 transport、meter 和 source，`transport_frame.rs` 负责 wire 投影；高频读取不调主线程。精确 source 时戳和真实桌面 WebView 吞吐仍未完成。

每张图的 `TransportClockObserverNode` 在最终 `PlayHeadPositionNode` 之后发布唯一 `MeterClockObservation`，复用现有三槽 SPSC mailbox；各输出链的 `MeterOutputObserverNode` 仅保留电平采样。时钟节点在 `prefetchBlock` 捕获本块 `ProcessState` 的已冻结 timeline sample、PPQ、BPM、bar 与 barsPerSecond，在输出完成后读取同块引擎 audible time 并单独写入 audibleBar/audibleBarsPerSecond。两种坐标不混用，不从上一个块的缓存推算当前位置。Hub 通过同一 native read handle 消费新观测，`received_monotonic_ns` 仍只表示 Hub 接收时间。

`transport_clock.h` 拥有主线程控制目标的一致性发布及音频侧只读 witness。apply/control 在实际模型修改前标记版本为 mutating，成功后发布 controlGeneration、appliedSequence 与 mode；失败不发布新身份。payload 使用 lock-free u64 atomics，音频读取最多尝试一次，不循环等待。替换 Edit 轮换 ownerEpoch，旧图不能为新 owner 提供有效控制身份。SDK 的每图 `positionChangePending` 查询绑定准确的 NodePlaybackContext，复用已有非阻塞 pending-position getter。

音频 witness 在预取与输出两端核对同一发布版本和 owner，并要求 pending seek 已由音频侧清除后才报告 controlValid。120-byte C ABI 记录将控制身份、渲染与引擎 audible 坐标交给 Rust Hub；旧 mailbox 不能用新 accepted 代际重标。Hosted 用例覆盖 1024-sample 图延迟、同块对齐、seek 和 BPM 转换。audibleValid 仅用于 active playback，停止缓存显式 unavailable。levels v2 独立传递控制有效位和两个坐标域，audioRevision 保持 unavailable；这些位置不证明完整 DSP 批次、严格失败原子性或物理出声时间。

无播放图时，native registry 返回 unprepared 与 ownerEpoch，保留同一个 Hub。主线程在同一 TransportClockState 发布版本中保存已停止的实际 bar、rate、controlGeneration 和 appliedSequence。40-byte stopped reader 对照 owner 与版本读取一次；变更中、播放等待和旧 owner 均为 Unavailable。Stopped 经同一 binary stream 发送，sample clock probe 仍返回 null。无图和有图 metadata 共用递增 generation；首次播放沿用原 stream，旧 registry、响应和控制代际不能重新生效。Stopped 不提供音频帧或 DSP 采用保证。

输入 bank 的唯一 `InputMeterCollector` 按设备 epoch 保留，与图 collector 分开。Hub 通过 `zp_input_meter_acquire` 取得该 collector 的采集权；旧 JSON 遥测复用缓存，不另取 mailbox consumer。`HubSnapshot.input` 保存独立 input registry 和聚合记录，换图保留其 RMS 与 peak 状态，设备换代才替换。输入 metadata 从已打开设备的实际 active channel 掩码生成，不开启设备或权限。统一 registry 将输入本地 slot 偏移到图记录之后，reset 返回同一坐标；请求绑定图代际和输入 epoch，所有目标处理到 reset epoch 后才确认。hosted 回归覆盖停止播放、共享缓存、旧 epoch 引用和选择性 C ABI reset；临时生产 Hub 夹具验证 0.25/0.5 输入 RMS、混合 reset 块后确认及未选输入保留。真实硬件输入显示和窗口传输仍未验收。

## Web消费与Canvas绘制

每 WebView 一个 MeterStore 拥有 registry、最新完整 snapshot 和兴趣并集，独立窗口不共享 JS 对象。全应用 native 唯一 MeterHub。core 定义 Store 契约，runtime 实现 `acceptRegistry`、`acceptFrame`、`readLatest`、`setInterest`、`subscribeMetadata`、`subscribeFrames` 和 `dispose`。兴趣按稳定 endpointId 保存，新 registry 重新解析 slot；owner token 防止旧清理删除新兴趣。高频帧通知只唤醒绘制，不更新 React 或工程状态。

生产 `MeterSession` 已连接原生 stream。Store 在 admission 时绑定 stream/session，拒绝迟到 registry 和旧图帧，选择性 reset 立即屏蔽受影响 slot，保留其他 endpoint。Pull 由共享 rAF 调用 `tick`，最多一个请求和一个 pending buffer；隐藏、长帧、兴趣变化和 stalled 响应按代际丢弃，旧请求未完成时不并发补发。实际 DOM 和轨头 Canvas 绘制通过 `recordPaint` 累计每帧耗时，驱动 60/30Hz 降级和恢复；无兴趣时 scheduler 休眠，metadata 变化唤醒。相同 source 字段的 React 重渲染不重建 watcher。关闭先释放 Store 订阅再停止 Pull，绘制回调异常不能阻止原生关流。时钟校准绑定可见性及 graph/device 代际，换图后的旧响应不能覆盖新映射。每次 stream/session 重建销毁旧实例。真实 WKWebView 验收仍未完成。

停播结构操作替换 Edit 后可能没有 playback graph。此时 `playback_stream_registry` 和 `playback_clock_probe` 返回 `null`，Web 废弃校准、标记 stale 并暂停 Pull，保留 stream，待既有低频检查发现图后恢复。BPM 更新已改为保留 Edit；早期停播 BPM 替换 smoke 只代表当时路径，不能作为当前替换行为的依据。空 registry、空时钟及迟到旧帧仍由 Web 回归覆盖。

Arrangement、Mixer、Device rack、浮动窗口各自的可见集合合并后发送。重复显示同一endpoint不增加采集任务。面板移动、隐藏、卸载、engine release时引用计数清理。input meter即使transport停止仍可能活跃，因此调度条件必须是active interests/data而非`playing`。

每个面板一个 meter Canvas 与 layout rect 表，复用 arrangementScheduler。同一帧读取同一 buffer，React 只订阅 registry、错误与低频生命周期，level 不 setState。静态渐变和刻度按主题尺寸缓存，数字限 10Hz；每 plugin 不建 timer 或 IPC。衰减真相归 Hub，不由各窗口独立重算。

默认可见 60Hz。最近两秒 paint p95>16.67ms 降至 30Hz 并显示 degraded，连续五秒≤12ms 恢复。频谱使用独立 interest 与 binary snapshot，每窗口最多一个 endpoint、全应用最多四个；FFT 不混入 levels。LUFS、true-peak 与 plugin GR 按明确 capability 和独立帧类型发布，不能从 peak 推算。

## 预算和验收

不能只测一个track。新增冻结前的同步负载阶梯为16/64/128 tracks、每轨0/4/8 devices、input endpoints和master/cue、多面板重复显示。平台无法承载的组合必须标出容量，不承诺无限扩展。

带宽按实际布局计算。128 tracks × 8 plugins × 每 plugin input/output 两个 stereo tap = 4096 声道槽。无 source 记录时每帧 `128 + 48 * 4096 = 196736` bytes，60Hz 为 11804160 bytes/s，尚未计入 track/input、source 尾记录和 IPC 副本。这是算术预算，不是吞吐测量。默认只订阅可见面板兴趣，不自动订全部工程。

验收必须同时覆盖：

- 播放中连续改参数，声音按最新完整版本生效，计时与capture无额外停顿；meter延迟和声音延迟分别测。
- registry增删、插件重排/替换、session切换，旧数据绝不落到新slot；多声道正确。
- UI阻塞/隐藏1秒后恢复，只显示最新快照，publisher积压和内存有固定上限；不可丢事件通过序号检测并重同步。
- 多Dock/Mixer显示相同endpoint，只有一个原生publisher和一个session hub；关闭全部视图后无残留订阅。
- input信号在transport stopped时继续刷新；无输入授权时不得采集或路由。
- RMS窗口、peak hold、clip latch、mute/solo、pre/post tap的数值用已知音频验证；无plugin meter能力时明确不可用。
- 同时运行索引、波形、保存和缩放，记录snapshot producer→receipt→paint年龄p50/p95/p99、Canvas耗时、IPC bytes/s、allocations、callback deadline和xruns。

沿用冻结音频/UI阈值。正常负载 meter 采集→Hub→pull→paint 年龄 p95≤33.4ms、p99≤66.7ms，计时映射误差上界计入判断。步骤 3 开始先在已有 Tauri 窗口测 33KiB 与实际 payload，含空闲、1.2 秒 UI 阻塞、120Hz 和双窗口；raw Channel 与单 credit Channel 只作对照，不保留第二生产通道。未测平台标 NOT VERIFIED。ArrayBuffer 仍要边界校验并统计 alloc/copy，不宣称零解析或一次拷贝。
