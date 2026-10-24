# ZoeyDAW 原生音频库与保持音高 BPM 同步调研

状态：PASS，研究交付完成；存在下列集成风险，尚未完成选型。调研日期 2026-10-22。

范围为 macOS、Windows 桌面本地 WAV / AIFF / FLAC / MP3 的解码、流播、随机定位、保持音高变速和多轨输出。没有改项目代码、引入依赖、运行项目测试或音频性能实验。C++ 和商业 SDK 都是允许的候选，纯 Rust 不是产品硬要求。

## 结论先行

- 建议保留 CPAL、Symphonia、Rubato 作为设备输出、解码、采样率转换的首轮候选。它们不是一套完整 DAW 引擎，更不自动解决 Auto-Warp。
- 保持音高变速优先比较 Signalsmith Stretch 与 Rubber Band R3。前者 MIT、嵌入较轻；后者有明确的实时/离线模式、起始延迟和立体声选项，但闭源分发通常需要商业许可。没有实测证据证明其中一个达到或优于 Live。
- Firewheel 是值得验证的图引擎候选，不是现成的磁盘流播 Warp 播放器。它当前内置 sampler 的变速会改变音高，部分流播路径尚未实现。可以写自定义节点接入成熟流播器和伸缩器，不能据此推论 ZoeyDAW 无法支持这些功能。
- Creek 可复用其后台 I/O、预取和多缓存机制，但发布版适配器依赖 Symphonia 0.5，未暴露 AIFF feature。不能把 Symphonia 0.6.1 的能力表直接算到 Creek 1.2.3 上。
- Beat This! 1.1.0 是值得作后台 beat/downbeat 分析基准的许可友好候选，代码和模型权重标 MIT。它依赖 Python/PyTorch，不能直接当成熟 Rust 原生组件。Essentia 可以作另一个 tempo/beat 基准，但 AGPL/商业许可和依赖清理成本更高。两者都不是已验证的 Live Auto-Warp 替代品。

## 证据范围与 Context7 结果

已读取并调用 Context7 的 `resolve-library-id`、`query-docs`，命中并查询：

| 库 | 实际命中的 Context7 ID | 查询得到的关键内容 | 交叉核对 |
| --- | --- | --- | --- |
| CPAL | `/rustaudio/cpal` | `asio`、LLVM/Clang、SDK 下载、回调与 buffer 配置 | 固定 v0.18.2 的 Cargo、WASAPI 和 ASIO build 源码 |
| Symphonia | `/pdeljanov/symphonia` | `aiff` / `mp3` 默认不启用、容器与 codec 区分、准确 seek 合同 | 固定 v0.6.1 的 feature 图、AIFF/WAV parser、FormatReader |
| Signalsmith Stretch | `/signalsmith-audio/signalsmith-stretch` | 输入/输出延迟、`process` 的输入输出比例、seek/reset/flush | 固定 `a670068d…` 的头文件与通道相位处理 |

Context7 还返回了 Signalsmith 的 Rust wrapper ID `/colinmarc/signalsmith-stretch-rs`。本轮没有对 Firewheel、Rubato、Creek、Rubber Band 分别获得 Context7 查询结果，改用官方源码和版本文档。工具限制每个问题最多三次 resolver/query，已用于上述三个核心环节。这里不声称其他库“没有被索引”。Context7 结果指向浮动分支，版本结论以下列固定 tag/commit 或发布源码为准。

本轮网络限制：crates.io API 返回 403，Creek Codeberg 原始文件返回 429，改读 docs.rs 发布源码；Signalsmith、Rubber Band 的 GitHub `releases/latest` 返回 404，改用源码版本宏、commit 和官方发布页，不能把 404 解释成项目没有发布或停更。

## 版本、维护与嵌入成本

| 候选 | 实际核实版本或 commit | 许可证与嵌入成本 | 判断 |
| --- | --- | --- | --- |
| CPAL | [v0.18.2，2026-08-16 发布](https://github.com/RustAudio/cpal/releases/tag/v0.18.2)；[Cargo](https://github.com/RustAudio/cpal/blob/v0.18.2/Cargo.toml) | Apache-2.0；Rust 1.85。macOS 调 CoreAudio，Windows 调 WASAPI，ASIO 可选且有 C++ SDK/toolchain 成本 | 输出短名单，设备兼容性需真机 |
| Firewheel | [0.14.0 发布文档](https://docs.rs/firewheel/0.14.0/firewheel/)；源码树 [`34b35cad0535bf0a9542ac977b34744805d6cc03`](https://github.com/BillyDM/Firewheel/tree/34b35cad0535bf0a9542ac977b34744805d6cc03) 的 Cargo 为 0.14.0 | MIT OR Apache-2.0；edition 2024，依赖图较大；[CPAL backend Cargo](https://github.com/BillyDM/Firewheel/blob/34b35cad0535bf0a9542ac977b34744805d6cc03/crates/firewheel-cpal/Cargo.toml) 对接 CPAL 0.18.2；另有 RtAudio backend | 图引擎短名单，不把内置 sampler 当完整 DAW 播放路径 |
| Symphonia | [v0.6.1，2026-08-13 发布](https://github.com/pdeljanov/Symphonia/releases/tag/v0.6.1) | MPL-2.0，源码文件头明确；不是整个产品必须开源的简单等式，分发时仍需审计修改文件与 notice 义务 | 解码首轮候选 |
| Rubato | [v5.0.1，2026-10-01 发布](https://github.com/HEnquist/rubato/releases/tag/v5.0.1)，release 指向 `eb9190855133fd40d54b17f8d17065ef98ab4db0`；[Cargo](https://github.com/HEnquist/rubato/blob/v5.0.1/Cargo.toml) | MIT OR Apache-2.0；Rust 1.87；最新 API 使用 audioadapter 5，不应照抄旧 0.16 示例 | SRC 短名单；不是保持音高伸缩器 |
| Creek | [1.2.3 发布源码](https://docs.rs/crate/creek/1.2.3/source/Cargo.toml)，[vcs 元数据](https://docs.rs/crate/creek/1.2.3/source/.cargo_vcs_info.json) 指向 `4accd9a9787554eebb2805f01ffc18fd4f1d36e2` | MIT OR Apache-2.0；creek-core 0.2.3、creek-decode-symphonia 0.3.3；[官方 GitHub 镜像](https://github.com/MeadowlarkDAW/creek) 声明已迁 Codeberg，不能用镜像活跃度判断现维护状态 | 有条件保留，需要格式适配/依赖升级验证 |
| Signalsmith Stretch | 固定 [`a670068d9aeb64913331d5cc29337b19a457a7df`](https://github.com/Signalsmith-Audio/signalsmith-stretch/commit/a670068d9aeb64913331d5cc29337b19a457a7df)，2026-09-25；[头文件](https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/a670068d9aeb64913331d5cc29337b19a457a7df/signalsmith-stretch.h) `version={1,3,2}` | MIT；C++11，依赖 Signalsmith Linear；此 commit 的 CMake 把 Linear 固定为 0.6.4。需要可重现 vendoring、C++ 编译与 ABI 封装 | 保持音高实时伸缩首轮候选 |
| Rubber Band | [官方 v4.0.0，2024-10-25 发布](https://breakfastquay.com/rubberband/)；[源码头文件](https://github.com/breakfastquay/rubberband/blob/e4296ac80b1170018a110bc326fd0d45a0eb27d6/rubberband/RubberBandStretcher.h) 宏 4.0.0；GitHub 镜像固定 `e4296ac80b1170018a110bc326fd0d45a0eb27d6`，2025-02-27 | GPL-2.0-or-later 或商业许可；C++，有 C API；可用内建 FFT/resampler 降低第三方依赖，外部 FFTW/IPP 等另审许可证 | 质量/实时/离线对照候选；商业许可不是淘汰理由，但必须预算 |

上表版本是本轮实际读取到的发布版本或源码版本，不承诺其后未出现任何其他分支、预发布版或站点未收录版本。许可证摘要用于选型，不代替分发前法律审查。

## macOS / Windows 输出与 ASIO / WASAPI

### CPAL 的已核实事实

[固定版 Cargo](https://github.com/RustAudio/cpal/blob/v0.18.2/Cargo.toml) 在 Apple target 引用 CoreAudio 相关库，在 Windows target 引用 Windows Audio API；Windows 的 `asio` feature 引入 `asio-sys`。

[WASAPI `device.rs`](https://github.com/RustAudio/cpal/blob/v0.18.2/src/host/wasapi/device.rs) 的输入、输出初始化使用 `AUDCLNT_SHAREMODE_SHARED`。同文件说明 `BufferSize::Fixed` 改变环形缓冲延迟，不会把共享模式的设备回调周期直接变成所请求周期。因此：

- 不能把 CPAL 0.18.2 的 WASAPI 包装当成已经提供可选择的 exclusive mode。
- 不能仅凭设置 64/128 frames 就承诺设备端低延迟。需记录实际 buffer、callback timestamp 和硬件往返延迟。
- v0.18.2 发布说明修复了设备丢失时 `drop/play/pause` panic、ASIO duplex 独立 Device handle 丢音频、WASAPI buffer 尺寸和 timestamp 问题。它表明维护在进行，不表明已覆盖目标用户全部声卡。

### “ASIO 只是 feature”不成立

[asio-sys v0.18.2 build.rs](https://github.com/RustAudio/cpal/blob/v0.18.2/asio-sys/build.rs) 的 `get_asio_dir`、`create_lib`、`create_bindings` 证明它会寻找 `CPAL_ASIO_DIR`，否则尝试下载 SDK，编译 C++ 并通过 bindgen 生成绑定。[同版 setup 文档](https://github.com/RustAudio/cpal/blob/v0.18.2/asio-sys/README.md) 列出 LLVM/Clang 和运行时 ASIO driver 要求。

[Steinberg 2025-10-15 官方公告](https://ocl-steinberg-live.steinberg.net/_storage/asset/808575/storage/master/Press%20Release%20-%202025-10-15%20-%20OBS%20Partnership-%20EN.pdf) 明确 ASIO 转为 GPLv3 与专有许可双轨。CPAL 的 Apache-2.0 不自动覆盖 SDK 的许可，也不授权重新分发第三方声卡驱动。本轮没有核实 build 下载 URL 当前返回的具体 SDK zip 版本，不能宣称已解决这一层合规。

推荐在后续验证中冻结 SDK 包与校验和，用 `CPAL_ASIO_DIR` 提供受控构建输入，而不是让 release build 随网络下载结果变化。ASIO host 枚举、设备选择、驱动不可用时的 UI 和恢复都需要应用实现。这里不是禁用 ASIO，而是把它当正式发布能力而非一个 Cargo 开关。

## 四种格式：支持需要容器、codec 和启用项同时成立

[Symphonia v0.6.1 feature 图](https://github.com/pdeljanov/Symphonia/blob/v0.6.1/symphonia/Cargo.toml) 是以下判断的直接依据。

| 输入 | Symphonia 0.6.1 的具体依据 | 限制 |
| --- | --- | --- |
| WAV | `wav` demuxer + `pcm` decoder；两者默认启用；[`WaveFormatChunk::read_pcm_fmt/read_ieee_fmt`](https://github.com/pdeljanov/Symphonia/blob/v0.6.1/symphonia-format-riff/src/wave/chunks.rs) 分支支持整数 8/16/24/32 和 IEEE float32/64 | `.wav` 是容器，不等于所有压缩 WAVE 子格式、任意损坏文件、RF64 等均已验收 |
| AIFF / 部分 AIFC | `aiff` 默认关闭，PCM 另需 `pcm`；[`CommonChunk::read_pcm_fmt` 和 `parse_aifc`](https://github.com/pdeljanov/Symphonia/blob/v0.6.1/symphonia-format-riff/src/aiff/chunks.rs) 有 BE PCM 1–32 bit，AIFC 支持 NONE、alaw/ulaw、in24/in32、23ni、fl32/fl64、sowt/twos、raw 等明确分支 | AIFC 的未知 compression type 返回 unsupported；例如不能把 sowt 分支支持的 16 bit 外推到所有位深。不要宣传“所有 AIFF/AIFC” |
| FLAC | `flac` bundle 包含相应实现，默认启用 | 特定采样率、位深、多声道、seek table 缺失与异常元数据仍需语料验证 |
| MP3 | `mp3` 或 `mpa` feature，默认关闭 | CBR/VBR、Xing/Info/VBRI、encoder delay/padding 和 seek 必须测试。0.6.1 刚修复静音区丢解码及带 CRC 的 Xing/VBRI 被忽略，不能把旧版结果混用 |

推荐显式固定这次需求对应的 features，而不是只写 `all` 并声称“全格式”。这里验证的是解码路径，不是编码/导出全部格式。`all-formats` 也只代表库已实现的容器集合，不代表所有世界上的格式。

### Seek 不是一次 API 调用就样本精确

[Symphonia v0.6.1 `FormatReader::seek`](https://github.com/pdeljanov/Symphonia/blob/v0.6.1/symphonia-core/src/formats/mod.rs) 明确：

- `Accurate` 定位在目标之前的 packet；reader 本身不能定位到任意精确音频 frame。
- 调用方需要解码并丢弃目标前的音频；successful seek 后应 reset 消费它的 decoder。
- `Coarse` 允许落在目标前或后，不能用于精确 clip/loop 起点。
- `FormatOptions::prebuild_seek_index` 和 `seek_index_fill_period_ms` 是打开时成本、seek I/O 与索引内存的权衡，不是“seek 永远 O(1)”保证。

MP3 的时间位置必须结合实际 packet timestamp、time base、delay/padding。UI 上的秒数或估算总帧数不能直接当无损 PCM 的索引使用。解码、建索引、磁盘 seek 都放在非实时路径。

## 流播与预处理缓存

### Creek 的可复用部分与发布版缺口

[creek-core 0.2.3 `ReadDiskStream`](https://docs.rs/crate/creek-core/0.2.3/source/src/read/read_stream.rs) 实际创建 rtrb 消息环，`ReadServer::spawn` 后台 I/O，预分配 read/prefetch/cache 数据；`SeekMode` 可自动或指定 cache。缓存命中可继续读，未命中需要缓冲，不是所有随机 seek 都即时。

同源 `can_move_cache` / `cache` 文档和实现指出，连续移动仍被播放依赖的 cache 可能使最旧区域静音。产品层需要定义缓冲状态、取消过时 seek 和预读优先级，不应把静音当成“成功播放”。`block_until_ready` 不能在音频回调使用。

[Creek 1.2.3 Cargo](https://docs.rs/crate/creek/1.2.3/source/Cargo.toml) 没有 `decode-aiff`；[creek-decode-symphonia 0.3.3 Cargo](https://docs.rs/crate/creek-decode-symphonia/0.3.3/source/Cargo.toml) 依赖 Symphonia `0.5`，features 列表也没有 aiff。`decode-all` 不能补出未暴露的 feature。可考虑为相同 0.5 版本显式合并 feature 或实现/更新 decoder adapter，但这两条都没有在本轮编译验证，不能当开箱即用的四格式流播。

[发布版 decoder 源码](https://docs.rs/crate/creek-decode-symphonia/0.3.3/source/src/lib.rs) 中 `SymphoniaDecoder::seek/decode` 有 Accurate seek、`required_ts-actual_ts` 和丢弃前段逻辑；打开文件还要求 `n_frames`，不存在时返回 `NoNumFrames`。这会影响某些缺元数据文件。必须用 MP3/VBR 与随机定位语料核验，不单凭 README 宣称所有格式精确 seek。

### Firewheel 不补齐这些能力

固定源码 [`SamplerNode`](https://github.com/BillyDM/Firewheel/blob/34b35cad0535bf0a9542ac977b34744805d6cc03/crates/firewheel-nodes/src/sampler.rs) 的 `speed` 明确说明慢放降低音高、快放提高音高。`PlaybackSpeedQuality` 当前是无 anti-alias filter 的 `LinearFast`。流播 resource 的 [类型定义](https://github.com/BillyDM/Firewheel/blob/34b35cad0535bf0a9542ac977b34744805d6cc03/crates/firewheel-nodes/src/sampler/resource.rs) 标记未实现，sampler 的两个 `Streamed` 分支实际为 `todo!()`。

结论只针对这些内置实现。Firewheel 仍可承载自定义 clip reader/stretch node；相应工程成本必须计入比较，不是产品能力禁区。

### 推荐验证的缓存策略，不是既定架构

[推荐] 短 sample 可保留内存 PCM，长文件优先后台流播。压缩格式可后台建立规范 PCM 缓存和 waveform/分析缓存，避免每次拖动都重新走长距离 MP3 解码。选中条目先预读起点和试听位置，再做全长分析，不让建 waveform/beat map 阻塞首次原速试听。

不要默认全量转码后才能播放，也不要默认每个项目长期保留所有 tempo 的完整渲染版本。规范 PCM 缓存、分析结果、可选 stretch 渲染是三类不同资产。缓存身份至少包含源文件内容身份、decoder/算法版本、采样率/通道映射、分析设置；渲染另包含 warp map、目标 tempo 与质量模式。缓存损坏或失效后重建，不写回用户源音频。

[推论] 对本地文件可提前读取伸缩器需要的未来输入并预生成首块，从而让算法内部延迟不必直接转化成每次按播放的可感知等待；是否成立要测冷缓存、随机 seek 和多轨争用。不能据此提前宣称比 Live 快。

## 保持音高变速链路

职责必须分开：

1. 解码把容器数据变为 PCM。
2. 采样率转换解决文件与设备 rate 不同，不是 Warp。
3. 分析器估计 beats/downbeats/tempo 变化，用户可修正。
4. 调度层把项目 musical position 映射到源音频时间。
5. 伸缩器按该映射生成保持音高的音频，多轨补偿延迟后混音。
6. 设备 backend 按硬件时钟输出。

固定 tempo 且已知正确源 BPM 时，时长比 `r = source_BPM / target_BPM`。例如 100→120 BPM，目标时长为源时长的 5/6，音高因子保持 1。若输入/输出已在同一采样率，Signalsmith 的平均 `inputFrames/outputFrames` 为 120/100，而 Rubber Band `setTimeRatio` 是 output/input 的 100/120。两种 API 的比值方向不同，必须有回归样例。带 tempo map 时不能只用一条全文件比值。

### Rubato 的边界

[Rubato 5.0.1 `Resampler`](https://github.com/HEnquist/rubato/blob/v5.0.1/src/lib.rs) 提供 `input_frames_next`、`output_frames_next`、`output_delay`、`reset`、`process_into_buffer`；`process` 会分配输出，实时使用应预分配并选前者。`Fft` 是固定采样率比，`Async` 适合变化比率与设备时钟漂移。[官方说明](https://github.com/HEnquist/rubato/blob/v5.0.1/README.md) 区分两者并说明 SIMD、chunk size 与质量成本。

改变重采样比并在同一设备 rate 播放会改变音高，不能仅凭 Async 支持动态 ratio 就称它能“BPM 同步保持音高”。保留 SRC 职责，淘汰它作为本需求独立伸缩器的选项。

### Signalsmith Stretch

[固定头文件](https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/a670068d9aeb64913331d5cc29337b19a457a7df/signalsmith-stretch.h) 的 `process(inputs,inputSamples,outputs,outputSamples)` 接受不同长度，内部按 output interval 调度频谱处理。`setTransposeFactor(1)` 保持原调，比例由输入/输出帧供给决定。调用方须用累计分数位置控制整数帧取整，不能逐 block 独立舍入积累漂移。

- `presetDefault` 使用约 120 ms block、30 ms interval；`presetCheaper` 约 100 ms block、40 ms interval。它们是窗口/计算间隔，不是实测端到端延迟。
- `inputLatency()` 和 `outputLatency()` 分别报告输入前瞻与输出延迟；split computation 额外增加一个 interval 的输出延迟，换更均匀的计算负载。
- `reset` 清状态；`seek` 用前段输入建立 history；当前源码还有 `seekLength`、`outputSeek`、`outputSeekLength`。跳转不能只清输出队列而继续使用旧频谱状态。
- `processSpectrum` 中选择通道预测后，其他通道 `channelTwist/channelPhase` 锁相，源码注释为 “All other bins are locked in phase”。这证明有多声道关联处理，不是左右声道各开一个无关联实例。实际立体声/mono sum 品质仍需验收。
- [官方使用文档](https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/a670068d9aeb64913331d5cc29337b19a457a7df/README.md) 建议时间拉伸更适合 0.75x–1.5x 的温和变化。极端比例、鼓瞬态、复杂立体声和人声都不应直接承诺。

Rust wrapper 不能不审计直接采用。读取到的 [0.1.3 Cargo](https://github.com/colinmarc/signalsmith-stretch-rs/blob/92b8b438c313a727de704c6cf7cabce213e10593/Cargo.toml) 使用 bindgen 0.70 与 cc；[固定源码树](https://github.com/colinmarc/signalsmith-stretch-rs/tree/92b8b438c313a727de704c6cf7cabce213e10593) 的 Stretch 子模块 pinned 为 `c5987267e6ad42ff9b620b2802c4600472e85818`，不是上面的当前 1.3.2 commit。更具体地，[`wrapper.cpp`](https://github.com/colinmarc/signalsmith-stretch-rs/blob/92b8b438c313a727de704c6cf7cabce213e10593/src/wrapper.cpp) 中 `signalsmith_stretch_set_formant_base` 调的是 `setFormantSemitones`，而非上游 `setFormantBase`。因此保留上游算法候选，wrapper 需要修复/审计或换受控薄绑定。没有运行这段代码，不声称已经复现听感故障。

### Rubber Band

[4.0.0 API 头文件](https://github.com/breakfastquay/rubberband/blob/e4296ac80b1170018a110bc326fd0d45a0eb27d6/rubberband/RubberBandStretcher.h) 和[官方 integration notes](https://breakfastquay.com/rubberband/integration.html) 提供更明确的集成合同：

- `RubberBandStretcher` 支持 time 与 pitch 独立变化。新的 `RubberBandLiveShifter` 只处理 pitch，不能因为名字有 Live 就选来做 tempo 同步。
- Offline 是 `study` + `process/retrieve` 两遍，可做 key-frame map，自动处理起始补偿；Realtime 无 study pass，可动态改比率，但调用方处理 padding、delay、输出计数。
- 输出帧数局部不固定。用 `available()`、`getSamplesRequired()`、`process()`、`retrieve()` 形成 pull 流程，不能假设一次输入必返回固定输出长度。实时尾部也可能需按期望时长裁剪。
- realtime 正常参数下无 allocation/lock/blocking，但超出预设 process size、错误和极端比率变化等是例外。初始化和首尾 priming 放到回调之外。
- `getPreferredStartPad` 与 `getStartDelay` 用于首部补零/裁剪，seek/reset 后重新建立正确状态。API 不允许另一个线程同时 `process` 和改 ratio。
- R3 `OptionEngineFiner | OptionChannelsTogether` 是官方建议的高质量/立体声起点；R3 short window 可作低成本对照。R2 percussive 模式也值得测，不是默认只挑最慢模式。
- 官方给出的常见 44.1/48 kHz start delay 示例为 R2 默认 1024 frames、R3 默认 2048、R3 short 1280，约 21–46 ms；这是参考配置值，不是 ZoeyDAW 设备到耳朵的实测总延迟，也不含完整 input priming。

闭源产品不能因为 Rust binding 本身 MIT 就忽略底层 GPL。[官方 licensing](https://breakfastquay.com/rubberband/) 要求专有分发取得商业许可；[README](https://github.com/breakfastquay/rubberband/blob/e4296ac80b1170018a110bc326fd0d45a0eb27d6/README.md) 另列 FFTW/IPP 等依赖许可证。许可可买，C++ 可嵌入，这些是成本而非技术淘汰条件。

## 控制命令与实时边界

“队列满就随便丢控制命令”不适合此产品。

[Firewheel `FirewheelContext::update`](https://github.com/BillyDM/Firewheel/blob/34b35cad0535bf0a9542ac977b34744805d6cc03/crates/firewheel-graph/src/context.rs) 在消息满时返回 `MsgChannelFull`，并恢复未发送的 event group 或 graph schedule；不是默默把用户操作丢掉。[`BufferOutOfSpaceMode`](https://github.com/BillyDM/Firewheel/blob/34b35cad0535bf0a9542ac977b34744805d6cc03/crates/firewheel-graph/src/processor.rs) 提供 Allocate/Panic/DropEvents，默认 AllocateOnAudioThread，还明确 DropEvents 一般不推荐。这说明启用图引擎不等于已经保证实时无分配。

[推荐] meter、波形显示进度和连续拖动中的过时中间值可以合并为 latest value。stop、seek 的最终目标、导入 clip、轨道路由切换和资源销毁不能任意丢失。要有有界容量、控制侧重试/合并或序列化、最终状态确认。不要在音频回调等待 UI、拿普通 mutex、打开文件、解码压缩音频、创建/销毁伸缩器或进行大内存释放。

“纯 Rust 必然性能好”也不成立。上述 Firewheel 默认溢出分配、Rubato 分配型 convenience API、线性无 anti-alias sampler 都展示了语言之外的选择。DSP 的算法、FFT/SIMD backend、block size、缓存局部性和 worst-case 调度决定实时表现。C++ Signalsmith/Rubber Band 不能因语言被排除；跨 ABI 的复制/布局成本需要量化。

## Beat / downbeat / tempo 分析补充

保持音高伸缩不等于检测源 BPM、首拍、拍号或 tempo map。Signalsmith 的频谱/音高处理不返回这些信息。Rubber Band 的 transient 分析也不等于歌曲 downbeat 或可编辑 Warp map。

### Beat This! 1.1.0

[官方 1.1.0 发布记录](https://github.com/CPJKU/beat_this/releases/tag/v1.1.0) 为 2026-04-14，模型未变，新增非 CUDA accelerator 支持等维护内容。[固定 `inference.py`](https://github.com/CPJKU/beat_this/blob/v1.1.0/beat_this/inference.py) 的 `Audio2Beats` 返回 beat/downbeat 位置；`Audio2Frames` 将立体声均为 mono，按 22050 Hz 预处理，`Spect2Frames` 分块推理再聚合。它适合后台文件分析候选，不应在设备回调跑。

[官方 License 章节](https://github.com/CPJKU/beat_this#license) 明确代码与发布模型权重 MIT，同时提醒训练音频版权/受限 CC 可能影响具体用途。其主模型约 78 MB、小模型约 8.1 MB 是官方标称，未实测加载内存。直接分发 Python/PyTorch 会增加安装包和维护成本；导出 ONNX、Rust inference、Windows CPU 与 Apple accelerator 上的算子/数值一致性，本轮均未核验。不能把“可转换”当作已支持。

[推荐] 把它作为 beat/downbeat 质量基准和候选后台实现，先用 small/main 两档测时延与正确率。拒绝在线自动下载模型进入发布主路径，后续需冻结权重、hash、许可证与离线安装策略。

### Essentia RhythmExtractor2013

[官方算法文档](https://essentia.upf.edu/reference/std_RhythmExtractor2013.html) 标 2.1-beta6-dev；文档链接到可固定的 [`v2.1_beta5-1445-gb9fa6cb6` 源码](https://github.com/MTG/essentia/blob/v2.1_beta5-1445-gb9fa6cb6/src/algorithms/rhythm/rhythmextractor2013.cpp)。`RhythmExtractor2013` 返回 bpm、ticks、confidence、estimates、bpmIntervals；要求输入 44100 Hz。multifeature 可给 confidence，degara 的 confidence 固定 0。该接口没有 downbeat 输出。

源码的 streaming `process()` 在 `shouldStop()` 后汇总输出，不能把 “streaming algorithm” 标签直接宣传为能在首次几十毫秒内提供可靠最终 BPM。tick 间隔可帮助生成 tempo 候选，但稳定 tempo map、首拍和 pickup 的语义仍需应用决策与人工修正。

[官方 licensing](https://essentia.upf.edu/licensing_information.html) 提供 AGPLv3 与商业许可，训练模型另有默认 CC BY-NC-ND 4.0 条件。不要混淆纯算法与另行下载模型的许可，也不要把 AGPL 本身误说成禁止商业使用；闭源商用应询价并审计 FFTW 等第三方权利。这里保留为基准/商业候选，不建议未经范围裁剪就嵌入完整依赖栈。

另读了 [aubio 0.4.9 tempo API](https://aubio.org/doc/latest/tempo_8h.html)：它有 beat、BPM、confidence，未发现该 tempo 接口提供 downbeat。未继续扩展它为第三套详细候选，也不把 beat detector 宣传为 downbeat detector。

共同限制：beat/downbeat 估计不是语义保证。BPM 半速/双速、无鼓开头、弱起、非 4/4、速度漂移、自由节奏都需测试。即使模型返回 downbeat，也不是保证“歌曲第一个 sample = 1.1.1”。

## 旧陈述的修正

本轮未定位用户旧文档的具体路径。以下针对任务中引述的四个命题，不冒充逐行审阅：

| 过强陈述 | 可保留的准确表述 |
| --- | --- |
| 全格式支持 | 明确列出 Symphonia 版本、容器/codec/features、位深与语料结果；Creek 适配器另核对，不能传递性套用 |
| ASIO 只是 feature | feature 开启编译路径；SDK、Clang/C++ toolchain、许可、声卡 driver、运行时 host 选择、恢复与发布验证都独立存在 |
| 控制命令可以丢弃 | 部分显示数据和过时连续值可合并；最终用户意图和有顺序副作用的命令要确认完成，不能无声丢失 |
| 纯 Rust 必然更快 | 需要同一机器、质量设置、缓冲与语料下的 tail latency、dropout、内存和听感对比；语言不是结果 |

## 最小可重复验证方案

这是一份下一轮可执行的验证规格，不是声称本仓库已有这些命令或本轮已跑过。无需把候选全部接进 UI，先做独立离线/设备回调驱动程序，锁版本后在 macOS arm64 与 Windows x64 各运行同一 corpus 和命令参数，输出 CSV 与音频。

### 固定输入和配置

- corpus manifest 保存文件 SHA-256、来源许可、格式/位深/rate/channels、预期 frame 数、参考 beat/downbeat。包含 WAV PCM16/24/float32、AIFF PCM16/24、AIFC float32 与明确不支持的负例、FLAC16/24、MP3 CBR/VBR/Xing/无完整长度元数据。
- 合成素材固定种子。最小集合为 30 秒 440 Hz 双通道同相信号、右通道反相信号、每 0.5 秒同位置 impulse、仅左/仅右 impulse、120→135 BPM 渐变 click、2 小时长文件。再加有合法使用权的鼓 loop、人声、复杂 mix 与弱起素材，避免只测正弦波。
- 输出 48 kHz、stereo float32；设备 block 请求 64/128/256/512，并记录实际 callback 大小；stretch 时长比 0.5/0.75/1/1.25/1.5/2，另外测 100→120 BPM 与动态 120→128。不要把设备声卡不支持的配置标作算法失败。
- Signalsmith default/cheaper/split 分别记录；Rubber Band R2、R3 default、R3 short + ChannelsTogether 分别记录；两个都是 pitch factor 1。SRC 44.1→48 与 stretch 独立测，再组合测。

### 运行方式与产物

后续独立程序应接受固定参数 `--manifest --engine --sample-rate --block-frames --tracks --seek-seed --output-dir`，保存源码 commit、Cargo.lock、C++ compiler/flags、FFT backend、OS/CPU/电源模式、驱动/SDK 版本。一次 warm-up 后重复 5 次，离线正确性与设备压力分两组，不能以渲染平均速度替代回调 deadline。

可先用已存在的 Rubber Band 官方 CLI 生成离线听感对照，例如 `rubberband -3 -t 0.833333333333 -p 0 input.wav output.wav`。它只验证离线时长/音高与听感，不验证 realtime integration。本轮未下载或执行该工具。

| 验证 | 可重复动作 | 记录与候选验收条件 |
| --- | --- | --- |
| 解码与 frame 数 | 每个文件全量解码为基准 PCM；固定 seed 做 1000 次随机 seek，比较窗口 | 无损输入与连续解码一致；MP3 与同版连续解码对齐后的窗口比较，单独报告开头 delay/padding 和 preroll，不拿有损 MP3 对原 WAV 作逐样本相等断言 |
| 音高与时长 | 440 Hz 与已知 impulse 序列按固定 ratio 拉伸，显式执行 priming/flush | 纯音稳态基频误差建议 <1 cent；首尾期望 frame 数、impulse 偏移、ratio 累计漂移；实时变速局部瞬态允许怎样偏离需用听测决定，不能为每个瞬态强加样本精确位置 |
| 立体声 | 同相、反相、单边 impulse，再听真实宽立体声 | 同相 L-R 残差、反相 mono sum、串扰与相关性；合成同相理想残差建议低于 -100 dBFS，真实音频报告变化，不伪装统一硬阈值 |
| seek/reset/loop | 固定 seed 跳转 1000 次，在每种 ratio 下跳入中段、首尾、静音，循环 10000 次 | 首块无旧位置残留；首拍/播放位置无累计漂移；记录冷/热 cache 首声 p50/p95/p99、接缝 peak 和人工 click 判定 |
| 多轨实时 | 1/8/32/64 stereo tracks，源文件不同，同一硬件时钟；加入 UI 快速选择与文件分析负载 | 每 callback 的 CPU 时间 p50/p95/p99/p99.9/max、deadline misses、xrun、worker backlog、缓存 miss、分配次数；48k/128 deadline 为 2.667 ms，建议 DSP p99.9 先留至少 50% 余量，最终门槛由真机/参考比较校准 |
| 命令可靠性 | 故意填满队列；交错 preview start/stop/seek/remove/change tempo | 最终状态与命令序号一致，无 ghost preview、丢 stop、引用已释放资源；可合并中间值，但最终位置必须完成 |
| 分析正确性 | 同一人工标注语料跑 Beat This! 与 Essentia；不使用其训练集冒充独立验证 | beat/downbeat F1、半/双速错误、首拍错误、tempo 漂移分段误差、unknown 比例、cold/warm wall time、RSS；没有 downbeat 的算法该项记不支持，不记 0 误差 |
| 体验比较 | 同一音频、设备、项目 BPM，在 Live 与候选原型做首次选中试听、冷导入、拖入、seek、改 BPM | 输入动作到首声、首次可听/可同步的分开时延、CPU 峰值、同步误差、ABX/盲听与崩溃/丢音；缓存预热状态分别记录 |

建议首轮对比目标是找出瓶颈与淘汰依据，不是用一台机器的最高 track 数宣传优于 Live。Live 首次分析可能阻塞文件播放这一体验可以成为异步分析设计的改进假设，但本报告未操作 Live 验证，也未证明候选已改善。FL 的 realtime Stretch 和 offline Elastique 同样不可当作同一种实现进行不等价比较。

## 仍待核实，不阻止研究结论

- macOS/Windows 真机的设备回调、ASIO driver 稳定性、热插拔和最终发行包，本轮未测试。
- Signalsmith/Rubber Band 在目标素材与比例下的音质、CPU tail latency、首声等待，本轮没有数据。
- Creek Codeberg 当前分支未完整读取，发布版的 AIFF 与 Symphonia 0.6 适配路径未编译确认。
- Beat This! 的可移植推理包、权重 hash、CPU/MPS/Windows 支持与训练数据权利审查未完成；其 MIT 声明不等于产品分发审查完成。
- 当前四种格式是明确目标，支持清单最终必须由实际 corpus 验收形成。不能用 README、库语言或 feature 名字替代。
