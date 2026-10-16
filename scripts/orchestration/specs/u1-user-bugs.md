# U1：用户报告的三个交互 bug（2026-10-16）

用户在真实打包应用中报告。只读调查已定位，报告全文：`agent://FooterDuplicateTabs`、`agent://MinimapCursor`、`agent://EditToggleFlash`（协调者会话内，下面已摘要关键证据）。三项按顺序各自独立提交。

注意：C2/C3/C4 统一配置切片正在改 footer、status、timeline 等目录。你的改动保持最小、只碰下面列出的行为，合入时由协调者解冲突。开工前先 `git merge gpuix-migration`。

## 1. 底部面板重复的 Clip Edit / Affect Chain 切换（先做，最确定）

- 现状：`project/sections/footer/index.tsx:81-124` 展开时渲染 `<MotionTabs>`（tablist：Affect Chain / Clip Edit）；底部状态栏 `project/sections/status/index.tsx:137-170` 的 `status-clip`、`status-devices` 两个按钮控制同一份 `shell.footerView/footerCollapsed`（`ProjectSections.tsx:71-77,100-106`）。原生 AX 证据 `app/evidence/phase2/project-light-en.ax.txt:59-77` 同时有两套。
- 用户决定：切换只保留在底部状态栏，删除底部面板顶部那组。
- 做法：Footer 按 `view` 直接渲染 EffectChain 或 Clip 内容；保留 `!collapsed` 卸载、设备固定高、Clip 填满宿主、`<Fragment key={clip.id}>`、`footer-content` testId；内容容器用 `role="group"` + 当前视图的本地化 `aria-label`，不留孤立 tabpanel。删掉失去用途的 Footer `onViewChange`/`reducedMotion` props 并迁移所有调用方（组合根、demo、测试）。不改 StatusStrip、shell reducer、PanelShell、共享 MotionTabs。
- 更新 `footer/README.md`、`status/README.md:7`（删除"Footer 内部标签仍保持互斥选择"）、`footer/VERIFICATION.md`：视图切换只在 StatusStrip。依赖 `motion-tab-*` 的 footer 测试改用受控宿主或整页 StatusStrip 操作。
- 验收：原生 AX 树里底部只剩状态栏那一组切换；状态栏切换 Clip/Devices、再次点击收起都正常；键盘可达。

## 2. Minimap 拖动松手后光标跟随实际位移

- 现状：`project/sections/arrangement/timeline/minimap/gesture.ts:61` 松手时 `cursor.restore(previous.cursor)`，目标永远是按下时保存的屏幕点（`:79-81` capture、`:102-104` hide）。`CursorLockPort.restore(point)` 和 Rust `cursor.rs:45-48` 已支持任意屏幕坐标，**不需要新接口或改 Rust**。
- 用户规则：Minimap 这种有实际位移的组件，松手后光标出现在被拖动框移动后的对应位置；BPM、音量等原地调值控件（共享 `ui/controls/DragPad/useDragPad.ts`）保持恢复到原按下点，**不改共享 DragPad**。
- 做法：只改 `timeline/minimap/`。按实际绘制的视口框计算目标点，不用最后鼠标 delta（主体拖动有 `PAN_DRAG_SCALE=0.25`、有夹边、竖拖改 `pxPerBar`）： `spanBars=min(bars, viewportWidth/pxPerBar)`；`startBars=clamp(scrollX/pxPerBar,0,bars-spanBars)`；`x(ratio)=(startBars+ratio*spanBars)/bars*width`。主体用按下点在框内的比例，左边缘 ratio=0，右边缘 ratio=1；y 保持按下点的 y（夹在 minimap 高度内）。用最终已发布视口计算，换算成屏幕点用现有 `capture` 的同一窗口→屏幕映射（按下点屏幕坐标 + (目标窗口 x − 按下窗口 x)），单位 pt。取消（Esc/卸载）仍恢复原按下点。
- 验收：单测覆盖主体、左边缘、右边缘、夹边四种情况的 restore 目标点，并有一个"恢复到 press.cursor"的变异被抓；BPM/音量的 DragPad 测试不变。真实桌面物理光标验收由协调者前台做，你在报告里标"待前台验收"。

## 3. 点击 Clip Edit / 展开收起时 Arrangement 闪一下（需先复现）

- 已排除：ArrangementPanel 没有被卸载重挂（无 key 变化，父结构固定），composition/scene 不随 footer 状态重建，quad-batch 不先清空。
- 两个候选：A. 尺寸多轮 `onLayout` 才收敛：Group 测量（`ui/panels/useElementSize.ts`）→ Panel 分配 → `timeline-layout` onLayout → `view.measure()`（`timeline/controller.ts:198-208`）→ scene viewport，中间帧出现"新外框 + 旧 viewport"。B. 高度变化时会重新 reveal 正在编辑的 Clip 所在轨道（`timeline/controller.ts:140-153`，条件包含 `revealedHeight !== bodyHeight`），导致纵向跳动。
- 做法：先用离屏 `createTestRoot` + 真实后端复现。用真实 `status-clip`/`status-toggle-footer` 输入，在每一轮 `renderer.flush()` 之后、下一轮 layout 事件之前，记录 bounds、scene viewport、`scrollY` 和截图；同时断言 `arrangement-panel`/`timeline-grid` 的 native element ID 不变（证明不重挂）。基于数据判断是 A、B 还是两者都有，再修：
  - B：把"编辑目标变化时 reveal"和"尺寸变化时只 clamp viewport"分开，单纯折叠 footer 不再重新定位轨道。
  - A：让外框尺寸和 timeline viewport 在同一个绘制边界收敛（例如在 Panel 尺寸变更的同一 layout 提交里同步 measure）。不靠加 key 强刷，也不靠忽略零尺寸事件。
- 如果两个候选都复现不出来，用 ask 把逐帧数据发给我，不要猜着改。
- 验收：逐帧回归，证明切换过程中没有任何一帧 viewport 和外框不一致、`scrollY` 没有跳动；配对应变异。

## 通用

按 `common.md`：本地只跑轻量检查（tsc、改动范围 bun test 与 eslint、变异）；每项独立提交；报告 `apps/gpuix/src/app/verification/U1-REPORT.md`，写明三项的根因证据、修法和未验证项；自审后发 merge_ready。
