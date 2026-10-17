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

`project/adapters/context.ts` 已注册真实 native backend 工厂。入口不再注册第二个，也不在模块初始化时打开会话。入口安装 `createProjectFileStorage()`，并把最近工程（settings 中的 `recentProjects`）与工程位置端口交给 `ProjectFileProvider`。

工程按 Live 的方式落盘：`<名称> Project/<名称>.zdaw`，默认目录为 文稿/ZoeyDAW，覆盖保存前先把旧文件复制到同目录 `Backup/`。路由 `projectId` 即 `.zdaw` 路径；首页“打开…”与工具栏“打开”走系统文件选择器，最近工程按路径列出。`ProjectFileProvider` 是 Save As 对话框与选择器的唯一 owner：未保存工程的 Save/Cmd+S、Cmd+Shift+S、未保存离开时的“保存”都会弹出 Save As，取消则留在原工程。工程首次写入成功后才进入最近列表，标题栏显示文件名。

打开 `.zdaw` 时在取得 runtime lease 前调用 `openProjectFile(path)`。读取/校验失败显示 `session.fileError`、保留 runtime，并以 `saveBlocked` 禁止覆盖原字节，Save As 到新位置后恢复。新建路由带 `openMode: "new"`，不读取文件；离开该条历史记录后其标记被消费，再次返回时打开它本次会话中保存到的文件。

## 设置

- 外观页保留明、暗、跟随系统的分段控件，并与 Gallery 共用 `theme-editor/ThemeEditor`：43 项只读内置预设、用户主题的新建/复制、改名、删除、分组字段编辑和重置、JSON 导入/导出。
- 内置基础预设经 `createThemePresetSetting` 存储，启动时先 `repair()`；完整用户主题库及当前选择经 `createThemeLibraryStore(createSettingStorage("themeLibrary"))` 保存。`AppPreferencesProvider` 统一解析覆盖后传给受控 ThemeProvider，切换与编辑不重挂载工程。
- 语言经 `createSettingStorage("language")` 持久化。读取失败使用显式初始语言或默认语言并记诊断；写入失败记诊断，保留内存选择且不抛出 rejection。`app/i18n` 只消费 React-free `@/platform/i18n/core`，不加载 react-i18next 的第二份 React。
- 模式经 `createSettingStorage("themeMode")` 持久化。`NativeRoot` 同步读取系统外观并订阅变化，跟随系统会更新同一工程，不重开后端。
- 失效预设修复的读写失败落入 preference store 的失败边界。记录日志，保留内存选择，不阻断启动。
- dirty 关闭与工程离开共用 save/discard/cancel 决策。router 在 navigate、replace、back 提交前执行唯一 leave guard；Cancel 或保存失败保持原路由、文档与 undo，成功后才释放 ProjectPage lease。原生关闭仍同步 should-close 否决，成功选择后在回调外 `closeWindow()`。同时到来的请求不替换当前决定。
- `ModalDialog` 是应用内唯一的模态包裹。设置和未保存关闭提示都使用它。所有弹层必须留在 `AppFrame` 这个唯一根 host 节点内；gpuix 的窗口 container 不支持并列根 host 节点。
- 原 Web 日志页仍是说明文字。本阶段初始化真实日志 sink，但不增加日志管理交互。console 与 native sink 分流前统一递归展开 Error 并按配置脱敏，包含嵌套字段、大小写与上下文，sink 不接收原始参数。

## 工程组合

`ProjectSections` 用 `ProjectLayoutSlots` 装配 sections。`ProjectLayout` 将 Browser、Arrangement、Clip Edit 和 Affect Chain 注册到共享 DockLayout；Transport 顶部与 StatusStrip 底部固定。默认 Browser 左侧、Arrangement 右上、两个编辑器 Tab 右下，默认比例来自 `theme.layout.project.panels`。

布局唯一可写来源是 project workspace 的 `dockLayout` JSON，`useProjectShell` 只解析布局并派生激活/可见状态。`dockRef.executeCommand` 接入现有 timeline keyboard controller，头部 Dock 焦点使用 K1 的 dock context，编辑区仍保留自己的键盘 owner。显式 Clip 编辑请求激活 Clip Edit；状态栏不再重复拥有两个 view switches。

| 槽 | 内容 |
| --- | --- |
| `transport` | `TransportBar`，路由与 Browser 显隐命令 |
| `browser` | `BrowserPanel` |
| `arrangement` | 单一 Arrangement timeline controller 与键盘 owner |
| `clipEditor` | Clip 类型的 `FooterPanel`，通过 slot 注入 ClipEditor |
| `devices` | Devices 类型的 `FooterPanel` / EffectChain |
| `status` | `StatusStrip`，编辑区整体显隐、ControlEnvironment info 与 warnings |

Clip slot 的唯一类型由 `clip-edit` 定义，只含 `clipId`、`trackId`、`close`。app 显式消费这三项，编辑器自行订阅权威 store；不传完整 clip/track 或 notes 数组，不留旧对象 props 兼容。

`createProjectComposition` 只创建一个 `createTimelineController`，后者持有唯一 timeline keyboard。lane 的 `markDrawModeGesture` 接该 keyboard 的 `markDrawGesture`。`ArrangementTimeline` 注册窗口键盘，lane 在元素阶段消费的事件不会再次到达窗口 owner。旧 `usePlaybackKey` 已删除。

`ArrangementPanel` 将同一个 scene 与 viewport 传给 TrackRows 和 LaneRow，`TrackRows.renderLane` 放置每行车道，`LaneOverlay` 单次挂载。峰值、telemetry、走带位置分别来自 adapters 的 `readProjectPeaks`、`readProjectTelemetry`、`readTransportBar`，均使用 ProjectPage 的同一个 backend session。

文本焦点由 `ControlEnvironment.textFocus` 的 lease 读取，模态状态只由 app `ModalDialog` 报告。全局 Cmd/Ctrl+F 在组合根检查已消费事件、modal 与 Browser 的实际折叠状态，再调用 `BrowserPanelHandle.focusSearch()`。Clip editor 通过共享 `keystrokeId` 标记自己的键盘区域，不把未消费的 A/M 等发送给 Arrangement 命令。Space 后焦点回到工程 host，不保留按钮的按下行为。

`NativeRoot` 为整个应用提供同一个 renderer 的唯一 `AnimationFrameProvider`、`nativeCursorLock` 与原生窗口激活端口。Footer 和 Transport 的 reduced motion 直接读取 platform/window，不增加定时链。Transport 的 Back 回到首页并释放 ProjectPage lease。

帧需求由 `playing`、lane 的真实 `dragActive` 与 timeline 的 autoScroll 活动共同派生，经稳定的 external-store 订阅通知组合根。停止且无手势时取消 native frame 订阅，播放或手势开始时恢复；不缓存第二份可写需求状态，不轮询 pointer。只读 Input 仍是文本焦点，不能把 A/M 或 Cmd+A 送给 Arrangement。

普通帧继续使用 `useAnimationFrame`。同一个 source 的 `useResumeFrame` 使用同一需求谓词，在原生 prepaint 中显式 `flushSync` 执行同一个 `composition.tick`，使首次恢复 present 使用最新视口。无需求时两类订阅都释放，不另建 source 或 timer。

## 配置与通知

首页最大内容宽来自 `theme.layout.home.maxWidth`，预设网格的列宽、色块高、滚动高度来自 `theme.design.settings.presetGrid`。字重和模态遮罩分别读取 `theme.design.typography.weights` 与 `theme.colors.dialogBackdrop`，不借轨道尺寸或在调用处重算混色。

`AppFrame` 在 layout effect 配置 `ToastPolicy`，卸载时清空通知与 timer。`Toaster` 只消费调用方传入的 presentation policy、关闭/加载文字及区域名称；UI 不反向读取工程或设置模块。调整 queueLimit 会淘汰最早通知并清理 timer，已保留通知不重新计时；默认时长只影响之后新建或替换的通知。
