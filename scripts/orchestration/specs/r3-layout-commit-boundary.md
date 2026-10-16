# R3：面板尺寸变化在同一绘制边界收敛（Edit 展开/收起闪一下）

## 用户报告（2026-10-16）

点 Clip Edit 展开/收起底部面板时，Arrangement 会闪一下。

## U1 已复现的证据

- ArrangementPanel 没有重挂（native element ID 前后相同），composition/scene 不重建，quad-batch 不先清空。
- 逐帧数据（`renderer.flush()` 之后、`dispatchNativeEvents()` 之前采样，单位 px）：panel / timeline-layout / scene.viewport.height `316/464/464 → 437/246/464 → 437/367/246 → 437/367/367`。也就是：外框先变；Group 下一轮才重新分配；timeline 最后才 `measure()`。中间两帧画出来的是"新外框 + 旧 viewport"。原始 JSON 与每轮 PNG 在 U1 的 `U1-REPORT.md` 里有路径。
- 根因：原生 `renderer.flush()` 只负责绘制，`onLayout` 要等异步的 `dispatchNativeEvents` 才发；`ui/panels/useElementSize.ts` 把测量写进 React state，再由 Group 分配、Panel 写尺寸，`timeline-layout` 的 `onLayout` 调 `view.measure()`（`timeline/controller.ts:198-208`），每一层都要再走一轮"布局→事件→React 提交→绘制"。只在 timeline 的 onLayout 里同步 measure 消除不了第一帧旧 viewport。

## 要做

1. 先查 renderer（`.gpuix-main/packages/native/src/renderer.rs` 的 layout/onLayout 派发，以及 `@gpuix/react` 的 `onLayout` 与 flush）有没有现成能力：同一帧内把 layout 事件同步交给 JS 并在 present 之前完成提交（类似 F3 resume-frame 的同步回调）。查上游 gpuix / zed 有没有同类机制。
2. 拟定方案后用 ask 报给我，等 reply 再动手。候选方向（自己验证，择优）：a. renderer 补丁：尺寸变化的 layout 事件在同一帧同步回调 JS（`flushSync`），JS 提交后再 present；与 F3 resume 的 pre-present seam 同构。b. 应用层：Group 不再依赖 `onLayout` 测自身，改由父级已知尺寸直接计算分配，把多级串联压成一级；timeline 的 viewport 直接从 Panel 分配的尺寸推导，不等它自己的 onLayout。c. 两者组合。不接受：给内容加 key 强刷、忽略零尺寸事件、在业务层轮询测量。
3. 回归：用真实 `status-clip` / 收起按钮输入，在每一次 `flush` 后采样，断言没有任何一帧出现外框和 timeline viewport 尺寸不一致；配变异（恢复旧的多轮串联）。
4. 改 vendor 的话按补丁序列走、用独立 vendor 根构建；改 `ui/panels` 共享层要保持现有 Panel/Group API，Gallery 与 `panels.test.tsx` 全绿。

## 验收

- 上述逐帧回归通过；Arrangement、Browser、Footer 的现有测试通过。
- 真实窗口：展开/收起各 5 次，用 `computer.window` 截图序列，或者在 renderer 侧记录 present 帧，证明没有中间帧。验完关闭窗口。
- 按 `common.md`：本地只跑轻量检查；报告 `apps/gpuix/src/ui/panels/R3-REPORT.md`；自审后发 merge_ready。
