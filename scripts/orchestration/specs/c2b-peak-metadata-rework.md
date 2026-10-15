# C2 返工:峰值元数据切片的 review 必修项

## Target

同一个 worktree `gpuix-c2-peak-metadata`(分支 `gpuix-c2-peak-metadata`),在已有 3 个提交(16d9257、a3757ff、ea3bbc2)之上继续。先读这三个提交与 `scripts/orchestration/specs/c2-peak-metadata.md`,再读本文。

## 协调者 review 结论(已独立复跑:扫描 0 hard、门禁通过,行为设计正确;以下两项不改不能合并)

1. **越界追认与收窄**:你改了 `crates/engine/src/assets.rs` 与 `session.rs`(原规格写明不动 `crates/engine`,且未先 ask)。追认批准 `SourceInfo`(源采样率、帧数、声道只能在解码处取得)。**不批准多存一份 `source_pcm`**:它让每个素材在内存里存两份 PCM,并新增 `pcm.clone()` 与 `source_pcm.clone()` 两次整段拷贝。峰值金字塔已在源采样率上一次性构建(`PeakPyramid::from_interleaved(source_pcm…)`),读峰值应读金字塔。改法:删除 `source_pcm` 字段与两处 clone;`pcm` 恢复为 move;峰值读取走源采样率上的 `peaks`;加测试证明素材只保留一份 PCM(断言字段不存在或比较容量),并保持 44.1k/48k 区分测试为绿。
2. **重复实现(必修)**:`apps/gpuix/src/platform/engine.ts` 第 57 行在 TS 里重写了 `barsPerSecond = bpm*denominator/(240*numerator)`,第 79–80 行重写了 bar→frame 换算与取模循环。原规格要求复用 `crates/engine` 的 `bar_to_frame` 语义(`transport.rs:54`,`session.rs:135` 也有一份)。改法:在 `crates/native/src/engine.rs` 新增 napi 导出 `readPeaksAtBars(session, sourceId, startBar, endBar, pixels, contentOffsetBars) -> Float32Array`,在 Rust 内用该会话工程的 `TransportClock` 与源采样率完成 bar→frame、带符号取模循环(与 C1 混音的 `sourceOffsetBars` 语义一致),返回布局与 `readPeaks` 相同(channel-major,其次 pixel-major,每项 [min,max])。TS 的 `musicalPeakReader` 只转发,不含任何换算公式。新增导出属于 `crates/native` 公共导出变更,**仅此一个导出已批准**。原有 TS 性质测试改为对新导出断言同样的性质(平移不变、负偏移取模、44.1/48k)。

## 交付前自审(强制)

按 `docs/architecture/gpuix.md`「交付前自审与协调者仲裁」:`node scripts/gpuix-review-scan.mjs`(HARD 清零)→ 用 `task` 起 `pstack-reviewer` 只读子代理做 Standards/Spec 双轴自审 → 发现分必修/汇报仲裁/记录;报告含『自审结果』表。`cargo test --workspace`、`cargo clippy --workspace --all-targets -- -D warnings`、`pnpm native:build`、`apps/gpuix` 的 `tsc`(除 ui/controls 已知 4 处)、`bun test`、eslint 全过。变异检查:去掉取模、把采样率换成设备采样率,各 → 失败数。

## Constraints

拥有路径:`crates/engine/src/assets.rs`、`crates/engine/src/session.rs`(仅为本返工)、`crates/native/src/engine.rs`、`apps/gpuix/src/platform/engine*`、`docs/research/engine-backend.md`。提交标题避免 `+ & 和 与`。进程清理强制。
