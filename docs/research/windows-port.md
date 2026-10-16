# Windows x64 移植

2026-10-17，W1，`x86_64-pc-windows-msvc`。独立 Windows vendor 构建、声明生成、DirectComposition 离屏、真实后端主路径及受影响回归已实跑。生产窗口的恢复/关闭闭环、物理输入、多显示器和安装仍待协调者实机或 Actions 验收。Linux 不在范围。

## 基线和接口

派发基线 `b53cd676`，分支 `chacelow/gpuix-w1-windows`。已合入协调者主干 `60e4b97c27886d3d81ab3ae33141217c709778bb`，保留 P1 最终图标、许可证、`0.1.0-alpha.1` 版本和 engine xrun 非致命修复。后续主干 C3 等合入由协调者再次集成，不能覆盖其工作。gpuix 固定 `6a5c7c142ac32f9eb0caefe0121be995cfc18631`，Zed 固定 `c2e9f882030ca95cee55d206512a0a3ee6cd72b0`。

完整审查命令：`git diff 60e4b97c27886d3d81ab3ae33141217c709778bb...HEAD`。原实现提交为 `c1a4ee21`、`124de6d7`、`b67194a1`、`face6dae`、`9185c00d`；主干合并 `ce10c938`，测试质量修正 `c79b10e2`。返修提交包含 Unix 兼容、registry 与真实生命周期探针。

## 能力矩阵

“实现”表示源码契约；只有证据列明确标记的 Windows 路径已经运行。首次 macOS 阶段记录与 PC 增量分节保留。

| 能力 | macOS | Windows | 证据与边界 |
| --- | --- | --- | --- |
| nativeVersion | 既有实现 | 可移植 | crates Windows check 通过 |
| app_state | NSRunningApplication | foreground HWND/PID 已有实现 | Windows 运行未验证，未知仍 null |
| atomic_file | rename、目录 fsync | MoveFileExW replace/write-through 已有实现 | 不承诺 Windows 目录 fsync 或相同断电耐久性 |
| clipboard | NSPasteboard 保持 | CF_UNICODETEXT、有效隐藏 owner、HGLOBAL RAII | NUL 在修改前拒绝；跨进程实跑未验证 |
| cursor position/restore | CoreGraphics 保持 | Get/SetPhysicalCursorPos、范围与舍入校验 | Windows 锚点为虚拟桌面物理像素，可为负 |
| 持续隐藏光标 | 原 native 路径 | UI-thread ShowCursor 自有计数平衡 | 失活/退出清理；物理隐藏/归位未验证 |
| window_geometry | NSWindow 转换保持 | HWND DPI、ClientToScreen、临时 DPI context | 事件至 JS 期间窗口移动竞态未解决，不宣称跨屏精确 |
| window_diagnostics | AppKit 已有 | 明确 unsupported | CI 显式断言，不伪造 occlusion/main-window bool |
| reduced motion | NSWorkspace 保持 | SPI_GETCLIENTAREAANIMATION 取反、WM_SETTINGCHANGE 线程 | baseline/替换/注销、Env cleanup；系统实际切换未验证 |
| settings/snapshots | 原持久化 | 复用 dirs/serde/原子文件 | 不新增主题状态 owner |
| external/log | 既有实现 | ShellExecuteW/explorer、文件 sink 复用 | Windows 打开目录与文件删除语义未实跑 |
| engine/session/peaks | 首次真实后端 smoke 通过 | Firewheel/CPAL WASAPI 会话、峰值和走带已实跑 | Windows smoke released=true；音频听感、设备切换未验证 |
| engine cleanup/telemetry | 既有 Env owner/单 in-flight | 同一实现 | Windows Worker teardown 待 Actions |
| file URI | 严格恢复原 Unix 解码 | Url::to_file_path 支持 drive/UNC | #、?、真实 symlink/.. 回归与平台 mutation |
| appearance | renderer observer | 复用 GPUI Windows observer | 不另建 native 外观 owner |
| frames/resume | embedded loop 保持 | bounded NonBlocking TSFN、token/ack、pre-present gate | 纯协议测试通过；Windows闭环待 Actions |
| close guard | 同步 veto 保持 | 先 veto、异步 predicate、拒绝过期响应 | confirmed closeWindow bypass |
| renderer 生命周期 | 原路径 | 每 Env 一个 registry hook、实例注销、幂等 shutdown | 5 个真实源 registry 单测通过，Windows释放待 Actions |
| offscreen scale/bounds | 原 1x/2x 路径 | 原生 400×300 默认/1/2 与 JS 1x/2x 几何已实跑 | vendor Rust 回归通过；4000×3000 入口保留给 CI |
| offscreen 资源生命周期 | 原生 helper 卸载时显式释放 | HWND owner thread 同步销毁，TestRoot 幂等 dispose | DComp 开启连续 320 窗口、首尾像素、陈旧 owner 与自然退出通过 |
| WARP | 不适用 | GPUIX_FORCE_WARP=1 显式选择 | 默认生产 adapter 选择不变；实际运行待 CI |

现有手势使用按下点与绝对事件位移，GPUI 已 SetCapture/ReleaseCapture。本次不增加 ClipCursor、raw input、AttachThreadInput，也不宣称无限拖动。所有旧 nativeCursorLock 调用方已迁移到 renderer 作用域 factory，不保留 alias。业务没有新增 process.platform；Windows effect 方法缺失时 hide/restore 明确抛错，离屏 capture 仍调用真实 native geometry。

## 全部补丁盘点

| 原补丁 | Windows 处理 |
| --- | --- |
| close-guard.patch | 原 Mac 同步实现；windows-ui-bridge 补异步 veto/response |
| frame-callback.patch | 原 Mac API；Windows bounded TSFN 单 in-flight |
| input-select-all-on-focus.patch | 平台无关，复用；Windows IME 未验证 |
| anchored-center.patch | snap center 改为 trigger 中点；四边/对齐/奇偶/1x2x/翻转已验证，混合 DPI 未验证 |
| select-trigger-space.patch | React 逻辑复用；Windows键盘实机未验证 |
| window-active-change.patch | 已有 UI command/TSFN，复用 |
| window-appearance-close.patch | 已有 appearance/bypass close，复用 |
| context-menu.patch | 平台无关；Windows native right click 复用 |
| quad-batch.patch | owned buffer 复用；DirectX像素等价未验证 |
| autofocus-focus-event.patch | UI FocusHandle owner 复用 |
| resume-frame.patch | 原 Mac prepaint；Windows gate 单独追加 |
| aria-toggled.patch | AccessKit映射复用；Windows UIA 未实机验证 |
| test-window-scale-factor.patch | 边界校验复用，Windows平台消费新增 |
| zed-production-no-sync-draw.patch | 平台无关 Production 语义保留 |
| zed-offscreen-window-bounds.patch | Mac专用实现保留，Windows另补 |
| zed-test-window-scale-factor.patch | 通用参数链保留，Windows另补 |
| windows-ui-bridge.patch | 单个 NAPI init，函数体内区分平台；帧、resume、close、cursor 与 scale 桥 |
| zed-windows-resume-offscreen.patch | GPUI gate、restore generation、offscreen、WARP |
| windows-renderer-cleanup.patch | 每 Env registry、显式终止 receiver、幂等注销 |
| zed-windows-successful-presents.patch | 只在 DXGI Present 成功后计数，非物理可见性证明 |
| test-window-teardown.patch | VisualTestState 关闭窗口；owner-checked dispose 与 TestRoot 清理，包含生成声明 |
| zed-windows-offscreen-teardown.patch | 仅 offscreen 同步释放 HWND，避免任务滞留在未泵送的 native executor |

PC 隔离 vendor 为 `D:/Code/_vendor/pc-gpuix-w1-windows/6a5c7c142ac32f9eb0caefe0121be995cfc18631`，Cargo target 为同根 `target`。最终从干净 tracked 源码重放 16 个 renderer、6 个 Zed 补丁，`napi build`、`check.mjs --record`、`--resolution` 均通过。共享 vendor 只读，未新增依赖。已有 anchored-center 与 Windows 补丁按批准更新，没有使用生成文件后处理。

## 线程与资源决策

UI 不阻塞等待 JS。普通帧和 resume 使用 generation/token/ack；resume 在提交确认前延后 present，但继续处理输入与 commands。JS trampoline 拒绝过期回调。关闭请求先 veto，重复请求合并，旧 handler 的 true 不关闭新状态。

初版逐实例 Env hook 被独立审查退回。锁定 napi 3.12.7 的 remove_env_cleanup_hook 不回收 Box::leak 包装，不能用“移除了 handle”冒充释放。最终每 Env 仅注册一个 hook，registry 只持有活跃实例；close、Drop、tick 退出均移除 registration 并主动 shutdown。receiver 收到终止命令即 break/cx.quit，不等待所有 TSFN sender 断开。Env teardown 只清理剩余实例。

## CI 与 P1 release

Windows Node driver 复用 config、完整补丁身份和 manifest，使用 junction、MSVC ABI 文件名、显式 Git executable。macOS shell 构建路径保持。Windows checkout 前配置 LF。Git 默认 Windows ProgramFiles/Git/cmd/git.exe，允许绝对 GPUIX_GIT_EXECUTABLE；不忽略安全 lint。

ci.yml 的 Windows job 只在 main push 运行，首轮 continue-on-error。缓存由 RUNNER_WORKSPACE 写入 GITHUB_ENV，再用 env.GPUIX_VENDOR_ROOT/env.CARGO_TARGET_DIR，vendor/target 分层。`verify-windows.mjs` 构建 native、执行 Rust/类型/Bun/架构、URI mutation、GPUI gate、离屏 scale、真实后端与 Gallery。独立检查失败后仍保留截图和故障证据，不假通过。

std-only User32 driver 按准确 PID/title 定位自有窗口，操作前重新核对归属，真实 minimize/restore/WM_CLOSE。runtime 验证无提前成功 Present、JS提交后继续 Present、veto/allow/陈旧响应和 bypass；successfulPresents 不等同 frames，也不等同物理屏幕可见。Windows探针只在 Actions 编译运行。

P1 接口为 `bun scripts/release/package.mjs <version> [output-directory]`，Bun plugin 将包名及真实 loader 路径都变为静态 .node require，不改 vendor loader。Windows binding 后缀 win32-x64-msvc；Bun exe → cargo-packager 0.11.8 nsis。只分发含五份许可证资源的安装器与 SHA256SUMS-windows-x64，不发布裸 exe。release matrix 加 windows-latest，draft聚合未改；evidence-release-* 不匹配资产下载 release-*。尚未生成/安装 Windows包，未push、未打tag。

## 首次 macOS 阶段已执行验证

| 检查 | 结果 |
| --- | --- |
| 改动 crates cargo check/test，合入主干后重跑 | 64 passed；保留既有非根 profile 告警 |
| cargo check --target x86_64-pc-windows-msvc | libs 通过 |
| cargo check --tests --target x86_64-pc-windows-msvc | Windows-only测试类型通过 |
| vendor Windows cargo check | ring C build 缺 assert.h/Windows SDK，未到 renderer源码或链接 |
| vendor固定工具链 target add | missing manifest；同版本stable重试后到上述SDK边界 |
| Unix兼容 path_tests | 5 passed，含真实临时 symlink读取 |
| W1 URI mutation | 被真实 unix_file_uris_decode_escaped_local_paths 失败杀死，非编译失败 |
| 实际 windows_protocol.rs rustc独立测试 | 5 passed；仅纯状态，不是Win32集成 |
| 实际 windows_lifecycle.rs 外部Cargo harness | 5 passed；仅复用已锁 parking_lot 0.12.5，临时目录已删除 |
| app、Windows smoke、release smoke tsc | 通过 |
| scoped platform/frame Bun | 41 passed；后续 cursor 1 passed、reduced-motion 2 passed |
| Node source/build身份 | 7 passed；Windows ABI fixture修复TEMP后1 passed |
| ultracite与各本地commit hook | 通过，无no-verify |
| actionlint | 通过 |
| review scan | 0 HARD / 4 WARN，见自审表 |
| 全仓绝对路径scan | 835 tracked源码，0 HARD / 0 WARN |
| Mac真实后端离屏应用 | playingBar=2.0349620625，停止后released=true，进程退出0 |
| Mac完整Gallery | 深浅、中英四个完整组合图，进程退出0 |
| 自有后台真实窗口 | created native window/mount complete；33.6秒后关闭；AX因computer session closed不可用 |

按较新指令未在本机跑完整 pnpm verify:gpuix、vendor整库重建或打包；这些交给 Actions。Mac smoke 使用既有已验证 renderer 与本轮 native debug binding，不冒充新 Windows renderer二进制证据。

证据目录 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/w1-windows-port-evidence-HB9Xh5`：home.png、arrangement-playing.png、arrangement-stopped.png、smoke.json，gallery/{en,zh}-{dark,light}.png 与原生 a11y/stats JSON。所有临时入口和测试harness已删除。命名 service w1-background-window、w1-offscreen-smoke、w1-gallery-proof 均已关闭。

进程清理命令：`ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"`。实际输出为空，grep退出1表示无匹配；没有停止用户或其他worker服务。

## PC 增量验证（2026-10-17）

从 `4029041` 继续。`30f0a99` 合并主干 `08c2f20`，保留 C4 默认值/组合与 C5 可移植门禁，并重新带回被 `d8dca240` 撤回的 W1 改动。代码验证提交截至 `3bfe7aa`。macOS 的 app-only 打包、重签、strict 验证后生成 DMG 顺序未回退，Windows NSIS 保持独立分支。

### 根因与修复

- WindowsWindow 的旧 Drop 将持有 renderer 的 Rc 投递到 native ForegroundExecutor；VisualTest 只运行 TestDispatcher，该任务不执行。仅 remove_window 不能释放资源。现在 offscreen HWND 在 owner thread 销毁，先移除 close callback 避免重入 App，普通生产窗口仍异步销毁。
- TestRoot 原来只卸载 React，最后一个 native 窗口留到宿主线程退出，触发 COM 退出崩溃。新增 owner-checked TestGpuixRenderer.dispose，TestRoot.unmount 幂等且在 finally 释放；陈旧 root 的键盘/selection 退订不再作用于新窗口。失败的 env hook 与全局 OLE 析构实验已删除。
- 居中弹层在平移前产生 `-115.5` 与 `158.5` 两条边，toward-zero 舍入把宽 274 变成 273。snap wrapper 改在 trigger 中点放置零尺寸 anchor，不改全局 taffy，不补像素或放宽尺寸断言。
- i18n 失败来自文件 URL 的 pathname 作为 Windows cwd，执行文件原本就是 process.execPath。改用 fileURLToPath。波形测试显式使用黑底，避免把 Windows 的白色清屏当作白色峰值；同时独立初始化工程，消除对前序测试的依赖。
- builder 在 bun install 后及已验证缓存的修复路径中，将相对目录链接转为 vendor 内 canonical absolute junction。首次独立安装修复 1225 个链接，包含 React；已有绝对链接不重复转换。实际 React 链接与 App/Renderer/Reconciler/Zustand 全部解析到 `.bun/react@19.2.4/node_modules/react`。
- NAPI init 收敛成一个带 Env 的导出，平台分支位于函数体。真实生成的 index.d.ts 只有一个 init，dispose 声明也来自生成器并进入有序补丁。
- Preferences JSON 在唯一读取边界验证并收窄四组枚举，类型来自生成的 Preferences。删除无效 ambient JSON 声明；没有 as、第二份默认值或虚构的 arrangement 对象，调用方不变。

### WASAPI 多 session 预算

原始探针分别计时 factory、apply 与 dispose。8 次真实 open 为 1037.60–1056.62ms，dispose 为 669.26–1499.76ms，普通 commit 为 0.20–0.46ms。下面的 session 次数来自带计时的真实 backend，不是 mock。它解释宿主 I/O 成本，不代表引擎性能得到修复。

| 用例 | 真实 session 次数 | 原超时运行秒数 | 最终 JUnit 秒数 | Windows 预算秒数 |
| --- | --: | --: | --: | --: |
| saved project reopens from recent | 4 | 8.290 | 8.455 | 15 |
| save availability / Restore / switching | 3 | 6.186 | 6.277 | 15 |
| dirty replace saves before opening another project | 2 | 6.685 | 5.234 | 15 |
| save failure stays / discard may leave | 2 | 8.069 | 5.248 | 15 |

四项均由协调者逐项批准，仅使用 `app/verification/native-session-budget.ts` 的一个 Windows 15s 来源。其它平台保留 undefined 默认预算，其它用例不变。保留全部 219 个断言，没有 sleep、retry、skip 或 tolerance 调整。

### 已运行的命令与结果

所有 native test、smoke 与 Gallery 子进程都移除了 `GPUI_DISABLE_DIRECT_COMPOSITION`；没有设置 WARP override。旧 agent 继承的关闭标志没有用于成功证据。

```powershell
$env:GPUIX_VENDOR_ROOT = "D:/Code/_vendor/pc-gpuix-w1-windows"
$env:CARGO_TARGET_DIR = "$env:GPUIX_VENDOR_ROOT/target"
Remove-Item Env:GPUI_DISABLE_DIRECT_COMPOSITION -ErrorAction SilentlyContinue
node scripts/gpuix-main/build-windows.mjs
node scripts/gpuix-main/check.mjs --record
node scripts/gpuix-main/check.mjs --resolution
```

清洁重放前只对自己独立 vendor 与其 zed 执行 `git restore --source=HEAD --staged --worktree .`；所有修改已编码进有序补丁，依赖与 Cargo 缓存保留。首次 cached check 对未打补丁源码报预期失配，随后完整重放、重生成与最终检查退出 0。PC 使用 Windows builder，没有声称运行 macOS build.sh。

| 检查 | 实际结果 |
| --- | --- |
| 独立 Windows clean source → ordered patches → napi build → record/resolution | 16 renderer / 6 Zed 补丁与生成声明一致，单一 native/React 解析 |
| DComp offscreen-lifecycle 与 anchored-geometry | 7 pass，314 assertions；320 窗口、首尾像素、陈旧 keyboard/selection owner、奇偶/缩放/翻转，进程自然退出 |
| 原 5 个受影响应用测试文件 | 90 pass，219 assertions，62.80s |
| windows-dependency-links.test.mjs | 11 pass，含 checkout junction 下 React/Reconciler 同一实例及重复修复/越界/中断 |
| 两个项目 crate cargo test | engine 42、native 38 passed |
| 两个项目 crate cargo check --target x86_64-pc-windows-msvc | 通过 |
| vendor cargo check/test --locked --release --features test-support --lib | check 通过，315 tests passed，包含原生 offscreen scale 与 anchored 回归 |
| app tsc 与 windows/tsconfig.json tsc | 均通过 |
| scoped ultracite 与所有 commit hooks | 通过，无 no-verify |
| actionlint 1.7.12，ci.yml 与 release.yml | 通过；官方 Windows zip SHA-256 校验后临时执行，未改依赖 |
| UI-map 实际 lint-staged 回归与变异 | 7 tests passed，4 mutants killed |
| Windows 真实后端 offscreen smoke | playingBar=2.0640108，released=true，退出 0 |
| Windows 完整 Gallery | en/zh × dark/light 四组生成，退出 0 |
| 最终 review scan | 12 source / 9 test，0 HARD / 4 fixture WARN；逐项结论见下表 |
| 全仓绝对路径检查 | 892 tracked source，0 HARD / 0 WARN |

证据在 `C:/Users/11038/AppData/Local/Temp/w1-pc-evidence-oWdUgC`。保留 home/Arrangement PNG、AX、smoke.json、四组 Gallery、最终 windows-affected-tests.xml，以及 wasapi-transition-probe.fixture.tsx、wasapi-availability-probe.fixture.tsx 和对应计时 JSON。诊断副本只在原 app 目录临时运行，已移出仓库。未运行本机完整 verify:gpuix、NSIS 安装或发布；Windows Actions job 结果由协调者推 main 后补充，不能用 continue-on-error 的总流水线绿灯替代该 job 的成功。

本轮没有启动长期 W1 service。以下 Windows 检查没有匹配到 W1 smoke、Gallery、原生回归或临时探针进程。

```powershell
"W1_VALIDATION_REMAINS"
Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in @("bun.exe", "cargo.exe") -and
  $_.CommandLine -match "pc-budget-probe|pc-availability-probe|gpuix-main[\\/](windows[\\/](smoke|runtime|offscreen-lifecycle|anchored-geometry)|ci-geometry[\\/]gallery)"
} | Select-Object ProcessId,Name,CommandLine
```

```text
W1_VALIDATION_REMAINS
```

广域检查还看到 PID 125536 的 `--hot src/app/verification/r3-window.tsx`，参数是 `zoeydaw-r3-pc-evidence-SDQ8Ff`；它属于 R3，未停止或修改。

验证和独立复审完成后，已按授权只修改 `D:/Code/_migration/omp-lane.ps1`：删除设置 DComp=1 的 workaround，并在 launcher 进程中移除继承变量。实际 PowerShell AST 语法检查及执行该清理语句均通过，没有启动新 agent，也没有修改用户/系统全局环境。已通知协调者先合入并重建共享 vendor，其它 lane 在下一次启动消除旧继承环境；当前运行的其它会话未被干预。

## UI 规范第13节

| 项目 | 证据与结论 |
| --- | --- |
| Gallery/业务整体 | Windows 原生离屏四组 Gallery 与真实后端 Arrangement；已抽看 en-dark、zh-light 和新构建的 arrangement-playing，不是前台桌面 |
| 对齐居中 | 四边/对齐/奇偶尺寸与 1x/2x 原生 bounds 回归，宽 274 精确保持；混合显示器 DPI 未验证 |
| gap/padding/尺寸/紧凑感 | 沿用共享组件/token，没有实例级补像素；组合图保留工具栏、卡片和面板空间关系，未重做 Live 比例评审 |
| 排版、裁切与中英文 | 四组合图生成，抽看中英文；Windows 字体与物理 DPI 的跨机器一致性未验证 |
| 深浅颜色层级 | en-dark 与 zh-light 完整组合已观察，未新增产品颜色或设计变量 |
| 状态与键盘焦点 | 原生陈旧 root keyboard/selection、弹层与配置回归通过；前台 Tab/Space/硬件输入未验收 |
| 拖动/滚轮/弹层/性能 | native selection 拖动和弹层 bounds 已测；物理 cursor 隐藏/归位、窗口恢复与性能尚未验证，Present 计数不冒充物理帧 |

## 产品规则 → Live观察 → 实现 → 差异

下表 Live 只读记录来自首次 Mac 阶段。本轮没有操作 Live，也没有改变产品交互语义。

| 产品规则 | Live只读观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 数值控件可访问 | AX速度slider 140、音量/声像slider存在 | 保留控件规则，只移植native port | 未操作Live拖动；Windows隐藏与归位未验证 |
| 播放/停止与录制分开 | AX播放0、Arrangement录制0 | 真实fixture play/stop与session释放 | 未修改用户Live工程，不以Mac代替WASAPI |

## 自审结果

首次 3 项 P2 已关闭。PC 的 Standards 与 Spec 独立审查、Preferences/selection follow-up 及最终预算 delta 复审均通过，无剩余必修或仲裁项。最终扫描 0 HARD / 4 WARN，均为原有验证窗口尺寸；绝对路径全仓扫描 0 HARD / 0 WARN。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| Unix URI裸#/?和symlink/..变化 | 汇报仲裁→必修 | 协调者批准恢复原Unix解码，仅Windows标准转换 | 5 path tests + mutation；Spec复审关闭 |
| 每实例Env hook强sender保留 | 汇报仲裁→必修 | 改每Env registry、幂等注销和terminal命令 | 5 lifecycle tests；Standards复审关闭 |
| 原smoke未触发恢复/guarded close | 汇报仲裁→必修 | User32真实驱动与成功Present计数 | types/lint通过；Spec源码复审关闭，运行待Actions |
| gallery/controls.tsx 两处 fixture 尺寸 WARN | 记录 | 原值未改；configuration.md:29 允许验证视口常量 | 当前 scan 0 HARD / 4 WARN |
| app/verification/tracks/demo.tsx 两处 fixture 尺寸 WARN | 记录 | 原值未改，仅 cursor 注入 | 当前 scan |
| app/verification/clip-edit/demo/index.tsx 两处 fixture 尺寸 WARN | 记录 | 原值未改，仅 cursor 注入 | 当前 scan |
| app/verification/footer/demo.tsx 两处 fixture 尺寸 WARN | 记录 | 原值未改，仅 cursor 注入 | 当前 scan |
| Windows diagnostics不等价 | 汇报仲裁 | 批准明确unsupported，不伪造bool | CI显式断言 |
| Windows剪贴板NUL差异 | 汇报仲裁 | 批准修改前拒绝，Mac保持 | Rust边界与文档 |
| DComp executor 与最后窗口 COM 退出 | 必修 | offscreen 同步 HWND 销毁、显式 owner dispose；失败 workaround 删除 | 320 窗口和自然退出；native 315 tests |
| init 声明与补丁树不一致 | 必修 | 单个 NAPI 导出，真实生成后纳入补丁 | clean replay、record/resolution |
| popup 274→273 | 汇报仲裁→必修 | 批准局部 anchored center 修复，不改 taffy | exact size / parity / scale / flip 回归 |
| Preferences 默认 JSON 类型 | 汇报仲裁→必修 | 批准唯一边界收窄，移除 ambient shim | 两份 tsc、独立双轴复审 |
| 多 session 宿主 I/O 超预算 | 汇报仲裁→必修 | 四项批准共用 Windows 15s，所有行为断言保留 | 原始计时、session 次数、最终 JUnit |
| selection owner 覆盖不足 | 记录→已补强 | 同一 stale-root 场景断言原生选择与清空 | filtered test 4 assertions，整组 314 assertions |
| React junction 修复需求 | 必修 | 复用通用 installer repair，不造重复 normalizer/test | 11 tests、实际绝对链接、四处单一 React 解析 |

## 错题

- 全局rustup target不代表vendor override toolchain也装了target；失败阶段要区分core、C SDK和链接。
- 原来“注册handler+局部状态测试”不能证明原生恢复/关闭闭环，必须驱动自有HWND。
- napi cleanup hook移除不等于捕获数据释放，锁定实现必须实读；不能照API名字推断。
- 标准URL解析会改变旧Unix路径语义；跨平台移植不能顺带统一历史媒体路径。
- LSP调用链盘点仍需完整tsc兜底，本轮由tsc发现五个旧cursor调用方。
- remove_window 不会自动运行 WindowsWindow 投递到另一个 executor 的析构任务；必须追到 HWND 与 renderer 的真实 owner。
- 600 次创建无耗尽但退出崩溃仍不是通过；TestRoot 卸载还必须释放最后一个 native 窗口。env hook 和全局 OLE 顺序实验无效后已删除。
- UV spawn 的 ENOENT 不一定是 executable 丢失；这里 process.execPath 正确，cwd 的 URL pathname 错误。
- Windows 白色清屏会让白色波形 detector 误读整列；fixture 要声明背景并验证空白区域。
- 两个 root 的清理顺序会暴露陈旧事件退订，不能仅给 native dispose 加 identity guard 而遗漏 keyboard/selection owner。

## 已验证做法

- 在独立 vendor 以有序补丁保存改动，再从干净 tracked 源码重放并校验生成输出；不写共享 vendor。
- 真实后端离屏像素与行为优先，后台窗口只证启动；拿到结果立即关闭。
- 用真实源文件的轻量纯Rust harness验证协议/registry，不重建整库，也不造替代实现。
- 源码复审、运行证据、物理桌面能力分别报告；Windows CI未运行就明确写未验证。
- 精确区分 test dispatcher、native executor 和 HWND owner thread；同步销毁只限 offscreen，生产窗口语义保持。
- 先保留真实 I/O 计时和 session 次数，再对获批用例设置统一平台预算，不改断言或引入重试。
- 一个可重跑 installer repair 处理所有相对依赖链接，React 根与嵌套 reconciler 使用同一 canonical 包实例。
- `Preferences` 类型只在 JSON 读取边界收窄；调用方消费可信类型，不靠 ambient 声明或 as 掩盖差异。

## 来源

- [gpuix固定SHA Windows CI](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/.github/workflows/ci.yml)
- [gpuix Windows Bun编译示例](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/examples/compile-chat.ts)
- [gpuix打包指南](https://github.com/remorses/gpuix/blob/main/website/src/guides/hermes.mdx)，Context7 /remorses/gpuix。
- [cargo-packager NSIS实现](https://github.com/crabnebula-dev/cargo-packager/blob/cargo-packager-v0.11.8/crates/packager/src/package/nsis/mod.rs)，Context7 /crabnebula-dev/cargo-packager。
- [Zed Windows平台](https://github.com/zed-industries/zed/blob/main/crates/gpui_windows/src/platform.rs)
- [ShowCursor计数契约](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showcursor)
- [actionlint 1.7.12 官方发布](https://github.com/rhysd/actionlint/releases/tag/v1.7.12)，Windows amd64 zip SHA-256 `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`。
