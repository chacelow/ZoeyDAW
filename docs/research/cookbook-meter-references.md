# Meter 与实时反馈参考目录

本文补充三份原始参考清单，保留两份外部 meter 评审在批准实施计划中列出的全部线索。外部评审原文未随计划提供，本文不虚构其作者、标题、原句或测量环境。S 表示已读具体源码，D 表示一手文档声明，U 表示未核实。只有明确注明的 S 支持当前机制判断。本文不是运行验收报告。

## 架构纠错

生产 meter 传输采用 single-flight binary pull。每个 WebView 最多一个 snapshot invoke 在途，完成后仅存 pending buffer，下一 rAF 校验、采用、绘制并发起下一次请求。可靠事件另用有序 Channel 与 receipt。旧 meter Channel 加 receipt 方案不再是生产契约。

| 证据 | 已核实事实 | 设计边界 |
| --- | --- | --- |
| S，安装的 Tauri 2.9.4 `src/ipc/mod.rs` 96–115、189–204 行 | `Vec<u8>` 转成 `InvokeResponseBody::Raw`，`Response::new` 接受该 body | snapshot 可返回 raw response，不先序列化 JSON 数组。不证明零复制或无需边界解析 |
| S，安装的 Tauri 2.9.4 `src/ipc/channel.rs` 138–180、318–330 行 | Channel 带递增 index；较大 body 先存 `ChannelDataIpcQueue`，前端 fetch 后删除 | 需要应用自己的流控。不能概括为 Channel 必然无界，也不能把每次 send 成功视为 UI 已消费 |
| S，安装的 `@tauri-apps/api` 2.11.1 `core.js` 76–114 行 | 未按序到达的消息保存在 pendingMessages，等前序消息后交付 | 有序与 latest-only 是不同语义。meter 不需要按序补画历史 |
| S，[hollance 原文](https://audiodev.blog/levels-plugin/) | `compare_exchange_weak` 累积最大值，消费者 `exchange(0)` 读取并清零 | 不能照抄为多个窗口独立清同一峰值。当前设计由唯一 Hub 消费 audio mailbox，窗口只读 Hub 快照 |
| S，[arc-swap 1.9.3 changelog](https://docs.rs/crate/arc-swap/1.9.3/source/CHANGELOG.md) | 1.9.0 修正错误内存序证明并升级部分 ordering 为 SeqCst，1.9.1 再补一处；1.9.3 的 RwLock strategy 为显式 opt-in，默认策略不变 | 固定 `=1.9.3`。仅在非实时 Hub 发布 Arc，audio 不读取或析构 ArcSwap 对象 |

安装源码版本依据根 `Cargo.lock` 的 Tauri 2.9.4 与 `node_modules/.pnpm/@tauri-apps+api@2.11.1`。可公开复核的 Rust 源码入口为 [Tauri 2.9.4 ipc](https://docs.rs/tauri/2.9.4/src/tauri/ipc/mod.rs.html) 和 [channel](https://docs.rs/tauri/2.9.4/src/tauri/ipc/channel.rs.html)。本轮未复制这些实现。

二手纳秒数、带宽和 Canvas benchmark 不作为 ZoeyDAW 成绩。不使用“唯一最优”“一次拷贝零解析”“Channel 必然无界”作为结论。实际帧字节数为 `128 + 48 * slotCount + 48 * sourceCount`。4096 个声道且无 source 记录时为 196736 bytes，不是早期仅计算两个 Float32 的 32768 bytes。

### 2026-10-23 现有 API 复核

不能把“找到锁”直接推导成“必须修改整套库”。先区分 callback、prepare、message thread，并核查锁定版本与当前官方文档。Context7 查询 Tracktion `/tracktion/tracktion_engine`、JUCE `/websites/juce_master` 后，以已安装源码校正文档的简化描述。

| 问题 | 已有 API 与源码事实 | 决定及验证边界 |
| --- | --- | --- |
| 每轨最终输出采集 | `PluginNode::getPlugin()`、`Node::getDirectInputNodes()`、`visitNodes()` 和既有 per-output hook 可以构造 graph-owned observer。依赖在图初始化前登记，不能只缓存裸指针 | 隔离程序未调用本轮新增的 track/build/post hooks，在真实 Edit 图验证 normal/mute/solo/stopped/fence。2 workers × memory sharing 开关 × pooling 开关共 20 场景通过，Release 与 ASan/UBSan 均通过。不是多输出、任意 rack 或规模性能证明；生产替换尚未完成 |
| 旧 meter 无 client 是否无锁 | `LevelMeasurer.cpp::processBuffer` 先获取 clientsMutex 再检查空 client；client 批更新仍有 SpinLock。当前 develop 源码也相同 | 不能靠不订阅或预热声道宣称该路径零锁。轨道 meter 可用公开删除 API；原生 master meter 的插入开关仍需单独处理 |
| 完整快照是否必须自造 | 已 vendored farbot `RealtimeObject<T,realtimeMutatable>` 的 RT 发布为固定复制与 atomic 操作，非 RT 消费使用 mutex/CAS | 是可用候选，不应遗漏。当前 31 行三槽实现保留 trivially-copyable、always-lock-free 和新值 bool 语义；没有性能证据支持仅换库名就更快。两者都仍需峰值累计与 reset 协议 |
| 数值统计 | JUCE `AudioBuffer::getMagnitude` 使用 FloatVectorOperations；`getRMSLevel` 自身循环累加并 sqrt | 单纯 peak 可复用；当前需一次扫描同时获得峰值、能量、clipCount 和 finite 状态，不能把多次扫描加 sqrt 当免费优化。需用相同负载比较 |
| 图准备与发布 | observer prepare 可以准备自身资源，但不证明整个 graph setNode 成功，更不等于 audio adoption | 不为 meter factory 捆绑扩大生命周期修改。精确 posted/adopted 通知分别论证，不能删掉事件语义来消除补丁 |

官方入口：[Tracktion graph Node](https://github.com/Tracktion/tracktion_engine/blob/develop/modules/tracktion_graph/docs/tracktion_graph_part_2_node.md)、[当前图构建 API](https://github.com/Tracktion/tracktion_engine/blob/develop/modules/tracktion_engine/playback/graph/tracktion_EditNodeBuilder.h)、[当前 LevelMeasurer](https://github.com/Tracktion/tracktion_engine/blob/develop/modules/tracktion_engine/playback/tracktion_LevelMeasurer.cpp)、[JUCE AudioBuffer](https://docs.juce.com/master/classjuce_1_1AudioBuffer.html)。文档、源码与本机隔离运行分别记证据，不将 benchmark 或结构推导称为生产验收。

生产切换已完成并由 `crates/engine/native/tests/meter_observer_tests.cpp` 保留回归。新增 `wrapTrackOutput` 字段及三个上游调用点已删除，改为组合既有 `insertOptionalLastStageNodeForDevice`。9 项 native CTest 通过；observer 测试覆盖两 worker、sharing/pooling 四种组合、五种播放状态和单/共享输出两种拓扑，共 40 组实际样本与能量守恒场景。graph/observer 的 ASan/UBSan 测试通过，Rust engine cargo check 通过。没有测量与旧实现的性能差，不能称为已证明更快。图生命周期通知和 legacy meter 抑制仍保留为临时上游扩展。

`AudioClipBase::getPlayhead()` 已有真实源位置 API，`AudioClipPlayhead::getPosition()` 内建过期判定，不能用 timeline position 替代。锁定实现 `model/clips/tracktion_AudioClipBase.h:20-55` 使用含 optional position 和更新时间的 `std::atomic<State>`。本机 AppleClang/arm64 隔离程序测得对象与对应 State 均为 24 bytes，`is_always_lock_free=false`、`is_lock_free=false`。这是当前平台的原子实现属性，不是延迟测量；现有 WaveNode 已调用该发布路径，不能把新 meter 分支零锁外推为整个播放图零锁。源码和 probe 不支持未经评估直接替换全部 playhead 实现。

## 全部专项线索

未读取具体实现的条目保持 U 或 D，不用搜索摘要升级成源码证据。未明确逐文件许可的代码不复制。

| 原始名称与入口 | 证据状态 | 适用问题与限制 |
| --- | --- | --- |
| [hollance/levels](https://github.com/hollance/levels)、[audiodev.blog 原文](https://audiodev.blog/levels-plugin/) | S 原文 CAS/exchange；D 仓库声明 MIT | 单消费者峰值保存、显示衰减。原文 60Hz timer 和两秒 hold 不替代本项目真实 dt 与 600ms hold |
| [nih-plug PeakMeter](https://github.com/robbert-vdh/nih-plug/) | U，仓库已定位，具体 PeakMeter 文件及许可尚未核查 | GUI 显示组件不等于全应用采集与多窗口协议 |
| [Firewheel peak_meter](https://docs.rs/crate/firewheel-nodes/0.12.1/source/src/peak_meter.rs) | U，搜索定位发布源码入口，尚未读取 | 比较 tap 与上下文所有权，不新增第二设备引擎 |
| openDAW PeaksWriter；[已确认项目](https://github.com/andremichelle/openDAW) | U，指定实现未定位。搜索仅返回第三方 opendaw-test 文档 | 不把第三方文档当上游源码，AGPL 采用另核许可 |
| [clearlysid/tauri-wgpu-cam](https://github.com/clearlysid/tauri-wgpu-cam) | D，已读 README。未取得明确代码许可 | native wgpu surface 摄像头示例，不证明 meter pull 慢，也不是 WebView 共享内存 |
| Ardour meterbridge | U，具体路径和版本尚未核查；项目研究见 [既有 DAW 深读](open-daw-architecture-2026-10-22.md) | 多通道计量 UI、tap 语义，不能据产品名称声明已审计 callback |
| Meadowlark/Dropseed，[定位入口](https://codeberg.org/Meadowlark/Dropseed) | U，搜索定位，未核查当前源码和许可 | 模块化引擎参考，不替换 Tracktion owner |
| Hikaru OpenLive | U，搜索出现 Bluemacro/openlive 与 KaiserKauf/openlive，原始身份未确定 | 保留名称，不从多个候选任选一个冒充原报告来源 |
| kuanish-dev/Dawcraft | U，精确检索仅命中二手 AI Release 页面，原始源码未核实 | 不用二手功能宣传作为实时性证据 |
| triple_buffer | U，精确版本和源码未给出 | 对照单生产者三槽所有权。不得用多个 worker 共写一个 SPSC 槽 |
| [arc-swap 1.9.3](https://docs.rs/arc-swap/1.9.3/arc_swap/) | S，版本 changelog 如上；API 与逐文件许可采用前另核 | 非实时 Hub 到多窗口只读快照，不进入音频 callback |
| left-right/evmap | U，精确版本、源码及许可未核实 | 读写发布与回收机制参考，不能凭名字保证实时安全 |
| seqlock | U，未指定实现 | 普通对象并发读写的数据竞争不能只靠前后序号检测消除 |
| rtrb/ringbuf | U，rtrb 指定版本未核实；ringbuf 既有证据见 [原子目录](cookbook-atomic-references.md) | 有界事件或样本队列，明确 producer、consumer 和 overflow，不替代峰值累计 |
| traKmeter | U，精确 URL 与文件许可未核实 | 专用计量算法参考，不据名称宣称符合某标准 |
| ebur128 | U，未指定库与版本 | LUFS 独立实现、许可和语料验收，不从普通 RMS 推导 |
| PPM/VU/BS.1770 | U，未指定规范版本与原始文本 | 普通 300ms RMS 不称标准 VU 或 BS.1770 认证 |
| Chrome AudioWorklet | U，原报告文章精确 URL 未给出 | 浏览器音频线程模型不替代 native Tracktion callback 验证 |
| Tabularis IPC 税，[候选原文](https://tabularis.dev/blog/why-tabularis-runs-on-tauri) | U，搜索定位，正文未核查 | 应用经验不等于本机 WKWebView 相同 payload 的测量 |
| Tauri Changelog 访谈，[#560](https://changelog.com/podcast/560)、[#497](https://changelog.com/podcast/497)、[JS Party #265](https://changelog.com/jsparty/265) | U，搜索定位多个访谈，报告具体所指未确定 | 保留候选，不拼接成虚构的一篇性能报告 |
| [freeCodeCamp 高频 React 文章](https://www.freecodecamp.org/news/high-frequency-real-time-data-in-react-from-ring-buffers-to-offscreencanvas/) | D，已读开篇及外部 store 示例，未复测文中 benchmark | 将高频值与 React 结构状态分开。示例 ring 读取会分配和复制，不能概括为全部常数时间或零分配 |

## 检索记录与验收入口

已查询 GitHub 的 openDAW PeaksWriter、Firewheel、nih-plug、tauri-wgpu-cam、Dropseed、Hikaru OpenLive 与 Dawcraft。检索结果与已读取正文分别记级。`site:x.com Tauri audio meter Channel` 没有域内匹配，搜索工具放宽域名后返回的 GitHub 和 docs.rs 结果不算 X 讨论。

| 反馈 topic | 当前路径 | 差距与实施 | 验收 |
| --- | --- | --- | --- |
| 多窗口清峰相互干扰 | native `EngineSession::telemetry`、runtime `BackendTelemetry.levels` | graph-owned tap mailbox → 唯一 MeterHub → 每窗口只读过滤 | 双窗口、短脉冲、1.2 秒阻塞，锁存不丢 |
| 高刷或慢 UI 产生积压 | app backend `native.ts::schedulePoll` | single-flight pull，rAF 上限 60Hz，隐藏代际丢旧响应 | 33KiB 与实际帧，60Hz、120Hz、双窗口、主线程阻塞 |
| reset 使无关 endpoint 消失 | 待建 MeterStore reset 基线 | 每 endpoint 保存 expectedSlotResetEpoch，header 只表示全局顺序 | reset(A) 后 B 继续显示，旧 A 不复活红灯 |
| meter 与声音不同步 | connection telemetry、native graph stamp | device sample 与 reference sample 成对映射，clock probe 保留 RTT/2 不确定度 | 生产年龄与块年龄分开，p95≤33.4ms、p99≤66.7ms |

完整实施契约见 [实时同步设计](realtime-sync-design.md)。传输 spike 必须在已有 Tauri 窗口运行。WKWebView、WebView2、WebKitGTK 分别报告，未运行的平台标 NOT VERIFIED。
