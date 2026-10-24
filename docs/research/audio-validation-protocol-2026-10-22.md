# 冻结的音频验证协议

阈值在首次候选运行前写入 [audio-acceptance-contract.json](audio-acceptance-contract.json)。该文件是机器可读权威入口。不能根据候选成绩下调标准；修改必须有用户明确决策与新版本，原始失败记录保留。

## 语料与口径

`node scripts/audio/generate-corpus.mjs <output-directory>` 生成固定种子的 CC0 合成音频及 manifest。`node scripts/audio/convert-corpus.mjs <output-directory> <absolute-ffmpeg-path>` 生成不同格式，并记录 ffmpeg 版本与每个文件 SHA-256。相同编码器版本才能要求有损编码文件字节一致，不能用不同 MP3 编码器版本的 hash 不同证明解码失败。

合成 WAV 包含 440Hz、同相和反相立体声、120BPM 点击、one-shot、七拍循环、弱起静音、截断文件与一小时稀疏 PCM 文件。一小时文件测试长度、随机访问和内存，不是音乐，也不代表真实磁盘吞吐。稀疏零文件在支持稀疏存储的文件系统中可能不产生真实读盘负载。

格式派生包含 WAV PCM24、float32、AIFF PCM24、FLAC、MP3 CBR 与 VBR。原始 WAV 为 PCM16。实际格式兼容还需 AIFC 负例、不同采样率与多声道，不因这批语料生成成功就宣布全部编码受支持。

音乐质量门禁另需来源许可明确的鼓、人声、复音混音和自由速度素材，以及独立拍点标注。不得使用来源不明的 demo、用户私人素材或模型训练集冒充独立验收。缺少音乐语料时该门禁保持 NOT VERIFIED。

## 指标定义

- 音高在头尾各排除至少一秒后的稳态区间测量。纯音用插值上穿零点估计频率，只适用于已知单正弦样本，不能泛化为人声音高检测。
- 时长按采样帧计算，包含正确 priming、flush 和预期边界。当前离线 CLI 必须生成目标总帧数，容差一帧。实时变速不能直接套用一条固定 ratio。
- RMS 比较相同稳态区间；不拿更响当更好。立体声同相差分与反相求和必须满足冻结残差门槛。
- 首声延迟从用户动作被应用接收到实际输出首次有效声音，不能只测 command acknowledge。同步模式的预期量化等待单列，不混入解码耗时。
- 搜索以 100,000 条索引测从查询到可操作结果，排除不相关动画，但包含 IPC 与列表更新。100 次以上冷/热记录 p50、p95、p99。
- 音频 deadline 是当前 callback frames/sampleRate。回调 p99 不超过 deadline 的 70%，max 不超过 100%，规定 30 分钟负载无 xrun。系统 CPU 不代替回调时间。
- 长文件 PCM 工作集按 reader 的解码与预读内存计，不把可淘汰的文件映射地址空间当 RSS，也不能隐藏共享缓存的实际驻留量。
- 与 Live 比较前声明主要改进项，要求至少 20% 相对提升，其余关键延迟指标回退不超过 5%。声音与稳定性门禁不能因某一项速度更快而豁免。

音乐盲听至少 12 段、3 位听者，随机匿名顺序、响度匹配，保留音频、投票与呈现顺序。五分量表定义为 1=不可用伪影，2=明显损伤且影响使用，3=能辨认的损伤，4=轻微差异但可正常使用，5=未察觉处理损伤。中位数至少 4；该门槛不能单独证明优于 Live，需要配对评分与相同条件输出。没有真实听者时不得由自动指标生成评分。

## 两候选的第一阶段

`node scripts/audio/benchmark-stretch.mjs <corpus> <signalsmith-binary> <output-directory>` 对同相、反相和纯音跑两个独立 CLI，使用相同 tempo ratio、sample rate 和输入。每个配置预热一次后重复十次。Rubber Band 使用 R3 和 ChannelsTogether，Signalsmith 使用默认窗口。

此阶段只报告离线 CLI 总耗时，包含进程启动与文件 I/O，不把它写成 DSP callback CPU、不把离线 CLI 和实时引擎混比。信号指标由 `measure-stretch.mjs` 读取实际 WAV，而不是回显配置。

第一条已观察结果为 Rubber Band 4.0.0 R3、100→120BPM 对应时长比 5/6。八秒 440Hz 单声道样本输出时长零帧误差、音高误差约 0.0002 cent、RMS 差约 0.00027dB、无非有限样本。仅通过该合成信号，不代表音乐、设备或 Windows 已验收。

直接调用 `SignalsmithStretch<float>::exact` 的 float WAV 探针排除了 CLI PCM16 输出量化这一解释。相同的三种信号和四个 tempo ratio 共 12 项，6 项通过合成门禁；非单位比例下的同相、反相残差仍失败。原始结果见 [float 探针记录](audio-stretch-float-results-2026-10-22.json)。本次每项只运行一次，不用于性能比较。残差不足以证明可听损伤，但在冻结门槛下不能视作通过，也不能用复制声道的特判掩盖。

## 完整引擎与模块化探针

小探针源码保存在 `scripts/audio/probes/`，第三方源码和构建目录不进入仓库。Tracktion 固定提交及许可见其 `dependencies.lock.json`。在临时目录复制 `tracktion/` 后，把固定提交的官方源码放到该目录的 `source/` 并初始化 JUCE submodule，再执行 `cmake -S <probe> -B <build> -DCMAKE_BUILD_TYPE=Release` 和 `cmake --build <build> --target TracktionProbe --parallel 2`。可执行文件位于 `<build>/TracktionProbe_artefacts/Release/TracktionProbe`，参数为 `<corpus> <out> [--tempo]`。

Rust 探针执行 `cargo build --release --locked --manifest-path scripts/audio/probes/rust/Cargo.toml`，或先把该目录复制到临时目录再构建。可执行文件参数为 `bench <corpus> <out>`，`inspect <file>` 实际逐包解码。两个探针都不打开音频设备，不改变应用播放后端。

两者已串行运行同一三信号、48kHz、256 frames、1/8/32 实例、各实例 gain=1/N 的原速场景，九项输出分别通过。Tracktion 实际经过 Edit、AudioTrack、WaveAudioClip 和 Renderer，Rust 探针只经过独立文件 reader、Symphonia decoder 和混音，二者职责不同。前者计时包含 graph prepare/render/write，后者包含 open/probe/decode/mix/write，不能把总耗时差写成引擎优劣。原始结果见 [探针记录](audio-engine-probe-results-2026-10-22.json)。

Tracktion 的 SoundTouch Better 路径另跑 tempo1.2，九项输出通过相同合成检查，音高误差约 0.289 cent。原速两路线和变速结果统一由 `measure-stretch.mjs` 测量，见 [信号记录](audio-engine-signal-results-2026-10-22.json)。测量器识别实际 hound float WAV 的 WAVE_FORMAT_EXTENSIBLE 子格式，不重编码输出来迎合测量。七种真实格式的逐包解码与截断负例见 [解码记录](audio-decoder-corpus-results-2026-10-22.json)。尚未证明音乐听感、完整 Warp、实时回调、UI 集成或 Windows 能力。

## 已运行的工程存储验证

`cargo test --manifest-path src-tauri/Cargo.toml --lib` 的 26 项测试通过，含 19 项真实磁盘存储测试、4 项退出授权状态测试和既有原生命令测试。存储覆盖收集、普通重存、移动目录重开、完整指纹 Relink、路径逃逸、取消、冲突、发布后同步不确定及截断或空音频拒绝。导入逐包验证实际可解码帧，不只信任文件头。Web 类型检查、96 个测试文件的 621 项测试、31 项架构测试、62 项共享包测试通过。构建保留大 chunk 提示，测试环境保留 Canvas 与导航未实现提示。

已有 macOS 桌面应用实际执行了导入固定 8 秒 WAV、保存、收集、返回首页后从 recent 重开、模拟受管文件缺失、选择同内容原件 Relink 及再保存。磁盘 manifest 的 source ID 保持不变，收集文件和原件 SHA-256 一致，原件未改变。此证据覆盖原生 IPC 与可见恢复入口，不代替重启整个进程、Windows 或音频回放验收。

窗口关闭实际经过关闭方式选择、未保存工程 Save/Discard/Cancel，再点击 Cancel。同一原生 PID、轨道和未保存 BPM 修改保留，没有真的退出应用。前端和 native 授权测试覆盖显式退出、保存失败、忙碌与一次性 ticket；强杀不在此保护范围。

## 尚缺的真实条件

用户于 2026-10-22 明确要求先跑通 Mac，Windows 先实现但暂不测试和验证。[硬件矩阵](audio-hardware-matrix-2026-10-22.md) 的 Windows 行保留 NOT VERIFIED，不再阻塞 Mac 实现与验收。Mac 的真实设备输出、同步试听与编排一致性、定位循环、负载稳定性仍须实际运行；独立离线探针不满足应用内跑通。原数值阈值不变，最终音质与性能结论仍按其实际证据范围报告。
