# ZoeyDAW 开源 DAW 媒体与播放架构调研

状态：PASS，研究范围完成。采用建议仍有 ISSUES，见末节。

本轮只读官方手册与实际源码，未运行这些项目，未编译、试听、测试或测量性能。没有修改 ZoeyDAW 项目代码。文中的“事实”指源码或官方文档能证明的行为，不代表本机已验收。

源码快照：Ardour `b896344c8d16f89e04a235562ab31594605c6715`；Tracktion Engine `877e39c0fe9f1c3e4a9d836f5f338688250875d7`；Futureboard Studio `b923c53c0aa77a473f488cb77a5f05738c023cb5`。后两者包含正在演进的主开发分支，不能把这些符号当成某个稳定发行包的 API。

## 结论

1. **借鉴 Ardour 的媒体所有权、Source/Region 分离和磁盘工作线程，不整体嵌入 Ardour。** 它把复制、外部引用、收集外部媒体、峰值和分析文件分开处理；磁盘读与 seek 不在音频回调完成。[A1][A2][A3][A4][A6][A7]
2. **Tracktion Engine 是本轮最值得评估的完整可嵌入引擎。** 它本来就是 JUCE/C++ 模块，不要求使用其 GUI；源码有独立媒体 reader、循环、播放图、样本时钟和文件收集。代价是引入 C++/JUCE、消息线程约束和 GPL/commercial 许可，不是可直接加进 Cargo 的库。[T1][T2][T3][T5][T7][T9]
3. **保留 React + Tauri + Canvas。** 上述两者提供的主要价值在原生音频层。推荐 UI 发送控制命令、读取原生播放快照和峰值数据，音频回调独立推进。Ardour 和 Tracktion 的 UI 时钟都读取音频播放位置，而不是由 UI timer 推动声音。[A8][A9][T8][T9] 这是适配建议，不是已验证的 ZoeyDAW 集成。
4. **Futureboard 可以看具体 Rust 模块，当前不宜直接抽整个引擎。** 已核对到真实的压缩音频后台流播和 Browser 试听实现，但源码还有平台本地依赖、单消费游标限制、压缩长文件峰值限制。MIT 降低许可障碍，不消除工程风险。[F1][F2][F3][F4][F5][F6]
5. **“所有格式统一全量解码进内存”不适合本产品的长文件路径。** Tracktion 当前压缩代理存在全尺寸 float PCM 内存分配；Ardour 的复制导入会生成会话格式文件；Futureboard 则提供有界流播。ZoeyDAW 应区分原始媒体、可重建解码缓存和每个播放实例的读游标。此为基于这些实现的推荐，不宣称一种策略对所有文件都最快。[T4][T5][A5][F2][F3]

## 筛选与成熟度

先搜索 Tracktion Engine、openDAW、Zrythm、ossia score 的官方入口和许可，再选 Ardour + Tracktion 深读。Tracktion 的高层 Edit/Clip/Transport API 与原生桌面需求最直接；openDAW 官方有 SDK 和商业许可，但本轮未审查其流播源码，不拿 SDK 宣传代替长文件能力证明。[T1][O1] Zrythm、ossia score、Tenacity 未进入本轮源码比较，不对其做“不能嵌入”或“不支持”的断言。

| 项目 | 事实支持的成熟度与平台 | 许可证 | 对当前产品的判断 |
| --- | --- | --- | --- |
| Ardour | 官方提供 Linux、macOS、Windows ready-to-run 包；手册覆盖复制/引用、素材试听、收集、归档和跨平台会话。源码有专门 Butler 与 DiskReader。无本轮压力测试。[A1][A2][A4][A6][A10] | GPL v2 or later。COPYING 的插件说明针对第三方插件 API，不是任意自定义 FFI 的闭源豁免。[A11] | 成熟实现参考。整体嵌入会话引擎的依赖和 API 稳定性本轮未验证；不推荐当低成本库接入。 |
| Tracktion Engine | 官方定位为可嵌入音频应用引擎，提供 JUCE 模块与 Edit 对象模型；CI 配置覆盖 macOS/Windows/Linux 的 DemoRunner、TestRunner 等。CI 文件存在不等于本轮已查 CI 全绿。[T1][T10][T11] | GPL v3 or later / commercial 双许可；仓库明确第三方代码需分别合规。[T2] | 本轮完整引擎首选候选。不是纯 Rust；Tauri 进程中的 JUCE 消息循环、设备所有权和 IPC/FFI 需做专门可行性验证。 |
| Futureboard Studio | 当前 README 明确 pre-alpha、项目格式可能变化；官方列 Windows WASAPI/WDM-KS、macOS CoreAudio、Linux ALSA，ASIO 只在 Professional Edition。上述平台为官方声明；本轮只确认相应代码/依赖存在，未跑二进制。[F1][F4] | 根目录与 SphereDirectAudioEngine/LICENSE 都是 MIT；第三方依赖许可、品牌限制仍独立。[F7][F8] | Rust 可读性和模块借鉴价值高，不能因 crate 多就视为稳定 SDK。详见专项。 |
| openDAW | 官方说明有 SDK/plugin model；本轮没有核实其磁盘流播、seek 和浏览器外壳中的平台行为。[O1] | AGPL v3 or later / commercial。[O1] | 不因同为前端技术就替换当前原生音频层。长文件原生播放证据不足，不能排在 Tracktion 前。 |

## Ardour 的实际设计

### 媒体与 Region 身份分离

事实：`Region::SourceList` 持有 `shared_ptr<Source>`；`Region::source()`、`sources()` 暴露媒体引用，`_start` 是源内偏移，`position()` 是时间线位置，`length()` 是区域长度。`_master_sources` 保留处理前原始源，源码注明用于 timefx 后仍可访问原始源。[A3，region.h L117、L145-L159、L412-L419、L614-L621]

`Source::get_state()` 单独序列化 Source 的 `id`、`name`、`type`、`flags`。因此多个剪辑共享同一媒体，不意味着它们共享位置、裁切、淡入淡出或选中状态。[A12，source.cc L111-L120；A3]

推荐：ZoeyDAW 的 Browser item、MediaAsset、timeline Clip、playback Reader 不要合成一个对象。移动或复制 Clip 不能复制音频文件；重命名路径不能自然导致 Clip 身份变化。稳定 asset ID 是产品建议，不代表 Ardour 使用内容哈希身份。[A3][A12]

### 复制、引用、收集与试听

事实：Import dialog 有导入前 audition、位置 scrub 和独立试听音量；可添加成新轨，也可只进 Region list 再拖到轨道。手册没有承诺其试听自动按工程 BPM 保持音高，不能据此写成 Live 同等试听能力。[A1]

复制会把媒体放进会话目录，必要时转换会话格式和采样率；引用不修改原始文件，移动或外部更改会影响工程，备份工程目录不会包含这些外部文件。[A2]

归档工具包含外部引用文件，并可只保留当前 snapshot 使用的素材。选择 FLAC 归档不是对 float PCM 的无损保持，手册明确提示定点转换、归一化带来的影响。不要把“FLAC 是无损编码”误写成“任何会话归档到 FLAC 都位精确保真”。[A4]

推荐：Browser 的试音不应立刻复制素材进项目。正式拖入时按项目的媒体所有权策略建立引用；提供单独 Collect/Make self-contained。复制原件与生成播放缓存是两个动作，缓存删除不应破坏工程。[A1][A2][A4]

### 压缩解码与分析缓存

事实：`Session::import_files()` 经 `write_audio_data_to_new_files()` 分块写入新的 AudioFileSource。导入源尝试 libsndfile、可用时 CoreAudio、minimp3、FFmpeg；需要时用 ResampledImportableSource 包装。因此“复制导入”可把压缩文件转为会话音频文件，不能等同于持久化可淘汰 decode cache。[A5，import.cc L113-L135、L255 起、L903 起、L1032-L1034]

Ardour 并非完全不能直接引用 MP3。存在 `Mp3FileSource::read_unlocked()`，委托 `Mp3FileImportableSource`；其 seek 向后时会 rewind，再跳解到目标上下文。该路径的复杂度与 seek 索引能力不能照搬 PCM 的随机读取假设。`get_soundfile_info()` 还把 `seekable` 设为 false，不能仅凭类存在承诺 UI 全格式引用行为。[A13][A14]

会话目录中 `peaks/` 与 `analysis/` 分离，后者保存已分析媒体的 transient/pitch 信息。[A15] `AudioSource::initialize_peakfile()` 检查文件存在、峰值长度和源文件 mtime，缺失或过时会重建；固定峰值基础粒度 `_FPP=256`，更粗显示聚合，更细显示可读原始音频。[A16]

`Source::get_transients_path()` 使用 Source ID 与 `TransientDetector::operational_identifier()` 拼分析缓存文件名，`load_transients()` 重载结果。[A12，source.cc L343-L395] 可借鉴“分析算法身份也是缓存键的一部分”，但本轮未逐个验证所有分析类型的版本失效策略。

推荐：峰值缓存与 BPM/key/onsets 分开，算法版本与源文件指纹进入键。不能因波形画出来了就把 BPM 标为已分析，更不能把峰值缓存当播放数据。[A12][A15][A16]

### 长文件、seek、循环与实时边界

事实：`DiskReader::run()` 在处理周期消费 `PlaybackBuffer`，根据缓冲空闲空间决定 `_need_butler`。`Butler::thread_work()` 负责 `do_refill()`，并为 auditioner 提供 seek/refill；工作缓冲在 Butler 线程入口分配。[A6，disk_reader.cc L316 起、L540-L566；A7，butler.cc L169-L183、L264-L307]

`DiskReader::seek()` 明确由 Butler 的非实时 locate 路径调用。可在已有保留缓冲内完成 internal seek，否则重置缓冲再预读；播放方向或 loop 语义变化会使快速路径失效。[A6，L878-L943] `audio_read()` 按 loop 边界分段、回卷源位置，并支持 loop fade/crossfade 相关路径。[A6，L1048-L1155]

`Session::process_with_events()` 可按事件精确位置切分一次音频 block，再推进 `_transport_sample`。UI 的 `ARDOUR_UI::update_clocks()` 读取 `audible_sample()`，定时刷新显示，不驱动音频播放。[A8，session_process.cc L584-L647、L731-L735；A9，ardour_ui.cc L2183-L2207]

推荐：Rust 音频回调消费已准备的数据；目录扫描、文件打开、解码、磁盘读取、分析和 seek 预读在非实时线程。seek 要有明确的“请求、换代、目标预读完成”协议，不能只改 UI 播放头，再让回调临时补读。loop 末尾必须预先考虑开头需要的数据和 DSP 状态，不能以 Canvas 每帧的时间计算作为循环边界。[A6][A7][A8]

## Tracktion Engine 的实际设计

### 媒体、Clip 与收集

事实：`WaveAudioClip::getOriginalFile()` 通过 `sourceFileReference.getFile()` 解析原始文件，Clip 自身还保存 takes、warp、reverse 等状态。[T3，L84-L107] `SourceFileReference` 支持直接相对/绝对路径以及 ProjectItemRef。`setToFile()` 是否创建 project item 取决于项目类型和 allowProjectItems，不是所有模式都只有固定数字 ID。[T6]

新 folder-based project 文档特别说明其 ProjectID 是目录路径 hash，目录移动会改变；不能把此 ID 当成跨移动不变的全局素材 ID。[T12，表格及 Source References]

`ProjectUtilities::importExternalFiles()` 实际执行 copy 并更新 source file；`consolidateEdit()` 收集引用。[T7，L57-L85、L171-L218] `ArchiveJob` 对临时副本进行 consolidate 再打 zip，源码真实调用 `ProjectUtilities::consolidateProject()`。[T13，L142 起、L461-L475]

推荐：可采用它的“外部引用与独立 consolidate”工作流，不照抄 path-based identity。当前 Rust 产品需要把持久化素材身份与查找路径拆开，避免搬工程后失去分析缓存或 Clip 关联。[T6][T7][T12]

### 两条读取路径，不能笼统称为磁盘缓存

事实：`AudioFileCache::createReader()` 优先尝试已注册内存源或缓存的 memory-mapped reader，普通 fallback 使用后台 `juce::BufferingAudioReader`，缓冲配置为 `48000 * 5` samples。缓存 Reader 拥有自己的 atomic readPos/loopStart/loopLength。[T4，cpp L785-L808；T14，Reader 定义]

但当前 `WaveNodeRealTime::buildAudioReaderGraph()` 对 `needsCachedProxy` 文件走 `BufferedAudioFileManager`。`AudioFileInfo` 对非 Wav/Aiff/Float 格式设置 needsCachedProxy，因此 FLAC/MP3 等在此路径会渐进解码到完整 PCM 内存。[T15，WaveNode.cpp L2201-L2219；T16，AudioFile.cpp L382-L384]

`BufferedAudioReader` 构造时 `data.resize(numChannels, lengthInSamples)`，先在调用线程解首块，之后每次 `65,536` frames 后台填充；以 `validEnd` 发布可读区，未准备好则清零并返回 false。`BufferedAudioFileManager` 按文件复用，5 秒清理计时器移除仅被缓存持有的 reader。[T5，cpp L14-L30、L44-L100、L120-L149；T17]

推论：这避免在每个音频回调内反复压缩解码，但不满足“任意长压缩文件保持固定内存”。立体声 48 kHz 一小时 float PCM 约 `48,000 × 3,600 × 2 × 4 = 1.3824 GB`，还未计其他缓冲。不能把映射压缩输入文件误当成没有输出 PCM 内存。[T5][T18]

推荐：Tracktion 可直接用来评估多轨调度、loop 和 tempo 处理；若采用完整引擎，必须特别验收压缩长文件内存路径。Rust 自研时不照搬整文件 PCM proxy，优先比较有界 PCM block cache 与项目内可重建 PCM proxy 文件。短循环样本可全解，长素材按内存预算处理。[T4][T5][T15]

### 峰值、分析、时钟与实时约束

事实：`TracktionThumbnailCache` 在磁盘保存 `thumbnail_<hash>.thumb`，mtime 变化时拒绝旧缩略图；`SmartThumbnail` 与 AudioFileManager 关联。[T16，L415-L490]

当前源码另有 `analyseAudioFile()` 流式遍历注册的分析器，返回 JSON 风格结果；头文件预留 tempo/key/onsets 分析器扩展不代表已经自带这些算法，也没有在本轮读到 BPM 分析持久缓存实现。[T19] 不把它当现成素材库智能分析系统。

`EditPlaybackContext::fillNextNodeBlock()` 按 numSamples 更新 reference sample range；process 把同一 range 送入播放图。`TransportControl::timerCallback()` 从 playhead 回读到 transport state。[T8，L312-L328、L341-L427、L973-L975；T9，L1087-L1107] 存在 `getAudiblePlaybackTime()`，适合区分图内样本位置和补偿延迟后的显示位置。[T8，L1129-L1132]

实时安全不能一句“lock-free engine”带过：`AudioFileCache::LockedReaderFinder` 使用 try read lock，并按 timeout 决定等待；传统 WaveNode 的实时读取传 3ms、离线 5000ms，WaveNodeRealTime 的 reader graph 则传实时 0ms、离线 5s。不同播放路径必须分开审计。[T4，L327-L369；T15，L1809-L1821、L2218-L2219]

推荐：直接嵌入前锁定采用的节点路径和版本。UI bridge 只在控制线程构建/替换播放图并发命令，不从 Tauri command 同步进入音频线程做文件 I/O；JUCE message-thread 标记如 `consolidateEdit()` 和 BufferedAudioFileManager 清理不得忽略。[T7][T5][T8][T15]

格式事实：AudioFileFormatManager 实际注册 WAV、AIFF、FLAC；MP3 reader 受 `JUCE_USE_MP3AUDIOFORMAT` 条件编译影响，另外有 macOS CoreAudio/WindowsMedia 原生格式入口。支持扩展名字符串并不证明交付包已经启用 codec。[T20]

## 追加核对：Futureboard Studio 是否适合抽 Rust 引擎

### 已读到的真实能力

- `ClipAudioSource` 有 InMemory、MappedWav、Streaming 三种变体。当前 `open_clip_audio_source()` 的默认选择是 WAV 达 64MiB 就 Streaming；非 WAV 文件超过 256MiB 就 Streaming，其余全解码内存。虽然有 MappedWav 类型，不能根据类型存在声称默认大 WAV 走 mmap。[F2，audio_source.rs L21-L26、L142-L171；F5，audio_file.rs L320-L323]
- `StreamingSource::open()` 先 probe、分配环形缓冲，再为每个 source 启动 decoder thread。ring 为 `262,144` 个 stereo frames，即约 2MiB、48kHz 时约 5.46s。`read_interp()` 发布 reader_frame、在已发布窗口内读样本；缺数据返回静音并增加 underrun 计数。[F3，L48-L54、L190-L225、L258-L283]
- `decode_loop()` 用 Symphonia 读取和解码；大范围 seek 调 `SeekMode::Accurate`，reset decoder 后重填。`Drop` 停止并 join 工作线程。源码有 graveyard 机制把退役音频对象移出 callback 销毁。[F3，L322-L408；F6，engine.rs L3594-L3597、L6170-L6194]
- Browser 的 decode 请求带 token；新选择到来后旧结果不会覆盖新结果。`StartAudition` 在音频线程再次检查 token，旧结果交 graveyard 回收。这是值得借鉴的快速键盘浏览体验基础，源码不是只有 UI 按钮。[F6，engine.rs L5799-L5810、L5888 起、L6246-L6255]
- `waveform_peak_file.rs` 实际读写 `FBPEAKS1` 格式，头含格式版本、算法版本、完整 asset ID、源 size/mtime。源码有 mismatch 错误与临时文件写入后 rename。可借鉴缓存格式与失效边界，但平台原子替换与崩溃耐久性本轮未运行验证，不能照抄注释当跨平台证明。[F9]

### 已有源码限制，不能称为可直接拿来用

1. **不是独立可发布 crate。** SphereDirectAudioEngine/Cargo.toml 依赖十余个本 workspace 模块；Windows target 下有无条件本地 path dependency `H:/daux/crates/daux-sdk`。`default = []` 不能自动去掉这个 target dependency。抽引擎至少要处理 workspace 依赖和设备 backend，不是换个 crate 名。[F4，L40-L71、L92-L104]
2. **压缩长文件播放与分析不统一。** `generate_audio_peaks()` 对 WAV 分块扫描，非 WAV 大于 256MiB 返回错误并要求转 WAV；`load_audio_file_head()` 只对 WAV 截取头部，其他格式仍 full decode。小体积高压缩文件也可能解出大量 PCM，因为阈值检查是编码文件字节数，不是预计解码内存。[F5，L336-L359、L706-L720、L1039-L1044、L1123 起] 最后一句是源码推论，非内存实测。
3. **单 source 的 ring 不等于任意多实例播放缓存。** `StreamingRing` 只有一个 reader_frame；RuntimeProject 按 path 在 `decoded_by_path` 中共享 `Arc<ClipAudioSource>`。[F3][F10，runtime.rs L3167-L3199] 推论：同一长文件的两个 Clip 若同时播放相距超过窗口的两个源区间，会竞争这个读游标，不能据现有代码承诺正确稳定。需要专项验证，不将其当成已复现 bug。
4. **seek、loop 质量不能由“Accurate”枚举名保证。** seek 错误分支把 decode_frame 设成 reader，而 decoder 的实际位置没有在该分支得到证明；ring reset 后只存一个 write_frame，也需要验证快速连续 seek 的旧窗口失效。未读到专门预取 loop 开头的双窗口设计。[F3，L379-L408] 不宣称本轮已听到爆音或错误音频。
5. **当前 streaming 输出是固定双声道。** mono 复制到左右，更多声道直接取前两路，代码没有做多声道 downmix 矩阵；注释中的 downmix 不能替代实际计算。[F2，L40-L45；F3，L449-L455]
6. **每个采样点有全局原子诊断计数和 per-sample AtomicU32 访问。** 没有锁和分配不代表低成本；多轨扩展需要实际 profiler 证据。[F3，read_interp/load_frame/store_frame] 本轮不作 CPU 性能优劣判断。

推荐采用层级：先读并择取 Browser token 取消、控制线程/音频线程命令分界、退役对象回收、峰值缓存格式这些具体设计；不要直接把整个 SphereDirectAudioEngine 当稳定替换品。项目 MIT 可以支持后续合法代码复用，但本轮没有完成第三方 license audit。[F4][F6][F7][F8][F9]

## 对 ZoeyDAW 的建议边界

以下是推荐，不是现有代码审计结论，也不是实现计划。

| 关切 | 建议 | 一手依据 |
| --- | --- | --- |
| 媒体身份 | 共享 MediaAsset；Clip 单独保存源内范围、时间线位置和处理参数；Reader/voice 独立游标。不要让路径或 UI item 充当全部身份。 | Ardour Source/Region；Tracktion SourceFileReference；Futureboard 单游标风险。[A3][A12][T6][F3][F10] |
| 导入所有权 | 试音只读外部文件；拖入后按项目默认 copy/reference；独立 Collect；保留原件，缓存可重建。 | Ardour 导入、复制/引用、归档；Tracktion consolidate。[A1][A2][A4][T7] |
| 压缩素材 | 小文件可全解；长文件使用有预算的 block cache 或持久 PCM proxy；不得用压缩文件大小作为唯一内存上限。PCM proxy 不覆盖原件。 | Tracktion 全尺寸缓存与 Futureboard 有界流播、Ardour 转换导入。[T5][F3][F5][A5] |
| Browser 试听 | 复用原生音频输出，独立 preview voice；快切选择时淘汰过期解码请求；不为每次选中都做完整项目导入。BPM 保持音高策略由专题另行确定。 | Ardour auditioner；Futureboard audition token。[A1][F6] |
| 波形与分析 | UI 按 viewport 取峰值层级，不接收整段 PCM；峰值和节拍分析分开缓存，键包含源指纹与算法版本。 | Ardour peaks/analysis；Futureboard 实际峰值文件。[A12][A15][A16][F9] |
| seek/循环 | 控制命令换代后预读；短距离复用有效缓冲，远 seek 失效旧窗口；loop 预取与 DSP reset/crossfade 独立处理。 | Ardour seek/loop；Tracktion loop reader 与 timeout。[A6][T14][T15] |
| 播放/UI 时钟 | 设备 block 的样本时间决定所有轨播放；UI 读取位置快照，可插值绘制，不能以 RAF/timer 保持音轨同步。区分 render position 与 audible position。 | Ardour process + audible_sample；Tracktion reference sample range 与 UI timer。[A8][A9][T8][T9] |
| 直接采用 | 若接受 C++/JUCE 和商业许可，先评估 Tracktion。若保持 Rust 音频核心，则学 Ardour 与 Tracktion 的职责分离，Futureboard 只复用经审查的局部模块。 | 实际接口、许可与依赖。[T1][T2][T6][T8][F4][F7] |

## 剩余 ISSUES 与未知

- 未验证任何方案在 macOS/Windows 的指定声卡、sample rate、buffer size 下的时延、underrun、CPU、seek 恢复和 loop 无缝程度。
- Tracktion 当前 develop 的 WaveNode/WaveNodeRealTime 与压缩 PCM 缓存路径要按锁定版本重新核对；本轮不承诺二进制发行版本行为一致。
- 尚未验证 Tauri 主循环与 JUCE message thread 共存、跨语言对象销毁、设备切换及热拔插。将 Engine 放到 sidecar 不是自动解决许可或实时问题的结论。
- Ardour/Tracktion/Futureboard 都不能凭这些代码证据证明“Browser 试听按工程 BPM 同步且保持音高”达到 Live 标准。需要声学与交互专项，不能用 resampling 冒充 time stretch。
- 未查实所有 codec 的交付配置和许可证链。MP3 在 Tracktion 中受宏和原生 codec 可用性影响；Futureboard 的依赖采用 workspace features，不能按文件扩展名列表验收。
- 本轮未做所有项目依赖 license audit。GPL/AGPL 代码进入闭源产品、商业许可是否覆盖 JUCE/第三方算法、是否允许分发与特定插件 SDK，需要对拟使用版本逐项核对。本报告不代替法律意见。

## 一手来源索引

### Ardour

[A1]: https://manual.ardour.org/adding-pre-existing-material/import-dialog/
[A2]: https://manual.ardour.org/adding-pre-existing-material/copying-versus-linking/
[A3]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/ardour/region.h#L117-L159
[A4]: https://manual.ardour.org/working-with-sessions/backup-and-sharing-of-sessions/
[A5]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/import.cc#L255
[A6]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/disk_reader.cc#L878-L943
[A7]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/butler.cc#L169-L307
[A8]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/session_process.cc#L584-L647
[A9]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/gtk2_ardour/ardour_ui.cc#L2183-L2207
[A10]: https://community.ardour.org/download
[A11]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/COPYING
[A12]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/source.cc#L343-L395
[A13]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/mp3filesource.cc#L59-L75
[A14]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/mp3fileimportable.cc#L149-L178
[A15]: https://manual.ardour.org/working-with-sessions/whats-in-a-session/
[A16]: https://github.com/Ardour/ardour/blob/b896344c8d16f89e04a235562ab31594605c6715/libs/ardour/audiosource.cc#L278-L350

### Tracktion

[T1]: https://www.tracktion.com/develop/tracktion-engine
[T2]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/LICENSE.md
[T3]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/model/clips/tracktion_WaveAudioClip.cpp#L84-L107
[T4]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/audio_files/tracktion_AudioFileCache.cpp#L785-L808
[T5]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/audio_files/tracktion_BufferedAudioReader.cpp#L14-L100
[T6]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/model/edit/tracktion_SourceFileReference.h#L19-L46
[T7]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/project/tracktion_ProjectUtilities.cpp#L57-L85
[T8]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/playback/tracktion_EditPlaybackContext.cpp#L312-L427
[T9]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/playback/tracktion_TransportControl.cpp#L1053-L1127
[T10]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/.github/workflows/build.yaml#L12-L31
[T11]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/examples/DemoRunner/demos/PlaybackDemo.h#L26-L65
[T12]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/docs/Folder_Based_Projects.md
[T13]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/model/export/tracktion_Archive.cpp#L461-L475
[T14]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/audio_files/tracktion_AudioFileCache.h#L40-L101
[T15]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/playback/graph/tracktion_WaveNode.cpp#L2201-L2219
[T16]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/audio_files/tracktion_AudioFile.cpp#L382-L490
[T17]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/audio_files/tracktion_BufferedAudioReader.h#L17-L106
[T18]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/audio_files/tracktion_AudioFileUtils.cpp#L59-L80
[T19]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/audio_files/tracktion_AudioFileAnalyser.h
[T20]: https://github.com/Tracktion/tracktion_engine/blob/877e39c0fe9f1c3e4a9d836f5f338688250875d7/modules/tracktion_engine/audio_files/tracktion_AudioFormatManager.cpp#L19-L89

### Futureboard 与 openDAW

[F1]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/README.md#L34-L37
[F2]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/crates/SphereDirectAudioEngine/src/audio_source.rs#L142-L171
[F3]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/crates/SphereDirectAudioEngine/src/streaming_source.rs
[F4]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/crates/SphereDirectAudioEngine/Cargo.toml#L40-L104
[F5]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/crates/SphereDirectAudioEngine/src/audio_file.rs#L320-L359
[F6]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/crates/SphereDirectAudioEngine/src/engine.rs#L5799-L5810
[F7]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/LICENSE
[F8]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/crates/SphereDirectAudioEngine/LICENSE
[F9]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/crates/SphereUIComponents/src/components/timeline/waveform_peak_file.rs
[F10]: https://github.com/futureboard/futureboard-studio/blob/b923c53c0aa77a473f488cb77a5f05738c023cb5/crates/SphereDirectAudioEngine/src/runtime.rs#L3167-L3199
[O1]: https://opendaw.studio/manuals/open-source
