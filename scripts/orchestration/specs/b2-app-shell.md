# B2-app-shell:应用外壳、首页、设置、路由与全局

## Target

Worktree `gpuix-b2-app-shell`。迁移 `apps/web/src/{App.tsx,main.tsx,routes/**,components/{layouts,providers,settings,SharedControlBridge},pages/{home,SettingsDialog,not-found}.tsx,pages/project/{index,ProjectLayout,useProjectShell}}`,装配 A1 stores、A2 平台(设置/日志/外链/i18n 存储)、A3 控件、A4 面板、B2 各 sections 的槽;**主题与语言切换保持现有交互**(设置对话框不得换成简化控件)。`apps/gpuix/src/main.tsx` 成为真实应用入口。

## 拥有路径

`apps/gpuix/src/{app,main.tsx}/**`、`project/ProjectLayout`/`useProjectShell` 对应文件。不动 sections 内部(各 B2 切片的)。

## 要点

- 单窗口、单工程视图;不要复刻旧的多 Tab/Portal/隐藏架构。
- 标题栏与 Header 同一连续表面,无缝无边框;红绿灯保持原样不重设计;标题保持弱化色。标题栏覆盖层只是压暗表面,不过暗(不要据未刷新的预览过度矫正)。
- 窗口关闭、失活、应用激活走 A2/A7 的原生能力与 A6 的关闭拦截结论;**不得用 JS 轮询模拟**。未保存工程的关闭拦截按 A6 报告的可行性实现或如实写明限制。
- 把 `main.tsx` 接成:创建 stores → 注册原生 `ProjectBackend`(C1)→ 渲染 `ProjectLayout`,最后一个视图卸载时清理后端会话(显式 lease,不在模块末尾启动后端)。
- 重构完成后,`apps/web`、`src-tauri`、`packages/ui`(未被消费部分)的删除由协调者统一做,你不删。
- Arrangement 组合根 `ArrangementPanel` 归你,按 `docs/architecture/gpuix-arrangement-composition.md` §5:只调用 `createTimelineController`(内部唯一 keyboard,不另调 `createTimelineKeyboard`);lane 的 `markDrawModeGesture` 接 `timelineController.keyboard.markDrawGesture`;lane 的 `readPeaks` 传 adapters 的 `readProjectPeaks`。
- 必须有一条跨切片行为测试(真实 lane controller + 真实 timeline keyboard,不是回调计数):按住 B → lane 绘制手势 → 松开 B → Draw Mode 偏好未锁定;对照:按住 B 不绘制 → 松开后按 timeline 规则处理。并做变异(断开 markDrawGesture 接线应让测试失败)。
- 同一 keyDown 序列只被一个 owner 处理(组合契约 §4)的跨切片测试也由你在组合根证明。
- 组合根挂唯一的 `AnimationFrameProvider`(`source = createAnimationFrameSource(renderer)`,同一个 renderer),覆盖所有 sections;不得在组合根或任何切片再起定时链。`ControlEnvironmentProvider` 的 `cursorLock` 注入 `@/platform/cursor` 的 `nativeCursorLock`;窗口激活经 `createWindowPlatform(renderer).subscribeApplicationActive` 注入 `PanelEnvironmentProvider`。依赖方向见 `docs/architecture/gpuix.md`(lint 强制)。
- 组合根注入的 keyboard `focus()` 必须在真实 Input/Textarea 聚焦时返回 'text'(含 Cmd+A 全选后继续输入),使时间线快捷键(A、M、数字、Space 以外的键)不被触发。timeline 的 probe 实测过:Octave 编辑态下 A 键切换了 Automation。加一条组合根行为测试:聚焦 Input 后按 a 与 Cmd+A,Automation 与其它模式均不变;变异:focus() 固定返回 'timeline' 应失败。
- 全局快捷键守卫(Cmd+F 等)统一在组合根:对话框打开时(唯一来源是 app 层 ModalDialog 的状态)、事件已被消费时、目标面板折叠时都不触发;sections 只导出命令(如 footer 的 focusBrowserSearch)。reduced motion 由 H1 的 platform 端口读取后注入 Footer/Transport。
