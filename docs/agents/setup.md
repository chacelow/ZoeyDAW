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

`pnpm tauri:dev` 和 `pnpm tauri:build` 只给用户参考，Agent 不主动执行。当前按纯本地开发验收：保留 workflow 文件，但不上传 GitHub、不触发远程流程、不把配置存在称为 CI 已运行。

UI 改动必须在已有应用或 Web 页面上验证主路径，观察新截图或实际状态。单元测试通过不能代替 UI 验证；报告实际检查与限制，不把模拟电平称为真实音频。

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
