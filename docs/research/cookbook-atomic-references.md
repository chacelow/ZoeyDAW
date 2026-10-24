# 原子模块参考目录

核查日期：2026-10-23。本文保留用户第三份清单的全部名称，按模块记录来源、许可证、证据强度和适用边界。本文属于选型解释，不是已接入的能力清单。本轮只读文档和源码，没有安装依赖、运行参考项目、修改生产代码或执行构建与测试。

总入口见 [DAW cookbook](daw-cookbook.md)。音频引擎与 Rust 生态的完整比较见[音频参考目录](cookbook-audio-references.md)，Canvas 调度、可见范围绘制和播放线见[Canvas 参考目录](cookbook-canvas-references.md)。这里不重复两个章节的实现分析。

当前批准范围已包含 Link、plughost 0.1.5、Session 和录音等完整接线。下文的“暂缓”保留研究时点的判断，不是本轮实施排除项。新增 meter 来源与对旧传输方案的纠错见 [meter 专项目录](cookbook-meter-references.md)。采用前仍固定版本、逐文件许可和依赖锁，PDC 优先复用 Tracktion PluginNode 与 SummingNode/ConnectedNode，不新增第二套图补偿。

## 2026-10-23 现有 API 优先复核

当前决策先区分已有 API 误用、可配置能力和真正缺口，不因发现 lock/new 就默认修改上游。锁定版本源码优先于概括性文档，性能结论另需真实负载。

| 能力 | 已有实现与接入决定 | 不能据此承诺 |
| --- | --- | --- |
| 普通工程编辑 | 保留同一 Edit，复用 Clip setter、PluginList、AutomatableParameter 与 `TransportControl::ReallocationInhibitor`，不为普通编辑新建整份 Edit | inhibitor 析构只减计数，延迟重建由后续 timer 处理，不是 graph 发布确认。已有 context 的 rebuild 保留 playhead，但仍执行 output prepare 和 MIDI clock reset，声音连续性必须 capture 验证 |
| 输入路由及 arm | 使用 `InputDeviceInstance::setTarget` 与按 target 的 `setRecordingEnabled` | `setMonitorMode` 是设备级，不表达同输入两轨独立 In/Off；Auto 的 clip-playing 条件也不能由 arm 冒充 |
| 录音队列 | 复用 [JUCE AbstractFifo](https://docs.juce.com/master/classjuce_1_1AbstractFifo.html) 的 SPSC 索引，预分配样本存储和满队列策略由录音 owner 负责 | 构造容量的可用项为 N−1，partial write 不等于整块成功。不能用 SingleThreadedAbstractFifo 跨线程 |
| 后台写盘 | [ThreadedWriter](https://docs.juce.com/master/classjuce_1_1AudioFormatWriter_1_1ThreadedWriter.html) 已有有界 FIFO、后台 writer 和 full=false，应先比较而非声称不存在 | 锁定 `juce_AudioFormatWriter.cpp:283,294` 忽略底层 write 返回值。原样使用无法报告磁盘失败；writer 队列之外的输入链仍有锁，不能宣称整个引擎无锁 |
| Filter | JUCE StateVariableTPTFilter 已有 cutoff/resonance，多声道 prepare；使用薄 Plugin wrapper | Tracktion LowPass 没有所需 resonance，不为此修改它或自写滤波算法 |
| Delay | JUCE DelayLine 已有预留最大长度与 fractional sample 操作，配合既有平滑器 | Tracktion Delay 仅增长时扩容，不是每块分配；但整数延迟、mix 和平滑语义不同，预热不解决全部差异 |
| Reverb | Tracktion/JUCE Reverb 在 setSampleRate 分配，setParameters 更新目标值，不因 roomSize 每次扩容 | 独立 size 与 RT60 是语义缺口，不是已证明性能差。引入 Signalsmith 前核对该语义和运行代价 |
| Sampler | TE 已有 root/range/excerpt/gain；JUCE Synthesiser 支持预先 addVoice 和 stealing | TE 默认32声部且回调分配/释放，JUCE Synthesiser render 仍持锁。不能仅换类名就声称64声部零锁、特定 steal/crossfade 已满足 |
| 波形概览 | [JUCE AudioThumbnail](https://docs.juce.com/master/classjuce_1_1AudioThumbnail.html) 与 Engine 的现有 cache 可后台生成 min/max，不需要假 Component | getApproximateMinMax 是低分辨率近似，不能替代深缩放 raw samples；setReader 持有 reader/file handle 直到 clear 或换源 |

Tracktion 文档入口为 [TransportControl 源码](https://github.com/Tracktion/tracktion_engine/blob/develop/modules/tracktion_engine/playback/tracktion_TransportControl.cpp)。以上已由当前 vendor 调用链与 Context7 官方文档交叉核查。Meter observer 的实际隔离验证、farbot 候选和上游最小缺口见 [meter 专项复核](cookbook-meter-references.md#2026-10-23-现有-api-复核)。

## 结论与证据口径

保留现有 Tracktion Engine 和 DeviceManager 的唯一 owner。清单中的 transport、mixer、stretch、plugin host 和 CPAL 不能各自形成第二套播放链路。当前优先级是核实现有引擎的接线和行为，不是把每个原子模块换成独立第三方库。

| 标记 | 本文含义 | 不能据此推出的结论 |
| --- | --- | --- |
| S | 已读具体源码、包 manifest 或许可证文件；说明所核实的范围 | 未运行路径的实时性、正确性和平台兼容性 |
| D | 作者 README、官方 API 文档或官网声明 | 宣传中的性能、成熟度、完整实现和项目内已生效 |
| U | 原始链接缺失、名称不唯一，或当前来源无法访问 | 项目不存在、不能使用，或某个搜索命中就是原清单所指 |
| 直接用 | 当前边界内可复用的现有能力，或满足许可与接口约束后可独立使用的工具 | 已经添加依赖或已通过本机验收 |
| 参考 | 借鉴模型、算法边界或交互，不复制整套运行时 | 已获得任意文件的复制许可 |
| 暂缓 | 缺少身份、许可、接线需求或验证依据，不纳入当前实施 | 永久排除该方案 |

表中的许可是本次读取到的声明，不代替发行审查。采用前仍需固定版本或 commit，读取目标文件及第三方依赖的许可，保留归属。GPL、AGPL、LGPL、MPL 的义务不能因经过 WASM、FFI 或 IPC 就自动消失。未明确授权的公开源码不能按 MIT 处理。

Context7 已查询 `/bbc/peaks.js` 的预计算数据与 Web Audio 路径，以及 `/rustaudio/cpal` 的输入流与缓冲示例。CPAL 首次查询超时，重试后取得文档。Context7 指向的 `master` 包含 v0.19 升级内容，而本次 docs.rs 显示 CPAL 0.18.2，本文不混用两版 API。[W3][R1][R3]

## Transport、时钟与节拍器

| 原清单名称与一手入口 | 已核实的范围与许可证 | 对 ZoeyDAW 的决定 |
| --- | --- | --- |
| `midi_clock_sync`，原入口 [lib.rs](https://lib.rs/crates/midi_clock_sync)，[发布包 0.1.0](https://docs.rs/crate/midi_clock_sync/0.1.0) | D：transport、BPM automation、bar/beat/tick 和单位换算。README 声明 MIT。S：`process_block` 只在块起点读取自动化 BPM，按当前块 BPM 累计 beat；`seek_to_beat` 用当前 BPM 换算 sample position。[C1] lib.rs 与 crates.io API 本轮均返回 403，以发布包源码补证。 | 参考。学习单位和状态分离，不另设 transport owner。“no drift”不等于对块内 tempo ramp 精确积分，带 tempo map 的任意 seek 也不能只用当前 BPM。 |
| [padenot/audio-clock](https://github.com/padenot/audio-clock) | D：从音频线程向其他线程传播音乐时钟，MIT 或 Apache-2.0。S：`ClockUpdater::increment` 分别更新 atomic frames 与 `f32` beat；消费者分别 load。`beat_duration()` 实际返回 `tempo / 60`。[C2] | 参考。适合研究低频 UI 快照，不直接照抄。多个 atomic 不形成一致的 transport 快照，`f32` beat 累计精度和函数单位需单独处理。callback 帧数不等于 seek、loop 后的工程位置，也不等于可听位置。 |
| `augmented-playhead`，属于 [yamadapc/augmented-audio](https://github.com/yamadapc/augmented-audio)，[发布包 0.9.0](https://docs.rs/crate/augmented-playhead/0.9.0) | D：audio-thread 与 GUI 同步类型。S：包 manifest 的 `license = "MIT"`，依赖 `audio-processor-traits`、`augmented-atomics`。[C3] 本轮未逐方法审查其内存序与时间映射。 | 参考。用于比较共享 playhead 的接口，不把类型名称当作有 seek generation、设备延迟补偿或 tempo map 的证据。 |
| [Ableton/link](https://github.com/Ableton/link) | D：跨应用与局域网设备同步 beat、tempo、phase。README 解释设备 sample clock 与系统 clock 的映射、`HostTimeFilter` 和输出延迟补偿。许可为 GPLv2+ 或商业许可。[C4] | 暂缓接入，保留同步协议参考。Link 解决跨应用同步，不是当前设备 transport 的替代品。接入应在 native 时钟边界完成，另核实现有 Tracktion 集成和发行许可。 |
| [talaviram/TICK](https://github.com/talaviram/TICK) | D：JUCE 节拍器插件与 standalone，作者称 sample-accurate；README 标注 WIP。自身 MIT，框架与格式依赖另核许可。README 的历史 JUCE/VST3 许可描述不能替代当前依赖版本的许可证。[C5] | 参考。适合比较 click 生成、拍号、音色和 preset，不作为已测的跨平台计时保证。当前 metronome 应跟随同一 native transport，不由前端 timer 产生声音。 |

时钟模块可借鉴的边界是带时间戳的 transport snapshot、seek/loop generation、tempo map 和输出延迟口径。UI 插值只显示 native 状态，不能反过来成为音频时间的权威。以上是本项目的设计判断，不是声称这些库都实现了这组能力。

## Mixer、发送、路由与计量

| 原清单名称与一手入口 | 已核实的范围与许可证 | 对 ZoeyDAW 的决定 |
| --- | --- | --- |
| `mixer_ggmaldo`，原入口 [lib.rs](https://lib.rs/crates/mixer_ggmaldo)，[发布包 0.1.0](https://docs.rs/crate/mixer_ggmaldo/0.1.0) | D：作者列出 channels、EQ、FX buses、sidechain、mute/solo、peak/RMS；README 声明 MIT。S：`Mixer::process_block` 每块创建临时 `Vec`、收集 channel/send/bus IDs，并 clone bus 左右缓冲。[M1] | 参考，不直接用于实时 callback。API 目录可作功能核对表，但“professional”和“smooth faders”不证明整个 mixer 无分配或无点击。与当前 Tracktion mixer 并行运行会重复 owner。 |
| [oximedia-mixer](https://crates.io/crates/oximedia-mixer)，[发布包 0.2.1](https://docs.rs/crate/oximedia-mixer/0.2.1)，[cool-japan/oximedia](https://github.com/cool-japan/oximedia) | D：作者列出 channel strip、bus、automation modes、VCA、scene、metering，Apache-2.0。本轮未审查完整 DSP 路径。README 的“100+ channels”“lock-free”“target <10ms”属于作者声明，不是本机测量。[M2] | 参考功能分类，暂缓采用。依赖和职责远超单一 mixer，不能因 Rust 包存在就替换已有播放图。 |
| [SpotlightKid/sendmixer](https://github.com/SpotlightKid/sendmixer) | D：一个 stereo channel strip 插件，master gain 与两个 pre/post-fader sends，使用 DPF 和 FAUST 生成 DSP。自身 MIT，格式 SDK 与 DPF 另核许可。[M3] | 参考 pre/post tap 的信号语义和测试输入。它不是整台 DAW 的 bus graph、solo、反馈检测或 PDC 实现。 |
| [Shirakumo/libmixed](https://github.com/Shirakumo/libmixed)，现行入口 [Codeberg](https://codeberg.org/shirakumo/libmixed) | D：低层 C audio mixer pipeline。GitHub README 明确 2025-08 迁出，旧库已归档。旧 GitHub 页面标识 Zlib；Codeberg 项目页与 raw README 本轮均返回 429，未重验现行源码与许可。[M4] | 参考，采用暂缓。保留新旧入口，不把归档镜像当现行维护源，也不声称 Codeberg 版本已审查。 |
| [Mozilla audio-mixer](https://github.com/mozilla/audio-mixer) | D：任意输入声道布局到输出布局的矩阵混音，README 声明 MPL-2。[M5] | 参考 channel-layout matrix。它处理声道映射，不等于具有 track、aux sends、automation 和插件生命周期的 DAW mixer。仅当现有引擎缺少某个声道转换时再比较直接采用。 |

本模块真正可直接用的首选是现有 Tracktion 的 gain、pan、send、routing 和 metering 能力。新增参考代码前，先确认某条实际路径缺失，而不是根据清单再造 mixer。播放连续性与参数更新的当前差异见[现状评审](daw-current-review-2026-10-22.md)。

## 插件宿主、隔离与 PDC

| 原清单名称与一手入口 | 已核实的范围与许可证 | 对 ZoeyDAW 的决定 |
| --- | --- | --- |
| `plughost` crate，[发布包 0.1.5](https://docs.rs/crate/plughost/0.1.5)，[emulette/plughost](https://github.com/emulette/plughost) | D：VST3、AU、CLAP，chain helper process、shared-memory realtime endpoint、扫描、state 与 recovery。MIT 或 Apache-2.0。该版要求 Rust 1.92+，支持 Apple Silicon macOS 15+ 与 Windows x64，不支持 Linux、Intel Mac 或跨架构 bridge。作者文档明确不提供 device I/O 或 resampler。[P1] | 参考 helper 协议与生命周期，暂缓集成。量子流水引入额外延迟，迟到输出和恢复必须进入 DAW 的 PDC、transport 与错误模型，不能只换一个 Rust API。 |
| `PDC KVR unnamed articles` | U：用户未给文章标题、作者或具体 URL，无法确定是哪几篇 KVR 内容。保留缺链接状态，不生成论坛帖链接。文章许可也未知。 | 暂缓。不能以未定位文章支持“必须自研 PDC”或任何补偿算法正确性的结论。 |
| [erroreyes/simple-delay](https://github.com/erroreyes/simple-delay) | D：作者自述为学习 delay line、ring buffer、插值的 nih-plug 效果器，也说明 pitch 尝试未完成。S：`Cargo.toml` 声明 GPL-3.0-or-later。[P2] | 参考 DSP 学习材料，不是 PDC 方案。创意 delay 改变声音；宿主 PDC 要对齐不同处理路径，两者目的不同。 |

### 现有 Tracktion 已有延迟补偿机制

“PDC 必须自研”的前提不成立。固定版本 `877e39c0fe9f1c3e4a9d836f5f338688250875d7` 的 `SummingNode::transform` 在未禁用 compensation 时调用 `createLatencyNodes()`；后者计算输入最大延迟与各节点延迟的差，再插入 `LatencyNode`。这是已读源码证据 S，不是根据 README 推断。[P3]

因此当前决定是直接复用并验证 Tracktion 能力，不先实现第二套补偿算法。仍待项目路径证明的内容包括并行干湿链、group/return、sidechain、动态插件延迟、bypass、离线导出和录音监控。引擎存在算法不等于当前宿主每条路由都正确使用。完整接线评审由[现状评审](daw-current-review-2026-10-22.md)与[重构计划](daw-refactor-plan-2026-10-22.md)保存。

### 扫描隔离与运行隔离分别决策

同进程插件并非天然不可接受。应分别评估三个阶段。

- 扫描阶段执行不可信插件初始化，子进程可限制单次崩溃或卡死的影响。扫描超时、黑名单、取消和缓存属于扫描服务。
- 运行阶段是否隔离，取决于崩溃容忍度、插件 UI 的线程约束、CPU 开销、附加量子延迟和恢复要求。不能把扫描子进程存在当成实时处理也已隔离。
- 运行隔离需要说明共享内存的有界容量、helper deadline、迟到块策略、state 恢复及新增延迟。`plughost` 文档提出一套做法，但其作者的性能结论仍是 D，本项目没有运行验证。[P1]

## Time stretch、pitch shift 与 warp

| 原清单名称与一手入口 | 已核实的范围与许可证 | 对 ZoeyDAW 的决定 |
| --- | --- | --- |
| [breakfastquay/rubberband](https://github.com/breakfastquay/rubberband)，[官方集成说明](https://breakfastquay.com/rubberband/integration.html) | D：独立调 tempo 与 pitch，R2/R3 引擎、C++ 与 C 接口；GPL-2.0-or-later 或商业许可。README 指明 GitHub 为镜像，主源码在 SourceHut。FFT 与 resampler 依赖随构建配置另核许可。[T1] | 参考，直接采用暂缓。先确认当前 Tracktion stretch 后端和模式的缺口，再用同一语料比较时长、瞬态、pitch、seek、CPU 和工作集。 |
| [bungee-audio-stretch/bungee](https://github.com/bungee-audio-stretch/bungee) | D：C++ granular 与 streaming API。granular 模式允许任意 position、零速和负速；streaming 只支持向前。开源 Bungee 为 MPL-2.0，Bungee Pro 是另一个商业产品，不能混用其质量或 SIMD 宣传。[T2] | 参考 scrub 和 request-position 契约，暂缓第二后端。需要显式处理 preroll、请求输入区间、输出时间戳与 buffer 生命周期。 |
| [Daninet/rubberband-wasm](https://github.com/Daninet/rubberband-wasm) | D：Rubber Band 的 WASM build，README 明确继承 GPL，专有发行需商业许可。[T3] | 参考浏览器集成，不直接塞入当前 native callback。WASM 包装不改变底层许可，也不证明比已有 native 后端更快。 |
| `dm-TimeWarp unnamed product`，定位到同名候选 [davemollen/dm-TimeWarp](https://github.com/davemollen/dm-TimeWarp) | D：候选 README 描述 granular delay、looper、sampler，可捕获 live audio 和导入 sample。S：候选 `LICENSE` 为 GPLv3 文本。原清单未提供产品 URL，尚不能证明此仓库就是原指向。[T4] | 原条目身份暂缓，候选仅参考声音设计交互。它不是通用 DAW warp SDK，不能据其产品描述替换现有 stretch 路径。 |

当前不替换 Engine 或 stretch 后端。现有音频语料与 probe 结果沿用[音频参考目录](cookbook-audio-references.md)，不把未运行的新项目评成“更低延迟”或“音质更好”。

## DAW 模块边界与 Clip launcher

| 原清单名称与一手入口 | 已核实的范围与许可证 | 对 ZoeyDAW 的决定 |
| --- | --- | --- |
| [1-chris/Ongenet](https://github.com/1-chris/Ongenet) | D：.NET/C# DAW，README 把 portable Core、device backend、UI、plugin formats 和可选 PluginHost 分开。仓库及 README 标注 MIT。本轮未逐条验证其“lock-free”“production-ready”、PDC 或 session engine。[L1] | 参考真实职责划分。C# 模块不能直接作为 Rust/C++ dependency。不要按其目录数量制造本项目空 crate。 |
| [onge.net](https://onge.net/) | D：Ongenet 官网，由仓库互相链接。展示 Session、automation、routing、piano roll 等功能，站点不能作为独立引擎源码或测试证据。代码 MIT 声明见对应仓库，图片与站点素材不默认一并授权。[L1][L2] | 参考产品和交互文档。官网描述与仓库实现分开记录，不因页面存在就判断已达到项目验收标准。 |
| `Clipdeck`，定位到匹配用途的 [jakobkilian/ClipDeck](https://github.com/jakobkilian/ClipDeck) | D：显示并启动 Ableton Live Clips 的 Stream Deck Python 工具，外部脚本与 Live Remote Script 通过 OSC 通信。S：`LICENSE` 明确 All Rights Reserved，未经书面许可不授予使用、复制、修改或分发权限。[L3] 原清单无 URL，该仓库是按 clip-launcher 用途定位的候选，不与同名剪贴板产品混同。 | 暂缓采用，不复制、安装或运行。最多将公开文档作为硬件映射需求线索，实际实现独立设计。公开 GitHub 不等于开源。 |
| [Mark Eats Clips](https://github.com/markwheeler/mark-eats-clips) | D：Ableton Live 的 monome grid clip launcher，是 Max for Live device，README 写明测试于 Live 9。仓库标识 GPL-3.0，并提供 `LICENSE.md`。[L4] | 参考硬件网格反馈和 clip 控制，不是独立播放引擎。直接搬入需要 Max/Live 环境，且不能忽略 GPL。 |
| `Ghost Arcade launcher`，[官网来源页](https://ghostarcade.live/community)，[riskcapital/ghost-arcade](https://github.com/riskcapital/ghost-arcade) | D：这是 projection mapping 与 VJ 软件，包含 clip launching、dual deck、crossfader 和 beat-quantized triggers，不是音频 DAW。README 声明 AGPL-3.0-only，并明确默认分支是 legacy 1.9，2.x 源码在另一分支。[L5] | 参考 queued/playing/stop 等 launcher 状态与反馈，暂缓代码复用。不能把当前产品宣传归为默认分支已读实现，也不能用视频触发证明 sample-accurate 音频调度。 |

Launcher 的可复用问题是量化启动、取消排队、同轨 clip 互斥、scene 启动、Arrangement 与 Session 的优先关系。UI 的 queued 状态必须等 native 接受命令后再推进。这里列出的是需要定义的契约，并不声称上述项目全部已实现。

## MIDI piano roll 与表达编辑

| 原清单名称与一手入口 | 已核实的范围与许可证 | 对 ZoeyDAW 的决定 |
| --- | --- | --- |
| [bitflipp/pianizer](https://github.com/bitflipp/pianizer) | D：MusicXML、Canvas piano roll、velocity、CC64、CC67、tempo curve 与 Web MIDI 输出。README 声明 MIT，写明 30ms tick、150ms lookahead 的浏览器 MIDI scheduler。[N1] | 参考 note/curve 编辑和中途播放控制器状态恢复。该 Web MIDI scheduler 不是 native audio transport，也不能当零延迟承诺。 |
| [signal.vercel.app](https://signal.vercel.app/)，现重定向 [signalmidi.app](https://signalmidi.app/)，实际源码 [ryohey/signal](https://github.com/ryohey/signal) | D：官方页面直接链接仓库，确认不是按名字猜出的 repo。README 标注 MIT，定位 MIDI composition sketching，明确 no effects 等取舍。官网列多轨 piano roll、expression、pitch bend、tempo 与 time-signature graph。[N2] | 参考浏览器 MIDI 编辑的数据与交互分层，不替换当前 native 播放和插件宿主。MIDI 文件编辑器的完整性不等于 DAW mixer 完整性。 |
| [mjhasbach/pixi-piano-roll](https://github.com/mjhasbach/pixi-piano-roll) | D：JavaScript WebGL/Canvas animated piano roll，README API 主要是 note data、time、BPM、zoom 与 playback，MIT。[N3] 本轮未核实完整交互编辑、撤销或现代 Pixi 版本兼容性。 | 参考批量 note 绘制，不把 animated piano roll 误称完整编辑器，也不把其自带播放计时接管工程时钟。 |
| [maolan-widgets](https://docs.rs/crate/maolan-widgets/0.0.41)，实际源码 [maolan/widgets](https://github.com/maolan/widgets) | D：Iced widget package，包含 `piano_roll`、`note_area`、`piano`、controller lanes、meters 和 clip widgets。S：包 manifest 标注 BSD-2-Clause，依赖 Iced 0.14，不是整个 Maolan DAW。[N4] | 参考 widget 与编辑业务的边界、滚动同步和 MIDI lane 数据。不是 React 或 gpuix 的可直接替换组件。 |
| `unspecified react-piano-roll` | U：没有作者、包名或 URL。存在多个同名实现，未指定的 `react-piano-roll` 不能自动归为某个 npm 包或 GitHub 库。许可未知。 | 暂缓。保留缺链接状态，不替用户补选另一库。 |

渲染与命中测试还需使用本项目的可见范围、缩放和事务模型。具体绘制参考沿用[Canvas 章节](cookbook-canvas-references.md)，不因发现 piano-roll 库而新建第二套 note owner。

## 波形数据与显示

| 原清单名称与一手入口 | 已核实的范围与许可证 | 对 ZoeyDAW 的决定 |
| --- | --- | --- |
| [bbc/audiowaveform](https://github.com/bbc/audiowaveform)，现行入口 [Codeberg chrisn/audiowaveform](https://codeberg.org/chrisn/audiowaveform) | D：C++ CLI 生成 min/max waveform binary 或 JSON，也能输出 PNG。GitHub README 明确 ongoing development 已迁移。S：镜像 `COPYING` 是 GPLv3 文本，不能概括为 BBC 全家桶统一 MIT。[W1] | 参考格式，也可在完成发行审查后作为独立离线对照工具，当前不加入产品。不能用 CLI 全量分析替换有取消和范围预算的 native waveform service。 |
| [waveform-data.js](https://github.com/bbc/waveform-data.js)，现行入口 [Codeberg chrisn/waveform-data.js](https://codeberg.org/chrisn/waveform-data.js) | D：读取预计算 binary/JSON 或由 decoded audio 生成可缩放波形。README 明确迁移 Codeberg。S：镜像 `LICENSE` 是 LGPLv3。[W2] | 参考 min/max、多声道和重采样语义。需要完整 decoded buffer 的 Web Audio 路径不能被描述为长文件有界流播。当前 native signed waveform 不改格式以迎合它。 |
| [peaks.js](https://github.com/bbc/peaks.js) | D：overview、zoomview、points、segments 和 custom player。Context7 核实 `dataUri` 与 `webAudio` 是不同入口，文档建议 binary 预计算数据，且该文档要求 8-bit 而非 16-bit。S：当前读取的 `package.json` 为 `4.0.0-beta.2`，`license` 是 LGPL-3.0。[W3] | 参考标注与波形交互。不是 audio engine，不把其 Web Audio 解码路径作为本项目默认加载策略。版本与数据位深限制采用前重核。 |
| [naomiaro/webaudio-peaks](https://github.com/naomiaro/webaudio-peaks) | D：从 TypedArray 或 AudioBuffer 提取 peaks，可设 samples-per-pixel、cue 范围、mono 与 8/16/32-bit，MIT。[W4] | 参考或限定测试工具候选。当前无需为了已有 native min/max 再加入 JS 分析链；它也没有替应用解码长文件、提供多级磁盘缓存或取消。 |

波形缓存必须记录 source identity、sample range、samples-per-bin、声道和数据精度。深度放大需要原始 samples 时，不能靠插值 peak bins 伪造采样点。缓存、可见范围与 GPU 绘制的完整比较见[Canvas 章节](cookbook-canvas-references.md)。

## Automation 与曲线

| 原清单名称与一手入口 | 已核实的范围与许可证 | 对 ZoeyDAW 的决定 |
| --- | --- | --- |
| [johannphilippe/hypercurve](https://github.com/johannphilippe/hypercurve) | D：把多种曲线组合成 2D envelope，提供 C++、Lua、Csound、Faust 入口。README 明确 core MIT，而 `curve_lib.h` 中 derived easing curves 是 GPLv3。[A1] | 参考曲线数学，暂缓整库复制。不能把整个头文件集按 MIT 引入；预生成 envelope 表也不是自动化编辑、undo 和音频块求值的一整套系统。 |
| `Ongenet automation`，[仓库](https://github.com/1-chris/Ongenet)，[官网](https://onge.net/) | D：可编辑 automation lanes、breakpoints 与 bend，portable Core 包含 automation。MIT 声明见仓库。本文未审查每种 curve 的求值、录制模式或实时线程发布。[L1][L2] | 参考 UI、参数绑定与 engine 的职责分离，不声称它已经证明本项目所需的 sample-accurate 自动化。 |
| `OpenDAW automation`，实际项目 [andremichelle/openDAW](https://github.com/andremichelle/openDAW)，[官方开源说明](https://opendaw.studio/manuals/open-source) | D：官方确认 GitHub 身份、SDK/plugin model，AGPL v3 or later 或商业许可。本轮未深读其 automation 求值源码。[A2] | 参考，代码采用暂缓。不能把浏览器 automation 或 SDK 宣传当当前 native 参数发布已解决的证据。 |
| [Curvessor](https://unevens.net/curvessor.html)，实际源码 [unevens/Curvessor](https://github.com/unevens/Curvessor) | D：dynamic-range processor，每声道 response curve 是可自动化 spline，含 knot 编辑与 smoothing。仓库 README 声明 GPLv3。处理的是输入电平到输出电平的传递曲线，不是工程时间 automation lane。[A3] | 参考 knot 编辑和参数平滑，不作为通用 DAW automation engine。响应曲线允许非单调，不等于时间轴曲线允许时间倒序。 |

Automation 模块需区分持久化控制点、编辑预览、curve 求值、音频线程参数平滑和宿主参数通知。这些职责可以共用规范，但不能共用一个含 UI 状态的回调。选数学实现前，先固定时间单位、端点规则、曲线参数和越界语义。

## 录音、设备与 ring buffer

| 原清单名称与一手入口 | 已核实的范围与许可证 | 对 ZoeyDAW 的决定 |
| --- | --- | --- |
| [cpal](https://crates.io/crates/cpal)，[RustAudio/cpal](https://github.com/RustAudio/cpal)，[发布包 0.18.2](https://docs.rs/crate/cpal/0.18.2) | D：低层跨平台设备枚举、配置、input/output streams；Apache-2.0。Context7 展示 `record_wav` 示例直接在 callback 中获取 writer 的 `try_lock` 并写 sample，这不是本项目可照抄的录音线程设计。[R1][R3] | 暂缓作为产品设备后端。保留设备配置和录音边界参考，不与 Tracktion DeviceManager 同时拥有声卡。已有音频研究探针不等于产品接入。 |
| `ring-buffer recording/device`，原清单没有指定 crate；可核查的候选 [agerasev/ringbuf](https://github.com/agerasev/ringbuf)，[发布包 0.5.3](https://docs.rs/crate/ringbuf/0.5.3) | D：lock-free SPSC FIFO，split producer/consumer、批量 push/pop、静态或堆内存，MIT 或 Apache-2.0。文档明确 full/empty 会立即失败；`push_overwrite` 需要独占访问，不是可随意跨线程调用的录音容错方案。[R2] | 参考；只有新边界确需跨线程传样本且现有引擎无合适队列时，才考虑直接用候选。不能把泛称 ring buffer 自动认定为用户指定了 `ringbuf`，也不能认为有 buffer 就解决独立设备时钟漂移。 |

录音链路应由现有 native device owner 交付输入块，再由有界通道交给磁盘 writer。若采用 SPSC，要明确唯一生产者与消费者、容量的帧/声道单位、overflow 计数、录音中断语义、writer drain 和 WAV finalize 的顺序。音频 callback 不等待磁盘，不把掉帧静默填成“录音成功”。多设备或不同输入输出时钟还需独立的漂移与重采样策略，ring buffer 本身不提供这些能力。

以上是录音设计约束，不是本轮已实现。设备变更、monitoring 和录音能力的项目现状见[现状评审](daw-current-review-2026-10-22.md)。

## 来源定位与源码证据

下面链接支持表中对应事实。S 只限具体读到的代码或许可，其他能力描述仍是 D。默认分支链接可能变化；实施时需固定 revision。

- [C1] [`midi_clock_sync` 0.1.0 transport 源码](https://docs.rs/midi_clock_sync/0.1.0/src/midi_clock_sync/transport.rs.html)，`process_block` 57–90 行、`seek_to_beat` 93–100 行。
- [C2] [`audio-clock` 源码](https://github.com/padenot/audio-clock/blob/master/src/lib.rs)与[README/双许可声明](https://github.com/padenot/audio-clock)。分别 atomic 更新是源码事实，缺少一致快照与单位命名问题是据此作出的评审判断。
- [C3] [`augmented-playhead` 发布 manifest](https://docs.rs/crate/augmented-playhead/0.9.0/source/Cargo.toml)。
- [C4] [Link README 的 Time and Clocks、Latency Compensation 与 License](https://github.com/Ableton/link/blob/master/README.md)。
- [C5] [TICK README 的功能、WIP 与许可](https://github.com/talaviram/TICK/blob/master/README.md)。
- [M1] [`mixer_ggmaldo` process 源码](https://docs.rs/mixer_ggmaldo/0.1.0/src/mixer_ggmaldo/mixer.rs.html)，151–157、176–185、212–223 行包含分配和缓冲复制；[包说明与 MIT 声明](https://docs.rs/crate/mixer_ggmaldo/0.1.0)。
- [M2] [`oximedia-mixer` 发布包说明](https://docs.rs/crate/oximedia-mixer/0.2.1)。
- [M3] [SendMixer README](https://github.com/SpotlightKid/sendmixer/blob/master/README.md)。
- [M4] [libmixed 归档仓库、Zlib 标识与迁移声明](https://github.com/Shirakumo/libmixed)，[作者的现行跳转入口](https://shirakumo.org/projects/libmixed)。
- [M5] [Mozilla audio-mixer README](https://github.com/mozilla/audio-mixer/blob/master/README.md)。
- [P1] [`plughost` 0.1.5 完整发布说明](https://docs.rs/crate/plughost/0.1.5)。能力、限制、helper latency、fallback 和恢复均按作者文档记录，未做本机 benchmark。
- [P2] [Simple-Delay README](https://github.com/erroreyes/simple-delay/blob/main/README.md)与[GPL-3.0-or-later manifest](https://github.com/erroreyes/simple-delay/blob/main/Cargo.toml)。
- [P3] [固定 Tracktion `SummingNode` 源码](https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_graph/tracktion_graph/nodes/tracktion_SummingNode.h)，`transform`、`createLatencyNodes` 与 `LatencyNode` 插入。
- [T1] [Rubber Band README 与 GPL/商业条款](https://github.com/breakfastquay/rubberband/blob/default/README.md)。
- [T2] [Bungee granular/streaming 契约及 MPL/Pro 区别](https://github.com/bungee-audio-stretch/bungee/blob/main/README.md)。
- [T3] [rubberband-wasm README 与许可说明](https://github.com/Daninet/rubberband-wasm/blob/master/README.md)。
- [T4] [TimeWarp 候选 README](https://github.com/davemollen/dm-TimeWarp/blob/main/README.md)与[GPLv3 许可证](https://github.com/davemollen/dm-TimeWarp/blob/main/LICENSE)。
- [L1] [Ongenet README、项目边界与 MIT 声明](https://github.com/1-chris/Ongenet)。
- [L2] [Ongenet 官网的 timeline、mixer、session 与 piano roll 描述](https://onge.net/)。
- [L3] [ClipDeck README](https://github.com/jakobkilian/ClipDeck)与[禁止未经授权使用的 LICENSE](https://github.com/jakobkilian/ClipDeck/blob/main/LICENSE)。
- [L4] [Mark Eats Clips README、GPL 标识及 LICENSE.md 入口](https://github.com/markwheeler/mark-eats-clips)。
- [L5] [Ghost Arcade 官网到实际源码的链接](https://ghostarcade.live/community)与[README 的版本分支及 AGPL-3.0-only 说明](https://github.com/riskcapital/ghost-arcade/blob/main/README.md)。
- [N1] [Pianizer README](https://github.com/bitflipp/pianizer/blob/master/README.md)。
- [N2] [Signal 官方页面到 ryohey/signal 的链接](https://signalmidi.app/)与[仓库 MIT、定位及限制](https://github.com/ryohey/signal)。
- [N3] [pixi-piano-roll README/API](https://github.com/mjhasbach/pixi-piano-roll/blob/master/README.md)。
- [N4] [Maolan widgets 0.0.41 文档](https://docs.rs/crate/maolan-widgets/0.0.41)与[BSD-2-Clause manifest](https://docs.rs/crate/maolan-widgets/0.0.41/source/Cargo.toml)。
- [W1] [audiowaveform README、min/max 描述与迁移通知](https://github.com/bbc/audiowaveform/blob/master/README.md)和[GPLv3 COPYING](https://github.com/bbc/audiowaveform/blob/master/COPYING)。现行 Codeberg 版本未重验。
- [W2] [waveform-data.js README、预计算与 Web Audio 路径及迁移通知](https://github.com/bbc/waveform-data.js/blob/master/README.md)和[LGPLv3 LICENSE](https://github.com/bbc/waveform-data.js/blob/master/LICENSE)。现行 Codeberg 版本未重验。
- [W3] [Peaks README 数据来源](https://github.com/bbc/peaks.js/blob/master/README.md)、[custom player API](https://github.com/bbc/peaks.js/blob/master/doc/API.md)及[包版本与 LGPL-3.0 声明](https://github.com/bbc/peaks.js/blob/master/package.json)。前两项也经 Context7 查询交叉定位。
- [W4] [webaudio-peaks README/API 与 MIT 声明](https://github.com/naomiaro/webaudio-peaks/blob/master/README.md)。
- [A1] [Hypercurve README 的曲线、WASM 未完成状态及混合许可](https://github.com/johannphilippe/hypercurve/blob/master/README.md)。
- [A2] [openDAW 官方身份、SDK 与 AGPL/商业许可](https://opendaw.studio/manuals/open-source)。
- [A3] [Curvessor 官方产品说明](https://unevens.net/curvessor.html)与[仓库 GPLv3 声明](https://github.com/unevens/Curvessor)。
- [R1] [CPAL 0.18.2 发布说明与 Apache-2.0 许可](https://docs.rs/crate/cpal/0.18.2)。
- [R2] [ringbuf 0.5.3 的 SPSC、失败及 overwrite 语义和双许可](https://docs.rs/crate/ringbuf/0.5.3)。
- [R3] [CPAL `record_wav` 示例](https://github.com/RustAudio/cpal/blob/master/examples/record_wav.rs)与[UPGRADING.md](https://github.com/RustAudio/cpal/blob/master/UPGRADING.md)。由 Context7 返回具体代码与版本升级段落，未把 master 的 API 当成 0.18.2 API。

## 保留的未知项

缺少精确原始 URL 的条目是 KVR PDC articles、`dm-TimeWarp unnamed product`、`Clipdeck` 和 `unspecified react-piano-roll`。前两项中的 TimeWarp 与 Clipdeck 已找到用途或名称匹配的候选，但没有用搜索结果替代原始身份确认。`ring-buffer recording/device` 是泛称，本文的 `ringbuf` 是显式候选，不是补写用户未指定的依赖。

Codeberg 的 libmixed 当前源码与许可因 429 尚未核实，旧镜像的 Zlib 声明不替代现行发行核验。所有仅有 D 的实时、sample-accurate、lock-free、音质和成熟度声明，仍需具体源码与相同负载下的运行证据。
