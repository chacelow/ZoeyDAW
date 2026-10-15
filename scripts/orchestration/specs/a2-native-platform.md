# A2 native-platform:原生平台层(Rust 优先)

## Target

Worktree `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-a2-native-platform`(分支 `gpuix-a2-native-platform`)。`crates/native` 已有 `cursor.rs`(光标锁定,已验证,不要动)。把 `src-tauri/src/*.rs` 与 `apps/web/src/shared/native/*` 的能力迁成 Rust napi 模块 + 薄 TS 适配。

## Change

1. **`crates/native/src/atomic_file.rs`**:把 `src-tauri/src/atomic_file.rs`(215 行,含 fsync、目录 fsync、Windows replace 语义)原样迁入,经 napi 暴露 `writeBytesAtomically(path, bytes)` 及读取函数。保留其现有 Rust 单元测试并 `cargo test` 通过。
2. **`crates/native/src/settings.rs`**:低频用户设置(主题预设、语言、关闭行为)落盘到用户配置目录的单个 JSON,走上一条的原子写;暴露 `settingsGet/settingsSet`(同步,小 JSON)。路径用 `dirs`-类做法解决;若需新增 crate 先 ask(候选 `dirs 6`)。**不得把它当工程数据库**。
3. **`crates/native/src/log.rs`**:迁 `src-tauri/src/log_config.rs`(244 行:`PersistedLevel`、`LogConfig`、`resolved_log_dir`、`get_log_config`/`set_log_level`/`set_log_dir`/`clear_logs`/`open_log_dir`)。去掉对 `tauri::AppHandle` 的依赖,改为接收目录参数;日志写入用现有 `log` crate 语义。暴露对应 napi 函数。
4. **`crates/native/src/external.rs`**:`openExternalHttpUrl(url)`——Rust 侧仅允许 http/https(迁 `external-links.ts` 的 `resolveExternalHttpUrl` 校验逻辑到 Rust,并保留其 `external-links.test.ts` 的全部场景为 Rust 单元测试),用系统 `open` 命令打开(macOS `open`,Windows `cmd /c start`,Linux `xdg-open`;不新增依赖)。
5. **`apps/gpuix/src/platform/`**:每个能力一个文件夹+`index.ts` 薄适配,对外导出接口,导入不启动任何东西:
   - `storage`:实现 A1 的 `SnapshotStorage` 端口(`get/set`),底层用 `settings` 或专用快照文件(快照是原型快照,每路由一个 key;用原子写落到用户数据目录下的 `snapshots/<key>.json`),返回同步字符串。
   - `window`:封装 gpuix 已有的 `setWindowTitle/minimizeWindow/zoomWindow/toggleFullscreen/activateWindow/promptForPaths`(来自 `@gpuix/native`);关闭拦截与托盘:**先查证**发布的 `@gpuix/native@0.10.0` 与主干是否有关闭拦截/hide-window 接口。若没有,在 Rust 侧评估能否对 GPUI window 直接加(`crates/native` 里 `objc2` 取 NSWindow 的 `setReleasedWhenClosed`/delegate `windowShouldClose` 或 GPUI 的 `on_window_should_close`),给出**可行性结论与最小实现或明确的阻塞原因**,不得用 `process.exit()` 冒充。
   - `log`:迁 `log-sink.ts` 的 sink 接口到 `@zoeymind/logger`,底层改调 Rust log。
6. **`packages/i18n` 去 DOM 化**:`setup.ts` 用 `i18next-browser-languagedetector`(localStorage/navigator)、`hooks.ts` 写 localStorage。改为注入存储与初始语言(`I18nStorage { get(): string|null; set(locale): void }` + 系统语言来自 Rust/`Intl.DateTimeFormat().resolvedOptions().locale`),`react-i18next` 的 React 绑定保留(gpuix 用同一个 React reconciler,不涉及 DOM)。不动语言包内容。
7. `src-tauri/**` 与 `apps/web/**` 只读,不删。

## Constraints

- 不改 `crates/native/src/cursor.rs` 与 `crates/native/src/lib.rs` 里已有的 `native_version`;只在 `lib.rs` 增加 `mod` 登记。
- 新 Rust 依赖(`dirs` 等)与新 npm 依赖先 ask。
- 不动 `ui/**`、`project/**`、`shared/theme/**`。
- 影响真实用户目录的测试必须指向临时目录(`std::env::temp_dir()`),不得写入真实用户配置或日志目录。

## Ownership

`crates/native/src/{atomic_file,settings,log,external}.rs`、`crates/native/Cargo.toml`(仅你新增的依赖,须先 ask)、`apps/gpuix/src/platform/**`、`packages/i18n/**`、`packages/logger/**`。

## Observable acceptance

- `cargo test -p zoeydaw-native` 通过(含原 `atomic_file` 全部单元测试与外链校验场景)。
- `pnpm native:build` 后,`bun test src/platform` 对**真实 napi 二进制**通过:原子写入读回一致、崩溃安全(写入中途不会出现半文件,沿用原测试思路)、外链拒绝 `file:`/`javascript:`、设置读写往返。
- 关闭拦截/托盘:报告里给出实测结论(附命令与输出),是"已实现并验证"还是"阻塞及原因",二选一,不得含糊。
