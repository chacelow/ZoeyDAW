# B2 app-shell 第一阶段交付报告

2026-10-15。范围是应用外壳，不包含 Arrangement 组合根。入口为 `bun --hot apps/gpuix/src/main.tsx`。

## 迁入清单

| Web 源 | gpuix 目标 | 处理 |
| --- | --- | --- |
| `App.tsx`、`main.tsx` | `main.tsx`、`app/AppShell.tsx`、`app/NativeRoot.tsx` | 原生 render root，单 ThemeProvider、WindowKeyboardProvider、AnimationFrameProvider，注入原生光标和窗口激活端口 |
| `routes/index.tsx` | `app/router/route.ts`、`router.ts` | home、project、not-found 的内存路由，navigate、replace、back |
| `routes/route-error-fallback.tsx` 与测试 | `app/router/RouteErrorBoundary.tsx`、`AppShell.test.tsx` | 错误页保留标题栏。重试重挂载当前 route，返回首页恢复路由 |
| `routes/ShellTitleBar`、`components/layouts/TitleBar`、`main-layout` | `app/shell/TitleBar.tsx`、`AppShell.tsx` | 原生透明标题栏，保留系统红绿灯，标题弱化居中，背景跟下方页面一致 |
| `components/layouts/titlebar-drag` | 原生 AppKit titlebar move region | 不迁 DOM contains、Tauri startDragging 或 JS 拖窗 |
| `pages/home.tsx` | `app/home/HomePage.tsx`、`recent-projects.ts` | 保留新建、最近工程。持久化从 localStorage 改为原生 snapshot KV |
| `pages/SettingsDialog.tsx` | `app/settings/SettingsDialog.tsx`、`ThemePresetGrid.tsx` | 左侧导航、明暗系统三态、语言 RadioGroup、43 个预设三色条与勾选、日志说明、关于外链 |
| `ThemeMenu.tsx` 的 ThemePresetGrid | `app/settings/ThemePresetGrid.tsx` | 沿用 Web 顺序，两个列，原生滚轮、箭头、Home、End、Tab、Space、Enter |
| `pages/not-found.tsx` | `app/router/NotFoundPage.tsx` | 404 和返回首页 |
| `pages/project/index.tsx` | `app/project/ProjectPage.tsx` | projectId 隔离存储键，显示时取 lease，卸载时释放 |
| `ProjectLayout.tsx`、`useProjectShell.ts` | `app/project/ProjectLayout.tsx`、`useProjectShell.ts`、`project-shell.ts` | 共享 Group、Panel、PanelShell 与 Divider，提供具名空槽 |
| `SharedControlBridge` | `NativeRoot` 的 ControlEnvironmentProvider | 注入 `nativeCursorLock`。StatusStrip 的 info 数据接线留在第二阶段槽装配 |
| i18n setup | `packages/i18n/src/core.ts`、`app/i18n/index.ts` | 新增无 React 子路径。Web 的入口仍绑定 react-i18next，gpuix 直接订阅 i18next，不加载第二个 React |
| 外链、日志、主题持久化 | `platform/external`、现有 platform/log 与 settings | 外链校验仍在 Rust，主入口初始化真实日志 sink，模式和预设走独立设置字段 |

未迁的死代码：`QueryProvider`、`SectionCard` 没有目标消费者，未复制。Web LoadingProvider 没有外部 producer，未创建第二套加载状态。组件库路由不迁，现有 `src/gallery` 保留。旧 Web、Tauri、packages/ui 未删除。

## 数据和资源 owner

- 工程文档、编辑事务、走带只在 adapters 与 stores。本切片不创建第二份工程数据。
- adapters 已注册 `createNativeBackend` 工厂。首页导入不打开设备，工程页 lease 才打开。
- `NativeRoot` 对同一 renderer 建立一个 frame source，使用原生窗口激活订阅，不新增时钟或激活轮询。
- `getSystemAppearance` 给首帧主题，`subscribeSystemAppearance` 推送变化。模式与配色预设独立持久化。
- 未保存关闭先由原生 predicate 否决。用户选择保存成功或不保存后，异步调用 `closeWindow`。
- 旧关闭回调在外壳卸载后放行。异步保存续体不能关闭已被替换的窗口。

## 与 Web 的差异和原因

| 差异 | 原因与决定 |
| --- | --- |
| 浏览器历史改内存历史 | gpuix 没有 DOM history 或 router，协调者批准最小内存路由，不新增依赖 |
| 路由重试重挂载当前视图，不 reload 整个窗口 | 原生单窗口没有浏览器 reload |
| 标题栏高 28 AX 点，而不是 Web 的 Tailwind h-16 | Live 实测，协调者将 titlebarHeight、trafficLightInset、trafficLightMargin、trafficLightFrameHeight 加入共享度量 |
| Footer 互斥显示 Affect Chain 或 Clip Edit | 新 Footer 切片契约取代 Web 可同时显示两者的 detail-view，协调者批准 |
| 预设是 43 项，不是派发文字的 44 项 | H2 对照 Web 源表，Default 加 42 个 tweakcn 预设 |
| 没有项目页返回按钮 | 第一阶段 Transport 槽为空。协调者批准返回验收移到第二阶段，不在标题栏增加 Web 没有的按钮 |
| 首页 Open 仍创建工程 | 原 Web 本身把 Open 绑定 createProject。保留等价行为，不称其为文件打开能力 |
| 最近工程打开不自动恢复快照 | 与 Web 一致。快照恢复是后续 Arrangement toolbar 的显式命令 |
| 日志页仍为说明文字 | 与 Web 对话框一致。本阶段只配置已存在的真实日志 sink |

## 第二阶段空槽

`ProjectPage.renderSlots(shell)` 返回 `ProjectLayoutSlots`，每项是 ReactNode，空值是 null，不展示假面板。

| 槽 | 待填内容 | 接线 |
| --- | --- | --- |
| transport | TransportBar | onBack 到 router，onToggleBrowser 到 shell |
| browser | BrowserPanel | 外层 Browser Panel 的 handle 与连续宽度 |
| arrangement | ArrangementPanel | 唯一 TimelineController，真实 lane、tracks、readProjectPeaks |
| footer | FooterPanel | shell.footerView、footerCollapsed、selectFooterView、setFooterCollapsed |
| status | StatusStrip | 同一 Footer 状态与共享控件 info |

第二阶段删除 `usePlaybackKey`，由 timeline 唯一处理 Space。本阶段没有 B 键跨切片绘制测试，没有 Arrangement 键盘单 owner 测试，没有文本焦点注入。这些属于第二阶段。

H1 两个临时文件 `theme-mode-setting.ts`、`close-guard-port.ts` 已删除，直接消费主干平台端口。只剩 `layout-constraints.ts` 的 `PENDING_BROWSER_COLUMNS`，值 90 与 140 来自 Footer 分支，Footer token 合入后读取 theme.project 并删除常量。协调者已批准。

## 已运行验证

| 命令或路径 | 结果 |
| --- | --- |
| `pnpm native:build` | 成功，最后一次在 H1 合入后重建 |
| `pnpm exec tsc --noEmit -p apps/gpuix` | 0 错误 |
| `bun test src/app` | 36 pass，0 fail，5 files。包含路由、错误恢复、真实 native lease、设置持久化、系统外观、关闭、滚动、键盘与双语 AX |
| app 随机顺序 seed 7 与 seed 99 | 各 36 pass，0 fail |
| `bun test` 于 apps/gpuix | 862 pass，1 todo，1 fail，864 tests，127 files。唯一失败是主干 tracks 嵌套右键，协调者批准显式基线例外 |
| `bun test src/platform/external` | 1 pass，0 fail |
| `pnpm exec eslint apps/gpuix/src/app apps/gpuix/src/main.tsx apps/gpuix/src/platform/external` | 0 error，0 warning |
| `node scripts/gpuix-main/check.mjs --resolution` | 单一 gpuix renderer 与 vendor React 解析通过 |
| `bun test` 于 packages/i18n，随机 seed 7 与 99 | 各 3 pass，0 fail |
| Web typecheck 与 i18n typecheck | 通过，i18n core 分离未破坏原 Web 入口 |
| `cargo check --workspace && cargo test --workspace` | 通过，49 tests，4 suites，0 fail |
| `bun apps/gpuix/src/app/verification/mutations.mjs` | 13 个变异全部被行为断言捕获，脚本恢复原文件 |
| `node scripts/gpuix-review-scan.mjs` | 0 HARD。唯一 WARN 是 main.tsx 的窗口初始 1280×800，来源 tauri.conf.json，协调者批准 |
| 所有提交 | Ultracite hook 通过，无 no-verify，无 push |

真实 native lease 测试委托真正的 openSession 并记录 handle。首页 handles 为空，进工程收到 accepted，离开后直接调 napi.apply(handle, request) 得到 disposed，不经过 JS facade 的 disposed 早返回。测试重复进入两个工程，finally 清理任何泄漏的 handle。删除 native dispose 的变异会失败。

全仓唯一失败为 `secondary click on an interactive title opens its track context menu`。已在主干单独复现，owner 是 F2 的原生 context-menu 端口与 A3b 的接入。协调者明确要求不要等待 F2，按基线例外交第一阶段 merge_ready。本报告不声称全仓全绿。

## 变异检查

下表来自提交的 `verification/mutations.mjs`，可直接重跑。

| 变异                                             | 失败用例数 |
| ------------------------------------------------ | ---------: |
| dirty 关闭绕过确认                               |          3 |
| 保存失败仍允许关闭                               |          1 |
| 工程 id 不编码到 path                            |          1 |
| 视图漏返回 lease cleanup                         |          3 |
| 语言选择漏持久化                                 |          1 |
| 上一个工程的编辑请求当作新请求                   |          1 |
| 已卸载的关闭 predicate 仍否决                    |          1 |
| 预设点击断开选择                                 |          1 |
| Settings 内 Space 泄漏到播放                     |          1 |
| repair 逃出启动失败边界                          |          1 |
| 箭头焦点不再滚入可见区                           |          1 |
| Tab 焦点不再滚入可见区                           |          1 |
| native dispose 变成 no-op，JS facade 仍 disposed |          1 |

另有两条手工变异：把设置对话框移回第二个根 host 子节点，关闭后主内容树消失，1 个回归失败。恢复旧 Footer 两棵 workspace 树，切视图丢失 Browser 宽度，1 个回归失败。

## 自审结果

两轮独立只读审查。第一轮审完整 diff，第二轮重点审预设网格、持久化和原生释放。审查后只修改本切片拥有路径，公共 API 由协调者仲裁。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| main 在 render 前读共享度量，窗口初始尺寸为字面量 | 汇报仲裁 | 协调者批准 main.tsx 唯一例外；按钮高 14 移入共享 token | main.tsx 注释，scan 0 HARD |
| 语言测试未覆盖 persistLocale 接线 | 必修 | 设置 UI 切语言后读真实临时 settings 文件 | 漏 persistLocale 变异失败 |
| Mock lease 测试未验证真实设备 | 必修 | 保留计数测试，另加真正 native 设备测试 | openSession handle 与 Rust disposed 断言 |
| 只断言 JS disposed 不能证明 Rust 释放 | 必修 | 改直接调用 napi.apply，重复两次 lease | 漏 engine.dispose 变异失败 |
| Footer 切换重挂载 workspace | 必修 | 保持 Group 与 workspace Panel 位置，Browser 尺寸不丢失 | 浏览器 resize 跨 Footer view 回归 |
| 旧项目 clipEditorRequest 打开新工程 Clip Edit | 必修 | 以挂载时请求作为基线 | 跨工程请求回归及变异 |
| 旧关闭回调和保存续体在卸载后仍生效 | 必修 | predicate 退休后放行，续体比对 guard 身份 | 卸载回归及变异 |
| 预设修复写失败会阻止启动 | 必修 | repair 在 preference store 的失败边界内，记录日志并回退 | 只读错误注入与变异 |
| 键盘焦点进入网格裁剪区外 | 必修 | 选项是 ScrollArea 直接子节点，箭头和模态 Tab 负责显露 | 真实 End 截图、wheel 截图、bounds 测试及变异 |
| SettingsDialog 作为第二个根 host，关闭后窗口清空 | 必修 | 放入唯一 AppFrame host 内 | 对话框关闭生存回归及变异 |
| 中文 AX 中 Settings sections 与 Dismiss 写死 | 汇报仲裁 | 协调者新增共享 label ports，本切片传双语文案 | 双语 AX 行为测试 |
| 项目页缺返回入口 | 汇报仲裁 | 协调者明确推迟到第二阶段 Transport 装配 | 本阶段不声称返回真窗验收完成 |

## 真实窗口证据

所有截图在 `evidence/`。每个 service 在取证后立即结束。没有操作用户的 Live，没有停止用户应用。

- 首页打开工程，最近工程落盘后重启仍有记录。
- 设置中切换明暗与中英，关闭对话框后工程内容仍在。
- Modern Minimal 预设切换后关闭进程，重启恢复同一预设。后续 End 选择 Sage Garden 也随重启恢复。
- H1 合入后按当前系统深色首帧启动，System 可选，不再显示缺原生能力的禁用提示。
- H1 前真窗已验证 dirty 红灯否决、取消、再次请求、不保存确认与关闭。H1 后应用直接调用 closeWindow 的分支由行为测试覆盖，原生 closeWindow 的真窗证据在 H1 自审报告。本切片未另做最终 native closeWindow 的整窗点击复验。
- 滚轮负向输入从首屏滚至 Neo Brutalism、Claymorphism 等后续行。End 聚焦最后 Sage Garden，AX y=628、height=55，整项可见。
- 最后一个验证窗口从 6 frames 到 21 frames，最终 p90 为 5.42ms。原始值与进程退出记录见 `evidence/native-verification.json`。这些是 renderer 的 getDebugFrameOverlayStats，不是 JS 定时器计数。

## 与 Live 对比

Live 只读观察时截图窗口为 2560×1049。AX 量尺寸时显示器已改为 1920×1080，scale 未知，窗口为 x0 y139 w1920 h918。两次采样不混算像素比例。

| 产品规则 | Live 实际观察 | 本实现 | 结论 |
| --- | --- | --- | --- |
| 保留原生红绿灯 | AXCloseButton x8 y146 w12 h14，minimize x28，fullscreen x48 | 系统按钮未重画，初始位置取共享实测 token | 一致，见 Live zoom 与 titlebar zoom |
| 标题弱化并居中 | 标题框 x938 y144 w43 h16，位于窗口中心，颜色弱于主要内容 | 标题绝对居中，mutedForeground | 外观一致，字体具体点值不同 |
| 标题栏紧凑高度 | window top139，内容 root top167，差28 AX点 | titlebarHeight=28 | 一致 |
| Titlebar 与 Header 同一表面 | Live 顶部与工具区为连续灰色区域，无网页卡片边距 | titlebar 与 project/Header 使用 muted，同一颜色无 seam | 外观一致；本阶段 Header 槽空 |
| Space 只播放，不激活按钮 | 未在 Live 发送输入 | 本实现通过真 Button、真实窗口键盘行为测试 | Live 未验证 |
| 主题语言保持原有交互 | Live 设置未打开 | 对照 Web SettingsShell、ToggleGroup、RadioGroup、预设网格 | 无 Live 对应验证 |
| 点击 Clip 不打开别的面板 | 只读观察，未点击 | 第一阶段无 Clip 槽内容 | 未验证，第二阶段 |
| 独立高亮、弹层内部交互保持打开 | Live 未交互 | 设置调整后仍打开，截图可见选中态 | Live 未验证 |
| 图标方形、数值宽度稳定 | Live 走带为紧凑控件行 | 标题栏 Settings 20×20，模式行13高，无数值控件 | 数值项不适用 |
| 拖动隐藏光标、滚轮不隐藏 | Live 未交互 | 本阶段无数值拖动；网格滚轮已验证 | 拖动未验证 |
| 分割条连续缩窄，折叠列表固定宽 | Live 未交互 | 复用 A4 Panel，Browser 键盘 resize 跨 Footer view 保持 | Live 未验证 |
| 窄窗 Header 渐进隐藏且可横滚 | Live 未调整窗口 | Transport 空槽 | 未验证，第二阶段 |

## UI 规范第 13 节

| 检查 | 结论和证据 |
| --- | --- |
| 每个控件每个状态放大截图 | 有标题栏、模式默认与选择、预设默认/选择/焦点/hover、禁用 system 历史截图。未逐一覆盖 43 个预设的按下截图，不把它写成全覆盖 |
| 间距同 token | 实测模式相邻水平 gap=2，预设列 gap=4，行 gap=4，来源 control-gap 与 track-gap。`settings-bounds.json` |
| 文字、图标居中 | 标题栏 zoom，模式行 zoom，原生 bounds。列表名称左对齐，选中勾位于预览条右侧 |
| 同组等高，图标方形 | 模式项均13高，Settings 按钮用 transport iconOnly 20×20。预设200×55，同列宽稳定 |
| 紧凑感与 Live 对照 | 标题栏28点对齐 Live。预设网格按 Web 设置交互保留，不声称与 Live 设置页密度一致 |
| 深浅、中英 | `settings-appearance-*-en`、`settings-appearance-*-zh`，Language截图。H1前历史截图中的禁用提示不代表最终能力 |
| Tab、焦点环、Space | 真实 Tab截图，End 聚焦最后一项截图，Space form-selection 不播放行为测试 |
| 拖动、滚轮、弹层保持 | 网格真滚轮已验证，模式和语言调整后对话框保持。分割条真拖动未验证 |
| 可见裁剪与帧数 | ScrollArea 裁剪43个设置项，滚轮与键盘可以访问。设置列表不是虚拟列表，全部43项挂载。Arrangement 裁剪不在本阶段 |

## 未实现或未验证

- Arrangement 组合根以及五个 section 的装配是第二阶段，不在本交付范围。
- 第一阶段项目页没有返回首页的真实控件，协调者明确接受延期。
- Open 没有工程文件格式、原生文件选择或导入。与 Web 的原型行为相同。
- Cmd+Q、Windows 与 Linux 的关闭和窗口 chrome 未验证。macOS 红灯和同步 should-close 路径已验证。
- 没有在用户 Live 内做键盘、拖动或设置交互。Live 的交互规则均按未验证记录。
- 本阶段没有 MotionTabs 动效。装配 Footer 的 MotionTabs 时，组合根还需传 native reduced-motion 值。

## 错题与已验证做法

### 2026-10-15，gpuix 根只能有一个 host 子节点

- 错：把 SettingsDialog 放成 AppFrame 的根 sibling。打开时 anchored 被 setRoot，关闭后整窗空白。
- 对：所有应用弹层放进唯一 AppFrame host。回归同时断言关闭弹层后的主题颜色和主页面存在。
- 因：renderer appendChildToContainer 对非 portal target 调 setRoot，每个新根 host 会替换旧根。
- 见：AppShell.tsx、设置关闭回归。

### 2026-10-15，固定 defaultSize，不拿它追踪折叠状态

- 错：Clip Panel 的 defaultSize 随 footerCollapsed 在0与40%切换，onResize 和 collapse effect 反复重算初始布局。
- 对：defaultSize 保持40%，折叠只走 Panel handle，onResize报告最终值。
- 因：defaultSize参与 Group 初始化，不是受控 size。
- 见：ProjectLayout.tsx，Browser resize 跨 Footer view 测试。

### 2026-10-15，原生滚入视口按直接子节点定位

- 错：ScrollArea只有一个包住43项的 ToggleGroup，scrollIntoView只找到这个大子节点，焦点留在裁剪区外。
- 对：ToggleGroup提供选择上下文，ScrollArea直接持有43个option，键盘移动后显露具体项。
- 因：native scroll_target向上找到scroll handle，再按该父节点的直接 child index滚动。
- 见：ThemePresetGrid.tsx，真实End和Tab边界回归。

## 提交和复核范围

完整 diff 用 `git diff gpuix-migration...HEAD`。作者提交用 `git log --oneline --no-merges gpuix-migration..HEAD`。独立审查分别使用完整 diff，以及预设接入提交 `git show 096cb37`。

截至最后源代码提交，作者提交为 `ad4e1dc`、`6050606`、`9114c7f`、`d1d263a`、`b4b6f6f`、`966a320`、`1ba3416`、`933432a`、`48658ff`、`8fd4480`、`7b8683c`、`68cd1ae`、`16fb488`、`9ec77c5`、`818c1f4`、`096cb37`、`eef0ff2`、`9ed6eba`、`d8b010d`、`8104776`。早期 `6050606` 的 ThemeProvider 实现在 merge H2 时已完全替换为主干版本，不保留第二份主题派生。

进程清理与完整命令结果见 `evidence/final-validation.txt`。最后 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo" | grep -v grep` 无输出，退出码1表示无匹配进程。
