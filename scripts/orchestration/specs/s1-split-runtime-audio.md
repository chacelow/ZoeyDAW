# S1：按职责拆分 project-runtime 与 AudioWaveform（纯重构）

## 前置

在 L1、R1b、R1c 全部合入主干之后派发。基于当时的 `gpuix-migration` 新建 worktree。

## 依据

架构审查（`docs/reviews/2026-10-15-architecture/project.md`、`ui-app.md`）列为 should-fix：

- `apps/gpuix/src/project/adapters/runtime/project-runtime.ts`（944 行）在一个闭包里同时承担 backend lease 生命周期、协议确认与恢复、编辑和撤销历史、录制归并、保存确认、预览投影。R1a 修掉的三个数据丢失缺陷，都出在这些职责的衔接处。
- `apps/gpuix/src/project/sections/clip-edit/audio/AudioWaveform.tsx`（570 行）混合了 view、选区、拖动生命周期、滚轮缩放、fade 路径、两个标尺、主波形和可交互的 overview。

## 要求

纯重构：行为不变，公开接口不变。

1. **project-runtime**：保持只有一个 runtime 状态 owner（同一个闭包或对象持有全部可变状态），不拆成多个需要相互同步的 manager。可以抽出的部分：
   - 纯的 checkpoint/history 转换函数，以及 preview 投影计算，放进 `runtime/` 下的独立模块，输入输出都是值；
   - backend lease 协调（open、release、quiesce、recover）作为同一 owner 内的一个内聚段，或一个只接收 owner 回调的模块；
   - 保存确认（markProjectSaved 一类）单独成段。拆完后，主文件只负责组装状态和对外 API。
2. **AudioWaveform**：抽出唯一拥有 view 和 drag 状态的 controller 或 hook；rulers、overview 抽成子组件，它们只读这份 view，不再持有第二份可写视口。SourceWaveform 和 PeakColumns 的路径不变。
3. 不新增功能、不改测试断言。允许为了新的模块边界移动测试文件，或拆分测试文件。

## 验收

- 现有全部测试不改断言、全部通过；R1a 和 clip-edit 已有的变异入口（`project/adapters/verification/mutations.mjs`、`clip-edit/verification/mutations.mjs`）在新文件位置上照样能全部被抓到（变异的锚点可以随代码搬家更新，但每一个都必须还在）。
- clip-edit 的 Audio 满量 production 分段同协议重跑，p90 不劣于拆分前（缩放 3.2ms、滚动 3.9ms，允许 ±10% 噪声）。
- 主文件行数：project-runtime ≤ 400，AudioWaveform ≤ 250。
- `pnpm verify:gpuix` 通过；先发 merge_ready，复核合入后再发 worker_done。
