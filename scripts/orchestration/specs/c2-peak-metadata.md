# C2 peak-metadata:readPeaks 返回源采样率与总帧数,platform 提供 musicalPeakReader

## Target

Worktree `gpuix-c2-peak-metadata`(子 worktree,基线 `gpuix-migration`,已含 C1)。小切片,不要扩大范围。

## 背景

`docs/architecture/gpuix-arrangement-composition.md` 规定 lane 的 `PeakReader` 为 `(sourceId, startBar, endBar, pixels, contentOffsetBars) => Float32Array`:`startBar/endBar` 是 one-based 的 Clip 局部可见范围,`contentOffsetBars = clip.sourceOffsetBars`,换算 `(bar-1+contentOffsetBars)` → 源 frame,返回 **channel-major、其次 pixel-major、每项 [min,max]** 的 `Float32Array`(立体声 `pixels*4` 个 f32)。目前 C1 的 `readPeaks(session, sourceId, startFrame, endFrame, pixels)` 只收 frame,而源采样率与总帧数没有暴露,lane 无法也不应该自己假设 48000。

## Change

1. `crates/native/src/engine.rs`(C1 文件,批准你改):新增 napi `sourceInfo(session, sourceId) -> { sampleRate: number, frames: number, channels: number } | null`(源解码后的实际采样率、总帧数、声道数;源未加载返回 null)。**`crates/native` 公共导出变更,批准仅此一个新导出**,不改 `readPeaks` 的签名与布局(channel-major 保持)。
2. `apps/gpuix/src/platform/engine.ts`:导出 `sourceInfo` 转发;新增 `musicalPeakReader(session, project)`,返回满足 composition 文档 `PeakReader` 签名的函数:用 BackendState 的 `bpm` 与拍号把小节换算成秒,再用 `sourceInfo.sampleRate` 换算成源 frame:`frame = round(((bar-1+contentOffsetBars) × barsPerSecond⁻¹) × sampleRate)`(barsPerSecond 取自引擎已有的换算,**不要在 TS 里另写一份 bar↔frame 公式**:复用 `crates/engine` 的 `bar_to_frame` 语义,若需要就把换算暴露为 napi 或用同一个 `TransportClock` 参数在 Rust 内完成,二选一,选最小者并写明理由)。源未加载/frame 越界时返回零长度或全静音数组,**不抛错、不返回 NaN**。
3. 测试:Rust `cargo test`;TS 用真实 napi(临时 WAV,同 C1 `native.test.ts` 的做法)断言:① `sourceInfo` 的采样率与帧数等于生成 WAV 的值(用 44.1kHz 的 WAV 与 48kHz 设备采样率区分,证明用的是源采样率不是设备采样率);② `musicalPeakReader` 在 Clip 平移(startBar 不同、contentOffset 相同)时返回的波形相同(『Clip 移到第 100 小节不会错读素材』);③ 带符号负 `contentOffsetBars` 循环取模与 C1 的语义一致;④ 变异检查至少 2 个(把 contentOffset 忽略、把采样率换成 48000)→ 失败数。
4. README(`platform/engine` 目录或 docs/research/engine-backend.md 追加一节):`sourceInfo` 与 `musicalPeakReader` 的契约。

## Constraints

- 拥有路径:`crates/native/src/engine.rs`、`apps/gpuix/src/platform/engine*`、`docs/research/engine-backend.md`(追加)。不动 `crates/engine` 的混音与围栏、`ui/**`、`project/**`。不新增依赖。Cargo.lock 冲突由协调者重生成。
- 进程清理强制:测试与发声验证结束即关;发声增益 ≤0.05(沿用 C1 的 -30 dB 做法);不改系统音量。
- 提交标题避免 `+ & 和 与` 并列与多个 Conventional Commit 类型(commit-msg 门禁会拒绝);提交用 `USER_CONFIRM_HASH=$(git write-tree) git commit`;lint-staged 在并行提交冲突时先 `git status`、`git stash list` 确认没有半成品再原样重试。

## Observable acceptance

`cargo test --workspace`、`cargo clippy --workspace --all-targets -- -D warnings`、`pnpm native:build`、`apps/gpuix` 的 `tsc --noEmit`(除 ui/controls 已知 4 处)、`bun test`(除已知 10 个 ui/controls 失败)、`pnpm exec eslint apps/gpuix/src`(含新增的 `architecture/gpuix-imports`:不手写 SVG、`@/` 别名)通过,贴命令与计数。
