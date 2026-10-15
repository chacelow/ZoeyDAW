# L1：迁出遗留共享包，删除 web/Tauri

## 前置

在 lane 与 clip-editors 两个切片合入主干之后派发（协调者确认）。基于当时的 `gpuix-migration` 新建 worktree。

## Target

gpuix 是唯一的产品。迁移完成的判据：仓库里不再有 `apps/web`、`src-tauri`、`packages/**`；gpuix 的构建、测试、lint 不再依赖它们。

## 现状（主干 3901ddc 实测）

gpuix 只用到三个遗留包中的少量导出：

| 包 | gpuix 用到的导出 | 位置 |
| --- | --- | --- |
| `@zoeymind/ui/metrics` | `CONTROL_METRICS`、`PROJECT_METRICS` | `packages/ui/src/controls/metrics/`（含 `control-metrics.json`、生成脚本 `scripts/control-metrics.mjs`，以及给 web 用的 `generated.css`） |
| `@zoeymind/i18n/core` | `i18next`、`initI18nCore`、`persistLocale`、`resolveLocale`、`InitI18nOptions`、`SupportedLocale` | `packages/i18n/src/core.ts` 与 `locales/` |
| `@zoeymind/logger` | `logger`、`configureLogger`、`LogEntry`、`LogSink` | `packages/logger/src/` |

## 必做

1. **迁入 gpuix**：metrics 迁到 `apps/gpuix/src/shared/theme/metrics/`，i18n core 与 locales 迁到 `apps/gpuix/src/platform/i18n/`（或 app 层，按 `gpuix-layers` 的分层判断，先读 `tooling/eslint/gpuix-layers.js`），logger 迁到 `apps/gpuix/src/platform/log/`。只迁 gpuix 实际用到的部分及其依赖：
   - web 专用的 `generated.css`、React provider、hooks 不迁；
   - `control-metrics.json` 是 metrics 的单一事实来源，保留它，删掉只为 CSS 服务的生成路径；
   - 根 `package.json` 的 `metrics:check` 和 `pnpm check` 里 metrics 那一步，改为指向新位置，或在不再需要时删除。跨文件改 import 用 LSP 或 codemod，不要手改。
2. **删除**：`apps/web`、`src-tauri`、`packages/**`；同时删掉只服务它们的根脚本（`dev`/`build`/`tauri*`/`icon:generate`/`test` 中 web 部分/`test:shared`）、依赖（`@tauri-apps/cli` 等仅 web/Tauri 使用的包）、`pnpm-workspace.yaml` 条目、ESLint 中 `apps/web`/`packages` 的配置块。新增依赖为零；只允许删依赖，改 lockfile 用 `pnpm install`，并用 `git diff pnpm-lock.yaml` 确认只有删除。
3. **文档与入口**：
   - AGENTS.md 中「只读参考旧 Web/Tauri」那一行，以及开头说 web/Tauri 是迁移参考的句子，改为当前事实；
   - `docs/architecture/project-panels.md` 等只描述 web 的文档：如果仍有契约价值，就迁移成 gpuix 表述，否则删除，在报告中逐个列明；
   - `scripts/check-doc-routes.mjs` 必须通过。LESSONS 中引用 web 路径的历史条目保留原文，不改写历史；只把「见：」里指向已删文件的链接标为「（已删除）」。
4. **工具**：`gpuix-review-scan`、`verify-gpuix.sh`、`check.mjs --resolution`（它目前检查 `apps/web/package.json` 的 React）都要在删除后继续工作；React 单一解析的检查改为只看 gpuix。
5. **验收**：在干净的临时 checkout 中按 setup 文档的「新 worktree 初始化」从零执行 `build.sh` → `pnpm install --frozen-lockfile` → `pnpm native:build` → `pnpm verify:gpuix`，全部通过；`git ls-files apps/web src-tauri packages | wc -l` 为 0；`rg -n "@zoeymind/" apps/gpuix` 为空。

## 约束

- 不改产品行为；metrics 数值、i18n 文案、日志格式保持字节级不变（迁移前后各导出一次快照做比对，写进报告）。
- 这是一次性的切换，删除后不留兼容层、re-export 或别名。
