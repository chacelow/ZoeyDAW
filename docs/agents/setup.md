# 开发环境与操作边界

## 当前工程

gpuix 原生应用在 `apps/gpuix`（bun 运行），Rust 原生能力在 `crates/native`（napi，产物 `@zoeydaw/native`），引擎在 `crates/engine`。渲染器源代码是 `vendor/gpuix` 的递归 Git 子模块，构建产物留在其 gitignored build 目录中。工作区使用 pnpm，只保留 gpuix 应用与 Rust crates。主题度量在 `apps/gpuix/src/shared/theme/metrics`，语言与日志分别在 `apps/gpuix/src/platform/i18n`、`apps/gpuix/src/platform/log`。版本、包名和脚本以对应 `package.json`、`Cargo.toml` 为准。

## 运行与热更新（gpuix）

- 新 checkout 初始化渲染器：`git submodule update --init --recursive`，再依次运行 `node scripts/gpuix-main/build.mjs runtime`、`pnpm install --frozen-lockfile`、`pnpm native:build`。macOS 可将 `runtime` 改为 `precompiled`。
- 编辑渲染器时直接在 `vendor/gpuix` 或 `vendor/gpuix/zed` 提交；推送到 chacelow 对应 fork 的 `zoeydaw` 分支后，在主仓库更新 `vendor/gpuix` gitlink。参见[渲染器 fork 指南](../research/gpuix-main-build.md)。
- 开发窗口：`apps/gpuix` 下 `bun --hot src/main.tsx`；Gallery 使用 `ZOEYDAW_ROUTE=/gallery` 进入主应用路由。改 TS/TSX 保存即热更新。
- Rust 改动：根目录 `pnpm native:build` 重建 `.node`，再重启自己的窗口。
- Agent 自己启动验证窗口，启动时用带 `name` 的 bash service，拿到截图/AX 证据后立刻 kill；收尾前确认零残留。
- 后台启动：应用入口加 `GPUIX_BACKGROUND=1`，窗口打开时不抢键盘焦点，用户的前台应用保持不变，统一由 `platform/window` 的 `LAUNCH_FOCUS` 控制。AX 只读量值、离屏截图（`createTestRoot`）和例行回归都用这种方式。后台窗口不能替代真实桌面验收：它通常被前台应用遮挡，macOS 会停发遮挡窗口的 animation frame（F3 实测），所以窗口截图可能全黑，等待原生帧的测量（性能、首帧）会一直卡住；`el.press()` 等输入还可能报 `BackgroundUnavailable`。遇到这些情况，把对应项标为未验证，不要用 headless 数据冒充窗口数据；需要真实帧的验收在真实桌面上串行完成。
- 不停止用户自己启动的应用或服务。

## 验证命令（gpuix）

`verify:gpuix` 保留 macOS 完整门禁。Windows x64 使用独立的 `node scripts/verify-windows.mjs`，覆盖原生构建、Rust、TypeScript、Bun、离屏 scale、生产 UI 帧与真实后端截图。Windows job 首轮为 `continue-on-error`，看到 Actions 稳定通过后转为必过。Linux 不在本次移植范围，离屏 scale 回归仍显式报 unsupported。实际支持状态见 [Windows 移植报告](../research/windows-port.md)。

完整门禁只在 GitHub Actions 运行，不在本机重复跑 `pnpm verify:gpuix`。本地交付执行 `tsc --noEmit`、改动范围的 Bun 测试与 eslint、必要的单窗口 smoke；Rust 只检查和测试改动 crate。`verify:gpuix [baseRef]` 依次检查绝对路径、渲染器初始化与构建、native 构建、类型、lint、架构与工具回归、文档路由、Bun、离屏 scale、review scan、UI 地图和真实后端应用 smoke。任一步失败即非零退出，全部通过打印 `verify:gpuix passed`。review scan 默认对比 `gpuix-migration...HEAD`，不覆盖未提交改动。

`node scripts/gpuix-review-scan.mjs --absolute-paths` 检查全仓 Git 跟踪的 `.mjs`、`.js`、`.ts`、`.tsx`、`.sh`、`.rs`、`.json` 文件，包括注释和 usage 示例。机器目录根的路径属于 HARD，包括 shell 默认值；相对路径不算。`evidence/` 运行记录、Markdown 和 `file://` URL 测试数据不在此门禁范围内。验证日志和 smoke 证据使用 `mktemp`，退出时清理，不依赖固定临时目录。

## 性能测量（gpuix）

- `pnpm perf:scenario [场景…] [--dev]`：启动真实窗口（默认生产模式），用 automation 输入跑 idle、hover、dividerDrag、zoom、hscroll、play，逐场景输出 GPUI draw 次数与 p90、React 提交与渲染组件数、JS 事件循环延迟。automation 输入不要求前台。
- `scripts/perf/vs-live/`：与 Ableton Live 同口径的系统输入到上屏延迟、帧间隔、CPU、内存对比，需要前台窗口；用法和基线见其 README。
- Windows 上 Rust 构建用 `powershell -File scripts/perf/rust-env.ps1 <命令>`：把 MSVC `link.exe`、SDK `rc.exe` 放到 Git 自带 `link` 之前，再执行命令（例如 `cargo install samply --locked`）。

## 根工具与度量
