# 音频参考 cookbook

本章整理用户给出的全部音频链接，按播放延迟、实时参数、结构编辑、遥测、插件和 WASM 查找可借鉴的做法。它是研究材料与重构输入，不是引擎替换方案，也不记录本轮生产实现。

核对日期：2026-10-23。除明确版本的发布包外，远程链接指向本次读取时的 `main`、`master` 或 `dev`，不是固定提交快照。复用代码前需固定 commit、复核逐文件许可及依赖许可。本轮没有编译、运行、试听或测量这些参考项目，没有运行 ZoeyDAW 的测试或构建。

入口：[DAW cookbook](daw-cookbook.md)。当前项目完整评估见 [当前代码审视](daw-current-review-2026-10-22.md)。已有的 [开源引擎研究](open-daw-architecture-2026-10-22.md) 补充 Ardour、Tracktion 和 Futureboard 的媒体读取路径，不代替下面的链接核对。

## 证据等级与采用边界

- `S`：读到相关实现或 manifest。只证明所列具体行为，不证明整个项目实时安全。
- `D`：官方 README、作者文章、产品页面、crate 发布说明或 issue。证明作者的声明，不证明性能或交付状态。
- `U`：链接不可访问、目标不明确或该项未核实。保留线索，不补写推测事实。
- `unknown` 许可：本轮未取得明确许可授权，不等于“无版权”或“可以复制”。

表中 MIT、BSD、Apache、GPL、AGPL 均只描述所指项目或包的已见声明。SDK、插件、媒体、图标及 vendor 代码可能有独立条款。宽松许可也不保证可以直接替换 ZoeyDAW 的设备 owner；GPL 或 AGPL 项目的实现可以研究，但复制、链接或发布前需要单独确认合规方案。

## 全部参考清单

| ID 与入口 | 已核实范围、证据 | 许可与证据状态 | 可借鉴内容 | 限制与当前采用判断 |
| --- | --- | --- | --- | --- |
| A01 [whoisryosuke/daw-tauri](https://github.com/whoisryosuke/daw-tauri) | `S`：[audio_engine_messaging.rs](https://github.com/whoisryosuke/daw-tauri/blob/main/src-tauri/src/engine/audio_engine_messaging.rs) 的 `play`、`send_command`、`update_mixer_track_gain`；`D` README 明确是教育研究项目。 | `unknown`。已读 [Tauri Cargo.toml](https://github.com/whoisryosuke/daw-tauri/blob/main/src-tauri/Cargo.toml)，未见 `license` 字段，仓库入口未提供明确许可。 | 将参数命令与 transport 命令区分，PCM 由后端缓存，前端不搬完整采样数据。 | `play` 会逐项创建并入队节点与效果，再 Seek、Play。不是“只切换 playing”的热启动。队列满时 sleep 1ms，不能照搬为低延迟保证。 |
| A02 [Creating a DAW in Rust: Playing Audio](https://whoisryosuke.com/blog/2026/creating-a-daw-in-rust) | `D`：作者讲解 CPAL callback、文件解码和 Tauri UI。首篇示例含 `Arc<Mutex<...>>` callback。 | 文章与示例授权 `unknown`，不能从仓库公开推导复制许可。 | 理解 UI、控制线程、音频 callback 的职责与数据流。 | 入门文，不作规范或性能证据。文中“Web Audio 只支持 stereo”“都运行在 main thread”等概括，以及 `44hz` 表述，不作为本项目事实引用。示例锁、打印和未完成分支不宜进入实时路径。 |
| A03 [Creating a DAW in Rust: Multi-track Timeline](https://whoisryosuke.com/blog/2026/creating-a-daw-in-rust-multi-track-timeline/) | `D`：作者分开 `TrackClip`、`Clip`、`MediaAsset` 与 `AudioCache`，说明前后端数据需求不同。 | 文章授权 `unknown`。 | 区分素材身份、时间线实例和 PCM 存储，限制发送到音频侧的数据。 | 文章中的线性 FX chain 适用其场景，不足以处理本项目任意 send、group、sidechain 路由。预分配或 sample-accurate 声明没有本轮设备实测。 |
| A04 [Toni997/project-pulse](https://github.com/Toni997/project-pulse) | `S`：[snapshot/publisher.rs](https://github.com/Toni997/project-pulse/blob/main/src-tauri/src/snapshot/publisher.rs) 用一个 builder thread、合并 `RebuildScope`、版本检查、`ArcSwap` 发布。`D` README 明确 timeline 和混音功能仍不完整。 | `unknown`。本轮未取得明确许可证文本或 manifest 许可声明。 | 对结构更新按 scheduler、render graph、data nodes 分类；旧版本构建结果不发布。 | 当前 `SETTLE_DELAY=10ms` 是中断后等待编辑停顿的策略，不是端到端延迟成绩。`ArcSwap` 本身不证明 callback 不释放旧对象。 |
| A05 [nbennett320/dawesome](https://github.com/nbennett320/dawesome) | `D`：README 为极早期 Rust/Tauri/React DAW，示例 thunk 先 `toggle_playlist` 再读取 `get_playlist_playing`；说明 Rodio 与 Linux PulseAudio 路径。 | `unknown`。未取得可用于采用的明确许可。 | 前端播放状态从后端确认，而不是只切按钮外观。 | 示例是 toggle + query 两次 IPC，不提供排队、幂等、版本或首声延迟契约。旧文中的链接路径与当前目录有差异，不当成稳定集成 API。 |
| A06 [ace-step/ACE-Step-DAW issue #1519](https://github.com/ace-step/ACE-Step-DAW/issues/1519) | `D`：hybrid architecture epic、分阶段计划、作者完成声明与 QA closeout 评论。 | 本条 issue/其示例的采用许可 `unknown`；未审查仓库代码许可。 | 将 native transport、IPC、插件、文件权限和硬件验收拆成独立验收项。 | 4 月 29 日评论列出 desktop 仍走 WebAudio、硬件 gate 等阻塞。不能只引用前面的“Phase 3 complete”。文中 `<5ms`、“zero overhead”等是目标或作者声明，不是本轮验证结果。 |
| A07 [crates.io/tauri-plugin-audioplayer](https://crates.io/crates/tauri-plugin-audioplayer) | crates.io API 本轮 HTTP 403；改读 [docs.rs 0.1.2](https://docs.rs/crate/tauri-plugin-audioplayer/0.1.2)，上游是 [GitLab audioland](https://gitlab.com/audioland/tauri-plugin-audioplayer)。`D`：下载后一次全解码为内存 `f32`、单 loaded track、CPAL 输出与 typed JS bindings。 | Apache-2.0，发布 README 明确声明；未作依赖全量审计。 | 单文件播放器的 load 与 play 分离，设备枚举和 seek API。 | 不提供多轨编排图或有界长文件缓存。发布说明要求 Rust 1.90+；docs.rs 0.1.2 文档构建失败不等于包不能在本地编译，也不能当成功验证。不能给当前 Tracktion owner 再接一套 CPAL。 |
| A08 [xudong7/tauri-rmusic](https://github.com/xudong7/tauri-rmusic) | `D`：Tauri 2、Vue 3、Rodio、Symphonia 的本地与在线音乐播放器；仓库有设备/媒体控制相关文件。 | MIT，仓库 license 元数据及 [LICENSE](https://github.com/xudong7/tauri-rmusic/blob/main/LICENSE) 入口。未审计 bundled sidecar 与 vendor。 | 本地库、系统媒体控制、播放器状态与窗口生命周期的产品参考。 | playlist 播放器不是多轨调度器。README 的低占用声明没有本轮测量；在线 proxy、Rosetta 与鉴权约束也不应带入 DAW 核心。 |
| A09 [nairdahh/TONI](https://github.com/nairdahh/TONI) | `D`：README 是 CPAL 输入到输出 pass-through，带 dB 与 latency UI；目录分 audio、processing、commands。 | `unknown`。未取得明确许可。 | 录音监听、输入输出选择和电平反馈的研究入口。 | pass-through 不覆盖多轨播放、离线处理、插件图或媒体读取。README 的 low latency 不证明往返时延。 |
| A10 [aera128/claket-tauri](https://github.com/aera128/claket-tauri) | `D`：soundboard，README 描述 Rodio/CPAL、导入复制到 AppData、预解码并缓存 PCM。 | `unknown`。未取得明确许可。 | 小音效的预热、素材本地镜像和输出选择。 | “zero latency”“bit-perfect”是宣传，不是测量或格式审计。短音效整段缓存不能直接推广到小时级多轨素材。 |
| A11 [KEYHAN-A/audiosync](https://github.com/KEYHAN-A/audiosync) | `D`：README 描述多设备录音 FFT cross-correlation、clock drift、NLE export；目录有 `audiosync-core`、CLI 与 Tauri adapter。 | GPL-3.0，README 与仓库 license 元数据；是否 `or-later` 本轮未核对，不补写。 | 批量离线分析与桌面桥分开，导出时间线和重连媒体的职责划分。 | 同一场景多设备录音对齐，不等于不同歌手的时间和音高匹配，也不是实时 transport 的替代。未核实算法源码和 drift correction 误差。 |
| A12 [storytold/soundcraft](https://github.com/storytold/soundcraft) | `S`：[Cargo.toml](https://github.com/storytold/soundcraft/blob/main/Cargo.toml) 分 time、model、mix、engine、playback、automation、audio-io 和插件 host。`D` README 为 egui Rust DAW，并标 pre-alpha。 | `MIT OR Apache-2.0`，workspace manifest 明确声明，仓库有两份许可文件。 | 时间模型、文档、播放和 UI 责任分开；不同插件格式的 host 单独组织。 | README 的完整功能、120fps、跨平台与插件兼容性未在本轮验证。多个 crates 存在不证明运行时无锁、无分配或稳定 SDK。 |
| A13 [soundcraft.live](https://soundcraft.live) | `D`：静态产品页可访问，链接回 A12，提供 browser editor 入口，标 pre-alpha，并声明 Rust/WASM、本地会话、mixer/automation。 | 页面声明 `MIT OR Apache-2.0`；关联代码许可见 A12。网页素材许可未单独审计。 | 浏览器版能力矩阵与会话导入导出体验的参考入口。 | 本轮没有打开交互 editor、录音或测量音频。网站的 offline、privacy、格式和同步声明不等于本轮已验证。原生插件能力不能据同一品牌推导到 WASM 版。 |
| A14 [maolan/maolan](https://github.com/maolan/maolan) | `S`：[Cargo.toml](https://github.com/maolan/maolan/blob/main/Cargo.toml) 依赖 `maolan-engine = 0.4.9`；[transport dispatch](https://github.com/maolan/maolan/blob/main/src/gui/update/dispatch/transport.rs) 将 play 与位置跳转分开。 | BSD-2-Clause，应用 manifest 与仓库 license 元数据一致。 | Play、Pause、Stop、TransportPosition 独立动作，读取引擎 snapshot 而非 UI 自己驱动声音。 | 应用 UI 代码不能证明 engine 的 start 常数时间、设备时延或 RT 安全。上游持续变动，需分别固定应用和 engine 版本。 |
| A15 原列表推测 [maolan/maolan-engine](https://github.com/maolan/maolan-engine) | `U`：输入材料已核实 HTTP 404。保留错误入口以免继续引用。 | `unknown`，不存在可确认的该仓库授权。 | 遇到 crate 名不猜 GitHub 仓库名，沿发布 manifest 的 `repository` 查找。 | 不再把该链接当引擎源码引用。实际上游见 A16。 |
| A16 实际上游 [maolan/engine](https://github.com/maolan/engine) | `S`：[engine Cargo.toml](https://github.com/maolan/engine/blob/main/Cargo.toml) 声明 `maolan-engine` 和实际 repository。解析链为 A14 manifest → [docs.rs 0.4.9](https://docs.rs/crate/maolan-engine/0.4.9) → 此仓库。`D` 包说明列 OOP plugin hosting、共享内存 IPC 与 opt-in features。 | BSD-2-Clause，engine manifest 明确声明；当前 `main` 为 0.4.10，与应用声明的 0.4.9 区分。 | 真正独立 engine crate、插件进程生命周期与 protocol 的研究入口。 | 本轮未逐行审计 engine callback 或共享内存同步，不能据 basedrop/rtrb/arc-swap 依赖就宣称全部实时安全。OOP 会带 IPC、超时与故障处理代价。 |
| A17 [alexanderwanyoike/vibez](https://github.com/alexanderwanyoike/vibez) | `S`：[dev/Cargo.toml](https://github.com/alexanderwanyoike/vibez/blob/dev/Cargo.toml) 含 core、engine、audio-io、dsp、instruments、plugin-host、project、ui 等真实 members 和 rtrb 依赖。`D` README 声明 callback lock-free、allocation-free、sandboxed scanning。 | `GPL-3.0-or-later`，workspace manifest 明确声明。 | 按责任与依赖组织模块；引擎 sample clock 驱动录制的设计方向。 | “ring buffer”“RT-safe”需继续审查写端、满队列策略、回收和 plugin callback。manifest/README 不足以证明。GPL 代码不能未经许可评估搬入。不要照抄 crate 名建立空包。 |
| A18 [generic-daw/generic-daw](https://github.com/generic-daw/generic-daw) | `D`：仓库树有 audio_graph、clap_host、dsp、core、project、gui、thread_pool；README 明确 early development、iced UI。 | GPL-3.0，README 与仓库 license 元数据。`only` 或 `or-later` 未细分。 | 图、插件 host、项目、UI 的职责拆分入口。 | 未深读 callback、动态图更新或插件退役路径。不能用目录结构推出可嵌入性、零掉音或性能领先。 |
| A19 [tripplyons/daw](https://github.com/tripplyons/daw) | `D`：README 描述 iced tiling DAW、VST3/AU、扫描子进程、增量缓存、实时 gain/pan/send，后台导出及其取消。 | MIT，仓库 license 元数据与 [LICENSE](https://github.com/tripplyons/daw/blob/main/LICENSE) 入口。 | 将 scanner 崩溃与主程序隔离；参数 gesture 对应一个 undo；后台导出用独立实例。 | 本轮未验证源码和插件矩阵。扫描进程隔离不等于播放进程隔离。AU 是 macOS 专属；文中处理缓存不是当前工程可以直接采用的 API。 |
| A20 [defuse/DAWr](https://github.com/defuse/DAWr) | `D`：README 定义 `MonoEmitter`、`StereoEmitter`、`EventSource` 与组合设备，并明确无单测、sampler 仅 one-shot、暂不主动增加特性。 | MIT，仓库 license 元数据与 [LICENSE](https://github.com/defuse/DAWr/blob/master/LICENSE) 入口。 | 理解 DSP 组合与信号/事件的不同角色。 | 音频实验库，不是现成多轨引擎。README 使用 `Rc` 的组合方式不能直接推广为跨线程 mutable playback graph。 |
| A21 [emuell/phonic](https://github.com/emuell/phonic) | `D`：README 示例区分默认 RAM preload 与 `.streamed()`；handle 的 seek、volume、stop 可带 sample time；native CPAL 与 Emscripten 输出。 | AGPL-3.0，仓库 license 元数据；`only` 或 `or-later` 本轮未核对。 | 以 output sample frame position 为调度时钟，source handle 与状态事件分开。 | API 未稳定。未审计流播 ring 的多实例游标、seek、回收和 underrun 策略。不能仅凭 README 接入当前闭源或其他许可分发。 |
| A22 [augmented-playhead crate](https://crates.io/crates/augmented-playhead) | `D`：[docs.rs 0.9.0](https://docs.rs/crate/augmented-playhead/0.9.0) 说明基于 atomics 的 audio/GUI 同步工具；`S` [发布 Cargo.toml](https://docs.rs/crate/augmented-playhead/0.9.0/source/Cargo.toml) 指向 yamadapc/augmented-audio。 | MIT，发布 manifest 明确声明。 | 原子快照与播放头共享的专项研究入口。 | 不提供 Tauri bridge、磁盘读取或完整 DAW transport。发布页 API 文档覆盖率低，本轮没有做 memory-ordering 审计或性能测量。 |
| A23 [midi_clock_sync crate](https://crates.io/crates/midi_clock_sync) | `D`：[docs.rs 0.1.0](https://docs.rs/crate/midi_clock_sync/0.1.0)；`S` [transport.rs](https://docs.rs/crate/midi_clock_sync/0.1.0/source/src/transport.rs) 的 `process_block` 与 `seek_to_beat`。 | MIT，发布 README 明确声明。 | beats 应随历史 BPM 累积，不能拿总 samples 乘当前 BPM 反推全曲位置。 | BPM 在 block 开头采样。它不对 block 内 tempo ramp 精确积分；seek 用当前 BPM 换算 samples，不能据“No drift”宣传称完整 tempo-map 正确。也不是网络同步或外部 MIDI clock 抖动消除的证明。 |
| A24 [awsm-fun/awsm-audio](https://github.com/awsm-fun/awsm-audio) | `S`：[Cargo.toml](https://github.com/awsm-fun/awsm-audio/blob/main/Cargo.toml) 分 schema/player/worklet/editor-protocol/UI；`D` README 说明 Graph→WebAudio、AudioWorklet 自定义 WASM、`EditorController` 命令入口。 | `MIT OR Apache-2.0`，workspace manifest 明确声明。 | schema 与 live graph 分开；DSP worklet 协议与编辑命令分开；offline render 与实时 player 复用数据。 | WebAudio 节点编辑器，不是本项目 Tracktion 引擎的替代实现。WASM DSP 不等于可直接加载系统 VST3/AU。未验证 worklet 分配、浏览器兼容和参数时序。 |
| A25 [freeman-jiang/beatsync](https://github.com/freeman-jiang/beatsync) | `D`：README 描述 NTP-inspired 多浏览器时钟同步，Bun HTTP/WebSocket server、Next.js client 与 shared schema；明确 early development。 | MIT，仓库 license 元数据与 [LICENSE](https://github.com/freeman-jiang/beatsync/blob/main/LICENSE) 入口。 | 多设备未来播放时间、时钟偏移与用户端状态反馈的研究入口。 | 网络设备间“毫秒同步”不等于本机 callback sample-accurate，也不等于音箱声学输出对齐。本轮未审查 drift 算法或测量 Wi-Fi/蓝牙表现。 |

## 按症状查配方

以下配方是供后续重构使用的步骤与验收设计，不是已经实施或验证的结论。优先修改当前实现中有证据的成本，不因为一个外部项目“也是 Rust”就迁移引擎。

### 按 Play 后等很久才响

先把等待分开，避免将全部时间记成“IPC 延迟”。至少记录同一 request 的 UI 发出、Rust 接收、主线程执行、准备完成、transport start、首个有效音频 block 与实际输出捕获时间。最后两项不同，设备缓冲和输出链路仍可能延迟声音。冷启动、已预热后启动、seek 后启动分别统计，不只给平均值。

A01 的源码提供一个反例：`play()` 调 `composition.play()`，遍历 clips 建 node、排入 effects，然后 Seek，最后才 Play。它的 `send_command()` 在 sender 满时循环 sleep 1ms，再 `try_send()`，只打印结果。这个实现可以讲清控制消息流，但没有“每次 Play 都是轻命令”的保证，也没有满队列情况下明确的失败返回。[A01]

A14 的 UI dispatch 则将 `Action::Play` 与 `Action::TransportPosition` 分开。`TransportPlay` 在未播放时发 Play，`JumpToStart` 发位置动作。它证明命令边界可分，不证明 Maolan 引擎启动只做常数工作。[M1]

适用于 ZoeyDAW 的配方是保留当前 owner 和 stop fence，分别量出 `prepare` 与 `openDevice` 的占用，再决定是否需要提前准备。不要先增加 CPAL 或播放器插件。后续若分出 prepare/activate，prepared 数据必须带文档 revision、session 和取消身份；旧准备结果不能重新启动已停止或已替换的 session。首声验收要带真实设备和输出捕获，命令 accepted 不是“声音已经出来”。

### 拖 volume、pan、send 时卡顿或重新开始

先判断参数更新是否改变了播放对象身份。参数 gesture 的中间值与最终值都要到音频侧；UI 松手前显示新值、音频只在松手后跳变，不算实时参数成功。

可借鉴的事实有：A01 `SetMixerGain` 是独立命令；A21 的 handle API 可按 sample time 调度参数；A19 README 描述一次 drag 对应一次 undo，但后两项本轮尚未深读实现。[A01][A19][A21]

在当前项目，不要把已经存在的 `updateMixer` 当作缺失功能重做。先检查拖动的每个状态是否被 `sameGraph` 保留在热更新路径。参数命令若要合并，应按目标和参数保留最新值，并保留 gesture 终值；Stop、Seek、Release 不能跟连续参数一起丢弃。参数平滑与队列合并是两件事。平滑需要单独的增益斜坡和声音验收，不能用“没有重建 Edit”替代。

后续验收应同时观察 Edit/plugin 身份、graph build 次数、seek/start 次数、applied sequence 与捕获音频。只看 fader 动画或后端 accepted 不足以证明不中断。

### 移动 Clip 或改路由导致整图重建

A04 的 `SnapshotPublisher` 提供具体做法：一个线程持有 pending `RebuildScope`；scheduler、render graph、data nodes 分别决定是否重建；读取项目版本，构建过程中版本变了就丢弃本次结果；最后再查一次版本，用 `with_parts` 复用未变部分并统一发布。它还合并等待期间的新请求。[P1]

配方不是把 `ArcSwap` 搬进当前 C++ 引擎，而是先列出每种编辑影响的部分。区分位置/裁切、音源读取、DSP 参数、轨道路由、插件实例与全局 tempo。对旧实例的引用、退役和销毁线程作明确规定，再选择增量变更还是准备新图。

A17、A18、A12 可用于看模块归属，但不能从目录推导安全发布协议。A04 的单 writer 不自动解决音频线程最后一个 `Arc` 被释放的问题。新图发布还需要证明旧图、decoder、插件和大块 PCM 不会在实时 callback 被销毁。

对 ZoeyDAW，保留“结构编辑当前会重建”的事实。后续计划可选择逐类减少重建，但不应把拆包直接写成零掉音优化。跨线程修改 JUCE Edit 的要求也不能被外部 Rust 实现覆盖。

### 播放头、meters 或 waveform 把 IPC 堵住

[Tauri v2 官方文档](https://v2.tauri.app/develop/calling-frontend/#channels) 明确：events 面向小数据和多生产/多消费通知，不是低延迟或高吞吐路径；channels 为快速、按序传输设计。该结论也通过 Context7 核对到官方文档源。[T1]

区分三类消息：

| 数据 | 可采用的策略 | 不能丢失的身份 |
| --- | --- | --- |
| 控制确认、错误、生命周期 | 有界、可关联 request 的可靠响应 | session、lease、request sequence、revision、stop/seek generation |
| meters、播放头显示快照 | 固定频率、保留最新值、过时即丢；慢 UI 不积累整段历史 | session、telemetry sequence、applied sequence、采样时钟或采样时刻 |
| waveform、FFT、分析结果 | 独立任务和取消；大数据比较 binary channel 与当前请求响应 | source 指纹、算法版本、任务 generation、请求区间 |

这些是建议的传输分类，不是 Tauri channel 自带背压语义。ordered 也不代表实时期限保证；消费者仍可能处理不过来。任何 IPC 发送都不能直接从音频 callback 执行。

A14 的 `PlaybackTick` 读取 engine snapshot，使用本地时间外推 UI，适合区分“显示插值”与“真实声音时钟”。A22 可进一步研究 atomic playhead 数据，但不能再创建一个与引擎争夺主导权的 UI transport。A23 的 block 积分示例说明 tempo 历史有意义，也暴露了 block 内 ramp 和 seek 换算需要单独设计。[M1][A22][C1]

### 插件扫描、参数和窗口让播放不稳定

将插件工作拆成 discovery、scan、实例创建、state restore、process、UI editor 和销毁。A19 README 的 scan 子进程只能隔离扫描故障。A16 发布说明的“一实例一 host process”是播放期隔离的不同设计，不能混称 sandboxed plugins。[A19][M3]

当前项目继续使用 Tracktion owner。是否增加插件进程隔离，需要后续回答 block 边界、超时后的 bypass、状态恢复、参数回传、原生窗口和时延补偿，不因“共享内存”就写成 zero overhead。插件实例的创建和恢复状态应从热 Play 和连续参数路径中移出，但具体线程约束必须按当前 host API 核实。

许可需分别检查 host 代码、VST3/CLAP/AU SDK、第三方插件和打包资产。A17 是 GPL-3.0-or-later，A21 是 AGPL-3.0 声明，不能因为 Rust API 方便就直接复制进入现有产品。

### 想让 DSP 同时支持 native 和 WASM

A24 的可借鉴点是职责：schema 保存可序列化图，player 将图实例化，worklet 包处理自定义 DSP，editor 只发命令。A12 的 manifest 也把 model/time/mix/playback 与 UI、各插件 host 分开。[W1][S1]

可研究共享纯 DSP 算法和数据结构，但不要共享 OS 设备 owner 或假设相同 transport 实现。WebAudio、Emscripten 与 native 的 callback、内存增长、线程、I/O 和插件格式不同。WASM 版能运行自定义 DSP，不证明它能加载用户安装的 VST3/AU。

A13 是可访问的 browser 产品入口，本轮仅读静态页面；A21 说明 native 与 Emscripten 两种输出，本轮未验证同一工程跨目标的一致性。后续能力矩阵应逐项标 native、web、不可用与降级原因，不用“同一份 Rust”代替验证。

## 与本次实际读取的 ZoeyDAW 代码对照

下面只列本轮直接读取的路径与符号，不推断没读到的前端排队和 UI 行为。

| 对照点 | 当前源码事实 | 外部材料给出的提醒 | 后续重构边界 |
| --- | --- | --- | --- |
| 主线程与 owner | [`PlaybackService::invoke`](../../crates/engine/src/service.rs) 经 `MainThreadDispatcher` 执行，闭包内复核 lease/audition generation，延迟创建 native handle，再做 JSON FFI call。 | Rust callback 示例不自动适配 JUCE message-thread owner。 | 保留一个设备 owner、执行时验证和 stop fence；不新增 CPAL 并行 owner。 |
| Play 的准备成本 | [`EngineSession::apply`](../../crates/engine/native/runtime/engine_session.cpp) 先解码和验证请求。`opening |  | !accepted |  | !sameGraph`时先`prepare`，随后可能 `openDevice`，然后设置 loop/position 并启动 transport。 | A01 提醒 Play 前构建会进入首声路径；A14 提供单独 Play/Position 的命令例子。 | 先测准备、设备打开与实际首声。prepare/activate 拆分需要版本、取消、主线程和对象生命周期契约。 |
| 已有实时 mixer 路径 | 同文件 `updateMixer` 在已有 Arrangement 内设置 track volume、pan、mute、solo、send gain、cue volume。 | 不应再写“每次调音量都重建整个引擎”。 | 检查每项参数是否仍走 `sameGraph=true`，保留现有 instance 身份。 |
| 已有 fade 更新路径 | 同文件 `updateEnvelopes` 比较 fade 字段后调用 `Envelope::updateFades`。 | 不应把 fade 与所有结构修改混为一谈。 | 本轮没有运行该路径，不能宣称无爆音或 UI/native 已一致。 |
| 结构图判定 | [`sameGraph`](../../crates/engine/native/model/playback_model.cpp) 检查 tempo/time signature、sources、轨道身份/路由/自动化、clips 等。audio clip 比较忽略 fade 字段。 | A04 的细粒度 rebuild scopes 值得研究，但不是当前行为。 | 在明确影响集后改分类。保留尚未改造的结构重建事实。 |
| 图切换 | `apply` 准备 candidate 后停止旧 Arrangement transport，替换整个 Arrangement，恢复位置，需要时重新 play。 | 原子发布和图复用需处理对象退役，不能只改发布指针。 | 当前不是无缝增量图协议。重构方案不能把不中断当成现成能力。 |
| telemetry | `EngineSession::telemetry` 返回 session、sequence、appliedSequence、clock、playing、levels、device 和 issues；clock 带 frame/rate 或 musical 数据。 | Tauri channels 是候选运输方式，A22 是时钟共享线索。 | 先保留已存在的身份字段，不用“换 channel”掩盖陈旧样本、慢消费者或时钟定义问题。 |
| 分析调度 | [`playback_waveform` 与 `playback_waveform_range`](../../src-tauri/src/playback/mod.rs) 先创建 job，再 `spawn_blocking` 执行。 | A07 的整文件 preload 不能代替分析任务与播放缓存策略。 | 不把 waveform 生成重新塞进 Play 或 callback，不因拆包再复制取消状态。 |

源码存在这些分支不等于已通过压力和硬件验收。本章没有重新执行任何既有失败，也没有把外部 README 中的性能数字转成当前项目目标。

## 采用顺序

1. 先沿当前调用链量化首声和结构切换成本，保持现有 Tracktion、IPC 字段、工程格式及设备所有权。
2. 对照 A04、A14，定义控制动作与准备结果的版本关系，区分参数、transport 和结构编辑。
3. 根据当前 telemetry 与分析负载评估 channels，不先改通信机制再寻找性能理由。
4. 将插件隔离和跨 WASM 目标作为独立设计题，不夹带在模块拆分中。

以上是本章的采用建议，具体任务与验收由 cookbook 的重构计划统一安排。没有授权新的生产改动。

## 深读来源索引

清单保留用户给出的全部入口，访问失败和继承的 404 记录另行标明。下面集中列出用于具体实现判断的已读一手来源，方便后续固定 commit 或发布版本。

- [A01 messaging implementation](https://github.com/whoisryosuke/daw-tauri/blob/main/src-tauri/src/engine/audio_engine_messaging.rs)：`play` 逐节点入队、Seek 后 Play；`send_command` 满队列 sleep；独立 mixer gain。
- [P1 Pulse snapshot publisher](https://github.com/Toni997/project-pulse/blob/main/src-tauri/src/snapshot/publisher.rs)：pending scopes、单 builder、10ms settle、版本验证、parts 复用与发布。
- [M1 Maolan transport dispatch](https://github.com/maolan/maolan/blob/main/src/gui/update/dispatch/transport.rs)：`Message::TransportPlay`、`JumpToStart`、`PlaybackTick`。Play、Position 与 snapshot 分离。
- [M2 Maolan application manifest](https://github.com/maolan/maolan/blob/main/Cargo.toml)：BSD-2-Clause、`maolan-engine=0.4.9`。[engine manifest](https://github.com/maolan/engine/blob/main/Cargo.toml) 确认真实上游，不再猜仓库名。
- [M3 maolan-engine 0.4.9 package](https://docs.rs/crate/maolan-engine/0.4.9)：发布说明的 feature 和 OOP 模型。尚未审查 callback 实现。
- [V1 Vibez dev manifest](https://github.com/alexanderwanyoike/vibez/blob/dev/Cargo.toml)：workspace、GPL-3.0-or-later、rtrb。RT 声明仍只到 README 证据等级。
- [S1 Soundcraft manifest](https://github.com/storytold/soundcraft/blob/main/Cargo.toml)：time、model、mix、engine、playback、automation 和 hosts 分包，MIT OR Apache-2.0。
- [W1 awsm-audio manifest](https://github.com/awsm-fun/awsm-audio/blob/main/Cargo.toml)：schema/player/worklet/editor-protocol 分包，MIT OR Apache-2.0。运行机制的描述来自项目 README，未把 manifest 当 callback 证明。
- [C1 midi_clock_sync 0.1.0 transport](https://docs.rs/crate/midi_clock_sync/0.1.0/source/src/transport.rs)：按 block 累积历史 BPM，block 开头更新 automation，seek 用当前 BPM 换算。
- [T1 Tauri v2 channels 与 events](https://v2.tauri.app/develop/calling-frontend/#channels)，[官方文档源](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/calling-frontend.mdx)：ordered channels 与 events 的吞吐、低延迟用途边界。
