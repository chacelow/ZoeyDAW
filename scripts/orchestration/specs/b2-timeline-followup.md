# B2-timeline 补验收（F2/F3/F4、A3b、设计 token 已入主干后）

## Target

新 worktree（脚本已基于当前 `gpuix-migration` 创建）。拥有路径仍为 `apps/gpuix/src/project/sections/arrangement/timeline/**`。原切片 B2-timeline-minimap 的产品规则、Live 对照要求和公共契约全部继续适用（见下方 `b2-timeline-minimap.md` 与 `b2-common.md` 原文）。本次只关闭 `timeline/evidence/verification.md`「未验证项与阻塞」与「视觉检查范围」中的残项，不重写已合入的实现。

## 已入主干、你直接消费的能力

- F2 原生 `onContextMenu`；F3 后台帧 `useResumeFrame`；F4 `quad-batch`（标尺、网格线可迁移到单一批量路径，像素与原 div 等价）。
- A3b 第二批：MenuTrigger Space/Enter、DragPad 滚轮祖先隔离、NumericPad fill/中线、焦点查询。
- G1 DragPad 锚点；Minimap 光标锚点使用按下事件坐标（03c869e 已合入）。
- 设计 token 入口 `@/shared/theme/design-tokens`（`theme.design`）。

## 必做

1. **hover/pressed 视觉**：toolbar、Minimap 选框、分隔条的 hover/pressed 状态，在真实组合视图中用 AX bounds 和截图取证。held pressed 无法保持 mouseDown，按已批准的工具限制标「未验证」，用原生状态测试覆盖，不拿 active 或释放后的截图冒充。
2. **隐藏光标物理拖动**：Minimap 拖动与分隔条松手位置。合成窗口级输入能覆盖的部分用 `computer.window` 加窗口级输入完成；需要前台物理输入的部分先 `orca orchestration ask`，写清具体输入，由协调者决定或代操作。未获批准就保持「未验证」。
3. **A3b 解阻项**：MenuTrigger Space/Enter、嵌套右键、DragPad wheel 祖先隔离、NumericPad fill/中线、最终焦点查询，逐项写行为回归（已有的确认仍有效），各至少 1 个变异。
4. **网格/标尺绘制**：如果标尺与网格仍逐线挂载 div，评估迁移到 `useQuadBatch` 单一路径：节点数前后对比，原生 PNG 与原 div 零差异。没有收益就记录理由，不迁。
5. **视觉残项**：toolbar 左边距 AX 为 1px 而 token 是 1.5px，核实取整来源；文字、图标的精确内部居中用 AX 或像素量值。实例上的局部 padding/gap 覆盖改为读 `theme.design`。
6. **Ctrl/Cmd+3、+5** 仍未实现：保持在 README 中如实声明；如果实现，按 Live 菜单实测行为先 ask。

## 约束

- 不改 `ui/**`、`shared/theme/**`、`project/{model,stores,adapters}`、`arrangement/core`、`crates/**`；确需修改先 ask。
- 桌面时段先 ask，绝对 UTC，fail-closed。
- 交付：先 `merge_ready` 精确 HEAD，复核合入后再 `worker_done`。verification.md 更新为当前事实。
