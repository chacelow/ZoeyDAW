# A7 app-active:原生"应用是否处于激活状态"只读查询

## Target

Worktree `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-a7-app-active`(分支 `gpuix-a7-app-active`,基于 gpuix-migration,已含 A1/A2/A5 与分层 lint)。

## 背景

A4(`ui/panels`)实测:gpuix 0.10.0 的 `onFocus/onBlur` 在窗口失活(用户切到 Finder)时不触发,拖动分隔条中途失焦无法回滚。已核对上游:0.10.0 与主干都没有暴露窗口激活信号(GPUI 内部有 `Window::is_window_active`,但 gpuix renderer 未导出)。这是应当用 Rust 直接做的缺口。**此任务原本分给 A2,A2 交付时遗漏了,现单独交给你。**

## Change

1. `crates/native/src/app_state.rs`:`#[napi] pub fn is_application_active() -> Option<bool>`(TS 侧 `isApplicationActive(): boolean | null`)。
   - macOS:`objc2-app-kit` 的 `NSApplication::sharedApplication(mtm).isActive()`。`MainThreadMarker::new()` 在非主线程返回 `None`;napi 调用线程不一定是主线程——请实测并选对方式(例如读取不要求主线程的等价信号,或 dispatch 到主线程同步取值),把实测结论写进注释。不要凭记忆下结论。
   - Windows:`GetForegroundWindow` + `GetWindowThreadProcessId` 与本进程 ID 比较(`windows-sys` 已在依赖里,按需追加 feature,仅 cfg(windows))。
   - Linux:返回 `None`(未知);TS 侧把 `null` 当作"保持激活",避免误取消。
2. 依赖:`objc2`、`objc2-app-kit` 仅放 `[target.'cfg(target_os = "macos")'.dependencies]`,**批准仅限本项**。先 `cargo info` 核对当前最新稳定版(我看到 objc2 0.6.5、objc2-app-kit 0.3.2)与现有 `core-graphics` 不冲突;feature 越少越好。关闭拦截的 objc2 旁路仍**不批准**。
3. TS:`apps/gpuix/src/platform/window` 增加 `subscribeApplicationActive(listener: (active: boolean) => void): () => void`:全应用唯一一个共享采样器(约 50ms,首个订阅者启动、最后一个取消时停止,import 无副作用),只在状态变化时回调;`null` 视为 active。platform 层不得 import 渲染器包(`gpuix-layers` 规则会拦),采样器依赖通过注入或直接 import `@zoeydaw/native`(platform 允许依赖它)。
4. 测试:Rust 纯逻辑部分 `cargo test`;TS 用可注入的假时钟/假 `isApplicationActive` 测订阅语义(首个订阅者启动采样、变化才回调、最后一个取消停止、`null` 视为 active、多订阅者共用一个采样器)。
5. 真实验证:用带 `name` 的 bash service 启动一个只打印 `isApplicationActive()` 的小脚本(不需要开窗口也可验证应用级状态;若需要窗口则按进程清理规则验证完立刻关),用 `computer` 把 Finder 切到前台,确认读数 true→false,切回 false→true,附输出;**用完恢复用户原来的前台应用**。

## Constraints

- 只改 `crates/native/src/{app_state.rs,lib.rs(仅 mod 登记)}`、`crates/native/Cargo.toml`(仅上述依赖)、`apps/gpuix/src/platform/window/**`。
- 不动 `cursor.rs`、`ui/**`、`project/**`、`docs/architecture/gpuix.md`;需要改共享契约先 ask。
- `Cargo.lock` 与 `pnpm-lock.yaml` 的冲突由协调者合并时统一重生成。
- **验证完立刻关闭自己启动的一切进程**(见通用要求"进程清理"),`worker_done` 前用 `ps` 确认零残留并贴输出。
- 错题/已验证做法在报告里单列,格式同 LESSONS.md。

## Observable acceptance

- `cargo test --workspace`、`cargo clippy -p zoeydaw-native --all-targets -- -D warnings`、`pnpm native:build`、`apps/gpuix` 的 `tsc --noEmit` 与 `bun test`、`pnpm exec eslint apps/gpuix/src/platform` 全部通过。
- 真实 Finder 切换的前后读数输出。
