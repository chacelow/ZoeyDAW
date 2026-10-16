# W1：Windows x64 移植

## 用户决定（2026-10-16）

用户要求 Windows 也要做。目标：`x86_64-pc-windows-msvc` 上能构建、启动、走通主路径，并进入 P1 的 release 流水线（P1 并行在做 macOS 打包，先合入的一方定接口，另一方同步）。Linux 不在本切片。

## 已查证（协调者 2026-10-16）

- 上游 gpuix 本身支持 Windows：vendor `packages/native/src/renderer.rs` 有约 180 处平台 cfg，上游 `.github/workflows/ci.yml` 构建 `x86_64-pc-windows-msvc` 与 `aarch64-pc-windows-msvc`；README 有 Windows NSIS 打包。
- **我们自己的 vendor 补丁多数只在 macOS embedded loop 成立**（见 `docs/research/gpuix-main-build.md` 第 231、266、490、746、774 行）：frame-callback 同步帧回调、resume-frame、close-guard 同步确认都依赖"JS 在同一线程泵 AppKit"。Windows/Linux 的 UI 线程独立于 JS，不能照搬同步回调，也不能在 UI 线程阻塞等 JS TSFN（死锁）。window-active-change 有 Windows UI command 路径但从未实跑。完整补丁序列见 `scripts/gpuix-main/config.json`。
- `crates/native`：`clipboard`、`cursor`（隐藏光标拖动/锁定）、`reduced_motion`、`settings`、`window_geometry`、`window_diagnostics` 只有 macOS 实现，其它平台走 `not(...)` 分支；`app_state`、`external`、`log`、`atomic_file` 已有 Windows 分支。`Cargo.toml` 已有 `windows-sys` 依赖（可加 feature，不加新 crate；需要新 crate 先 ask）。
- `crates/engine` 用 firewheel + cpal，cpal 在 Windows 走 WASAPI，未实跑。
- TD-10 把 Windows/Linux 的 scaleFactor 记为未实现（`docs/research/gpuix-main-build.md`）。
- 本机已装 rustup target `x86_64-pc-windows-msvc`，没有 Windows 机器、没有 xwin。真实运行只能靠 GitHub Actions `windows-latest`（无 GPU，DirectX 走 WARP 软件渲染，需实测）。你不能 push；协调者负责把合入后的 main 推上去跑 CI（满足推送授权条件时）。

## 要做

1. **先盘点再动手，用 ask 报方案等 reply。** 列出每个 vendor 补丁与每个 `crates/native` 模块在 Windows 上的现状（可用 / 编译但无实现 / 缺失 / 线程模型不同），给出 Windows 方案。尤其是：帧回调与 resume 在独立 UI 线程上的投递模型（非阻塞 TSFN + 下一帧生效，还是别的）；close-guard 异步确认；隐藏光标拖动（`ClipCursor`/`SetCursorPos`/raw input）；剪贴板；系统 reduced motion 与外观；scaleFactor。用 Context7/GitHub 看上游 gpuix、zed Windows 平台层与 Zed 自己的 Windows 实现，优先复用。
2. 交叉检查：本机 `cargo check --target x86_64-pc-windows-msvc`（vendor 与 `crates/*`）能过到哪一步，报告卡在哪（链接 / build.rs / shader 编译）。
3. 实现 ask 批准的方案。vendor 改动走补丁序列，用独立 vendor 根构建，不覆盖共享 vendor。TS 侧平台差异放 `platform/`，业务代码不出现 `process.platform` 分支；macOS 行为与测试保持不变。
4. CI：在 `.github/workflows/ci.yml` 加 `windows-latest` job（用户已授权做 GitHub CI/CD）：构建 vendor + `@zoeydaw/native`、跑 `bun test` 中不依赖 macOS 的部分与离屏 smoke。需要按平台跳过的测试只能以"该能力在此平台未实现"的明确断言出现，不静默 skip，不放宽 macOS 断言。如果首轮 Windows job 暂时不能全绿，先作为 `continue-on-error` 的独立 job 并在报告列清单，由协调者决定何时转为必过。
5. 与 P1 对齐：给 release 流程提供 Windows 打包步骤（`bun build --compile` → `.exe`，cargo-packager `nsis`），native `.node` 的嵌入/sidecar 方式与 P1 的 macOS 方案一致。

## 验收

- 本机：macOS `pnpm verify:gpuix` 仍通过；`cargo check --target x86_64-pc-windows-msvc` 结果记录。
- Windows：合入后协调者推 main，CI 的 windows job 结果作为验收证据（构建、测试、离屏 smoke、截图 artifact）。真实桌面交互（隐藏光标拖动、音频设备、多显示器缩放）没有 Windows 机器无法验证，报告里逐项标「未验证」，不写成已支持。
- 报告：`docs/research/windows-port.md`，含能力矩阵（能力 × macOS/Windows 状态 × 证据）。按 `common.md` 自审后发 merge_ready。
