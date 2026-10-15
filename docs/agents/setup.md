# 开发环境与操作边界

## 当前工程

gpuix 原生应用在 `apps/gpuix`（bun 运行），Rust 原生能力在 `crates/native`（napi，产物 `@zoeydaw/native`），引擎在 `crates/engine`。工作区使用 pnpm。`apps/web`、`packages/**`、`src-tauri` 是迁移参考，只读。版本、包名和脚本以对应 `package.json`、`Cargo.toml` 为准。

## 运行与热更新（gpuix）

- 新 worktree 初始化（`start-worker.sh` 以 `--setup skip` 创建，没有依赖）：在 worktree 根目录依次运行 `bash scripts/gpuix-main/build.sh`、`pnpm install --frozen-lockfile`、`pnpm native:build`、`node scripts/gpuix-main/check.mjs --resolution`。共享 vendor 已构建好时，`build.sh` 只校验并生成本 checkout 的 `.gpuix-main` 链接，不会重建。不要改 vendor 路径，不要删构建锁；报补丁序列不一致时交给协调者（见 LESSONS「修改补丁序列中间的补丁」）。
- 开发窗口：`apps/gpuix` 下 `bun --hot <入口>`（应用入口 `src/main.tsx`，切片 demo 与画廊各有入口）。改 TS/TSX 保存即热更新。
- Rust 改动：根目录 `pnpm native:build` 重建 `.node`，再重启自己的窗口。不提示用户重启 `tauri:dev`。
- Agent 自己启动验证窗口，启动时用带 `name` 的 bash service，拿到截图/AX 证据后立刻 kill；交付前确认零残留（见 `scripts/orchestration/specs/common.md`）。
- 后台启动：任何入口（`src/main.tsx`、Gallery、各切片 demo）加 `GPUIX_BACKGROUND=1`，窗口打开时不抢键盘焦点，用户的前台应用保持不变，统一由 `platform/window` 的 `LAUNCH_FOCUS` 控制。离屏截图、AX 只读量值和例行回归都用这种方式。后台窗口不能替代真实桌面验收：截图可能全黑，`el.press()` 等输入可能报 `BackgroundUnavailable`，遇到就把对应项标为未验证，不要切到前台操作。
- 不停止用户自己启动的应用或服务；用户的 `tauri:dev` 只属于旧 Web 参考，Agent 不启动也不重启它。

## 验证命令（gpuix）

在 `apps/gpuix` 运行 `tsc --noEmit`、`bun test`、`pnpm exec eslint apps/gpuix/src`（根目录）；涉及 Rust 时 `cargo check`、`cargo test`；交付前 `node scripts/gpuix-review-scan.mjs`。

## 旧 Web 参考的验证命令

开发套件统一使用 Ultracite v8，Node 要求以根 `package.json` 为准，当前至少 22.18。常规入口在工作区根目录运行：

```sh
pnpm doctor
pnpm check
pnpm fix
pnpm test
pnpm --filter @zoeydaw/web typecheck
pnpm --filter @zoeymind/shared typecheck
pnpm --filter @zoeymind/logger typecheck
pnpm build
```

`check` 执行 Ultracite 与共享度量漂移检查；`fix` 先生成度量 CSS 再执行套件修复；`test` 运行 Web 行为、根工具模块规则及 shared/logger 测试。Web 的 lint/format 是这些根入口的别名，不维护另一套格式配置。类型检查和构建单独执行，不包含在 `check` 中。

需要单独修改共享度量时使用包命令，不从 Web 跨目录执行脚本：

```sh
pnpm --filter @zoeymind/ui metrics:generate
pnpm metrics:check
cargo check --manifest-path src-tauri/Cargo.toml
```

正确性、类型、无障碍与项目架构/token 作为硬门禁；预设中的 suggestion/layout 规则默认关闭，不输出建议或自动要求全仓改写，文件名约束等显式规则以根配置为准，格式由套件 formatter 统一。架构检查覆盖配置列出的层级、公共入口和可静态识别的 JSX token，不是完整依赖图或所有动态样式的证明。现有单实例服务和测试 harness 的合理模式在根配置集中声明。类型化 React props 不重复添加 PropTypes，当前 Router 版本也不按 v8 规则强行迁移。

不要未经审查重跑 `ultracite init` 覆盖项目配置。升级时检查预设、peer 绑定和本地架构规则，重新执行 doctor、check、类型、测试与页面验证；不使用自动启动其他 agent 的修复参数替代本轮受控编辑。

`pnpm tauri:dev` 和 `pnpm tauri:build` 只给用户参考，Agent 不执行。按纯本地开发验收：保留 workflow 文件，但不上传 GitHub、不触发远程流程、不把配置存在称为 CI 已运行。

UI 改动必须在真实 gpuix 窗口验证主路径，观察新截图或实际状态。单元测试通过不能代替 UI 验证；报告实际检查与限制。

## 修改前确认

问用户的范围只有根 `AGENTS.md`「决策默认归 Agent」那张封闭清单；清单外的技术决定（含共享 UI 公共 API）由协调者决定，见 [协调方式](coordination.md)。

secrets、token 和 API key 不进入仓库。保留其他 Session、Agent 的未提交和暂存工作。

## 提交授权

**`gpuix-migration` 及其切片分支**：用户 2026-10-14 12:40 UTC 原话“去掉我确定这个 gate，然后你来编排，然后你来 review，你来做决策……最后交付给我就行了”。这些分支的本地提交（含协调者的合并提交）已授权，不再逐次索取“我确认”。非交互提交照常带 `USER_CONFIRM_HASH=$(git write-tree)` 通过 hook；`ultracite`/lint-staged 门禁仍必须通过，不用 `--no-verify`。

**`main` 与其它分支**：每次 commit 都要求用户在本次提交上下文明确说出 **“我确认”**。之前的授权不延续；“提交吧”“commit 一下”“push 吧”不能替代。

两种情况都不自动扩展为 push、发布或部署。确认 hash 绑定本次 staged tree；通过 hash 校验的非交互提交记录在 `.git/commit-audit.log`。
