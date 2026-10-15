# 应用外壳

`src/main.tsx` 是原生应用入口。首页、单工程页、404、路由错误兜底、设置对话框都在 `app/`。本阶段不挂 Arrangement、Transport、Browser、Footer、Status 的内容。

## 状态与生命周期

| 状态 | owner | 资源释放 |
| --- | --- | --- |
| 当前路由与返回栈 | `router/createRouter` | 随窗口销毁 |
| 当前主题模式、配色预设 | `settings/createPreferenceStore` | 订阅者卸载时退订，值经 platform settings 落盘 |
| 当前语言 | `@zoeymind/i18n/core` 的 i18next 单例 | `useAppTranslation` 卸载时退订 |
| 工程文档、编辑事务、走带 | `project/adapters` 与 `project/stores` | `ProjectPage` 显示时取得 `startProjectRuntime` lease，卸载时释放 |
| 面板激活、Browser handle、Footer view 与折叠 | `project/useProjectShell` | 随工程视图卸载 |
| 帧源、窗口激活、光标能力 | `NativeRoot` 绑定当前 renderer | Provider 与订阅各自退订，不新增动画定时链 |
| 未保存关闭判定 | `window/useUnsavedCloseGuard` | 旧 predicate 在卸载后放行，不再修改 React 状态 |

`project/adapters/context.ts` 已注册真实 native backend 工厂。入口不再注册第二个，也不在模块初始化时打开会话。入口只安装 `createSnapshotStorage()`，供快照和最近工程列表使用。

## 设置

- 外观页保留明、暗、跟随系统的分段控件，以及 Web 顺序的 43 项预设网格。
- 预设经 `createThemePresetSetting` 存储，启动时先 `repair()`，再读取。切换只改变受控 ThemeProvider 的 context，不重挂载工程。
- 语言经 `createSettingStorage("language")` 持久化。`app/i18n` 只消费 React-free `@zoeymind/i18n/core`，不加载 react-i18next 的第二份 React。
- 模式经 `createSettingStorage("themeMode")` 持久化。`NativeRoot` 同步读取系统外观并订阅变化，跟随系统会更新同一工程，不重开后端。
- 失效预设修复的读写失败落入 preference store 的失败边界。记录日志，保留内存选择，不阻断启动。
- dirty 关闭先由原生 should-close 否决。保存成功或不保存后调用原生 `closeWindow()`，不再要求再按一次关闭。
- `ModalDialog` 是应用内唯一的模态包裹。设置和未保存关闭提示都使用它。所有弹层必须留在 `AppFrame` 这个唯一根 host 节点内；gpuix 的窗口 container 不支持并列根 host 节点。
- 原 Web 日志页仍是说明文字。本阶段初始化真实日志 sink，但不增加原 Web 没有的日志管理交互。

## 空槽接口

`ProjectPage.renderSlots(shell)` 返回 `ProjectLayoutSlots`。每个槽的值是 `ReactNode`。传 `null` 不显示占位文字或虚构面板。

| 槽 | 第二阶段内容 | 所需 shell 接口 |
| --- | --- | --- |
| `transport` | `TransportBar` | `toggleBrowser`，组合根路由返回命令 |
| `browser` | `BrowserPanel` | `browserHandleRef` 由外层 Panel 持有 |
| `arrangement` | `ArrangementPanel` | 单一 timeline controller 与键盘 owner，见组合契约 |
| `footer` | `FooterPanel` | `footerView`、`footerCollapsed`、`selectFooterView`、`setFooterCollapsed` |
| `status` | `StatusStrip` | 同一份 Footer 状态，ControlEnvironment 的 info |

Footer 按新切片契约二选一显示 Affect Chain 或 Clip Edit，不迁 Web 可同时打开两者的 `detail-view`。Clip Edit 用垂直 Group 连续调整高度。Affect Chain 在 Group 外按 Footer 自身固定高度显示。切换时 Browser 与 Arrangement 的树位置不变。

`usePlaybackKey` 只服务第一阶段空 Arrangement。第二阶段挂 `createTimelineController` 时删除它，由 timeline 唯一处理 Space，避免双 owner。模态对话框打开期间不订阅这条播放快捷键。

## 尚待组合根收敛的部分

| 文件 | 原因 | 删除条件 |
| --- | --- | --- |
| `project/layout-constraints.ts` 的 `PENDING_BROWSER_COLUMNS` | Footer 的 Browser 两列 token 尚未合入 | Footer token 合入后读取 `theme.project` |

H1 的两个临时文件 `settings/theme-mode-setting.ts` 和 `window/close-guard-port.ts` 已删除。模式和关闭都直接消费平台端口。

窗口返回首页入口在第二阶段由 TransportBar 提供。本阶段不增加额外标题栏按钮。

## 验证入口

```sh
pnpm native:build
pnpm exec tsc --noEmit -p apps/gpuix
cd apps/gpuix
bun test src/app
bun --hot src/main.tsx
```

`bun apps/gpuix/src/app/verification/mutations.mjs` 会先跑 app 基线，再执行 13 个行为变异，最后恢复每个文件。真实后端 lease 测试需要可用音频设备，没有设备会失败，不跳过。视觉与迁移报告见 `report.md`。
