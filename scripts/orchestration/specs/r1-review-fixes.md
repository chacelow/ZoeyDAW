# R1：架构审查必修项

2026-10-15 协调者组织三路只读架构审查，报告在 `docs/reviews/2026-10-15-architecture/{project,arrangement,ui-app}.md`。本规格把必修项分成三个互不重叠的切片（R1a/R1b/R1c）。你只做分给你的那一节；别的切片的文件不要改。

公共要求：

- 每个必修项先写一条能失败的回归（修前红、修后绿），再修根因；对应报告里的「evidence」先复现一遍。如果复现不出来，就带着证据 ask，不要硬改。
- 每项至少一个变异（还原修复时测试失败），变异入口沿用你所在目录已有的 `verification/mutations*`。
- 删除旧路径，不留兼容层。
- 交付前跑 `pnpm verify:gpuix`，先发 merge_ready，复核合入后再发 worker_done。

## R1a：project/adapters（报告 project.md）

拥有路径：`apps/gpuix/src/project/{adapters,model,stores}/**`。

1. 保存会持久化未提交的 workspace 事务（`snapshots.ts`）：保存和序列化都改用 committed workspace 投影。
2. 派发旧队列项时 telemetry fence 被回退（`connection.ts`）：requested control fence 保持单调。
3. preview 和 recovery 都失败后，release 会丢失独立的 recording journal（`project-runtime.ts`）：在清理或替换 backend 之前归并 journal，只应用一次，不跨工程。
4. should-fix，一并做：删除已经没有产品消费者的 `waveformPeaks` / `withWaveformPreview` / `mockWaveformPeaks` 生产管线（fixture 留在测试边界）；`adapters/README.md` 删掉旧 Web/Tauri 说明，改为链接当前契约。不做：runtime 大文件拆分（单独评估，不在本切片）。

## R1b：arrangement（报告 arrangement.md）

拥有路径：`apps/gpuix/src/project/sections/arrangement/**`、`docs/architecture/gpuix-arrangement-composition.md`。

1. timeline 全量同步覆盖 lane 进行中的时间选区预览：区分持久选区与 lane 的暂态预览，显示时以预览为准。
2. `tracks/GroupOverview` 重复扣除 controlsWidth；并且折叠 Group 绕过了 `renderLane`，出现两套摘要实现：TrackRow 始终挂载传入的 lane，删除 `tracks/GroupOverview`，保留 lane 的摘要。两项一起修。
3. ruler controller 仍保留对 projectPreview / timeSelection 的镜像写入：删掉，投影只由 TimelineController 写。
4. should-fix，一并做：网格 quad 打包抽成 core 纯函数，两边共用，并统一普通网格的细线透明度（取 timeline 的 `MINOR_GRID_OPACITY`）；edge auto-scroll 纯计算抽到 `core/viewport`。
5. note：组合契约中的快捷键改为当前实际支持的 Ctrl/Cmd+1、+2、+4，+3/+5 标为未实现。

## R1c：ui 与 app（报告 ui-app.md）

拥有路径：`apps/gpuix/src/ui/**`、`apps/gpuix/src/app/**`、`apps/gpuix/src/project/sections/{footer,browser,transport,clip-edit}/**`、`apps/gpuix/src/shared/theme/**`。

1. 已消费的方向键继续冒泡到窗口，导致 timeline 同时 seek：RadioGroup 导航和 Separator resize 处理了方向键就消费掉，Space 仍然冒泡。加组合回归：切页或 resize 不改变播放位置。
2. MidiEditor 工具栏和 AudioParameters 自己写 overflow 滚动：改用共享 `ScrollArea`（MIDI 工具栏用 `wheelToHorizontal`）。
3. DropdownButton 弹出列表跟随 trigger 用了 transport 尺寸：trigger 与列表分开取尺寸；Select、Menu、Browser 的列表行统一用同一份行度量。
4. Browser 没有选中项时由容器做唯一 Tab 入口：把 roving focus 和资源选择分开，有结果时当前行或第一行是唯一的 tabIndex=0；同步更新 README。
5. 硬编码英文的可访问名称和值（Button 的 on/off 后缀、Separator 的 "Resize panels" / "pixels"、Browser 分隔条缺名称、PianoKeys/PatternSteps 的 on/off）：用 aria-pressed / aria-checked 表达状态，名称走 labels 注入，共享层不引入 app i18n。
6. 数值字体在 DragPadNumber 里写死了 "Menlo"（三处）：新增数值字体 theme token，三处共用。
7. note：删除 DragPadNumber 的 `variant` 尺寸别名（先确认没有消费者）。不做：AudioWaveform 拆分（单独评估）。
