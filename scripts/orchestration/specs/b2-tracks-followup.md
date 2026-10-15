# B2-tracks 补验收（F2/F3/F4、A3b、设计 token 已入主干后）

## Target

新 worktree（脚本已基于当前 `gpuix-migration` 创建）。拥有路径仍为 `apps/gpuix/src/project/sections/arrangement/tracks/**`。原切片 B2-tracks 的产品规则、Live 对照要求和公共契约全部继续适用（见下方 `b2-tracks.md` 与 `b2-common.md` 原文）。本次不重写已合入的实现，只关闭 `tracks/VERIFICATION.md` 中「未实现/未验证事项」与「阻塞：A3b」各行。

## 已入主干、你直接消费的能力

- F2 原生 `onContextMenu`：嵌套右键目标。
- F3 后台帧 `useResumeFrame`，以及首个 present 新鲜度。
- F4/F4b/F4c `quad-batch`（像素吸附、描边），`shared/quads/useQuadBatch`。
- A3b 第二批：共享控件 fill/hideIcon/bipolar/滚轮隔离、焦点环、MenuTrigger Space/Enter。
- 设计 token 入口 `@/shared/theme/design-tokens`（`theme.design`），Card 尺寸 `controls|project`，PanelShell 圆角与边框。

## 必做

1. **嵌套右键**：VERIFICATION 记录这条「仍保留失败」。基于 F2 修好，并去掉保留失败的标记；变异：把目标还原为旧的 mouseDown/button 判断，测试应失败。
2. **停止后 peak**：播放停止后，峰值保持条按规则缓慢下落到地板，不冻结也不瞬间归零。用真实 C1 遥测，或项目已有的确定性 frame source 驱动。补一条行为回归和一个变异；如果拿到静默时段，补一张原生截图。
3. **后台帧消费**：电平表在窗口恢复时的首帧必须显示最新值（F3 契约）。确认 TrackMeter 已通过 F3 授权的 `meter/telemetry.tsx` 路径消费，并有回归。
4. **A3b 阻塞行**：逐条重验「每控件每状态」「同类间距 token」「居中」「同组等高/图标方形」「深浅/中英」「drag/wheel/popup」，在真实组合视图用 AX bounds 量值，不批量逐按钮截图。实例上若残留局部 padding/gap/radius 覆盖，改为读 `theme.design` 或共享控件，不逐实例修补。
5. **Live 对照表**中仍写「未验证」的行：能用只读 AX/截图补的就补；需要在 Live 中输入的（拖动 resize、折叠）先 `orca orchestration ask`，写清具体输入，由协调者决定。

## 约束

- 不改 `ui/**`、`shared/theme/**`、`project/{model,stores,adapters}`、`crates/**`；确需修改先 ask。
- 桌面窗口和静默时段先 ask，由协调者给出绝对 UTC 时段，到点即停（fail-closed）。
- 交付：先 `merge_ready` 精确 HEAD，复核合入后再 `worker_done`。VERIFICATION.md 更新为当前事实，删去已过时的「阻塞：A3b」描述。
