# F4：原生批量矩形绘制（满量 Arrangement 的性能）

## 问题（lane 实测，2026-10-15）

满量工程 200 轨 × 50 clip，用真实 readProjectPeaks，探针 `lane/verification/render-cost.tsx`（headless NativeRoot）：

- 保留节点 14716 个，其中 div 14065 个；CPU render+flush p90 = 245.51ms，另有 native flush p90 = 84.65ms。
- 把网格合并进共享 Shape（svg path）后，节点降到 8172，p90 反而变成 449.35ms；再合成 compound path 后是 644.24ms。

结论：瓶颈在保留节点数量。svg 路径光栅化也不是解法。纯画面元素（网格线、MIDI 预览音符、波形竖线 PeakColumns）需要不经过 React 节点的批量绘制。GPUI 已有 `window.paint_quad`；gpuix 上游的 `<canvas>` 只有类型、没有实现（vendor `AGENTS.md:1270`）。

## 目标

渲染器提供一个原生元素，一次绘制成百上千个纯色矩形，React 侧每批只占一个节点。

## 接口方向（调查后可调整，停点处汇报）

优先**声明式**：实现上游已有类型的 `<canvas>`，或新增 host 元素（如 `quads`）。它接收 prop `quads: Float32Array`，每 4 个值是一个矩形 `x, y, w, h`，坐标相对元素本地；颜色与 opacity 取该节点 style 的 color/opacity。

- prop 按引用比较：引用不变就不重新上传。引用变了，只更新该节点的原生缓冲，不重建子树。
- 绘制在该元素的 paint 阶段用 `paint_quad` 完成，遵守 content mask 与裁剪，不参与命中测试（纯画面，`pointerEvents` 视为 none）。
- 多种颜色用多个元素表达，不在一个 batch 里塞颜色数组。

如果调查发现命令式更合适（如 `renderer.setQuadBatch(elementId, quads)`），在停点说明理由。

## 停点

先读 vendor `packages/native/src/renderer.rs`：元素如何声明、props 如何下传、paint 阶段在哪，以及已有 `gpui::canvas(` 的两处用法（约 3947 与 6177 行）。再读 GPUI 的 `paint_quad`（`zed/crates/gpui/src/window.rs:4198`）。然后用 `orca orchestration ask` 汇报：接口形状、数据怎么跨 napi（Float32Array 零拷贝或一次拷贝）、对 React reconciler 的影响、补丁规模。等 reply 再实现。

## 实现与构建

- 新补丁 `scripts/gpuix-main/patches/quad-batch.patch`，登记进 `config.json`。用独立 vendor 根：`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f4-gpuix`。共享 vendor 由协调者在合入时重建。
- 本切片交付原生能力、TS 类型，以及一个共享组件 `shared/quads/QuadBatch.tsx`（只做类型化转发与引用稳定的约定说明）。lane、clip-editors 等的迁移由各自切片接入，你只在 lane 的探针里证明收益。

## 验收

- GPUI 层 `gpui::test`：矩形位置、裁剪、opacity 与颜色、quads 引用不变时不重新上传。每项做变异。
- 性能：用 lane 的 `render-cost.tsx` 同一满量工程，把网格、预览音符、PeakColumns 换成 QuadBatch 后重跑。报告保留节点数与 CPU render/flush p90 的前后对比。目标是保留节点降一个数量级、p90 进入一帧预算（≤ 16ms）；达不到就如实报告瓶颈在哪。
- 真实窗口：一次 50 轨 × 50 clip 的滚动/缩放，录 renderer frames 与 draw p90。桌面时段先 ask。
- 文档：`docs/research/gpuix-main-build.md` 补丁清单；准备上游 PR 草稿（实现上游未实现的 canvas/批量绘制）。
- 按 `common.md` 自审，发 merge_ready。
