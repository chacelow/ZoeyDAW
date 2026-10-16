# 应用外壳

`src/main.tsx` 是原生应用入口。首页、单工程页、404、路由错误兜底、设置对话框都在 `app/`。工程页装配真实 Arrangement、Transport、Browser、Footer 与 Status，不保留空槽默认入口。

## 状态与生命周期

| 状态 | owner | 资源释放 |
| --- | --- | --- |
| 当前路由与返回栈 | `router/createRouter` | 随窗口销毁 |
| 当前主题模式、配色预设 | `settings/createPreferenceStore` | 订阅者卸载时退订，值经 platform settings 落盘 |
| 当前语言 | `@/platform/i18n/core` 的 i18next 单例 | `useAppTranslation` 卸载时退订 |
| 工程文档、编辑事务、走带 | `project/adapters` 与 `project/stores` | `ProjectPage` 显示时取得 `startProjectRuntime` lease，卸载时释放 |
| 面板激活、Browser handle、Footer view 与折叠 | `project/useProjectShell` | 随工程视图卸载 |
| 帧源、窗口激活、光标能力 | `NativeRoot` 绑定当前 renderer | Provider 与订阅各自退订，不新增动画定时链 |
| 未保存离开判定 | `window/useUnsavedCloseGuard` | router 守卫卸载时注销，旧 native predicate 放行；异步保存不能完成已退休的决定 |
| Arrangement scene、timeline 与 lane controller | `project/createProjectComposition` | 工程视图卸载时 dispose，取消手势并退订窗口与工程 |
| 文本焦点 lease、ModalDialog 打开状态 | `AppInteractionProvider` | Input 与实际数值编辑框的原生 focus/blur/unmount，ModalDialog 的 open/unmount |

`project/adapters/context.ts` 已注册真实 native backend 工厂。入口不再注册第二个，也不在模块初始化时打开会话。入口只安装 `createSnapshotStorage()`，供快照和最近工程列表使用。

已有工程（recent、启动路径、历史返回）在取得 runtime lease 前调用 `openProjectSnapshot(projectId)`：先隔离工程 identity，再读取并经现有 snapshot parser hydrate。缺失快照打开空工程且不报错；读取/校验失败显示 `session.snapshotError`，保留 runtime，但 `canSaveSnapshot()` 关闭该 key 的保存能力，避免默认数据覆盖原始字节。重新成功打开、显式 Restore 成功或切换 identity 后解除保护。新建路由带 `openMode: "new"`，不读取快照；离开该条历史记录后其标记被消费，再次返回按已有工程打开。

## 设置

- 外观页保留明、暗、跟随系统的分段控件，以及 Web 顺序的 43 项预设网格。
- 预设经 `createThemePresetSetting` 存储，启动时先 `repair()`，再读取。切换只改变受控 ThemeProvider 的 context，不重挂载工程。
- 语言经 `createSettingStorage("language")` 持久化。读取失败使用显式初始语言或默认语言并记诊断；写入失败记诊断，保留内存选择且不抛出 rejection。`app/i18n` 只消费 React-free `@/platform/i18n/core`，不加载 react-i18next 的第二份 React。
- 模式经 `createSettingStorage("themeMode")` 持久化。`NativeRoot` 同步读取系统外观并订阅变化，跟随系统会更新同一工程，不重开后端。
- 失效预设修复的读写失败落入 preference store 的失败边界。记录日志，保留内存选择，不阻断启动。
- dirty 关闭与工程离开共用 save/discard/cancel 决策。router 在 navigate、replace、back 提交前执行唯一 leave guard；Cancel 或保存失败保持原路由、文档与 undo，成功后才释放 ProjectPage lease。原生关闭仍同步 should-close 否决，成功选择后在回调外 `closeWindow()`。同时到来的请求不替换当前决定。
- `ModalDialog` 是应用内唯一的模态包裹。设置和未保存关闭提示都使用它。所有弹层必须留在 `AppFrame` 这个唯一根 host 节点内；gpuix 的窗口 container 不支持并列根 host 节点。
- 原 Web 日志页仍是说明文字。本阶段初始化真实日志 sink，但不增加日志管理交互。console 与 native sink 分流前统一递归展开 Error 并按配置脱敏，包含嵌套字段、大小写与上下文，sink 不接收原始参数。

## 工程组合

`ProjectSections` 用 `ProjectLayoutSlots` 装配 sections。`ProjectLayout` 只管理面板几何与激活外观，不持有第二份工程或视口。Browser 最小宽度直接取 `theme.project.browserNavigationWidth` 与 `browserResultsWidth`。

| 槽 | 内容 | 所需 shell 接口 |
| --- | --- | --- |
| `transport` | `TransportBar` | `toggleBrowser`，组合根路由返回命令 |
| `browser` | `BrowserPanel` | `browserHandleRef` 由外层 Panel 持有 |
| `arrangement` | `ArrangementPanel` | 单一 timeline controller 与键盘 owner，见组合契约 |
| `footer` | `FooterPanel` | `footerView`、`footerCollapsed`、`selectFooterView`、`setFooterCollapsed` |
| `status` | `StatusStrip` | 同一份 Footer 状态，ControlEnvironment 的 info |

Footer 按新切片契约二选一显示 Affect Chain 或 Clip Edit，不迁 Web 可同时打开两者的 `detail-view`。Clip Edit 用垂直 Group 连续调整高度。Affect Chain 在 Group 外按 Footer 自身固定高度显示。切换时 Browser 与 Arrangement 的树位置不变。

Clip slot 的唯一类型由 `clip-edit` 定义，只含 `clipId`、`trackId`、`close`。app 显式消费这三项，编辑器自行订阅权威 store；不传完整 clip/track 或 notes 数组，不留旧对象 props 兼容。

`createProjectComposition` 只创建一个 `createTimelineController`，后者持有唯一 timeline keyboard。lane 的 `markDrawModeGesture` 接该 keyboard 的 `markDrawGesture`。`ArrangementTimeline` 注册窗口键盘，lane 在元素阶段消费的事件不会再次到达窗口 owner。旧 `usePlaybackKey` 已删除。

`ArrangementPanel` 将同一个 scene 与 viewport 传给 TrackRows 和 LaneRow，`TrackRows.renderLane` 放置每行车道，`LaneOverlay` 单次挂载。峰值、telemetry、走带位置分别来自 adapters 的 `readProjectPeaks`、`readProjectTelemetry`、`readTransportBar`，均使用 ProjectPage 的同一个 backend session。

文本焦点由 `ControlEnvironment.textFocus` 的 lease 读取，模态状态只由 app `ModalDialog` 报告。全局 Cmd/Ctrl+F 在组合根检查已消费事件、modal 与 Browser 的实际折叠状态，再调用 `BrowserPanelHandle.focusSearch()`。Clip editor 通过共享 `keystrokeId` 标记自己的键盘区域，不把未消费的 A/M 等发送给 Arrangement 命令。Space 后焦点回到工程 host，不保留按钮的按下行为。

`NativeRoot` 为整个应用提供同一个 renderer 的唯一 `AnimationFrameProvider`、`nativeCursorLock` 与原生窗口激活端口。Footer 和 Transport 的 reduced motion 直接读取 platform/window，不增加定时链。Transport 的 Back 回到首页并释放 ProjectPage lease。

帧需求由 `playing`、lane 的真实 `dragActive` 与 timeline 的 autoScroll 活动共同派生，经稳定的 external-store 订阅通知组合根。停止且无手势时取消 native frame 订阅，播放或手势开始时恢复；不缓存第二份可写需求状态，不轮询 pointer。只读 Input 仍是文本焦点，不能把 A/M 或 Cmd+A 送给 Arrangement。

普通帧继续使用 `useAnimationFrame`。同一个 source 的 `useResumeFrame` 使用同一需求谓词，在原生 prepaint 中显式 `flushSync` 执行同一个 `composition.tick`，使首次恢复 present 使用最新视口。无需求时两类订阅都释放，不另建 source 或 timer。

## 验证入口

```sh
pnpm native:build
pnpm exec tsc --noEmit -p apps/gpuix
cd apps/gpuix
bun test src/app --timeout 30000
bun --hot src/main.tsx
```

`bun apps/gpuix/src/app/verification/mutations.mjs` 跑 app 基线与行为变异，并在每次变异后恢复源码。真实后端 lease 测试需要可用音频设备，没有设备会失败，不跳过。`verification/native-fixture.ts` 是真实 main 的隔离验证 preload，要求 `B2_EVIDENCE_DIR` 指向临时目录，配合临时 HOME 避免改用户配置。第一阶段历史报告见 `report.md`，阶段2验收与限制见 `phase2-report.md`。

变异脚本可接名字子串，例如 `bun apps/gpuix/src/app/verification/mutations.mjs "lane draw"`。过滤执行先验证该项的真实行为基线；不传过滤参数时仍先跑完整 app 基线。

`verification/resume-smoke.tsx` 配合 `native-fixture.ts` preload 可重跑实际 AppShell、真实 NativeBackend 与离屏 GPUI 的恢复提交。要求 `B2_EVIDENCE_DIR` 指向已创建的临时目录，配置/存储也限定在该目录；建议同时隔离 HOME。它手动投递 frame host 的 resume 事件，不替代真实桌面 occlusion 评审。

`verification/r1c-surfaces.tsx` 配合同一 native fixture preload，向命令行参数指定的仓库外目录采集中英文、深浅主题、MIDI/Audio 的八个工程组合。采集前确认工程与编辑器存在，root 在 finally 中卸载。R1c 回归、变异、自审及前台验收边界见 [R1c 验证报告](verification/R1C-REPORT.md)。

`verification/r2-lifecycle.tsx` 配合同一 native fixture preload，验证 dirty 离开保存 → recent hydrate → 损坏快照拒绝覆盖 → 修复后 Restore 恢复保存的实际 AppShell 路径，并采集少量完整组合截图/AX（中英文、深浅主题）。`verification/mutations-r2.mjs` 覆盖 UPA-01/02；locale 与 log 各自的 `verification/mutations-r2.mjs` 覆盖 UPA-03/08。R2 回归测试在 `project-lifecycle.test.tsx`，使用真实 native backend。
