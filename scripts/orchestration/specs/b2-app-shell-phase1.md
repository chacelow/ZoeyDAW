# B2-app-shell 第一阶段:应用外壳(不含 Arrangement 组合根)

## 分阶段

tracks、lane、timeline 尚未合入主干,共享控件 A3b 的增量也在路上。本阶段只做**不依赖它们**的外壳部分,第二阶段(另行派发)做 `ArrangementPanel` 组合根与跨切片测试。上面 `b2-app-shell.md` 的第 15–17 行(组合根、B 键跨切片测试、keyDown 单 owner 测试)本阶段**不做**,其余要点全部适用。

## 本阶段 Target

Worktree 新建 `gpuix-b2-app-shell`(基于 `gpuix-migration` 最新 HEAD)。拥有路径:`apps/gpuix/src/{app,main.tsx}/**`。迁移:

- `apps/web/src/{App.tsx,main.tsx,routes/**,components/{layouts,providers,settings,SharedControlBridge},pages/{home.tsx,SettingsDialog.tsx,not-found.tsx}}` → `apps/gpuix/src/app/**`。`pages/library` 是组件画廊,gpuix 已有 `src/gallery`,**不迁**。
- `apps/web/src/pages/project/{index.tsx,ProjectLayout.tsx,useProjectShell.ts}` → `app/project/**`:单项目页面骨架、面板布局(用 `ui/panels` 的 Group/Panel/PanelShell/CollapseDivider)、lease 生命周期。Arrangement、Footer、Browser、Transport 的位置先放**有名字的空槽**(接收 ReactNode 的 props),不写占位 UI 冒充面板;第二阶段与各 B2 切片合入后由组合根填。
- `main.tsx` 成为真实入口:创建 renderer 根 → 挂 `ThemeProvider`、`WindowKeyboardProvider`、唯一 `AnimationFrameProvider(createAnimationFrameSource(renderer))`、`ControlEnvironmentProvider`(`cursorLock: nativeCursorLock`)、`PanelEnvironmentProvider`(`subscribeWindowActive` 来自 `createWindowPlatform(renderer).subscribeApplicationActive`)→ 路由。adapters 的后端注册保持在 adapters(`registerNativeBackend` 已在 context 里);页面显示时取 `startProjectRuntime` lease,卸载时释放;不在模块顶层打开会话。

## 行为要求

- 路由:首页 / 项目页 / 404,与 web 等价;路由错误兜底(`route-error-fallback` 的测试迁过来)。gpuix 没有 react-router-dom 的 DOM history,用最小内存路由(状态 + 命令),先查 `@gpuix/react` 是否已有路由/导航能力,有就用;没有就 ask 再决定,不引入新依赖。
- 设置对话框:**保留现有对话框与主题、语言切换交互,不换成简化控件**(产品规则)。主题持久化与语言走 `platform/settings` 与 i18n 存储端口。
- 标题栏:与 Header 同一连续表面,无缝无边框;红绿灯保持原样;标题弱化色;覆盖层只轻度压暗。窗口拖动区用原生能力(查 gpuix titlebar/drag 区 API),不用 JS 模拟拖窗。
- 窗口关闭:按 A6 关闭拦截结论(`close-guard.patch`)接未保存工程的提示;做不到的写清限制。
- 键盘:Space 只给播放(本阶段播放命令接 adapters 的 transport 命令即可)。

## 验收

- 测试:路由状态转换、lease 获取/释放(卸载即释放,重复挂载不泄漏会话)、设置对话框主题/语言切换持久化、关闭拦截分支。不测转发。
- 真实窗口:`bun --hot apps/gpuix/src/main.tsx`(带 name 的 service),截图 + AX 验证首页 → 打开项目 → 设置对话框切换主题与语言(深/浅 × 中/英)→ 返回;标题栏与 Header 同色无缝的放大截图;取证后立刻 kill。
- 申请桌面时段用 `orca orchestration ask`,等协调者 **reply** 后才可输入;时段到点就停。
- 交付按 `common.md` 的自审流程,`merge_ready` 发出,报告列空槽清单(第二阶段要填的接口)。
