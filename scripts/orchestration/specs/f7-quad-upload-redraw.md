# F7：每次 setQuads 都同步整窗重绘

## 问题（已查证）

2026-10-16 协调者在前台真实窗口跑 lane 200×50 production 十步协议（976×758，`lane/verification/window-profile-preload.ts`）。结果见仓库外的 `/tmp/zoeydaw-fg-acceptance/lane-production-window.json` 和 `lane-production-summary.txt`。

- 单帧原生绘制 p90 只有 11.6ms，但每一步的同步 JS 耗时是 0.25 到 5.2 秒。
- 每一步的原生绘制次数，恰好等于这一步 `setQuads` 的调用次数，比如 300 次上传对应 329 次绘制，513 次上传对应 514 次绘制。每次上传平均 7.7 到 13ms，相当于一次完整绘制。`applyBatch` 每步只调用 1 次。

根因链（vendor `6a5c7c1` 加 12 个补丁）：

1. `packages/native/src/renderer.rs` 的 `set_quads` 每次调用都执行 `request_invalidate()`；macOS 上就是 `invalidate_window()` → `update_window()` → `App::update`。
2. `zed/crates/gpui/src/app.rs` 约 1711-1722 行，`finish_update` → `flush_effects` 在 `cfg(any(test, feature = "test-support", feature = "bench"))` 下，会对每个 dirty 窗口同步执行 `window.draw(cx)`。
3. 我们交付的 app binary 带 `test-support` 编译：`scripts/gpuix-main/build.sh` 22-23 行用了 `--features test-support`，`packages/native/Cargo.toml` 的 default 也包含它，这样离屏 `TestGpuixRenderer` 才能用。所以测试专用的“每次 update 同步绘制”进了正式窗口。

F4 当时的合成测量和离屏测量看不出这个问题，因为没有在真实窗口里连续上传几百个 batch。

## 目标

真实窗口里，一次 React commit 内的多次 `setQuads` 只触发一次绘制，由下一次正常帧完成，不做同步整窗绘制。离屏 `TestGpuixRenderer` 的行为和现有测试保持不变。

## 停点

先查清楚再动手，用 `orca orchestration ask` 汇报方案，等 reply 再实现。至少比较这两条路：

- 构建层：正式窗口路径不再启用 gpui 的同步绘制（例如把 `TestGpuixRenderer` 需要的能力和 `gpui/test-support` 分开，或者在正式窗口的 update 路径绕开它）。说明 `createTestRoot`、已有 vendor 测试会受什么影响。
- 失效层：`set_quads`（以及其它会走 `update_window` 的 setter）只标记 dirty 并安排下一帧，不走同步 `App::update`；或者按 commit 合并成一次 invalidate。说明和 F3 resume 回调（`RESUME_FRAME.invalidated`）的关系。

汇报里写清楚：选哪条，为什么，补丁大小，以及还有哪些 native setter 有同样的问题（`applyBatch`、`setImage` 等）。

## 实现与构建

- 新补丁接在 `aria-toggled.patch` 之后，登记进 `config.json`。如果必须改已有补丁（例如 `quad-batch.patch`），按 LESSONS「修改补丁序列中间的补丁」的规则处理。
- 用独立 vendor 根（`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f7-gpuix`），不碰共享 vendor。

## 验收

- 不需要前台窗口的可失败回归：后台窗口（`GPUIX_BACKGROUND=1`）或 native 单测里，一次同步调用 N 次 `setQuads`，断言绘制次数不随 N 增长、单次调用耗时远小于一次绘制。修前红、修后绿，再加一个变异。
- `TestGpuixRenderer` 已有测试、vendor Rust 测试、`pnpm verify:gpuix` 全部通过；`clip-edit`、`lane`、`timeline` 已有变异入口照样全部被抓。
- 用 `lane/verification/render-cost.tsx` 做 production 离屏分段，确认没有退化。
- 真实前台窗口复测 lane 200×50 十步协议、p90 ≤ 16ms，这一项由协调者在前台时段做；你在报告里给出复测命令。
- 文档：`docs/research/gpuix-main-build.md` 补丁清单；LESSONS 加一条（测试专用的同步绘制进了正式窗口）。
- 按 `common.md` 自审，发 merge_ready。
