# Windows x64 支持

目标 `x86_64-pc-windows-msvc`。Linux 不在范围。

## 能力矩阵

| 能力 | Windows 实现 | 未验证 |
| --- | --- | --- |
| app_state | foreground HWND/PID | 运行时行为 |
| atomic_file | `MoveFileExW` replace + write-through | 目录 fsync 等价耐久性 |
| clipboard | `CF_UNICODETEXT`、隐藏 owner、HGLOBAL RAII；含 NUL 的文本在修改前拒绝 | 跨进程 |
| 光标位置与恢复 | `Get/SetPhysicalCursorPos`，虚拟桌面物理像素，可为负 | — |
| 隐藏光标 | UI 线程 `ShowCursor` 自有计数平衡，失活与退出清理 | 物理隐藏与归位 |
| window_geometry | HWND DPI、`ClientToScreen`、临时 DPI context | 事件到达 JS 期间窗口移动 |
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

- `node scripts/gpuix-main/build-windows.mjs` 复用 `config.json`、完整补丁身份与 manifest，使用 junction、MSVC ABI 文件名与显式 `GPUIX_GIT_EXECUTABLE`。安装后把相对依赖链接修复为 vendor 内绝对 junction，React 只解析到一个实例。
- 本机构建需要 MSVC 环境（`INCLUDE`、`LIB`、`VCToolsInstallDir`），并确保 PATH 中 MSVC 的 `link.exe` 先于 Git 的 `link`。
- `node scripts/verify-windows.mjs` 只在 Windows Actions 运行：native 构建、Rust check/test、URI 变异、GPUI 首帧门控、TypeScript、ESLint、Bun、离屏 scale、DComp 生命周期、弹层几何、生产 UI 帧 smoke、真实后端 smoke 与 Gallery 截图。独立检查失败后继续执行，最后汇总失败。
- `ci.yml` 的 Windows job 只在 `main` push 运行。`release.yml` 的 Windows matrix 用 Bun 编译单文件 exe，再由 cargo-packager 0.11.8 生成 NSIS 安装器，只分发安装器与 `SHA256SUMS-windows-x64`。
- 多 session WASAPI 用例的真实 open 约 1 秒、dispose 0.7–1.5 秒；四个多 session 用例在 Windows 统一使用 `app/verification/native-session-budget.ts` 的 15 秒预算，断言不变。
