# 开发环境与操作边界

## 当前工程

gpuix 原生应用在 `apps/gpuix`（bun 运行），Rust 原生能力在 `crates/native`（napi，产物 `@zoeydaw/native`），引擎在 `crates/engine`。工作区使用 pnpm，只保留 gpuix 应用与 Rust crates。主题度量在 `apps/gpuix/src/shared/theme/metrics`，语言与日志分别在 `apps/gpuix/src/platform/i18n`、`apps/gpuix/src/platform/log`。版本、包名和脚本以对应 `package.json`、`Cargo.toml` 为准。

## 运行与热更新（gpuix）

- 新 worktree 初始化（`start-worker.sh` 以 `--setup skip` 创建，没有依赖）：在 worktree 根目录依次运行 `bash scripts/gpuix-main/build.sh`、`pnpm install --frozen-lockfile`、`pnpm native:build`、`node scripts/gpuix-main/check.mjs --resolution`。共享 vendor 已构建好时，`build.sh` 只校验并生成本 checkout 的 `.gpuix-main` 链接，不会重建。不要改 vendor 路径，不要删构建锁；报补丁序列不一致时交给协调者（见 LESSONS「修改补丁序列中间的补丁」）。
- 开发窗口：`apps/gpuix` 下 `bun --hot <入口>`（应用入口 `src/main.tsx`，切片 demo 与画廊各有入口）。改 TS/TSX 保存即热更新。
- Rust 改动：根目录 `pnpm native:build` 重建 `.node`，再重启自己的窗口。
- Agent 自己启动验证窗口，启动时用带 `name` 的 bash service，拿到截图/AX 证据后立刻 kill；交付前确认零残留（见 `scripts/orchestration/specs/common.md`）。
- 后台启动：任何入口（`src/main.tsx`、Gallery、各切片 demo）加 `GPUIX_BACKGROUND=1`，窗口打开时不抢键盘焦点，用户的前台应用保持不变，统一由 `platform/window` 的 `LAUNCH_FOCUS` 控制。AX 只读量值、离屏截图（`createTestRoot`）和例行回归都用这种方式。后台窗口不能替代真实桌面验收：它通常被前台应用遮挡，macOS 会停发遮挡窗口的 animation frame（F3 实测），所以窗口截图可能全黑，等待原生帧的测量（性能、首帧）会一直卡住；`el.press()` 等输入还可能报 `BackgroundUnavailable`。遇到这些情况，把对应项标为未验证，不要切到前台，也不要用 headless 数据冒充窗口数据；需要真实帧的验收，交由协调者在真实桌面上串行完成。
- 不停止用户自己启动的应用或服务。

## 验证命令（gpuix）

在 worktree 或合入树的根目录运行 `pnpm verify:gpuix [baseRef]`（`scripts/verify-gpuix.sh`），按顺序执行：渲染器身份校验（`scripts/gpuix-main/config.json` 登记的补丁序列，单一 native/React 解析）、`pnpm native:build`、`tsc --noEmit`、`eslint apps/gpuix/src`（0 warning）、`bun test`、review scan（`baseRef...HEAD`，默认 `gpuix-migration`；未提交的改动不在扫描范围内），最后用真实后端跑离屏应用 smoke（Home → 工程 → 恢复首帧）。任何一步失败就停，退出码非 0；全部通过时最后一行是 `verify:gpuix passed`。worker 交付前在自己的 worktree 跑一次，协调者在合入树再跑一次。涉及 Rust 时另跑 `cargo check`、`cargo test`。

## 根工具与度量

根 `package.json` 定义 `doctor`、`check`、`fix`、`test` 等入口；gpuix 的完整验收使用上面的 `verify:gpuix`。Node 版本要求与各命令实际覆盖范围以 manifest 和脚本为准，不再运行旧 Web、共享包或 Tauri 的命令。

共享度量的配置源是 `apps/gpuix/src/shared/theme/metrics/control-metrics.json`，同目录 `config.ts` 直接导入 JSON 并导出类型化度量。消费者通过 `shared/theme` 使用同一份配置，不复制数字；原 Web 度量 CSS 生成与漂移检查命令已删除，gpuix 不需要生成 CSS。

正确性、类型、无障碍与项目架构/token 是硬门禁。自动检查只覆盖规则声明的静态范围，不代表完整依赖图或所有动态样式已验证。不要未经审查重跑 `ultracite init` 覆盖项目配置；升级时核对预设、peer 绑定与本地规则，再执行对应工具、类型、测试和界面验证。

按纯本地开发验收，不上传 GitHub、不触发远程流程，不把 workflow 文件存在称为 CI 已运行。`.github/workflows/ci.yml` 在 macOS 上执行同一套 `build.sh` 与 `verify:gpuix`；`build.sh` 只在 `CI=true` 时允许 Cargo target 不在 `/Volumes/PSSD`。

UI 改动必须在真实 gpuix 窗口验证主路径，观察新截图或实际状态。单元测试通过不能代替 UI 验证；报告实际检查与限制。

## 修改前确认

问用户的范围只有根 `AGENTS.md`「决策默认归 Agent」那张封闭清单；清单外的技术决定（含共享 UI 公共 API）由协调者决定，见 [协调方式](coordination.md)。

secrets、token 和 API key 不进入仓库。保留其他 Session、Agent 的未提交和暂存工作。

## 提交授权

**`gpuix-migration` 及其切片分支**：用户 2026-10-14 12:40 UTC 原话“去掉我确定这个 gate，然后你来编排，然后你来 review，你来做决策……最后交付给我就行了”。这些分支的本地提交（含协调者的合并提交）已授权，不再逐次索取“我确认”。非交互提交照常带 `USER_CONFIRM_HASH=$(git write-tree)` 通过 hook；`ultracite`/lint-staged 门禁仍必须通过，不用 `--no-verify`。

**`main` 与其它分支**：每次 commit 都要求用户在本次提交上下文明确说出 **“我确认”**。之前的授权不延续；“提交吧”“commit 一下”“push 吧”不能替代。

两种情况都不自动扩展为 push、发布或部署。确认 hash 绑定本次 staged tree；通过 hash 校验的非交互提交记录在 `.git/commit-audit.log`。
