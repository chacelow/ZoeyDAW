# B1 arrangement-core:Arrangement 纯计算核心(无渲染、无 DOM)

## Target

Worktree `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-b1-arrangement-core`(分支 `gpuix-b1-arrangement-core`,基于 `gpuix-migration`,已含 A1/A2/A4/A5/A6)。

## 背景

`apps/web/src/pages/project/sections/ArrangementPanel/{canvas,Timeline,MiniMap}` 里,无 DOM/Canvas/React 耦合的纯逻辑约 1936 行,是后续轨道、Clip、时间轴、Minimap、交互切片(B2)的共同底座。先单独把它迁成纯 TS 核心并用测试钉死,B2 的各切片才能并行而不互相踩。

## Change

把下列**纯文件**迁入 `apps/gpuix/src/project/sections/arrangement/core/`,按职责分子目录,保持"一个文件一个职责":

- 场景与布局:`canvas/scene.ts`、`canvas/layout.ts`、`canvas/hit-test.ts`、`canvas/clip-geometry.ts`
- 时间/缩放:`MiniMap/zoom.ts`;网格相关在 A1 已迁的 `project/model/{grid,grid-geometry,timeline-ticks}.ts`,**直接复用,不要复制**
- 交互纯几何:`canvas/interactions/clip/{fade,timeRange}.ts`、`canvas/interactions/rulers/geometry.ts`、`canvas/interactions/automation/{geometry,hit,points,segment,selection,clipboard,drawing,flat,index}.ts`
- 表盘辅助:`canvas/painters/meter-peak.ts`、`canvas/audio/ring-buffer.ts`(先确认 gpuix 侧是否真需要;不需要则不迁并在报告写明)

对每个文件:

1. 去掉对 `HTMLElement`/`window`/`document`/`CanvasRenderingContext2D`/`react` 的任何残留引用,改成输入输出纯数据(坐标、矩形、枚举)。
2. 有 DOM 耦合的文件(`controller.ts`、`useTimelineViewport.ts`、`useMinimapGesture.ts`、各 painter 等)**不迁**,但把其中的纯判定(例如"拖到哪个吸附点""命中哪个 Clip 边缘""缩放锚点")**抽出为纯函数**放进 core,保留原行为;抽出的函数签名在报告里列出,供 B2 调用。
3. 所有时间位置统一用项目既有的小节坐标系(`bar` 从 1 开始、`(bar-1)*pxPerBar - scrollX`),不得引入第二套。

## 产品规则(必须保持,来自 LESSONS/产品决策)

- 轨道 resize 按"共享内部控件高度"为步长,不是连续;向上拖过阈值折叠、向下拖展开。
- Pattern Ghost 起点对齐线标记左起点,拖动/缩放任一边都是它,不是尾部。
- 音频 fade 曲线:底部锚点不可独立拖动,只有顶部锚点自由拖;中间 Bézier 锚点避开上下左右四个极值;缩放任一端时顶部和底部锚点同时跟随。
- 网格:粗细网格分级;Ctrl+E 最大缩放可细分到 1/256;缩放自适应,最小可见网格宽度随缩放变化(直到 1:16384 不变成均匀稠密)。
- 吸附点与网格线必须取自同一份网格,尤其 1/4 分辨率。
- Minimap:向下拖缩小(zoom out)、向上拖放大;以指针在选区内的水平位置(左/中/右)为锚点缩放,不是固定中心。这些都要在测试里出现为具体断言,不要只写在注释里。

## Constraints

- 只改 `apps/gpuix/src/project/sections/arrangement/core/**`(含同目录测试与一份 README)。
- 不改 `project/{model,stores,adapters}`(A1 的);发现需要改,先 `orca orchestration ask`。
- 不新增 npm/Rust 依赖。
- `apps/web` 只读,不要删。
- 层级:`project/sections` 可依赖 `ui`、`shared`、`project/model`;不得依赖渲染器包,不得 import `ui/panels` 之外的 `ui/**` 内部文件。`gpuix-layers` lint 必须通过,不得关规则。

## 测试(重点)

- 纯函数用**性质测试**:固定种子 LCG 生成随机输入,断言不变量。至少覆盖:① 命中测试与几何互逆(点落在 Clip 矩形内则命中该 Clip,边缘容差对称);② 缩放前后锚点像素不动;③ 吸附结果必在网格上且距离不超过半格;④ 时间↔像素往返误差 < 1e-6;⑤ fade 锚点在任意拖动序列后仍满足上述四条规则。
- **变异检查**(强制):对每组性质测试至少做 2 个变异(翻转符号、改容差、去掉 clamp),确认测试失败,再恢复;把"变异→失败数"表写进报告。无法被抓住的变异说明测试没有约束该行为,要补测试或承认它不影响行为。
- 迁移的 web 端 37 个测试里,针对被迁文件的要一并迁移并通过;删除任何只测实现细节/转发的。

## Observable acceptance

- `apps/gpuix` 的 `tsc --noEmit`、`bun test`、`pnpm exec eslint apps/gpuix/src/project/sections` 全部通过(贴命令与计数)。
- `grep -rnE "react|HTMLElement|document\.|window\.|CanvasRenderingContext2D" apps/gpuix/src/project/sections/arrangement/core` 零命中(贴输出)。
- 报告列出:迁入文件清单(源→目标)、抽出的纯函数签名、未迁文件及原因、变异表、未实现项。
- 本切片不需要开窗口;**不要启动任何 demo/service**。若启动了测试进程,结束前 `ps` 确认零残留。
