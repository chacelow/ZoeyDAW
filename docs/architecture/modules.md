# 模块组织与职责分离

适用于 UI、状态管理、运行时、adapter 和函数模块。目录组织与职责分离分别验收；不同文件不等于不同状态 owner。

## 开发前设计门槛

结构设计执行全局 `project-structure-discipline` Skill 的五个问题和自检清单。本文件只补充 ZoeyDAW 的职责、依赖和生命周期契约。

多文件修改在当前 Session 定义 owner、接口、文件职责及验收；单次计划不另建永久文档。UI 同时检查共享控件、Canvas 绘制和命中几何。稳定契约变化更新对应文档。

## 目录与公共入口

- UI 组件默认使用文件夹 + `index.tsx`，主组件和公共 props 从这里导出。
- 独立业务、状态或副作用模块默认使用文件夹 + `index.ts`。非 UI 入口只列公共导出，实现在内部文件；导入入口不启动连接、订阅或定时器。
- 跨模块使用公共入口；内部文件直接引用同模块内部文件，不回引自己的 index。不要把内部 helper 全部暴露出去。
- 类型优先与 owner 同住，确有共享需求再抽出。单个纯函数、小型无状态 helper、简单 hook、枚举、类型和 `.d.ts` 可保留单文件。
- 存量模块随职责改动就地迁移，不借规则更新做无关全仓搬迁。测试与所验证的模块同住。

以下是按需使用的模板，不要求固定文件数量，也不预建空文件：

```text
components/XxxThing/
├─ index.tsx          # 主组件与公共 props
├─ XxxThingItem.tsx   # 子视图
├─ useXxxThing.ts     # React 交互与生命周期适配
└─ XxxThing.test.tsx  # 组件行为测试

someModule/
├─ index.ts           # 公共导出
├─ controller.ts      # 状态与生命周期协调
├─ calculations.ts    # 独立纯计算
└─ someModule.test.ts # 公共行为测试
```

## 职责与依赖方向

| 职责 | 负责 | 不负责 |
| --- | --- | --- |
| UI | 呈现、展示格式、事件转发、局部界面状态 | 工程规则、撤销历史、后端队列、绕过公开接口操作业务 Store |
| 局部 hook/UI controller | 生命周期、DOM 输入与捕获、交互资源清理 | 把全部业务原样搬进一个大 hook |
| 业务 Store/runtime | 权威状态、状态转换、事务、命令协调、资源生命周期 | JSX、具体 DOM 节点、CSS 操作和组件实例 |
| 纯函数/model | 显式输入输出、计算、投影、约束、reducer | React、Zustand、DOM、Tauri、隐式可变全局状态 |
| 外部 adapter | IPC、文件和第三方能力适配，外部输入校验与错误转换 | 具体 UI、第二份权威工程状态 |

UI 与 hook 通过公开 selector 和命令访问业务状态；业务 runtime 通过接口使用外部 adapter。通用层不反向依赖具体页面。应用组合层可以将功能数据适配为通用组件的 props；通用组件本身不读取功能私有 Store。

## 功能 CLI adapter 与原子验收

CLI adapter 放在拥有该领域的 `crates/<owner>/examples/<feature>_smoke.rs`、`crates/<owner>/examples/<feature>_cli.rs`、`crates/<owner>/src/bin/<feature>.rs` 或已有 `scripts/<domain>/` 入口中，命名必须包含业务动作，不使用泛化的 `test`、`debug` 或 `helper`。CLI adapter 与 Web adapter 共享同一请求 schema、Rust/native adapter、状态 owner、错误分类和资源生命周期。Web 只做 IPC 与界面边界映射；CLI 直接调用同一 Rust/native 边界。禁止为 CLI 复制第二套事务、队列、音频时钟、meter 或插件处理逻辑。

一个 CLI 子功能必须在同一进程或明确的受控进程链中完成准备、动作、结果断言和释放，输出机器可读结果并以非零退出码表示失败。它必须能验证真实状态、PCM、MIDI、meter、ACK、延迟、队列和资源释放；不能依赖坐标点击、WebView timer、固定 sleep、模拟电平或 UI 文案。

功能开发顺序固定为 `domain owner → Rust/native adapter → CLI adapter → Web adapter → UI`。先用 CLI adapter 证明功能闭环，再用 Web adapter 接线，最后用 WebUI 验收呈现和交互。性能基准优先在 CLI adapter 测量 typed/native 路径，记录 callback deadline、队列深度、PCM/meter、延迟、分配和释放结果；WebUI 测试不能替代这些证明。

稳定 Agent CLI 的入口是 `crates/engine/examples/zoeydaw_cli.rs` 和根脚本 `pnpm zoeydaw -- ...`。它提供业务动作命令和机器可读结果；`audio_settings` 已迁移为 `audio` 子命令。`crates/engine/examples/*_smoke.rs` 只保留底层 native 回归，不承担面向 Agent 的工程编辑 API。

Rust 核心由根 Cargo workspace 约束。`crates/media` 拥有媒体身份、完整文件指纹与解码校验；`crates/project` 拥有工程事务、取消与发布状态，并依赖 media；`crates/browser` 拥有目录扫描、索引与持久化，不解码媒体；`crates/engine` 拥有播放 lease、generation、FFI 与 native build。核心 crate 不依赖 Tauri。`src-tauri/src` 只在命令边界调度主线程或 blocking worker，并保持原 IPC 字段。

工程保存先注册 `SaveOperation`，再进入 worker；取消与发布共享一个原子状态。引擎通过 `MainThreadDispatcher` 创建和调用进程期保留的 native session，release 关闭资源而不在任意线程销毁 owner。声卡仍由唯一 Tracktion Engine 管理。

`crates/plugin-host` 拥有显式扫描结果与 catalog ID 到原生 PluginRef 的映射，仅从该目录创建隔离 Chain。`crates/plugin-helper` 是单独的可执行文件，调用固定版本 `plughost-helper`，不依赖 Tauri 或 engine。维护源码归 `third_party/plughost/`，构建和资源打包由 `scripts/audio/build-plugin-helper.mjs` 负责。真实 Tracktion Node 到隔离 helper 的脉冲、PDC 与 MIDI 乐器探针已通过；工程 Device 和编辑器生命周期尚未接通。

已授权插件目录独立保存为扫描缓存旁的 `*.authorized.json`，包含版本、catalog ID、PluginRef 和 PluginInfo；读取校验格式、类身份、路径及内容派生 ID，不扫描或启动插件。显式扫描先准备并同步临时目录文件，再在 ScanLease 发布边界原子替换磁盘目录并交换内存映射；取消保留旧授权。`plugin_catalog_entries` 首次调用恢复已授权目录，删除扫描缓存不会删除授权。文件或父目录同步错误仍返回错误，不伪报扫描持久化成功。

`PluginStateStore` 保存带版本头和 SHA-256 内容身份的 `.zdps` 文件，借用解码后校验身份、大小与尾随内容，再分配状态数据。工程存储只负责有界普通文件、路径和摘要校验，不依赖插件宿主。`external` Device 的非空 `stateRef` 在 Normal Save 和 Collect 中均收集到 `plugin-state/<sha256>.zdps`；打开时解析为绝对路径，Save As 再收集到新工程。收集先写随机临时文件，校验并同步后无覆盖发布状态文件，最后发布 manifest；发布前失败清理本次新建文件，保留已有状态。发布后同步失败返回 `PublishedSyncUncertain` 并保留已引用状态。CLAP/VST3 已通过真实 snapshot、删除缓存、Save As、删除原工程、恢复参数和输出的磁盘链路验证；32 MiB 并发读取探针验证状态文件只呈现不存在或完整内容。CLI EngineSession admission 已接通；Tauri Web caller、保存屏障和完整编辑器生命周期仍单独验收。 `crates/engine/examples/vital_engine_smoke.rs` 是不依赖 WebUI 的真实 Windows 功能 adapter。它复用 `PluginCatalog`、`PreparedDevice`、`PlaybackService` 和唯一 native meter reader，原子执行音频配置、工程 open、Vital admission、graph rebuild、transport、note ACK、note-off、helper 状态、Device/Track/Main meter 和 lease release。该 adapter 已暴露并修复设备图重建缺口：Tracktion 的 max speed compensation 将 480-frame 设备块扩展为 528-frame graph quantum，插件必须按 graph quantum 准备，否则 graph factory 存在但处理回调为零。Tauri Web adapter 和 UI 仍是独立验收层。

SettingsDialog 的插件页通过 `plugin_catalog_reserve` 确认窗口与 operation ID 的 admission，再调用 `plugin_catalog_scan`。`ScanOperations` 独立于目录锁，取消不等待扫描 worker；已运行操作直到 lease 释放才允许下次扫描，未运行的 reservation 可直接取消。窗口销毁取消自己的操作。扫描只在显式选择目录后执行，不自动加载插件；页面卸载后不启动迟到的 admission，初始目录响应也不能覆盖新扫描结果。真实桌面验收尚未完成。

`QuantumAudio` 在宿主预分配音频和事件缓冲，按设备 quantum 提交一次，报告额外一个 quantum 的适配延迟。MIDI 与自动化使用分段内采样偏移，输出事件恢复到调用段坐标。维护版 plughost 的 BlockContext 最多携带 16 个 quantum 内 transport 变化，helper 按变化点分段处理并保留 DSP 连续性；后段失败要求 resync，不报告整块未执行。共享映射 format 2 与 extension-build 握手拒绝未修改的 helper。

`IsolatedPluginNode` 通过 `plugin-abi/include/processor.h` 调用 Rust 处理器，复用 ProcessState 的 sample、PPQ、BPM、拍号与循环坐标。`zoeydaw-plugin-abi` 无外部依赖，统一 engine 与 plugin-host 的 Rust C 布局类型及待移交资源守卫，engine 不依赖宿主实现。EngineSession 持有 `IsolatedPluginBindings`，控制线程保留最后一份引用，图引用全部释放后才销毁处理器；owned admission 失败也释放资源。admission 绑定 lease、session、Device ID 与当前 revision，取消、lease 释放或 revision 切换清理未消费的资源。binding 的非等待原子进入检查拒绝并发可变访问，不承诺多图同时驱动同一处理器。

`device_session::PreparedDevice` 从不可伪造的 `PluginSelection` 在独立控制线程创建单插件 Chain，使用 `ProcessMode::Realtime`，暴露有界串行参数、状态、编辑器与恢复请求。请求调用方会等待回执，只能在非实时 worker 使用。`DeviceAudio` 随 typed owned descriptor 移交 native，持有控制线程的存活引用；控制句柄全部释放后，仍要等 native 最后音频引用释放才销毁 Chain。真实 CLAP 探针已验证参数输出、状态恢复、无回调分配，以及两侧先后释放的 helper 生命周期；应用复用既有 EngineSession admission，不新增播放后端。

`IsolatedDevicePlugin` 通过 Tracktion `PluginCache` 创建并进入 `PluginList`，由 per-build `createCustomPluginNode` 替换普通 PluginNode；EngineSession 对当前和候选 Edit 均安装该入口。隔离节点按 Device ID 注册电平，零音频输入的乐器只产生输出电平。用户 bypass 读取与湿信号等延迟的 dry 音频和 MIDI，乐器 bypass 清除音频；故障 latch 与 bypass 分离。真实 CLAP retained Edit 探针验证 session admission、起音、停音、输出电平及补偿 bypass，native 回归验证 owner 拒绝、取消与 revision 退役、dry MIDI 偏移及零回调分配。这些验证尚不包含 Web Device 插入、Tauri admission 调用方、保存屏障或完整自动化。

`PluginDevices` 将 prepared control 绑定到 window、lease、session 和 Device ID。打开编辑器还核对已接受的 catalog ID 与 state hash。control worker 使用递增 instance ID；C ABI context 地址保留到 native 与 control 两侧引用全部释放。编辑器命令和参数事件复用已有有界 worker 队列。helper 拥有原生窗口和取消 checkpoint；Web `adapters/plugin-editor/` 只拥有轮询和编辑生命周期，不新增 document Store。保存工程先提交打开的插件编辑器，再捕获 revision。桌面终验与 helper、浏览器探针分开记录。

`device_session/health.rs` 只观察 SDK 与回调故障，并在同一 actor 内执行显式恢复。恢复从 native accepted 模型取得状态引用和参数；宿主候选在端点发布前完成参数恢复与延迟检查，成功后才推进 instance ID。故障观察复用现有低频 telemetry 与 MeterStreams EventLog，不创建第二个 Hub 或轮询线程。Web `adapters/plugin-recovery/` 拥有单在途请求与项目代际，`plugin-recovery/` 只呈现同一故障动作，工程文档仍由 runtime 独占。

外部 Device 的工程自动化复用 Tracktion 参数与曲线。`IsolatedDevicePlugin` 在控制线程注册精确原生 ID、更新曲线及 authored-curve 位图；`IsolatedPluginNode` 保留同一 wrapper，在补偿图延迟后生成采样偏移事件。单点曲线不依赖 SDK active-stream 标记，音频线程不读可变曲线容器。`IsolatedPluginBinding` 合并当前手动参数与曲线事件，不新增控制线程或队列。真实 CLAP/VST3 retained-Edit 探针覆盖曲线、BPM、斜坡、删除及手动值恢复；Tauri 操作与物理听感单独验收。

显式设备格式变更由同一 `PluginDevices` 的 `configuration.rs` 协调。它复用 `PreparedDevice` 的完整状态与参数接口，在非实时 worker 准备候选；`EngineSession::configurePrepared` 在配置期间保留旧 wrapper，并在驱动或持久化失败时恢复。Native plan 绑定当前文档 sequence、revision、配置和 callback context。apply、配置与显式恢复共用一个 async 更新许可，控制 registry 在 native 成功后更新。编辑器占用时拒绝不兼容格式，旧数据和配置保留。它不提供任意工程事务的失败原子保证。

驱动面板和系统主动格式变化复用同一配置 owner。`device_recovery_plan` 从当前设备构建 observed 配置；计划携带设备启动/停止代际，拒绝变化后又恢复的旧候选。状态查询中的 `PluginDevices::reconcile_configuration` 不与其他音频更新抢占，也不为同一个失败计划反复创建 helper。采用只刷新运行配置、路由和图，不重新打开驱动或覆盖偏好。格式不匹配的隔离节点在替换前输出静音与 all-notes-off，失败信息由既有 device/issues 状态呈现。关闭 lease/window 清理失败记录。

`crates/engine/native` 将协议模型、无设备分析与 EngineSession 分为 `model`、`analysis`、`runtime` 三个 OBJECT targets。分析不依赖 runtime，runtime 不依赖分析；根 `playback_bridge` 保留 C ABI。Tracktion/JUCE 实现只进入最终 `zoeydaw_playback` 静态库，OBJECT targets 仅继承编译配置，不链接带实现源的 vendor INTERFACE targets。

`analysis.rs::WaveformWindows` 拥有每个窗口的 overview/range 取消代际；两类请求各自复用窗口持有的 `Arc<AtomicU64>`，job 只保留 `WaveformTicket`，原生解码只在同步调用中借用回调。窗口 ID 由 Tauri 注入，不从 Web 请求取得。窗口销毁取消两类 job，普通 range 取消不影响 overview 或其他窗口；service 释放也取消仍被 job 持有的工作。源解码与 Web 缓存协议不变，不再使用进程全局 waveform generation。

`analysis/waveform_cache.cpp` 拥有进程期的只读范围 LRU，缓存原始 samples 或各级精确 extrema，只有同级/更细且覆盖请求的数据可复用。`waveform.cpp` 保留唯一解码、细到粗合并和 binary 编码路径；缓存锁不跨解码或处理。缓存保留的 float 载荷受 32 MiB/64 项限制，在途引用可独立存活。身份来自路径、OS file ID、大小和修改时间，不冒充每次请求的内容 hash 校验。窗口取消继续由 Rust job ticket 独占。

`protocol/waveform-range.json` 定义 range 二进制头与 float32 载荷。既有生成器生成三端布局，C++ 波形头位于 analysis 而非 runtime。Rust job 同步借出有界输出分配回调，native 写入 Rust 持有的字节，Tauri 只包装 `ipc::Response`；Web 边界校验后恢复既有 `WaveformRange`，缓存和 Canvas 不持有 wire 状态。

`runtime/audio_clips.cpp` 拥有 Audio Clip 创建、Warp、源窗口、淡变及源渲染任务处理；`runtime/meter_registry.cpp` 拥有 meter registry、图观测接线及 transport 遥测。两者保留 `EngineSession` 成员方法和同一 Arrangement 状态 owner，不创建第二份工程或播放生命周期。

录音 journal 归 `runtime/recording_journal.cpp`，take 生命周期仍归同一个 `EngineSession`。`recording_recovery.cpp` 读取受限磁盘描述并验证当前 lease/session，显式重认领后复用现有结果查询、媒体检查与录音发布。ACK 将 journal 标记 published，不删除磁盘恢复记录或音频。Web backend 持有单次恢复许可，文件菜单 Dialog 只持有呈现状态；恢复的新轨由原 `applyRecording` 与 runtime 文档 owner 发布，不创建第二录音后端或文档 Store。

`runtime/document_apply.cpp` 保留 `EngineSession::apply` 的协议准入、候选准备、增量应用与 accepted 发布；状态仍由同一个 EngineSession/Arrangement 持有。`engine_session.cpp` 负责 owner、生命周期与现有控制入口，事务文件不创建第二个 session、时钟或文档 Store。

`BuiltinDevice` 的参数属于各自图内 wrapper；处理资源以未准备、待继承和已准备三种状态表达。兼容 sample rate/block size 的候选 wrapper 保留同一 DSP 资源，准备时不采用候选参数或清空历史，实际处理时才采用自己的参数。处理中的有效设置、enabled 与 DSP 历史归资源，旧 wrapper 释放不销毁仍被新图保留的资源。此共享只用于同一 Engine、同一个 player 串行处理的图换代，不允许并发驱动同一处理资源；格式不兼容时独立准备资源。

Builtin 的初始化自行清理新资源或保留兼容资源，通过 SDK 的 `needsResetAfterInitialisation()` 能力声明避免框架在准备结束后再次清空继承状态。普通插件保留默认 reset 行为。显式 reset 请求属于处理资源，旧 wrapper 释放前尚未消费的 reset 仍由继承图采用；未准备 wrapper 的 reset 在首次实际处理时执行。

Rust `realtime/meter_hub.rs` 拥有 Hub 控制、图与输入 reader 的安装、reset 和快照查询。私有 `meter_hub/worker.rs` 执行聚合、reset 确认与发布循环，借用同一 `Shared`，不创建第二个 Hub 或可变状态 owner。worker 随 `MeterHub::start` 启动，Drop 发出 stop、唤醒并 join。`HubSnapshot.transport` 用 `HubTransport` 区分 Audio、Stopped 和 Unavailable；无图停止也保留同一个 Hub。

`runtime/source_observations.cpp` 拥有 SourceRegistry 到图专属 AudioClipPlayhead 的不可变投影。EngineSession 的 sourcePlayheadGraphs 只在主线程按 Edit 身份保存 graphPosted 结果；Arrangement 和候选 Preview 的启播/接受顺序不创建另一套采集 owner。节点在既有处理点发布源时间、reference sample 和处理 sampleRate。Arrangement 使用 transport 锚点；Preview 图根通过 `source_clock.cpp` 将自己的 processing reference 与既有设备计数配对，在编排无图时仍可观测。Rust 私有 native_reader/sources.rs 校验身份与对应锚点的采样关系，再进入原 48-byte WireSource；没有新增线程或 wire layout。Web `realtime/source-position.ts` 按 owner、Clip 和 source 身份选择有效观测，app realtime adapter 管订阅与兴趣释放，SourcePlayhead 组件只投影显示。时间域边界见 [实时同步设计](../research/realtime-sync-design.md)。

sourcePlayheadGraphs 的槽位在建图前预留，首次槽位为空时仍表示无已发布观测。graphPosted 只替换该槽位的共享指针，准备失败或候选取消保留旧指针。槽位迭代器只存活于主线程同一次同步 `EditPlaybackContext::createNode` 调用；回调不跨调用保留。此发布边界不表示音频采用。

`runtime/transport_clock.h` 是 EngineSession 控制目标的主线程发布和图内 witness，按 Edit owner、完整 u64 代际与请求 sequence 关联音频块。每个输出链的 `MeterOutputObserverNode` 只采电平；`transport_clock_node.cpp` 在最终 `PlayHeadPositionNode` 之后发布同块渲染坐标与引擎 audible 坐标。SDK 的每图查询和最终根包装器绑定精确 context 生命周期。Rust `native_reader/transport.rs` 拥有 120-byte C ABI 时钟结构及校验，从 NativeMeterReader 的同一公开面提供数据。它没有新增时钟、线程或 WebView 通道，也不提供完整 document audioRevision 或物理出声时间保证。

`NativeMeterRegistry.graph` 区分 prepared 的真实 sampleRate 与 unprepared 的 Edit ownerEpoch。无图 metadata generation 与有图 generation 共用递增计数。`TransportClockMutation` 在同一版本内保存主线程停止位置，40-byte stopped reader 只保留共享只读状态和 ownerEpoch。`refresh_meter_hub` 与 stream registry 始终返回显式 registry，`transport_frame.rs` 将同一 HubSnapshot 投影为 levels v2。`native-transport.ts` 拥有 Web MeterSession、transport 兴趣、帧订阅、可见性和清理，通过具名 `NativeTransport` 公开生命周期；它向既有 BackendTelemetry 接口转发有效音频或停止位置。状态查询只保留设备、issues 和录音缩略图。

Web 领域计算、快照校验和波形范围 schema 归 `@zoeydaw/project-core`，不依赖 app、React、Zustand、Tauri 或 runtime。`@zoeydaw/project-runtime` 拥有 vanilla store 工厂、编辑历史、preview、后端队列和 lease 生命周期，只依赖 core 与 `zustand/vanilla`。包导入不创建运行实例；app 组合层注入 backend 和轨道高度，React 绑定留在 `stores/useProjectState.ts`。测试和 Gallery 从 runtime 的 `./testing` 入口显式取得模拟实现。

`runtime/project-editing.ts` 独占撤销/重做历史、连续编辑 token、临时 preview 与编辑前快照；`runtime/recording-publication.ts` 独占录音 journal、待接受条目与 receipt。二者通过业务动作协作，读取同一个 Store，不保存另一份当前文档。编辑完成或取消后才排空 journal；后端拒绝先恢复 accepted 文档和历史，再重放独立录音。

`runtime/project-runtime.ts` 保留 backend 注册、lease、revision、accepted checkpoint 和 transport 协调。该文件仍超过 400 行，因为这些入口共同维护同一连接与接受边界；编辑和录音状态不再寄存在协调器闭包。公开 exports 与消费者命令保持原样。

`runtime/automation-recording.ts` 拥有 Touch/Latch take、原目标曲线、实际观测位置和发布重入保护，通过 `project-editing` 写入唯一文档。App `useAutomationGesture` 绑定控件手势与 epoch 清理；native 继续消费已有包络 DTO，不新增原生录制 owner。`transport-position.ts` 独立保存音乐位置换算，不持有后端生命周期。

Session 文档规则与内容 codec 归 `@zoeydaw/project-core/launcher` 和 `./clip-content`。`runtime/project-runtime.ts` 通过原 connection FIFO 发送演奏命令并保存只读观测。`project-save-wait.ts` 只拥有保存等待的订阅与取消生命周期，不持有另一份文档或 checkpoint。App `adapters/launcher.ts` 提供 authored actions；`sections/SessionPanel` 呈现场景矩阵并选择共享 Clip 编辑器。

原生 `runtime/launcher.cpp` 将场景 ID 映射到 Tracktion SceneList/ClipSlot 索引，并从同一 sync point 调度 LaunchHandle。原 Arrangement 继续持有轨道、效果器、源观测和 DeviceManager。`audio_clips.cpp` 负责片段本地播放时间中的淡变与源标记。维护的 SDK source switcher 按处理后的 handle 状态选择音频输入，不能等待主线程 mode 镜像后才停止叠加编排。状态观测复用既有 poll，不新增时钟或 Hub。

ESLint 检查两包的普通、类型、转发与动态导入。`scripts/check-core-boundaries.mjs` 检查 Cargo 本地依赖和自有 native include 方向；根 `check` 与 `test:architecture` 均运行该检查。公共包入口使用精确 exports，不暴露内部 connection 或测试文件。

## 状态和复用逻辑放置

按消费者、语义与生命周期决定，不按“以后可能复用”提升作用域：

| 内容 | 默认位置与所有权 |
| --- | --- |
| 单组件焦点、展开、指针捕获与临时输入 | 组件内部，复杂时放同目录局部 hook/controller |
| 单功能筛选、导航与编辑交互 | 功能目录；确需共享时由共同上层、功能 Provider 或 Store 拥有 |
| 工程、撤销、播放与后端同步 | 现有 project Store/runtime，通过 adapter 公开接口访问 |
| 跨页面设置和通用控件环境 | 应用共享层，不由某个页面私有 Store 充当全局来源 |
| 不认识业务的 UI 交互 | 共享 UI 包，通过 props/context 接收应用能力 |
| 无副作用的计算与规则 | 所属功能 model；相同语义的跨功能消费者确实出现后再提升 |

函数复用计算，controller 复用有生命周期的行为，hook 适配 React。调用同一个 hook 多次不等于共享状态。可派生结果直接计算，不维护第二份需要同步的 Store。

## 状态与生命周期验收

每份业务状态只有一个 owner。其他模块消费只读数据或派生结果；Canvas、撤销与后端同步遵守同一编辑所有权，不各自维护可写工程副本。

连接、订阅和定时器由明确的启动与对应清理管理。需要多实例时按实例创建状态与资源；保留当前单项目产品约束，不为假想多项目需求铺结构。外部输入在边界校验，内部使用可信类型。

React render 只计算当前视图，不发布外部 store options、不写供事件或后续 render 消费的 ref。需要保留的范围、lane 分配与事件回调在 commit 的 layout effect 更新；放弃的 render 不得改变已提交视图。Blob URL、Observer 和异步操作绑定创建它们的 owner，卸载后释放资源并拒绝迟到响应。共享 UI 的行为回归由根 `test:shared` 执行。

删除或替换功能时，变更集中于该功能、公共契约直接消费者和组合入口。卸载后释放其资源，旧回调不能写入新实例。移除共享基础模块本来就需要迁移消费者，不承诺零依赖或零改动。

同一不变量的可变状态由一个协调器拥有，不制造多份相互同步的 manager。公共入口应让读者找到 owner、修改入口和清理路径。

## 文件规模与拆分

行数、命名、按变化原因拆分及例外，以全局 `project-structure-discipline` 为唯一通用规则，执行 400 行预警与 800 行必拆。数据与夹具例外必须位于明确标识的目录；业务逻辑不能靠文件名或登记基线豁免。

`pnpm check:file-size --report` 是当前盘点入口。`tooling/file-size-baseline.json` 暂时追踪存量超限，检查只阻止新增超限和继续增长，尚未完整执行硬上限及例外分类。该工具边界不构成继续向超长文件追加的许可；收敛到 Skill 口径与拆分存量仍保留在 todo。

`adapters/runtime.test.ts` 保留 runtime 生命周期、backend 注册及工程初始化回归；编辑/撤销、transport/MIDI/录制、保存确认分别位于 `runtime-edits.test.ts`、`runtime-transport.test.ts` 和 `runtime-save.test.ts`。共享 `runtime-test-backend.ts` 仅导出延迟 backend 工厂，不安装 backend、不注册 hook；各测试文件持有自己的 lease 与清理状态，沿用 Vitest 的文件隔离。

## 自动检查与相关契约

可机械检查的跨层导入、公共入口和 token 使用通过已有 lint、类型或行为测试落实。交付时区分自动检查和仍需人工判断的部分；文档中的硬规则不等于 CI 已覆盖全部设计判断。

- 工程数据和运行时：[stores](../../apps/web/src/pages/project/stores/README.md)、[adapters](../../apps/web/src/pages/project/adapters/README.md)。
- 外观、共享控件与 Panel：[项目面板与共享外观](project-panels.md)。
- 操作与运行：[开发环境与操作边界](../agents/setup.md)。
- 参考选型与反馈复盘：[DAW cookbook](../research/daw-cookbook.md)、[现状评审](../research/daw-current-review-2026-10-22.md)、[重构计划](../research/daw-refactor-plan-2026-10-22.md)。
