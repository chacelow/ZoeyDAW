# A6 gpuix-main-build:自建 gpuix 主干的可行性与成本(spike)

## Target

Worktree `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-a6-gpuix-main-build`(分支 `gpuix-a6-gpuix-main-build`)。判断是否应从源码构建并固定 gpuix 主干,取代 npm `@gpuix/*@0.10.0`。

## 背景(协调者已核实的事实)

- npm 最新就是 0.10.0(2026-09-23),此后主干已有 88 个提交、37 个未发布 changeset。
- 主干已有而 0.10.0 没有、且我们正在为之写临时 workaround 的能力:`onLayout`(容器/文字尺寸事件,A3 字宽测量与 A4 面板测量都在用 `getElementBounds` 轮询代替)、`onScrollChange`、`getElementsAt`、`registerFont`、headless `Button`/`Dialog`、`createPortal`、Tab 焦点移动、`<virtual-list>` 滚动条、Windows ARM64。
- 主干同样**没有**:关闭拦截 `on_window_should_close`、hideWindow、托盘、光标 hide/warp、`measureText`。GPUI fork 里 `on_window_should_close` 钩子已存在(`zed` 子模块 `gpui_macos/src/window.rs:2893`、`gpui/src/window.rs:6231`),只是 gpuix renderer 没注册、没暴露给 JS。
- 主干 `rust-toolchain.toml` 固定 `1.97.1`,与本机一致。源码在 `/tmp/gpuix-src`(浅克隆,可能被清理,请自行重新克隆);`zed` 子模块指向 `https://github.com/remorses/zed` 的 `gpuix` 分支,固定提交 `c2e9f882030ca95cee55d206512a0a3ee6cd72b0`;主干提交 `6a5c7c142ac32f9eb0caefe0121be995cfc18631`。

## Change

1. 在 **`/Volumes/PSSD/code/_vendor/gpuix`**(仓库之外,不提交)克隆主干并 `git submodule update --init --depth 1` 取得固定的 zed 提交。磁盘:系统卷仅剩约 54GB,**`CARGO_TARGET_DIR` 必须指向 `/Volumes/PSSD/code/_vendor/target`**,不要让构建产物写进系统卷。
2. 用固定工具链构建 native(release,`napi build --platform --esm --js index.js`,以其 `AGENTS.md`/`package.json` 为准)和 `@gpuix/react`。**记录:全量冷构建耗时、增量重建耗时(改一行 renderer.rs 后)、产物 `.node` 大小、target 目录大小、峰值内存。**
3. 用本仓库验证兼容:在一个临时 worktree 副本里把 `apps/gpuix` 的 `@gpuix/native`/`@gpuix/react` 指向你的本地构建(`pnpm.overrides` 或 `link:`,仅本地、**不提交**到 `gpuix-migration` 相关文件),运行 `bun test`(当前 31 个)与 `bun --hot` 跑 `features/{track-mixer,clip-render,waveform-automation,drag-pad}/demo.tsx`,逐个报告通过/失败与差异。
4. 实测 `onLayout`:写一个 20 行的 demo,验证 `<div onLayout>` 与 `<text onLayout>` 在首次绘制和尺寸变化后触发,并量出触发延迟(帧数)。这直接决定 A3 字宽测量与 A4 容器测量能否改为事件驱动。
5. **关闭拦截的最小 PoC**:在你的本地 gpuix 克隆里,新建分支,给 renderer 注册 `on_window_should_close` 并暴露一个 JS 回调(返回 boolean 决定是否关闭),加 `hideWindow`/`showWindow`(若 GPUI 已有对应 API)。只做到 `Cmd+W`/红灯按钮能被 JS 否决并验证即可。给出**补丁大小(行数)、是否需要改 zed 子模块**(AGENTS.md 说明了 fork 规则:必须先推到 remorses/zed,**你不能 push**,所以只写补丁文件并描述,不推送)。
6. 评估 `measureText`:GPUI 的 text system 在 native 内,评估在 gpuix renderer 暴露 `measureText(text, style) -> {width,height}` 的补丁规模(只设计 + 估行数,不必实现)。
7. 产出 `docs/research/gpuix-main-build.md`:上述**实测数字**、结论与推荐(三选一并给理由):A) 继续用 npm 0.10.0;B) 固定主干提交自建并作为 `@zoeydaw/gpuix-native` 发布到本仓库(我们已有自己的 napi crate 与构建管线);C) 向上游提 PR 等发布。同时列出自建的持续成本(跟随主干、zed 子模块、CI 构建时间)。

## Constraints

- 不改 `apps/gpuix/src/**`、`crates/native/**`、`crates/engine/**`、`packages/**`、`docs/architecture/gpuix.md`;不 push、不向 remorses 仓库提 PR、不改子模块指针。
- 补丁只放你的本地克隆与 `docs/research/gpuix-main-build.md` 附录里的 diff 文本;不要把第三方源码拷进本仓库。
- 构建很重:Cargo 编译可能 10 分钟以上,请用 `bash` 的命名 service 或 async 并以 `proc://` 观察,不要轮询。不要运行会拖垮用户机器的并行构建(`CARGO_BUILD_JOBS` 不超过 6)。
- 不要用真实光标/窗口自动化去点用户正在用的窗口;demo 窗口只在 `bun --hot` 自己启动的范围内操作,用完停掉。

## Ownership

`docs/research/gpuix-main-build.md`、`scripts/gpuix-main/**`(若需要可复现的构建脚本)。

## Observable acceptance

- 文档里每个结论配一条实际命令的输出或日志片段;冷构建耗时、`.node` 大小、onLayout 延迟、31 个测试在新构建上的结果,四项都有实测数字。
- 如果构建失败,报告失败点、日志与已尝试的修复,不要含糊成"环境问题"。
