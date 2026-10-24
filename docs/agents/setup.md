# 开发环境与操作边界

## 当前工程

React Web 前端由 Tauri 2 承载，Rust 提供桌面原生能力。工作区使用 pnpm。版本、包名和脚本以对应 `package.json`、`Cargo.toml` 为准；共享包目前仍有 `@zoeymind/*` 名称，本任务不顺带改名。

## 应用由用户持有

用户手动运行 `pnpm tauri:dev` 并保持观察。Agent 不启动、不重启应用，也不停止用户已有服务。

- 修改 Web TS、TSX 或 CSS 后通过 Vite HMR 生效，继续验证。
- 修改 Rust、`src-tauri/tauri.conf.json`、capabilities、Cargo 依赖或原生 plugin 注册后，明确告诉用户“需要重启 tauri:dev”。由用户操作。
- 若已有应用不可访问，先检查现有服务和连接，不用另开一个应用绕过问题。

## 验证命令

开发套件统一使用 Ultracite v8，Node 要求以根 `package.json` 为准，当前至少 22.18。常规入口在工作区根目录运行：

```sh
pnpm doctor
pnpm check
pnpm fix
pnpm test
pnpm typecheck:core
pnpm check:boundaries
pnpm --filter @zoeydaw/web typecheck
pnpm --filter @zoeymind/shared typecheck
pnpm --filter @zoeymind/logger typecheck
pnpm build
```

`check` 执行 Ultracite、共享度量漂移和核心依赖边界检查；`fix` 先生成度量 CSS 再执行套件修复；`test` 运行 core/runtime 独立包、Web 行为、根工具模块规则及 shared/logger/UI 行为测试，并检查 Cargo/native 依赖方向。`test:shared` 包含共享 UI 的资源和 React 生命周期回归。`typecheck:core` 检查两个核心 Web 包。Web 的 lint/format 是这些根入口的别名，不维护另一套格式配置。类型检查和构建单独执行，不包含在 `check` 中。

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

原生播放使用仓库维护的 `src-tauri/native/tracktion-source/`，上游基线、JUCE 提交与许可路径见 `scripts/audio/native-source.lock.json`。先运行 `node scripts/audio/setup-native-engine.mjs`；脚本仅在 JUCE 缺失时取得固定提交，已有 checkout 不同版或含本地改动时拒绝继续，不重置文件。Tracktion 的循环起点、设备刷新、graph build/post 修复直接保存在源码中，不再重放 patch。graphPosted 仍不表示 audio 已采用新图。旧 ignored vendor checkout 保留，但不再参与构建。

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

实时协议布局由 `protocol/realtime.json` 唯一定义。运行 `node scripts/generate-realtime-protocol.mjs` 生成三语言产物，`--check` 检查漂移。`pnpm check:realtime-protocol` 编译临时 Rust/C++ 校验程序，对照 TS 写出的全部字段与独立 golden fixture，结束后删除临时文件。native CTest 覆盖三槽并发快照、实际 DC/正弦/短脉冲计量、输入设备换代，以及完整 Edit 的 fader/mute/solo/Stop fence 后采集。graph tap 已替换旧 LevelMeasurer 路径；MeterHub 和桌面 meter 拉取尚未接通。

`zoeydaw_playback_smoke REQUEST.json NEW_CAPTURE.wav SECONDS` 使用真实输出设备，会发声。输入为严格 protocol v2 `BackendDocumentRequest`，含十进制 `controlGeneration`，control 不含 heldNotes/midiVelocity；素材必须可解码。程序限制测试 Main 和试听为低增益，覆盖窄控制、可靠 MIDI、定位、循环、并行试听、owner 切换和停止。捕获文件来自设备前的引擎输出，不是物理 loopback，也不能替代桌面 Browser 拖入和播放按钮的 UI 验收。输出文件不能覆盖已有文件。

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

## 每一次 commit 单独确认

每次 commit 都要求用户在本次提交上下文明确说出 **“我确认”**。之前的授权不延续；“提交吧”“commit 一下”“push 吧”不能替代。

`.husky/pre-commit` 执行确认门禁及已有格式/检查流程。非交互提交在获得该次确认后使用：

```sh
USER_CONFIRM_HASH=$(git write-tree) git commit -m "..."
```

确认 hash 绑定本次 staged tree；通过 hash 校验的非交互提交尝试记录在 `.git/commit-audit.log`，该文件不记录被拒绝的违规尝试。未经授权不 commit，不自动扩展为 push、发布或部署。
