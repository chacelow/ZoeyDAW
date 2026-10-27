# 开发环境与操作边界

## 当前工程

React Web 前端由 Tauri 2 承载，Rust 提供桌面原生能力。工作区使用 pnpm。版本、包名和脚本以对应 `package.json`、`Cargo.toml` 为准；共享包目前仍有 `@zoeymind/*` 名称，本任务不顺带改名。

## 开发应用由 Agent 维护

Agent 先检查本项目进程、开发端口和应用窗口，复用已运行的实例；尚未启动时主动运行 `pnpm tauri:dev`。开发期间保持服务与日志连接，任务结束后继续保留运行。

- Web TS、TSX 或 CSS 报错时保持 Vite 与 Tauri 运行，修复后等待 HMR 恢复并重新验证页面。错误覆盖层或暂时白屏不作为主动断开或结束验收的理由。
- 修改 Rust、原生配置、capabilities、Cargo 依赖或 plugin 注册后，等待 Tauri watcher 重编译并恢复应用；需要重启时由 Agent 执行。构建失败后继续修复并等待下一次成功构建，不要求用户重新启动。
- 进程意外退出后先读取退出原因，修复后重新启动；已有应用不可访问时先检查服务和连接，保持单个开发实例，不另开副本绕过错误。
- 使用持久开发进程并保留日志；就绪须同时检查开发地址可达与原生应用实际出现。重启前处理未保存工程，不强制丢弃用户编辑，不停止其他项目或无关服务。

开发地址固定为 `http://localhost:7173`，Vite 保留 `strictPort`，与 Tauri `build.devUrl` 同步。Windows 若报 `listen EACCES`，先用 `netsh interface ipv4 show excludedportrange protocol=tcp` 与 IPv6 对应命令核对排除范围；本机原端口 5173 落在 5147–5246 的排除范围。修改端口需同时修改两端配置，并遵守 `tauri.conf.json` 的修改授权。

## 验证命令

开发套件统一使用 Ultracite v8，Node 要求以根 `package.json` 为准，当前至少 22.18。常规入口在工作区根目录运行：

```sh
pnpm doctor
pnpm check
pnpm fix
pnpm test
pnpm typecheck:core
pnpm check:boundaries
pnpm check:file-size
pnpm check:file-size --report
pnpm --filter @zoeydaw/web typecheck
pnpm --filter @zoeymind/shared typecheck
pnpm --filter @zoeymind/logger typecheck
pnpm build
```

`check` 执行 Ultracite、共享度量漂移、核心依赖边界及文件规模检查；`check:file-size --report` 列出超过 400 行的自有源码，一般上限为 800 行。`tooling/file-size-baseline.json` 只追踪既有超限债务，其上界只准降低或删除，不构成继续追加或规范豁免的授权。测试和字典参与统计；机器输出须有生成标记且对应生成器存在，不能仅凭 `generated` 文件名或目录名豁免，第三方与构建目录按明确路径排除。`fix` 先生成度量 CSS 再执行套件修复；`test` 运行 core/runtime 独立包、Web 行为、根工具模块规则及 shared/logger/UI 行为测试，并检查 Cargo/native 依赖方向。`test:shared` 包含共享 UI 的资源和 React 生命周期回归。`typecheck:core` 检查两个核心 Web 包。Web 的 lint/format 是这些根入口的别名，不维护另一套格式配置。类型检查和构建单独执行，不包含在 `check` 中。

Runtime 的录音回执与保存等待使用标准 `Promise.withResolvers()`。runtime 和 Web 显式包含 `ES2024.Promise` 类型库，编译 target 仍为 ES2022；运行环境必须提供该方法，不注入 polyfill。

需要单独修改共享度量时使用包命令，不从 Web 跨目录执行脚本：

```sh
pnpm --filter @zoeymind/ui metrics:generate
pnpm metrics:check
cargo check --manifest-path src-tauri/Cargo.toml
```

正确性、类型、无障碍与项目架构/token 作为硬门禁；预设中的 suggestion/layout 规则默认关闭，不输出建议或自动要求全仓改写，文件名约束等显式规则以根配置为准，格式由套件 formatter 统一。架构检查覆盖配置列出的层级、公共入口和可静态识别的 JSX token，不是完整依赖图或所有动态样式的证明。现有单实例服务和测试 harness 的合理模式在根配置集中声明。类型化 React props 不重复添加 PropTypes，当前 Router 版本也不按 v8 规则强行迁移。

不要未经审查重跑 `ultracite init` 覆盖项目配置。升级时检查预设、peer 绑定和本地架构规则，重新执行 doctor、check、类型、测试与页面验证；不使用自动启动其他 agent 的修复参数替代本轮受控编辑。

`pnpm tauri:dev` 由 Agent 主动维护；`pnpm tauri:build` 按任务需要执行本地构建。启动授权不包括 push、发布或部署：保留 workflow 文件，不上传 GitHub、不触发远程流程、不把配置存在称为 CI 已运行。

UI 改动必须在已有应用或 Web 页面上验证主路径，观察新截图或实际状态。单元测试通过不能代替 UI 验证；报告实际检查与限制，不把模拟电平称为真实音频。

原生播放使用仓库维护的 `src-tauri/native/tracktion-source/`，上游基线、JUCE 提交与许可路径见 `scripts/audio/native-source.lock.json`。先运行 `node scripts/audio/setup-native-engine.mjs`；脚本仅在 JUCE 缺失时浅 fetch 固定提交，不下载完整历史。已有 checkout 不同版或含本地改动时拒绝继续，不重置文件。Tracktion 的循环起点、设备刷新、graph build/post 修复直接保存在源码中，不再重放 patch。graphPosted 仍不表示 audio 已采用新图。旧 ignored vendor checkout 保留，但不再参与构建。

插件 helper 使用 `third_party/plughost/source-lock.json` 固定的 0.1.5 源码。`node scripts/audio/build-plugin-helper.mjs` 构建 `zoeydaw-plugin-helper`，在 macOS 生成并验证仅 helper 使用的 ad-hoc Hardened Runtime 签名，在 Windows 复制原生可执行文件。Tauri 的开发与构建前置命令运行该脚本，生成物位于 ignored `src-tauri/plugin-helper/`，作为资源打包。脚本不启动 DAW、不扫描插件、不执行发布签名或公证。

`node scripts/audio/verify-plugin-host.mjs [NATIVE_BUILD_DIRECTORY]` 从维护源码构建本地测试插件，打包到临时目录，运行后清理。它不扫描已安装插件。验收覆盖 catalog 身份约束、扫描取消、音频/MIDI/自动化跨 quantum 偏移、宿主回调分配计数、CLAP/VST3 quantum 内时间跳转、崩溃/挂起隔离及显式恢复的真实输出。指定 native build 目录时还构建并执行 Tracktion Node→C ABI→Rust→helper 的脉冲、PDC 和乐器测试。`transport_smoke` 可额外接收不兼容 helper 路径，验证拒绝旧构建。macOS 已实测；2026-10-26 在 Windows x64 运行带 native build 参数的完整入口通过，包括参数/状态恢复、两种格式的隔离与实时端点恢复、admission 释放及 1504-frame 原生图补偿断言。这些探针不代替插件编辑器、物理输入和真实 UI 验收。

同一验证脚本还运行 `editor_smoke`。CLAP 夹具打开 helper 所有的原生窗口，驱动真实音频 quantum，接收有序参数事件，重新加载编辑后的状态文件，并验证取消恢复打开前的完整状态。它不注入桌面输入，不代替 Tauri 编辑器终验。

验证入口还通过显式环境路径运行 `device_session::tests` 的真实恢复用例。受控 helper 挂起后，非法候选保留原实例；有效候选在同一个回调端点恢复 checkpoint 并预先应用当前参数，输出精确 PCM，同时保持独立插件的输出。该测试只等待受控的两秒挂起阈值，不是长期或规模压力测试。

`cargo run -p zoeydaw-engine --example plugin_admission_smoke --locked` 通过真实 EngineSession 验证异步 admission 回执未领取时取消，以及显式取消的恰好一次释放；不启动 Tauri 或声卡。带 native build 参数的插件验证脚本包含此入口。

同一 native probe 还用显式 Hosted IO 验证外部插件的配置重准备。真实 CLAP/VST3 状态在 48/96 kHz、512/256/128 frames 之间恢复，检查精确 PCM、新图延迟、驱动失败与持久化失败回滚、过期计划及编辑器排除。Hosted IO 不打开物理声卡。2026-10-27 的 Windows 实际输出仅报告一个可用 buffer，配置 smoke 因此未执行物理 buffer 切换；不能把该限制写成真实设备切换通过。

同一 probe 还模拟驱动主动启动/停止与格式切换，验证不兼容节点及 bypass 不泄漏 PCM、旧处理器回到兼容图后仍可输出、设备 ABA 代际拒绝，以及恢复后完整状态、自动化和精确 PCM。采用 observed 配置不会重新打开驱动。该路径不请求物理声卡或桌面输入，不代替驱动面板和系统设置的真机终验。

main 窗口关闭 Tauri 原生 `dragDropEnabled` 拦截，Browser 内部拖放使用 WebView HTML 事件。锁定的 tauri-runtime-wry 2.9.2 会无条件接收原生拖放，阻止 WKWebView 收到 `dragover` 和 `drop`。源同时提供内部 token 与标准文本文件名；只有内部会话 token 可用于导入。修改该原生配置需要重启应用，HMR 不生效。

不启动桌面应用的原生验证入口：

```sh
cmake -S crates/engine/native -B /tmp/zoeydaw-core-packages-native-build -DCMAKE_BUILD_TYPE=Release -DZOEYDAW_PLAYBACK_SMOKE=ON -DZOEYDAW_PLAYBACK_TESTS=ON
cmake --build /tmp/zoeydaw-core-packages-native-build --parallel 6
ctest --test-dir /tmp/zoeydaw-core-packages-native-build --output-on-failure
cargo test -p zoeydaw-media -p zoeydaw-project -p zoeydaw-browser
cargo test --workspace --locked
```

`native_transport_clock` 定向运行 Hosted transport clock 与音频侧控制代际竞争用例。Windows 从已加载 MSVC x64 环境的终端运行；Hosted 路径使用 48 kHz / 256 frames，不打开物理音频设备。

```sh
cmake -S crates/engine/native -B target/windows-native-clock -DZOEYDAW_PLAYBACK_TESTS=ON -DZOEYDAW_PLAYBACK_SMOKE=OFF
cmake --build target/windows-native-clock --config Release --target zoeydaw_mixer_tests --parallel 4
ctest --test-dir target/windows-native-clock -C Release -R native_transport_clock --output-on-failure --timeout 30
```

用例覆盖已排队音频块在新 seek ACK 后仍保留旧代际、主线程与音频预取边界并发 seek、完整 u64、实际处理速率与拒绝请求。1024-sample 图延迟场景还核对同块渲染/audible 坐标、seek 与 BPM 转换。可听补偿复用引擎既有位置节点，不是物理 loopback 测量；实际桌面播放头与听感仍需验收。

`native_session_launcher` 使用同一 `zoeydaw_mixer_tests` target，也可直接运行 `zoeydaw_mixer_tests --launcher`。Hosted IO 验收 mono 4/4 与 stereo 3/8 的真实 PCM 和 MIDI，覆盖量化前编排连续输出、块级启动、同轨替换、Stop/返回编排、场景删除、Slot 迁移及本地淡入/End 标记。它不打开物理声卡，不代替 Tauri 场景交互或实际听感验收。

同一 Session 入口还验证真实 Hosted Auto 输入：未启动的槽位不抑制监听，启动后只听片段，停止后恢复输入，返回编排时重新使用编排区间，并逐样本检查量化切换处没有输入泄漏。`native_meter_observer` 保留原 In/Auto/Off、recording、seek 和 sub-block 边界检查。

`zoeydaw_mixer_tests --recording` 定向验证 Hosted 输入的 16,384 帧精确 PCM、混合成功/失败 take、发布前拒绝 ACK 与重复 ACK。它还从真实 take journal 启动独立 `--recording-reclaim` 子进程，验证跨进程文件身份和 PCM，再覆盖缺少 finalized placement、不同工程 BPM、重复认领及目录越界拒绝。测试使用临时录音根并清理，不访问用户录音或物理声卡。Journal 使用同步 flush 后的临时文件替换；不声称断电恢复或损坏容器修复。

`zoeydaw_playback_tests --waveform` 定向运行真实浮点 WAV 的 signed samples、精确 extrema、部分 bin、取消、层级复用、同路径替换及缓存预算检查，并输出 retained bytes/entries 与命中数。缓存只从同级或更细数据合并，不用 AudioThumbnail 的近似极值。身份检查覆盖正常文件替换及修改时间变化；不声称保留元数据的原位写入或每次源内容 SHA-256 都已验证。

波形 range 已改为 `protocol/waveform-range.json` 定义的二进制响应；`pnpm check:realtime-protocol` 同时检查其生成布局。`apps/web/src/shared/native/audio.test.ts` 覆盖 signed float32、部分 bin、请求匹配、截断、非法头与旧 JSON 拒绝。原生 `--waveform` 和 Rust `analysis::tests` 使用同一 C ABI 的真实字节，不保留生产 JSON range 路径。

`zoeydaw_playback_tests --tempo` 定向运行源 BPM 检测回归，覆盖 metadata、短循环、切分、非节拍、三分/直分歧义，以及长源的结尾/中间变速、恒速和未知片段。长源检查只取三个分离窗口，不代替整曲分析、tempo map 或真实音乐准确率基准。

`zoeydaw_playback_tests --tempo-map` 用真实 WAV PCM 验证分段速度和阶梯斜坡，覆盖原速音频、Warp 源位置推进及 Clip 结束。`zoeydaw_mixer_tests --tempo-map` 通过 Hosted IO 核对 TempoSequence、seek、loop 回绕、停止时保留音乐位置，以及跨速度边界录制的 16,384 帧精确 PCM。两者均不打开物理设备，不代替真实音乐无 click 听验。

`native_graph_publication` 使用同一 build 目录的 `zoeydaw_graph_publication_tests` target。用例在图替换的各次分配注入失败，核对原 root、采样率、缓冲尺寸与连续 PCM，并继续提交有效图验证恢复；覆盖 pooling/sharing 组合及候选格式变化。它不打开物理音频设备，也不替代活跃 Edit 的严格原子事务或完整 document audioRevision。

`zoeydaw_mixer_tests --transaction-model` 使用真实 WAV 和同一 renderer clock 比较原位 Edit、独立候选和保留兼容处理资源的候选。它输出发布前、准备中、拒绝后及采用后的 PCM，记录 wrapper 重建，并验证 Utility 平滑、Delay 尾音、SDK 初始化及 reset 换代。此入口揭示事务边界，不将原位 setter、直接复制 Edit 或局部资源保留当作已完成的严格事务。

`zoeydaw_mixer_tests --source-publication` 定向检查 source graph 首次发布与替换均零分配、准备首个分配失败和候选取消保留旧观测，以及退役观测释放。该用例也包含在 `native_live_mixer` 中，不将主线程 graphPosted 当成音频采用确认。

`cargo run -p zoeydaw-engine --example meter_hub_smoke --locked -- REQUEST.json [FRAME_DIRECTORY]` 使用真实低增益输出，覆盖停止打开、无图 seek、完整 u64、Edit owner 换代、等待播放和实际音频块接管。可选输出目录必须已存在；探针保存真实 stream 的 `.bin` 与配套 registry JSON，便于重放到 Web consumer。用 `ZOEYDAW_AUDIO_CONFIG_PATH` 指定独立设备配置，`ZOEYDAW_AUDIO_CACHE_PATH` 指定临时缓存。停止、等待和播放使用同一个 levels v2 stream，不伪造 sample clock。该探针不启动桌面应用，也不代替物理听感验收。

同一入口还打开并关闭独立的 all-endpoint 验证 stream。指定 `FRAME_DIRECTORY` 时额外保存 `meter-consumers.bin` 与配套 registry，内容来自实际 native endpoint records，可重放到轨道、路由及 Device 的 Web meter 消费者。Device 输入与输出差异使用请求中显式配置的 Utility 增益验证；没有 Device 的请求不声称覆盖 Device 阶段。DOM 重放不代替实际 WebView、物理输入或听感验收。

`native_source_registry` 还验证 source 块时戳换算、未来块、50ms 过期、格式变化、设备计数下溢、停止与独立 Preview，以及退役 playhead 不可写入替换图。源时间、reference sample 和处理 sampleRate 在节点同一次发布中读取；native reader 使用同一 transport 锚点换算，48-byte source wire 布局不变。四种 Warp 的真实输出探针已覆盖非 1× 速度的 source 记录；这不表示算法物理延迟或音乐听感已验收。

根 `Cargo.lock` 与 `.cargo/config.toml` 供应用 workspace 共用。media、project、browser 的独立测试不编译 Tracktion；engine 与完整 workspace 检查需要维护的 Tracktion 源码及固定 JUCE checkout。研究探针 `scripts/audio/probes/rust` 保持独立 manifest 和 lock。

实时协议布局由 `protocol/realtime.json` 唯一定义。运行 `node scripts/generate-realtime-protocol.mjs` 生成三语言产物，`--check` 检查漂移。`pnpm check:realtime-protocol` 编译临时 Rust/C++ 校验程序，对照 TS 写出的全部字段与独立 golden fixture，结束后删除临时文件。native CTest 覆盖三槽并发快照、实际 DC/正弦/短脉冲计量、输入设备换代，以及完整 Edit 的 fader/mute/solo/Stop fence 后采集。

Windows 在 Visual Studio 的 x64 Native Tools Command Prompt 中运行 `corepack pnpm check:realtime-protocol`，或先加载已安装的 `VsDevCmd.bat -arch=x64 -host_arch=x64`。该入口使用 MSVC `cl.exe` 和带 `.exe` 后缀的临时程序；其他平台保留 `clang++`。确保 `where link` 首项来自 MSVC，避免 Rust 误用 Git 同名工具。Windows 已通过 v2 的 288 字节三语言往返、字段偏移与独立 golden fixture；这不代表桌面行为或物理出声已验收。

生产 transport、轨头、路由和 Device 电平从同一个 window-bound binary stream 读取 Rust MeterHub。Web MeterSession 管理单在途、endpoint 与 transport 兴趣并集、事件回执、可见性与关闭。项目接受后即可准入停止 stream，meterReady 不再门控 transport。registry 由原状态 poll 至多每 250ms 刷新，首次 Play 在缺少 audio observation 时立即刷新。playback_telemetry 只保留设备、issues 和录音缩略图。Hosted 回归与真实 native 帧重放不代替实际 Tauri 播放头、物理麦克风或 WebView 吞吐验收。

`zoeydaw_playback_smoke REQUEST.json NEW_CAPTURE.wav SECONDS` 使用真实输出设备，会发声。输入为严格 protocol v2 `BackendDocumentRequest`，含十进制 `controlGeneration`，control 不含 heldNotes/midiVelocity；素材必须可解码。程序限制测试 Main 和试听为低增益，覆盖窄控制、可靠 MIDI、定位、循环、并行试听、owner 切换和停止。捕获文件来自设备前的引擎输出，不是物理 loopback，也不能替代桌面 Browser 拖入和播放按钮的 UI 验收。输出文件不能覆盖已有文件。

`cargo run -p zoeydaw-engine --example meter_hub_smoke --locked -- REQUEST.json` 使用真实输出设备，将 Main 限制到 −30 dB。输入是严格 protocol v2 工程请求。它验证 EngineSession、native meter reader、Rust Hub 的真实样本聚合、音频图 sample/beat 时钟、1.2秒慢消费者、选择性 reset、换图后的 BPM 与 lease 释放，不启动 Tauri、不请求输入权限。用 `ZOEYDAW_AUDIO_CONFIG_PATH` 与 `ZOEYDAW_AUDIO_CACHE_PATH` 指向临时位置可隔离用户偏好；这项 smoke 不代替 WebView 吞吐和实际操作验收。

Windows WASAPI 的冷启动默认格式由 `audio_hardware_windows.cpp` 读取系统 mix format 与设备周期，不使用未打开 JUCE probe 的 current rate，不猜测采样率，也不在查询时调用音频流 Initialize/Start。普通 shared 模式已通过上述真实 Hub smoke，覆盖采样、RMS、时钟、窗口隔离、reset、慢消费者、拍号引起的换图和释放。Low Latency 与 Exclusive 模式仍未实测。探针通过拍号变更触发结构替换；单独改 BPM 保留 Edit，不能再作为换图测试输入。原生修改后由 Agent 等待重编译或重启 `tauri:dev` 并继续桌面验收；真实音乐听感仍需实际听验结论。

`playback_clock_probe(streamId)` 返回同一 Hub 原点的十进制纳秒和设备采样锚点，仅所属窗口可读。Web 首帧后每五秒串行采样五次，按最小 RTT 中点估算偏移，保留半 RTT 不确定度；隐藏恢复重新校准。`MeterSession.readFrameAge()` 只表示 Hub 快照发布年龄，不等同音频块采集到绘制的全链路延迟。真实 WKWebView 的 p95/p99 尚未测量。

`zoeydaw_audio_configuration_smoke [OUTPUT_DEVICE_ID]` 使用真实声卡，保持其当前物理采样率，只切换支持的 Buffer Size 后恢复。它验证 capabilities 探测不打开设备、配置失败与持久化失败回滚、输出通道掩码、编排和独立 Preview 状态、停止代际及重新创建 owner 后的偏好恢复。配置和 cache 使用临时位置，不覆盖用户偏好。它不请求输入权限，不验证录音或物理 loopback。示例设备 ID 为 `CoreAudio::E2x2`，以本机实际枚举为准。

`cargo test -p zoeydaw-browser tree_100k_disk_catalog_reports_bounded_window_latency -- --ignored --nocapture` 在临时目录创建 10 万真实文件，测量目录扫描及可见树窗口，结束后清理。它不代表音乐解码或实时播放压力测试。

开发首页的“实时 IPC 传输探针”打开 `/library/realtime-probe`，不取得工程/audio lease。Rust 新命令须等待原生重编译或重启完成再验收，由 Agent 维护 `tauri:dev`。页面显式运行 single-flight pull、有限 raw Channel 和单 credit 对照，每组4–20秒、最多1200帧；阻塞场景会故意让该 WebView 停顿1.2秒。所有原生命令在 release 构建拒绝，窗口身份由 Tauri 注入。报告是 synthetic IPC，不是音频延迟；显示器刷新、双窗口和其他平台未实测时保留 NOT VERIFIED。原始样本由页面下载，不把 native retainedBytes 当作 Tauri/WebView 总内存。`cargo test -p zoeydaw realtime_probe::tests` 验证队列/所有权，不能代替真实 WKWebView 运行。

## 修改前确认

以下改动先问用户：

- `src-tauri/tauri.conf.json`。
- `packages/ui/src/` 公共 API。
- 新增 npm 依赖。
- `.github/workflows/`。

secrets、token 和 API key 不进入仓库。保留其他 Session、Agent 的未提交和暂存工作。

## 按 Feature 或阶段提交

每完成一个可独立验证的 Feature、Bug 修复或重构阶段，运行受影响检查、自审 diff 后做一次本地 commit。无需重复询问用户，不要求口令、确认环境变量或 staged-tree hash。

只暂存本阶段归属的改动，保持提交可审查、可回退。保留其他 Session 的未提交和暂存工作；不要全仓 `git add .`、重置他人 index 或把未完成功能混入提交。若已有他人暂存内容，使用独立 index 隔离本阶段。

`.husky/pre-commit` 运行已有 lint-staged，`commit-msg` 检查提交职责。检查失败先修复，不默认跳过 hook。用户后续桌面验证继续保留为待办；本地提交记录实际执行的检查及未验收边界，不宣称全部验收通过。

本地 commit 不授权 push、发布、部署、合并或覆盖远端历史。提交历史中的旧确认日志保留为历史记录，不再作为当前门禁。
