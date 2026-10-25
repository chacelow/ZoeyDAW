# 开发环境与操作边界

## 当前工程

React Web 前端由 Tauri 2 承载，Rust 提供桌面原生能力。工作区使用 pnpm。版本、包名和脚本以对应 `package.json`、`Cargo.toml` 为准；共享包目前仍有 `@zoeymind/*` 名称，本任务不顺带改名。

## 应用由用户持有

用户手动运行 `pnpm tauri:dev` 并保持观察。Agent 不启动、不重启应用，也不停止用户已有服务。

- 修改 Web TS、TSX 或 CSS 后通过 Vite HMR 生效，继续验证。
- 修改 Rust、`src-tauri/tauri.conf.json`、capabilities、Cargo 依赖或原生 plugin 注册后，明确告诉用户“需要重启 tauri:dev”。由用户操作。
- 若已有应用不可访问，先检查现有服务和连接，不用另开一个应用绕过问题。

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

`check` 执行 Ultracite、共享度量漂移、核心依赖边界及文件规模检查；`check:file-size --report` 列出超过 500 行的自有源码，存量超限基线只准降低或删除。`fix` 先生成度量 CSS 再执行套件修复；`test` 运行 core/runtime 独立包、Web 行为、根工具模块规则及 shared/logger/UI 行为测试，并检查 Cargo/native 依赖方向。`test:shared` 包含共享 UI 的资源和 React 生命周期回归。`typecheck:core` 检查两个核心 Web 包。Web 的 lint/format 是这些根入口的别名，不维护另一套格式配置。类型检查和构建单独执行，不包含在 `check` 中。

需要单独修改共享度量时使用包命令，不从 Web 跨目录执行脚本：

```sh
pnpm --filter @zoeymind/ui metrics:generate
pnpm metrics:check
cargo check --manifest-path src-tauri/Cargo.toml
```

正确性、类型、无障碍与项目架构/token 作为硬门禁；预设中的 suggestion/layout 规则默认关闭，不输出建议或自动要求全仓改写，文件名约束等显式规则以根配置为准，格式由套件 formatter 统一。架构检查覆盖配置列出的层级、公共入口和可静态识别的 JSX token，不是完整依赖图或所有动态样式的证明。现有单实例服务和测试 harness 的合理模式在根配置集中声明。类型化 React props 不重复添加 PropTypes，当前 Router 版本也不按 v8 规则强行迁移。

不要未经审查重跑 `ultracite init` 覆盖项目配置。升级时检查预设、peer 绑定和本地架构规则，重新执行 doctor、check、类型、测试与页面验证；不使用自动启动其他 agent 的修复参数替代本轮受控编辑。

`pnpm tauri:dev` 和 `pnpm tauri:build` 只给用户参考，Agent 不主动执行。当前按纯本地开发验收：保留 workflow 文件，但不上传 GitHub、不触发远程流程、不把配置存在称为 CI 已运行。

UI 改动必须在已有应用或 Web 页面上验证主路径，观察新截图或实际状态。单元测试通过不能代替 UI 验证；报告实际检查与限制，不把模拟电平称为真实音频。

原生播放使用仓库维护的 `src-tauri/native/tracktion-source/`，上游基线、JUCE 提交与许可路径见 `scripts/audio/native-source.lock.json`。先运行 `node scripts/audio/setup-native-engine.mjs`；脚本仅在 JUCE 缺失时浅 fetch 固定提交，不下载完整历史。已有 checkout 不同版或含本地改动时拒绝继续，不重置文件。Tracktion 的循环起点、设备刷新、graph build/post 修复直接保存在源码中，不再重放 patch。graphPosted 仍不表示 audio 已采用新图。旧 ignored vendor checkout 保留，但不再参与构建。

插件 helper 使用 `third_party/plughost/source-lock.json` 固定的 0.1.5 源码。`node scripts/audio/build-plugin-helper.mjs` 构建 `zoeydaw-plugin-helper`，在 macOS 生成并验证仅 helper 使用的 ad-hoc Hardened Runtime 签名，在 Windows 复制原生可执行文件。Tauri 的开发与构建前置命令运行该脚本，生成物位于 ignored `src-tauri/plugin-helper/`，作为资源打包。脚本不启动 DAW、不扫描插件、不执行发布签名或公证。

`node scripts/audio/verify-plugin-host.mjs [NATIVE_BUILD_DIRECTORY]` 从维护源码构建本地测试插件，打包到临时目录，运行后清理。它不扫描已安装插件。验收覆盖 catalog 身份约束、扫描取消、音频/MIDI/自动化跨 quantum 偏移、宿主回调分配计数、CLAP/VST3 quantum 内时间跳转、崩溃/挂起隔离及显式恢复的真实输出。指定 native build 目录时还构建并执行 Tracktion Node→C ABI→Rust→helper 的脉冲、PDC 和乐器测试。`transport_smoke` 可额外接收不兼容 helper 路径，验证拒绝旧构建。macOS 已实测，Windows 尚未实测；这些探针不代替工程 Device 和真实 UI 验收。

`cargo run -p zoeydaw-engine --example plugin_admission_smoke --locked` 通过真实 EngineSession 验证异步 admission 回执未领取时取消，以及显式取消的恰好一次释放；不启动 Tauri 或声卡。带 native build 参数的插件验证脚本包含此入口。

main 窗口关闭 Tauri 原生 `dragDropEnabled` 拦截，Browser 内部拖放使用 WebView HTML 事件。锁定的 tauri-runtime-wry 2.9.2 会无条件接收原生拖放，阻止 WKWebView 收到 `dragover` 和 `drop`。源同时提供内部 token 与标准文本文件名；只有内部会话 token 可用于导入。修改该原生配置需要重启应用，HMR 不生效。

不启动桌面应用的原生验证入口：

```sh
cmake -S crates/engine/native -B /tmp/zoeydaw-core-packages-native-build -DCMAKE_BUILD_TYPE=Release -DZOEYDAW_PLAYBACK_SMOKE=ON -DZOEYDAW_PLAYBACK_TESTS=ON
cmake --build /tmp/zoeydaw-core-packages-native-build --parallel 6
ctest --test-dir /tmp/zoeydaw-core-packages-native-build --output-on-failure
cargo test -p zoeydaw-media -p zoeydaw-project -p zoeydaw-browser
cargo test --workspace --locked
```

根 `Cargo.lock` 与 `.cargo/config.toml` 供应用 workspace 共用。media、project、browser 的独立测试不编译 Tracktion；engine 与完整 workspace 检查需要维护的 Tracktion 源码及固定 JUCE checkout。研究探针 `scripts/audio/probes/rust` 保持独立 manifest 和 lock。

实时协议布局由 `protocol/realtime.json` 唯一定义。运行 `node scripts/generate-realtime-protocol.mjs` 生成三语言产物，`--check` 检查漂移。`pnpm check:realtime-protocol` 编译临时 Rust/C++ 校验程序，对照 TS 写出的全部字段与独立 golden fixture，结束后删除临时文件。native CTest 覆盖三槽并发快照、实际 DC/正弦/短脉冲计量、输入设备换代，以及完整 Edit 的 fader/mute/solo/Stop fence 后采集。

Windows 在 Visual Studio 的 x64 Native Tools Command Prompt 中运行 `corepack pnpm check:realtime-protocol`，或先加载已安装的 `VsDevCmd.bat -arch=x64 -host_arch=x64`。该入口使用 MSVC `cl.exe` 和带 `.exe` 后缀的临时程序；其他平台保留 `clang++`。确保 `where link` 的首项来自 MSVC，避免 Rust 误用 Git 自带的同名工具。Windows 已实际通过 224 字节的三语言往返和 golden fixture 校验；这不代表 Tauri、音频设备或桌面行为已验收。

生产轨头、路由和 Device 前后级电平通过 window-bound stream 的 raw binary snapshot 读取唯一 Rust MeterHub；Web `MeterSession` 管理单在途拉取、兴趣并集、事件回执、隐藏恢复和关闭。原生 telemetry 的 `meterReady` 显式控制准入，停播且尚无图时等待首次 Play，不因订阅启动音频。原有 backend poll 每 250ms 至多刷新一次 registry，原生刷新等待新图首个快照。Transport、设备状态和录音缩略图仍使用 `playback_telemetry`，完整唯一快照切换与 WKWebView 验收尚未完成。Hosted 录音回归覆盖三轨同源及不同输入、前后 seek 启录、播放中 punch-in、真实 writer PCM 和缩略图增长。这些验证不代替真实麦克风回调与桌面操作验收。

`zoeydaw_playback_smoke REQUEST.json NEW_CAPTURE.wav SECONDS` 使用真实输出设备，会发声。输入为严格 protocol v2 `BackendDocumentRequest`，含十进制 `controlGeneration`，control 不含 heldNotes/midiVelocity；素材必须可解码。程序限制测试 Main 和试听为低增益，覆盖窄控制、可靠 MIDI、定位、循环、并行试听、owner 切换和停止。捕获文件来自设备前的引擎输出，不是物理 loopback，也不能替代桌面 Browser 拖入和播放按钮的 UI 验收。输出文件不能覆盖已有文件。

`cargo run -p zoeydaw-engine --example meter_hub_smoke --locked -- REQUEST.json` 使用真实输出设备，将 Main 限制到 −30 dB。输入是严格 protocol v2 工程请求。它验证 EngineSession、native meter reader、Rust Hub 的真实样本聚合、音频图 sample/beat 时钟、1.2秒慢消费者、选择性 reset、换图后的 BPM 与 lease 释放，不启动 Tauri、不请求输入权限。用 `ZOEYDAW_AUDIO_CONFIG_PATH` 与 `ZOEYDAW_AUDIO_CACHE_PATH` 指向临时位置可隔离用户偏好；这项 smoke 不代替 WebView 吞吐和实际操作验收。

Windows WASAPI 的冷启动默认格式由 `audio_hardware_windows.cpp` 读取系统 mix format 与设备周期，不使用未打开 JUCE probe 的 current rate，不猜测采样率，也不在查询时调用音频流 Initialize/Start。普通 shared 模式已通过上述真实 Hub smoke，覆盖采样、RMS、时钟、窗口隔离、reset、慢消费者、拍号引起的换图和释放。Low Latency 与 Exclusive 模式仍未实测。探针通过拍号变更触发结构替换；单独改 BPM 保留 Edit，不能再作为换图测试输入。需要重启 `tauri:dev`，桌面播放及真实音乐听验仍由用户完成。

`playback_clock_probe(streamId)` 返回同一 Hub 原点的十进制纳秒和设备采样锚点，仅所属窗口可读。Web 首帧后每五秒串行采样五次，按最小 RTT 中点估算偏移，保留半 RTT 不确定度；隐藏恢复重新校准。`MeterSession.readFrameAge()` 只表示 Hub 快照发布年龄，不等同音频块采集到绘制的全链路延迟。真实 WKWebView 的 p95/p99 尚未测量。

`zoeydaw_audio_configuration_smoke [OUTPUT_DEVICE_ID]` 使用真实声卡，保持其当前物理采样率，只切换支持的 Buffer Size 后恢复。它验证 capabilities 探测不打开设备、配置失败与持久化失败回滚、输出通道掩码、编排和独立 Preview 状态、停止代际及重新创建 owner 后的偏好恢复。配置和 cache 使用临时位置，不覆盖用户偏好。它不请求输入权限，不验证录音或物理 loopback。示例设备 ID 为 `CoreAudio::E2x2`，以本机实际枚举为准。

`cargo test -p zoeydaw-browser tree_100k_disk_catalog_reports_bounded_window_latency -- --ignored --nocapture` 在临时目录创建 10 万真实文件，测量目录扫描及可见树窗口，结束后清理。它不代表音乐解码或实时播放压力测试。

开发首页的“实时 IPC 传输探针”打开 `/library/realtime-probe`，不取得工程/audio lease。Rust 新命令需要用户重启 `tauri:dev`。页面显式运行 single-flight pull、有限 raw Channel 和单 credit 对照，每组4–20秒、最多1200帧；阻塞场景会故意让该 WebView 停顿1.2秒。所有原生命令在 release 构建拒绝，窗口身份由 Tauri 注入。报告是 synthetic IPC，不是音频延迟；显示器刷新、双窗口和其他平台未实测时保留 NOT VERIFIED。原始样本由页面下载，不把 native retainedBytes 当作 Tauri/WebView 总内存。`cargo test -p zoeydaw realtime_probe::tests` 验证队列/所有权，不能代替真实 WKWebView 运行。

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
