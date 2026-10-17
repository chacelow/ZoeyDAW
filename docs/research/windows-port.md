# Windows x64 支持

目标 `x86_64-pc-windows-msvc`。Linux 不在范围。

## 能力矩阵

| 能力 | Windows 实现 | 未验证 |
| --- | --- | --- |
| app_state | foreground HWND/PID | 运行时行为 |
| atomic_file | `MoveFileExW` replace + write-through | 目录 fsync 等价耐久性 |
| clipboard | `CF_UNICODETEXT`、隐藏 owner、HGLOBAL RAII；含 NUL 的文本在修改前拒绝 | 跨进程 |
| 拖动光标 | renderer 相对模式：`WM_MOUSEMOVE` 取相对锚点偏移后 `SetCursorPos` 回锚点，`WM_SETCURSOR` 期间隐藏，失活结束 | 物理拖动越过屏幕边缘 |
| window_diagnostics | 明确 unsupported | — |
| reduced motion | `SPI_GETCLIENTAREAANIMATION` 取反，`WM_SETTINGCHANGE` 线程 | 系统实际切换 |
| engine | Firewheel/CPAL WASAPI 会话、峰值与走带 | 听感、设备切换 |
| file URI | `Url::to_file_path` 支持盘符与 UNC；Unix 保持原解码 | — |
| 帧与恢复 | bounded NonBlocking TSFN、token/ack、pre-present gate | 生产窗口闭环 |
| 关闭拦截 | 先否决，异步 predicate，拒绝过期响应 | — |
| renderer 生命周期 | 每 Env 一个 registry hook，实例注销，幂等 shutdown | — |
| 离屏窗口 | DComp 离屏，owner 线程同步销毁 HWND，`TestRoot.unmount` 幂等释放 | — |
| WARP | `GPUIX_FORCE_WARP=1` 显式选择 | — |

手势使用按下点与绝对事件位移，GPUI 已 `SetCapture/ReleaseCapture`；不使用 `ClipCursor`、raw input 或无限拖动。

## 线程与资源

UI 线程不阻塞等待 JS。普通帧与恢复使用 generation/token/ack；恢复在提交确认前延后 present，但继续处理输入与命令，JS 端拒绝过期回调。关闭请求先否决，重复请求合并，旧 handler 的 true 不关闭新状态。

napi 3.12.7 的 `remove_env_cleanup_hook` 不回收 `Box::leak` 包装，因此每个 Env 只注册一个 hook，registry 只持有活跃实例；close、Drop 与 tick 退出都移除注册并主动 shutdown。

`WindowsWindow` 的 Drop 会把析构投递到 native ForegroundExecutor，测试 dispatcher 不会执行它；离屏 HWND 因此在 owner 线程同步销毁，生产窗口保持异步销毁。

## 构建、CI 与发布

- `node scripts/gpuix-main/build.mjs runtime` 从递归初始化的 `vendor/gpuix` 子模块直接构建 native、JS host 和 React；产物留在 submodule 的 gitignored build 目录。Windows 安装后将相对依赖链接修复为 vendor 内绝对 junction，React 只解析到一个实例。
- 本机构建需要 MSVC 环境（`INCLUDE`、`LIB`、`VCToolsInstallDir`），并确保 PATH 中 MSVC 的 `link.exe` 先于 Git 的 `link`。
- 本机应显式设置 `CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER` 指向 MSVC `link.exe`，并注入完整的 Windows SDK `INCLUDE`/`LIB`。
- `node scripts/verify-windows.mjs` 只在 Windows Actions 运行：native 构建、Rust check/test、URI 变异、GPUI 首帧门控、TypeScript、ESLint、Bun、离屏 scale、DComp 生命周期、弹层几何、生产 UI 帧 smoke、真实后端 smoke 与 Gallery 截图。独立检查失败后继续执行，最后汇总失败。
- `ci.yml` 的 Windows job 只在 `main` push 运行。`release.yml` 的 Windows matrix 用 Bun 编译单文件 exe，再由 cargo-packager 0.11.8 生成 NSIS 安装器，只分发安装器与 `SHA256SUMS-windows-x64`。
- 多 session WASAPI 用例的真实 open 约 1 秒、dispose 0.7–1.5 秒；四个多 session 用例在 Windows 统一使用 `app/verification/native-session-budget.ts` 的 15 秒预算，断言不变。

首帧门控回归使用 `GpuiMode::Production` 与默认平台帧请求，走 dirty 驱动的生产路径：连续 `force_render` 请求在 inactive 的测试窗口会先被帧率限制挡住，而默认 Test mode 的 effect flush 又会同步 draw，二者都不能证明异步提交门控。回归保留 deferred、提交期间不渲染旧/新场景、移除 gate 后首帧使用最新提交的断言。Windows 恢复状态测试只导入 `ResumeState`，避免 `gpui::*` 的过程宏 `test` 经通配导入遮蔽标准 `#[test]` 而递归展开。

## 无音频设备的验证

`cargo run --locked --release -p zoeydaw-engine --bin audio-capability` 只枚举 CPAL 的默认输出设备，不打开音频流。Windows 验证入口保存 `audio-capability.json`，包含真实查询 `observed` 与验证使用的 `effective`，并通过 `ZOEYDAW_VERIFY_AUDIO_CAPABILITY` 向 Bun 传递结构化结果。查询失败或无效结果会让验证失败，不能冒充“没有设备”。

没有输出设备时，保存、dirty 确认、路由、布局和偏好测试继续运行，由测试 fixture 选择已有 `createMockProjectBackend`，不跳过生命周期断言。原生 session lease 测试仍检查实际 handle 的释放，也覆盖打开失败的状态。解码与设备时钟、原生 peaks、原生波形组合等真实音频用例显式 skip，并在日志中说明未验证原因。产品默认 backend、设备打开和错误显示路径不变。

WASAPI smoke 在创建测试 root 或打开 session 前检查能力。设备不可用时写入 `smoke.json` 的 `status: "unverified"`、原因与 `sessionOpened: false`；最终验证摘要明确标记真实音频未验证，不宣称播放成功。

`ZOEYDAW_VERIFY_NO_AUDIO=1` 只影响测试和验证入口，可在本机模拟不可用能力，不依赖 `GITHUB_ACTIONS`，不禁用系统设备，也不伪造可用设备。probe 证据仍保留真实设备查询。没有注入能力时为 `unprobed`，测试保持真实 backend 与原有断言，不默认跳过或降级。

Header 回归先测实际列宽，再构造平衡、恰好容纳、少 80px 和半宽视口；滚轮落点取视口内实际控件间隙，不假定某个字体在 900px 必然溢出。Empty 的 600px/601px 双视口覆盖奇偶像素间距，中心误差允许恰好半像素的原生舍入，不放宽到一像素。
