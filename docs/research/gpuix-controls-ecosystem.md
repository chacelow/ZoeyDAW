# zoeydaw 迁移到 gpuix 的控件生态调研

调研日期：2026-10-14。目标是 [remorses/gpuix](https://github.com/remorses/gpuix)，不是 `gpui-shell`。本文只做依赖与行为选型，不实施迁移。

历史范围：下文的“当前”均指调研当日。本仓库的 `apps/web`、`packages/**`、`src-tauri` 已删除，原应用 manifest 与消费者路径仅是历史证据，不是当前开发入口。实际组件与主题 owner 见 [项目面板与共享外观](../architecture/project-panels.md)。

## 结论

`@gpuix/react` 已有原生 Select、Combobox、Tooltip，以及输入、浮层、虚拟列表和 SVG host。不能把这次迁移理解为换一组 React import：当前 Base UI、cmdk、Resizable Panels、图标 React 包和浏览器控件依赖的 DOM、事件和 CSS 并不存在于同名的 GPUIX host 中。[G1] [G2] [G3]

有两组值得先验证的原生社区实现，不能直接判定所有缺口都要重写：

- [`wdcodecn/gpuix-base-ui`](https://github.com/wdcodecn/gpuix-base-ui) 有 Base UI-shaped 菜单、子菜单、Popover、RadioGroup、NumberField、OTPField 和 Form。它针对 gpuix 0.9，仓库 manifest 是 `0.1.0`，不是已确认可安装的发布包。[W1] [W2] [W3]
- [`drewnekota/gpuix-ui`](https://github.com/drewnekota/gpuix-ui) 有原生 Command、Popover、ContextMenu、DropdownMenu、样式变体和主题。其声明的 `@gpuix-ui/*` 包本次公开 npm 查询均返回 HTTP 404，查询时无法公开取得，不代表证明它们从未发布。适合按固定提交评估源码复用，不适合直接照 README 执行安装。[D1] [D2] [D3] [N2]

最关键的现成控件缺口是 DAW 的嵌套 resize、折叠和固定 Device 区域，以及 DragPad 的输入事务与无限拖动。Rust [`gpui-component`](https://github.com/longbridge/gpui-kit) 已有 resizable、dock、menu、table、calendar、OTP 和 editor，但它不是 `@gpuix/react` 的组件包。采用它需要扩展 Rust host 和 JS 契约，并先解决不同 GPUI 来源的兼容性。[R1] [R2] [R3]

**本次没有运行任何候选集成。** 下文的“可用”只表示已在包导出或源码中找到对应实现，不表示已在 zoeydaw 上编译、交互或性能验收。

## 取样与证据边界

### 原应用取样

原应用从 `/Volumes/PSSD/code/zoeydaw` 严格只读读取。该目录含其他会话的未提交修改，本文不把这些内容当作研究 worktree 的代码，也没有复制它们。研究 worktree 基于已提交的 `519d1c46849f7efb45963f9a910b86e6b8bea568`，因此下列消费者描述是原目录的当次观察，不是该 commit 的逐字快照。

读取了原目录 `LESSONS.md`、`docs/architecture/modules.md`、`docs/architecture/project-panels.md`，以及三个实际 manifest：

- `apps/web/package.json`
- `packages/ui/package.json`
- `packages/i18n/package.json`

下文当前版本写的是 manifest 范围，**不是 lockfile 解析后的安装版本**。消费者检查覆盖 `apps/web/src/pages`、`apps/web/src/components`、`apps/web/src/shared/app-shared`，以及 `packages/ui/src` 与 `packages/i18n/src` 的相关导入和实现。

### gpuix 主线与发布边界

| 对象 | 当次观察 | 对本次控件决策的意义 | 一手证据 |
| --- | --- | --- | --- |
| gpuix `main` | `6a5c7c142ac32f9eb0caefe0121be995cfc18631`，提交时间 2026-10-11T16:52:14Z | 本文的 main-only API 均以此提交为准 | [commit](https://github.com/remorses/gpuix/commit/6a5c7c142ac32f9eb0caefe0121be995cfc18631) |
| npm `@gpuix/react` | `latest = 0.10.0`，npm 发布时间 2026-09-23T08:16:25.684Z；dist-tags 当次只有 `latest` | 未发现较新的 npm beta、next 或 canary；不能把 main 当已发布 0.10 | [registry 元数据](https://registry.npmjs.org/@gpuix%2Freact) |
| GitHub React release | tag `@gpuix/react@0.10.0`；GitHub 显示 published_at 为 2026-09-21，created_at 为 2026-09-23，release 页面后来又更新了资产 | 日期字段有差异；npm 包发行时间以 registry 为准，release 说明不能替代包导出检查 | [release](https://github.com/remorses/gpuix/releases/tag/%40gpuix/react%400.10.0)、[release API](https://api.github.com/repos/remorses/gpuix/releases?per_page=10) |
| 0.10 的原生 React 控件 | 导出 Select、Combobox、Tooltip、`motion`、AnimatePresence | 可直接评估这些原生包 API，不必重新实现选择器和 tooltip | [tag 下 index.ts][G1] |
| main-only React 控件 | main 新增 Button、`buttonProps`、Dialog 各 part、DismissableLayer、`pushDismissLayer`；公开导出 `createPortal` | Dialog 与统一 dismiss/focus 层不能当 npm 0.10 功能；使用时必须选择源码构建或等待发布 | [固定 main index.ts][G2]、[Dialog 实现][G4] |
| 主线 host | `StyleDesc`、GPUIX 自有 `HostProps`，支持 `div/text/img/svg/input/textarea/anchored/code/diff/markdown/virtual-list` | 没有通用 HTML、DOM SVG 子元素或 CSS class 接口；同名 JSX 不代表浏览器 | [host 类型][G3] |

Context7 `/remorses/gpuix` 查到了 Select、Combobox、Tooltip、原生 host 类型和浮层建议。它也返回了计划文档中的 `<editor>` 例子。**当前 main 的 `ElementType` 中没有 `editor`**，因此本文不把计划里的例子当已实现能力。[G3] [G5]

### 分类规则

| 分类 | 本文含义 |
| --- | --- |
| 原生包可用 | 找到面向 gpuix 的已发布包 API，仍需应用集成证明 |
| 原生源码候选 | 找到 gpuix host 实现，但未确认发布或版本不匹配；属于原生可复用方向，不是即装即用的包 |
| 资产或 headless core 可复用 | 只复用 SVG、数据、状态、验证、几何或翻译；视图、事件、焦点仍须适配 |
| 需要 bridge | 候选在 Rust GPUI 或平台层已有实现，gpuix 尚未暴露所需 API |
| 未找到现成直接方案 | 本次查阅的 gpuix 主线、发布包、社区仓库与 registry 中没有找到完整对应控件；不宣称整个生态绝不存在 |

React Native 示例只证明某库支持受控值接口或无 DOM 的状态层，**不证明 React Native 组件能在 GPUIX 直接渲染**。

## 实际消费者优先级

| 优先级 | 原目录实际使用点 | 需要保留的行为 |
| --- | --- | --- |
| P0 | `pages/project/ProjectLayout.tsx`、`useProjectShell.ts`、`sections/ArrangementPanel/Timeline/TimelineCanvas.tsx`、`components/panels/` | Browser 横向折叠、Browser 内双栏、Timeline 控件栏分割、主区域与 Clip 高度调整；Device 固定区域不参与相邻 Panel 竞争；激活边框不改变几何 |
| P0 | `sections/TransportBar/`、`TrackMixer/`、`TrackRouting/`、`AudioEditor/Parameters/`、`FooterPanel/EffectChain/` | Button、DropdownButton、DragPadNumber、DragPadBar、DragPadToggle、PanControl；参数改变保留编辑事务和撤销语义 |
| P0 | `TrackHeader/TrackMenu/`、`ArrangementPanel/canvas/ContextMenu/` 及 rulers、automation、clip 的菜单项 | 按画布命中对象打开菜单、子菜单、checkbox/radio 项、禁用项、Esc、键盘导航和焦点归还；菜单不得被虚拟列表覆盖 |
| P0 | `sections/BrowserPanel/`、`TransportBar/index.tsx`、`StatusStrip/`、`SettingsDialog.tsx` | Lucide 与 Phosphor 图标、中文与英文、紧凑尺寸、标题栏/面板焦点与设置弹窗 |
| P1 | `packages/ui/src/controls/PopupButton/`；应用 `pages/library/index.tsx` 有演示 | 任意 popup 内容内拖 DragPad 不关闭；当前 DOM workaround 含 pointerup 后 500ms grace，迁移要保留目的，不照搬计时补丁 |
| P2 | UI 包的 Command、DataTable、Calendar、InputOTP、EmojiPicker、CodeEditor、Chart、Form 及 stories | 本次未发现它们作为当前 DAW 页面主要消费者；不能为了共享库清单，把所有这些控件变成迁移前置条件 |

`packages/ui/package.json` 仍声明 `radix-ui`，但对原目录 UI 源码和 web 源码的 `from "radix-ui"` 搜索没有匹配。当前实际通用控件主要已经使用 `@base-ui/react/*`。这说明 Radix 是待核对的依赖残留，不是另有一整套 DAW Radix 消费者；本次没有删除任何依赖。

## 依赖与行为决策矩阵

下表中的候选版本在后面的“最新版本观察”统一列出；源码候选另列固定 SHA。每行都区分保留什么、缺什么和仍需证明什么。

| 当前依赖或行为 | 现成候选与分类 | 兼容性证据 | 迁移含义 | 剩余证明 |
| --- | --- | --- | --- | --- |
| Base UI Button、Toggle、RadioGroup、Checkbox、Progress、Separator | Button 选 gpuix main，其他先看 `gpuix-base-ui` 的原生源码；`drewnekota/gpuix-ui` 也是源码备选 | gpuix main `buttonProps`、Button 导出；W 的 form/display/controls 分组、D 的原生控件清单 [G2] [W1] [W3] [D1] | 不直接运行 `@base-ui/react`。原 Base UI 的 `render`、事件 details、DOM ref 和 className 合同需要逐项转换。Settings 语言 RadioGroup、Transport toggles 和模拟 CPU Progress 优先 | 键盘 Space/Enter、disabled、pressed 与 focus-visible；中文文本和 Transport 紧凑尺寸；Screen Reader 语义仍需原生验收 |
| DropdownButton 的值列表 | `@gpuix/react` Select，原生包可用；菜单型动作选 W `Menu`，原生源码候选 | Select 已发布并拥有受控值、open 状态和关闭后触发器 focus；W 菜单有 collection 与 submenu [G1] [G6] [W3] | 把“选一个参数值”和“执行命令”分开，不能把全部 DropdownMenu 机械换成 Select。Routing、warp mode、grid、AutomationSelector 是第一批值选择消费者 | label 与 value 分离、disabled、typeahead、长列表、滚轮、选择时只提交一次事务 |
| Track 与 Canvas ContextMenu、子菜单 | W `ContextMenu` + `Menu.SubmenuRoot/SubmenuTrigger`，原生源码候选；Rust `gpui-component::menu` 是 bridge 备选 | W overlay 实现明确导出子菜单；D ContextMenu 重用 DropdownMenu 项，但所读导出未见 submenu [W3] [D3] [R3] | W 比 D 更接近本应用已有子菜单合同。保留画布命中数据和命令 owner，只换菜单展示和事件入口；不能靠 Select 模拟右键菜单 | 右键与 Ctrl-click、窗口坐标和缩放、嵌套菜单 Esc 层级、禁用项、键盘导航、触发器卸载、菜单上方/下方虚拟列表的命中与遮挡 |
| PopupButton、Popover 任意内容 | W Popover 或 D Popover，原生源码候选；底层已有 `<anchored deferred>` | 两个原生社区实现均不是 DOM portal；gpuix 的 floating 控件建立在 anchored 层 [W1] [W3] [D1] [G3] [G6] | 复用现成 anchored popup，不从普通 absolute div 造浮层。将 popup 内拖拽是否可 dismiss 建模为原生交互状态，不搬 `document.documentElement` class 和 500ms grace workaround | 内嵌 DragPad 的按下/拖动/松手不关闭；Esc、outside press、失焦、窗口 resize、边缘翻转与顶层 dismiss 顺序 |
| SettingsShell 的 Dialog，未来 AlertDialog | gpuix main Dialog，原生源码；npm 0.10 不含；W AlertDialog 是源码候选 | main DialogPortal 为全窗口 anchored，modal occlusion、Tab 限定、initial/final focus、Esc；W AlertDialog 禁止 pointer dismissal [G4] [W3] | 优先官方 Dialog，而不是增加第二套 modal 框架。源代码构建和发布包路线不能混用；保留 SettingsShell 的导航和应用 store | Select 位于 Dialog 内时层级正确、Tab/Shift-Tab 环绕、返回先前焦点、窗口改变大小、多个弹层只关闭最顶层；alertdialog 的确认/取消行为 |
| Tooltip 与共享 InfoChannel | `@gpuix/react` Tooltip，原生包可用；InfoChannel 的业务数据继续复用 | Tooltip 在 0.10 导出且 native overlay 圆角在 release 中有修复 [G1] [G7] | Tooltip 不替代 Footer 的固定控件帮助合同；共享控件环境继续由应用 owner 提供。不能仅因已具备 tooltip 就把静态说明改成动态资源内容 | hover delay、键盘 focus、disabled trigger、不同浮层遮挡；当前 DAW 的 Footer InfoChannel 仍正确显示组件类型说明 |
| cmdk 与命令面板 | D `Command`，原生源码候选；简单单值搜索先用 gpuix Combobox | D 源码有 `commandScore`、item registry、CommandInput/List/Group/Empty；gpuix Combobox 的默认过滤是 prefix 优先再 substring，并不是 cmdk 的所有语义 [D4] [G6] | 当前 DAW 未见命令面板消费，延后整体 Command 迁移。Browser 搜索不是强制接入 cmdk 的理由；不得把 Combobox 当作完整 cmdk 克隆 | 自定义排名、keywords、group、空态、箭头/Enter、选中项滚入可见区、中文搜索；D 与 0.10 的事件和焦点 API 兼容性 |
| react-resizable-panels | Rust `gpui-component::resizable` 与 `dock`，需要 bridge；未找到完整直接 gpuix 包 | R 已有 `resizable_panel().size().size_range()`、DockArea；gpuix 自有导出和两套社区清单没有对应 Panel/Group [R2] [R3] [G2] [W1] [D1] | 先对现成 Rust resizable 做窄接口 bridge 可行性评估，再决定 JS 原生 resize 控件。不要为两个固定区开整套 docking 框架。现有 numeric/string size 单位与 collapse 句柄 API 不会自动保留 | 原布局嵌套分割、最小值、收起/恢复前尺寸、键盘调整、resize 后 Canvas 几何一致；Clip 展开不挤掉固定 Device；7px 命中区和固定边框合同 |
| DragPad、PanControl、NumberField | W NumberField 的 ScrubArea/Input 可作原生源码参考；领域值、格式化与编辑事务可复用 | W 有 `NumberField.ScrubArea`，但 `ScrubAreaCursor` 源码返回 null；原 DragPad 使用 document、pointer lock、全局事件、cursor recenter [W4] | 不能把“有 NumberField”当成无限拖动已解决。重用数值模型和项目 gesture owner；需要调查 gpuix host 的全局鼠标、捕获、cursor warp 能力及缺失 bridge | 无边界长拖、细调、wheel、Esc/失焦取消、双击/键盘预编辑、中文 IME、输入原生 Undo 与项目 Undo 分离；native warp 后 popup 不误关 |
| lucide-react | `lucide-static` SVG，资产可复用 | 官方 static 分发；gpuix `<svg src/source>` 读 SVG 资源而不是 React DOM path 节点 [I1] [G3] | 保留图标名称与视觉资产，替换 React icon wrapper；只打包实际使用图标。`LucideIcon` prop 类型改为本地 native icon 标识或组件合同 | 描边在 12/14/16px 尺寸的清晰度、style.color tint、stroke 宽度、主题切换、图标名称升级差异、打包后的资源定位 |
| @phosphor-icons/react | `@phosphor-icons/core`，资产可复用 | 官方 core 明确提供按 weight 分组的 SVG 和 catalog；gpuix SVG 是 monochrome tint [I2] [G3] | Transport 的 HandTap、Keyboard、WaveSine 等直接保留对应权重资产，不换成近似 Lucide 图标。duotone 不能假定完整保真；需要时走 img 保留原色/透明度 | fill/stroke、regular/bold/duotone 视觉，hover/pressed tint；资源许可证保留；不引入 React Native SVG renderer |
| react-hook-form 与 Form wrapper | 现有 `Controller/useForm` 状态层，headless 可复用；TanStack Form 是可选 headless 候选 | RHF 官方演示受控非 DOM TextInput；TanStack Form 官方同样提供 handleChange/handleBlur 接口 [F1] [F2] | 优先保留已有 RHF，改 value/onChange/onBlur 和 focus adapter；本地 `form.tsx` 的 HTMLElement、Base UI mergeProps、HTML label/表单提交不能直接搬。没有消费者时不必引入另一套表单库 | 将 gpuix `event.value` 传给 field，而非伪造 DOM event；dirty/touched、异步错误、提交、聚焦首个错误、IME、卸载清理；RN 文档不等于 GPUIX 集成证明 |
| TanStack Table 与 DataTable | `@tanstack/table-core`，headless 可复用；React adapter 条件评估；Rust Table 为 bridge 备选 | 官方 v9 文档把 table model 与渲染分离；R 有 TableState/Delegate；当前 DataTable 是 HTML Table + tooltip + DOM 测量 + nuqs [T1] [R2] | 保留排序、过滤、分页和 row id 逻辑，native rows/cells 另接。当前 v8 hooks 与最新 v9 `useTable/tableFeatures` 不同，renderer 迁移不应顺带自动升级全部 API。nuqs 的浏览器 URL owner 不能直接当 native 状态 owner | 列尺寸、pinned 列、横向滚动、焦点导航、row selection、虚拟化；v9 React adapter 的具体依赖仍须审计；不能把 Markdown table 当交互 DataTable |
| Calendar、DateSelector、react-day-picker | date-fns 日期逻辑，headless 可复用；R Calendar/DatePicker 需要 bridge；未找到直接 gpuix 日历包 | 原 Calendar 基于 DayPicker；R 有 calendar 源码；gpuix host 没有 table/day picker 控件 [R3] [G3] | 当前 DAW 无主要消费，延后。不得为带有 Calendar 的 DataTable/Gantt 库存反向增加 DAW 范围。采用 date-fns 不会自动带来日期选择 UI | 单日/区间、locale、week start、disabled dates、DST/timezone、键盘和跨月选择；Rust 日期类型与 JS Date 的时区边界 |
| input-otp | W OTPField，原生源码候选；R OtpInput 需要 bridge | W form 源码有字符 slot、输入与 focus 管理；R 有 otp_input.rs [W4] [R3] | 有现成原生候选，不必移植浏览器 input-otp 的隐藏 input、selection 与密码管理器技巧。当前 DAW 没有 OTP 验收需求 | 整串粘贴、Backspace、左右移动、完成回调、过滤和长度、IME；不能承诺 browser autocomplete/SMS autofill 在桌面 host 可用 |
| Frimousse emoji picker | `@emoji-mart/data` 数据可复用；未找到现成直接 gpuix picker | Frimousse 本地 wrapper 含 HTML button、CSS、viewport；emoji-mart 提供独立数据包；现有 gpuix native 列表/输入可承载后续 UI [E1] [G3] | 先保留 Unicode、分类和搜索数据，不直接使用 web picker；现阶段不实现没有 DAW 消费者的功能 | 数据所含 Unicode 版本与新 emoji、中文搜索数据、肤色/ZWJ 序列、颜色 emoji 字体回退、虚拟列表键盘导航；真实 glyph 显示尚未验证 |
| react-ace + ace-builds CodeEditor | gpuix `<code>` 为只读代码展示，原生包方向；R `InputState` editor 为需要 bridge 的编辑候选 | gpuix CodeProps 的专用属性为 code/language/path/showLineNumbers/theme，未提供可编辑代码 value、编辑器状态或补全接口；R 文档展示 InputState editor [G3] [R2] | `<code>` 不能替代原 wrapper 的编辑、补全、snippet、Tab 缩进和 wrap。简单 textarea 也不等价。若未来必须保留 Ace，应另评估显式 WebView，不能称作 native package 迁移 | 编辑 Undo、IME、selection、语法高亮、补全、snippet、快捷键、长文档与滚动；R 与 gpuix fork 合并成本。Context7 的计划 `<editor>` 例子不计入能力 |
| Recharts、ChartContainer | `d3-shape` 数学/路径生成，headless 可复用；R Chart 需要 bridge；未找到完整直接 gpuix chart 包 | D3 shape 是 shape generator，R 有 Line/Bar/Area/Pie/Radar 等；gpuix `<svg>` 是整份资源，不是 DOM SVG 子树 [C1] [R3] [G3] | Recharts 新 canary 仍不能因为是 React 就直接运行。静态图可生成完整 SVG 资源或图像，交互与命中另适配；实时 DAW waveform/meter 不是 Recharts 换包问题，归渲染报告 | tooltip/legend、resize、主题、命中、数据更新、长序列；SVG monochrome host 不适合多色图，需 img/原生绘制或 Rust 图表候选 |
| CSS、Tailwind、CVA、clsx、tailwind-merge | D `@gpuix-ui/core` 的 `sv/sx/mergeStyle` 为原生源码候选；metrics JSON、语义 token、Culori 色彩逻辑为数据/纯逻辑复用 | gpuix `StyleDesc` 是有限结构化样式；D sv 返回 style 对象，其实现明确区分 CSS class；当前 cn 是 class 合并 [G3] [D5] | 保留设计值与 variant 语义，不保留 class 字符串作为 native 样式。CVA/clsx/tailwind-merge 可在 JS 运行，但输出不能被 host 自动消费。Tailwind v4 新版本和 insiders 都不解决 native 样式执行 | token → StyleDesc 映射的支持范围、OKLCH 等颜色转换、hover/active/focus-visible 优先级、字体测量、中英文、行高、Canvas 和 hit geometry 同源；不另维护第二份手写尺寸 |
| i18next 浏览器检测 | i18next core 与 `useTranslation` 为 headless 候选；持久语言和 OS preferred locale 需要 native adapter，未找到 gpuix 专用 detector 包 | detector 官方文档以 localStorage/navigator/document 为检测源并支持自定义 detector；本地 setup 明确只用 localStorage、navigator [L1] | 保留资源、fallback `zh-CN`、支持语言与 key。替换检测/缓存和 `useChangeLocale` 对 localStorage 的写入；优先显式存储用户选择，再读真实 OS locale。不能假设 Node ICU locale 等于 macOS 用户首选语言 | 首次启动、已选语言优先级、未知地区映射、重启持久化、系统偏好变更、动态切换；Trans 内嵌 HTML 标签和方向设置需要单独审计 |

## 最新版本观察，含预发布

以下数据来自各包的 npm registry 文档，取样日期均为 2026-10-14。这是版本取样清单，不是升级计划；本次选择最新相关的 gpuix 控件候选，不要求把已工作的 RHF、TanStack 或 i18next 顺带升级。这里只比较版本和渠道，不将“更新”当成“已兼容 gpuix”。`beta`、`next` 标签可能保留旧版本，不能只按标签名判断新旧。

| 包 | 原目录 manifest | 最新稳定版本与 npm 日期 | 值得关注的其他渠道，当次观察 | 一手元数据 |
| --- | --- | --- | --- | --- |
| `@base-ui/react` | UI `^1.6.0` | `1.9.0`，2026-10-09 | dist-tags 未见其他渠道 | [registry](https://registry.npmjs.org/@base-ui%2Freact) |
| `radix-ui` | UI `^1.6.0`，源码导入未匹配 | `1.8.1`，2026-10-12 | `next=1.8.2-rc.1791897977948`，2026-10-13 | [registry](https://registry.npmjs.org/radix-ui) |
| `cmdk` | UI `^1.1.1` | `1.1.1`，2025-03-14 | `beta=1.0.3-beta.0`，并不比稳定版本新 | [registry](https://registry.npmjs.org/cmdk) |
| `react-resizable-panels` | web/UI `^4.5.1` | `4.14.5`，2026-10-12 | `alpha=4.7.1-alpha.1`；`next=1.0.0` 均不能当最新能力 | [registry](https://registry.npmjs.org/react-resizable-panels) |
| `lucide-react` / `lucide-static` | React `^0.555.0`；static 未使用 | 都为 `1.57.0`，2026-10-14 | `next=1.3.0`；React `dev=0.554.0-rc.0` 比稳定版旧 | [React registry](https://registry.npmjs.org/lucide-react)、[static registry](https://registry.npmjs.org/lucide-static) |
| `@phosphor-icons/react` / `core` | React `^2.1.10`；core 未使用 | React `2.1.10`，2025-05-22；core `2.1.1`，2024-03-29 | 两包未见其他 dist-tag | [React registry](https://registry.npmjs.org/@phosphor-icons%2Freact)、[core registry](https://registry.npmjs.org/@phosphor-icons%2Fcore) |
| `react-hook-form` | UI `^7.56.4` | `7.90.0`，2026-10-11 | `beta=8.0.0-beta.4`，2026-09-26；`alpha=8.0.0-alpha.5`；`next=7.60.0-next.0` | [registry](https://registry.npmjs.org/react-hook-form) |
| `@tanstack/react-table` / `table-core` | React `^8.21.3`；core 非直接依赖 | 都为 `9.3.1`，2026-10-12 | `beta=9.0.0-beta.80`、`alpha=9.0.0-alpha.54` 已不是最新版本 | [React registry](https://registry.npmjs.org/@tanstack%2Freact-table)、[core registry](https://registry.npmjs.org/@tanstack%2Ftable-core) |
| `@tanstack/react-form` / `form-core` | 未使用 | 都为 `1.33.5`，2026-08-11 | `alpha=2.0.0-alpha.2`，2026-08-21 | [React registry](https://registry.npmjs.org/@tanstack%2Freact-form)、[core registry](https://registry.npmjs.org/@tanstack%2Fform-core) |
| `react-day-picker` / `date-fns` | UI `^10.0.1` / `^4.1.0` | `10.0.2`，2026-09-30 / `4.4.0`，2026-05-29 | DayPicker `next=10.0.0-next.6` 已旧；date-fns `next=5.0.0-alpha.0` | [DayPicker registry](https://registry.npmjs.org/react-day-picker)、[date-fns registry](https://registry.npmjs.org/date-fns) |
| `input-otp` | UI `^1.4.2` | `1.5.0`，2026-08-18 | `beta=1.5.0-beta.2` | [registry](https://registry.npmjs.org/input-otp) |
| `frimousse` / `@emoji-mart/data` | UI `^0.3.0` / 未使用 | `0.4.0`，2026-09-21 / `1.2.1`，2024-04-25 | Frimousse `beta=0.1.0-beta.4` 已旧；data 未见其他渠道 | [Frimousse registry](https://registry.npmjs.org/frimousse)、[data registry](https://registry.npmjs.org/@emoji-mart%2Fdata) |
| `react-ace` / `ace-builds` | UI `^14.0.1` / `^1.43.6` | `15.0.0`，2026-07-29 / `1.44.0`，2026-05-11 | 两包未见其他 dist-tag | [React registry](https://registry.npmjs.org/react-ace)、[Ace registry](https://registry.npmjs.org/ace-builds) |
| `recharts` / `d3-shape` | UI `3.8.0` / 未使用 | `3.10.1`，2026-07-25 / `3.2.0`，2022-12-20 | Recharts `canary=3.11.0-canary.6`，2026-10-13；D3 `next=2.0.0-rc.1` 已旧 | [Recharts registry](https://registry.npmjs.org/recharts)、[D3 registry](https://registry.npmjs.org/d3-shape) |
| `class-variance-authority` / 新包 `cva` | `^0.7.1` / 未使用 | 旧包 `0.7.1`，2024-11-26；新包 `latest=0.0.0` 是占位历史版本 | 新包 `cva@beta=1.0.0-beta.12`，2026-09-17，repo 为 `joe-bell/cva`；旧包 canary `0.7.1-canary.2` | [旧包 registry](https://registry.npmjs.org/class-variance-authority)、[新包 registry](https://registry.npmjs.org/cva) |
| `clsx` / `tailwind-merge` | `^2.1.1` / web `^3.4.0`、UI `^3.6.0` | `2.1.1`，2024-04-23 / `3.7.0`，2026-09-12 | merge `dev=3.7.0-dev.8396cc3d1f18c143a608a08ce8d2ca7487aa7b75` | [clsx registry](https://registry.npmjs.org/clsx)、[merge registry](https://registry.npmjs.org/tailwind-merge) |
| `tailwindcss` | web `^4.0.0`，UI `^4.3.2` | `4.3.3`，2026-07-16 | `insiders=0.0.0-insiders.1a38f84`；`next=4.0.0` 已旧 | [registry](https://registry.npmjs.org/tailwindcss) |
| `i18next` / `react-i18next` / browser detector | `^24.2.3` / `^15.5.1` / `^8.0.2` | `26.4.4`，2026-10-12 / `17.0.16`，2026-10-06 / `8.2.1`，2026-02-12 | core 和 detector 未见其他渠道；React `next=10.0.0-alpha.3` 已旧 | [core registry](https://registry.npmjs.org/i18next)、[React registry](https://registry.npmjs.org/react-i18next)、[detector registry](https://registry.npmjs.org/i18next-browser-languagedetector) |

## 原生候选的发布、许可证和兼容性

| 候选 | 固定状态与来源 | 兼容性与当前风险 | 判断 |
| --- | --- | --- | --- |
| `remorses/gpuix` | Apache-2.0；已发布包和 main 的边界见上文 [G1] [G2] | 同一 renderer 的官方实现，依赖最少；Button/Dialog 尚无新 npm 发布 | Select/Combobox/Tooltip 首选官方；Dialog 选官方 main 的已实现 API，但不能隐含承诺发布路线 |
| `wdcodecn/gpuix-base-ui` | MIT；main `4f8cc44e2ddf20980f820107273961849f7ead7f`，2026-09-18T02:04:52Z；manifest `0.1.0` [W1] [W2] | manifest 精确依赖 `@gpuix/react=0.9.0`、`@gpuix/native=0.9.0`、`react=19.3.0`，不是宽松 peer；公开 npm 查询 `gpuix-base-ui` 为 HTTP 404，查询时不可公开取得；不是 Base UI 官方移植 | 菜单、子菜单、Popover、RadioGroup、OTPField 优先源码候选，先审核事件/focus/overlay 与选定 gpuix 版本的差异 |
| `drewnekota/gpuix-ui` | MIT；main `33527c33b1c6f9823374eef6edd3912d5ab7a5bf`，2026-09-07T13:21:07Z；声明的包是 `@gpuix-ui/core`、`@gpuix-ui/primitives`、`@gpuix-ui/react`，manifest 版本 `0.1.0` [D1] [D2] | primitives peer `@gpuix/react=^0.7.0`，按 0.x semver 不包含 0.10；workspace core 也要一并处理；三包公开 npm 查询 HTTP 404，查询时不可公开取得 [N2] | Command、Popover、sv/sx 有实际原生实现，不从零重建；不把其 ContextMenu 当完整带子菜单替代 |
| `kotop21/gpuix-ui` | MIT；main `39e322a93bbbefd7f82d5ba56ca439ab54a732b5`，2026-09-12T11:19:30Z；README 使用不带 scope 的 `gpuix-ui` CLI；npm 同名包当次 `0.1.0`，2026-09-12 [K1] [N3] | README 标 gpuix 0.7；registry 元数据没有 repository 字段，尚未独立证明 npm 同名包就是此 repo。旧文件选择器通过 osascript/PowerShell/zenity，而 gpuix 0.10 已有官方 `promptForPaths` | 排在 W、D 后面。可借鉴静态 Lucide 图标，不为其平台 CLI 再引一套 picker；registry 包归属仍需 tarball 比对 |
| `longbridge/gpui-kit` 的 `gpui-component` crate | Apache-2.0；旧 repo `longbridge/gpui-component` API 重定向至本 repo；GitHub 最新观察 `v0.7.3`，2026-10-12；tag manifest component `0.7.3` [R1] | 它精确使用 `gpui-pre=0.3.9`，gpuix 则用自己 zed submodule 的 path GPUI。不能把两套 `Entity/Window/Context` 当同一种 Rust 类型，也未见 gpuix 已依赖此 crate [R1] [R4] | resizable、table、calendar、editor 是明确现成实现，但要先证明同一 GPUI 来源、实体生命周期、JS callback 与 native owner 能接通；不迁移到 gpui-shell |

主线的 Button/Dialog 不需要因为“未发布”就被排除。用户已接受预发布与最新方案，因此应将“固定 main + 明确构建/版本策略”作为有效候选，与已发布 0.10 对比，而不是退回旧版 Web UI。另一方面，本次无法从公开 registry 取得的社区包不能在报告里伪装成可直接 `bun add` 的 npm 包。

### 同名仓库与 npm 包不是同一个身份

`npm search` 命中的 **`gpuix-ui`** 是不带 scope 的包，不是 `@gpuix-ui/core`、`@gpuix-ui/primitives` 或 `@gpuix-ui/react`。`drewnekota/gpuix-ui` 和 `kotop21/gpuix-ui` 是两个不同 owner 的同名 GitHub 仓库。不能把不带 scope 包的搜索结果或下载可用性转用于 scoped 包，也不能用 `bunx gpuix-ui` 代替 `@gpuix-ui/react` 的安装证明。

协调者于同日独立用静态 reader 和 curl 复查 `gpuix-base-ui`、`@gpuix-ui/core`、`@gpuix-ui/primitives`、`@gpuix-ui/react`，确认实际 HTTP 状态为 404，正文是 JSON `Not found`，不是仅由页面提取失败推断。两个对应 GitHub 仓库可公开访问。这里记录的是 **查询时无法公开取得 registry 包**，不推断历史发布、删除、私有状态或其他 registry 的情况。[N2]

因此当前推荐路径是固定 owner、repo、SHA 后评估源码；安装路径须另外核对确切 npm 名称、版本、tarball 内容与源码对应关系。本次没有运行任何安装命令。

## 五项优先建议

1. **官方 gpuix 控件先行。** 已发布 Select/Combobox/Tooltip 直接进入后续验证候选；main 的 Button/Dialog/DismissableLayer 作为单独版本路线评估。第一个验收用 Settings Dialog 内打开 Select，再检查 Esc、Tab、焦点归还和浮层遮挡，不先造 popup 框架。[G1] [G2] [G4]
2. **用 `wdcodecn/gpuix-base-ui` 检验 DAW 菜单合同。** 重点是画布右键、子菜单、checkbox/radio 与 PopupButton。它有更接近当前 Base UI anatomy 的原生源码，但仍要做 0.9 → 选定 gpuix 版本的接口审计。只复用实际消费者所需部分，不移植全部 37 个 family。[W1] [W3]
3. **把 resizable 与 DragPad 当迁移的先决验证，而不是尾部修饰。** Rust resizable 已存在，先评估最小 bridge；DragPad 有 NumberField 参考但无限拖动没有现成证明。没有折叠/恢复、固定 Device 不被挤压、拖动撤销和输入预编辑的证据，不能宣称 DAW 控件迁移可交付。[R2] [W4]
4. **图标保留资产，样式保留数据。** 用 `lucide-static` 和 `@phosphor-icons/core` 的真实使用子集接 native SVG/img；保留 metrics JSON 与语义 token。用 D 的 `sv/sx` 源码评估样式变体，不为搬 Tailwind 字符串设计完整 CSS engine。[I1] [I2] [D5]
5. **保留 headless 逻辑，推迟无 DAW 消费者的浏览器控件。** 语言资源、i18next、现有 RHF 受控状态和 TanStack table model 值得复用。先解决语言检测与持久化 adapter；Command 如有明确需求，再评估 D 的原生实现。Calendar、OTP、emoji、CodeEditor 和通用 Chart 不成为当前 DAW 迁移前置范围。[F1] [T1] [L1] [D4]

## 后续证明与本次未做的工作

本次没有安装依赖、下载到应用、编译、测试、格式化、启动应用、启动服务或更改原目录。没有修改 manifest、lockfile 或源码。

后续若用户授权实现，原生控件需要在选定 renderer 版本下验收，而不是只跑 Web 测试：

- 0.10 包与固定 main 分别列出真实 imports 和版本，避免 TypeScript 编译用 main 类型、运行却加载 0.10 binary。
- 用当前 DAW 菜单、Settings、Browser 双栏、Clip/Device 显隐和 Transport 参数作为最小验证集合。
- 确认 native accessibility 的角色、名称、状态和 focus 顺序。React `aria-*` 字段存在不等于平台无障碍已验收。
- 验证中文 IME、文字测量、键盘焦点、输入本地 Undo、项目 Undo、取消手势和组件卸载。
- 验证多次 resize、DPI/缩放、窗口边缘 popup、overlay 与 virtual-list 的遮挡。原应用 LESSONS 中的 overflow 裁切和 CSS/Canvas 几何分离仍是验收项。
- Rust bridge 必须先统一 GPUI 来源，再证明实体释放、回调线程、状态 owner 与热更新/卸载路径；不把外部 Rust 控件状态复制成第二份工程状态。

## 搜索过程与未找到项的范围

一手检索包括 gpuix GitHub main 树、固定提交源码、React 0.10 tag、GitHub releases/tags 和 npm 元数据；Context7 查询 `/remorses/gpuix`、GPUI Component、TanStack Table、TanStack Form、React Hook Form 的相关文档；随后核对原始 GitHub 实现，避免把文档计划当发行功能。

GitHub repository search 使用 `gpuix components`、`gpuix resizable`、`gpuix icons`、`gpuix table`。components 找到 W、D、K 三个相关仓库；resizable、icons、table 的 repository query 当次返回零项。继续 forms/calendar query 时遇到 GitHub search rate limit，所以改查官方树、社区公开清单、npm registry `search?text=gpuix&size=40` 和 web search。npm 当次搜索结果含 `gpuix-ui`，未出现专用 gpuix resizable、calendar、table 或 emoji 包。这个结果只限制本次“未找到”结论，不证明整个生态不存在实现。

W 与 D 没有在 Context7 的库解析结果中出现，故以固定 GitHub 源码和 registry 可用性为准。i18next 的补充 Context7 查询超时，使用 detector 官方 README 和现有代码核对边界。

## Ego 浏览器与 X 的补充证据

2026-10-14 使用用户已登录的 Ego 浏览器，在共享 `TaskSpace24` 的独占 `p1` 实际检索公开 X 页面。复用同一页面导航，没有新建 Space/Page，没有操作 `p2` 或 `p3`，没有登录切换、发帖、回复、点赞、关注、收藏或读取私信。以下不是搜索引擎摘要或协调者转述的替代品，而是本 worker 在页面上读取的搜索结果、帖子正文、公开链接和 `<time datetime>`。

### 六组实际搜索与负结果

所有查询使用 X 的 `最新` 渠道 `f=live`。可见结果是当次页面窗口，不代表遍历全部历史帖子。

| 实际查询 | 搜索页 | 当次有用结果与限制 |
| --- | --- | --- |
| `from:__morse gpuix` | [作者搜索](https://x.com/search?q=from%3A__morse%20gpuix&src=typed_query&f=live) | 找到 disktree 的 HMR/npm 发行帖、Solid 公告及作者 GitHub 链接回复。下面记录独立打开后的正文，不仅复制已有帖子清单。 |
| `GPUI React components` | [控件搜索](https://x.com/search?q=GPUI%20React%20components&src=typed_query&f=live) | 结果混有 react-native-gpui 讨论和 Hypen `v0.6.2` 作者帖，不等于 gpuix 控件包。没有从这些结果取得可直接安装到 `@gpuix/react` 的新控件发布证明。 |
| `gpuix (Tailwind OR theme OR HMR)` | [主题与 HMR 搜索](https://x.com/search?q=gpuix%20%28Tailwind%20OR%20theme%20OR%20HMR%29&src=typed_query&f=live) | 找到作者 disktree 帖和 release-mode bindings/HMR 说明。没有读到 Tailwind 能直接驱动 gpuix host 的兼容性承诺。 |
| `gpuix (components OR shadcn OR "base-ui")` | [组件生态搜索](https://x.com/search?q=gpuix%20%28components%20OR%20shadcn%20OR%20%22base-ui%22%29&src=typed_query&f=live) | 找到 Jamon 对比帖，以及 KapishDima 请求 shadcn 风格 gpuix 控件的帖子。Jamon 由协调者另行阅读，本 worker 不把它当独立的已验证库能力。 |
| `gpuix Tailwind` | [Tailwind 搜索](https://x.com/search?q=gpuix%20Tailwind&src=typed_query&f=live) | 页面明确显示“没有关于‘gpuix Tailwind’的结果”。首次等待条件未匹配此本地化文案，随后真实 snapshot 确认负结果；没有将等待超时本身当零结果。 |
| `"gpuix-base-ui" OR "gpuix-ui"` | [确切名称搜索](https://x.com/search?q=%22gpuix-base-ui%22%20OR%20%22gpuix-ui%22&src=typed_query&f=live) | 可见结果只有 KapishDima 的需求帖，文中是 `gpuix/ui`，没有 scoped npm 包发布链接。X 的匹配结果不能消除 registry 身份差异。 |

### 公开帖子与一手源码交叉核对

日期使用帖子 DOM 的 UTC `datetime`，不用界面的本地日期。帖子未锁定版本时，版本栏写后续独立观察，不把当前源码版本倒推成发帖时版本。所有 HMR、性能和控件交互仍未在本项目运行。

| 帖子、作者与 UTC 时间 | 页面上读到的主张 | 链接仓库、版本与一手兼容证据 | 对 zoeydaw 控件迁移的影响与剩余证明 |
| --- | --- | --- | --- |
| [disktree 公告](https://x.com/__morse/status/2104248002541916391)，Tommy D. Rossi `@__morse`，2026-09-27T16:33:13Z；[源码回复](https://x.com/__morse/status/2104248006253903938)，同作者，2026-09-27T16:33:14Z | 将 disktree 移植到 GPUIX/Bun，声称 macOS、Windows、Linux，6MB npm 包、HMR、应用修改无需编译，入口 `npx disktree`。源码回复页面正文是“the code of this app”，本次 DOM 没提取出单独仓库 URL，不臆造链接。 | 沿下述同作者 Solid 公告回复的 GitHub 公开链接进入 `remorses/gpuix` 后，核对其中 [disktree manifest](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/disktree/package.json)。[npm disktree](https://registry.npmjs.org/disktree) 最新为 `0.2.0`，发布于 2026-09-27T19:56:35.953Z，依赖 `@gpuix/react ^0.10.0`、`@gpuix/native ^0.10.0`、React `^19.2.4`，并导出 `./src`。帖子时间早于这个版本的 npm 发行时间，帖子本身未 pin 版本。 | 是真实 gpuix 应用与源码分发的参考，不是可替换 DAW 菜单、resize 或 editor 的控件库。6MB 和跨平台声明没有由本 worker 重测，不能作为 DAW 体积/性能或控件完成度证据。 |
| [release bindings 与 HMR](https://x.com/__morse/status/2091609523374989591)，Tommy D. Rossi `@__morse`，2026-08-23T19:32:25Z | 开发时可以使用 release-mode bindings，React 修改走 HMR；对比 Rust debug 构建的帧率和修改后编译时间。 | 本帖没有源码外链或版本 pin；通过作者的公开 repo 链核对当前 [scripts/dev.ts](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/scripts/dev.ts)。源码明确 Rust `.node` 无法卸载，Rust 修改需要重新构建并重启进程；disktree manifest 的开发命令是 `bun --hot src/cli.tsx`。 | JS/TS 控件修改和新增 Rust bridge 的反馈路径不同。选 resizable/editor bridge 时必须把 native rebuild/restart 计入成本。“10fps”和“5s”仅为作者当时的表述，不是通用基准或本项目结果；本次没有启动 HMR。 |
| [native package 可做 Vue adapter 的回复](https://x.com/__morse/status/2091795814095921225)，Tommy D. Rossi `@__morse`，2026-08-24T07:52:40Z | 回复 Radu 的 Vue/React 统一框架问题，表示已有 native package 可用于 Vue adapter，建议 adapter 暂时放外部仓库。 | 帖子没有候选 Vue package 名或版本。当前 [native Cargo][R4]、[host 类型][G3] 与 [React 导出][G2] 能证明 native host 与 React adapter 的实际分层，但不证明当时的 Vue adapter 已发布或任何 React Native UI 可以复用。 | “同为 React”或“可另写 adapter”都不能推出现有 DOM 或 React Native 控件直接兼容。维持本文的 assets/headless/bridge 分类，不因社交讨论跳过事件、focus 和 host element 审计。 |
| [Solid 公告](https://x.com/__morse/status/2102455563183673708)，Tommy D. Rossi `@__morse`，2026-09-22T17:50:42Z；[GitHub 链接回复](https://x.com/__morse/status/2102455566576890247)，2026-09-22T17:50:43Z | 宣布 gpuix 支持 Solid，原生应用不使用 WebView，回复给出 `github.com/remorses/gpuix`。本 worker 从作者搜索独立找到并实际打开两条关联帖子。 | 实际在 `p1` 沿回复的 [t.co 公开链接](https://t.co/Z68FHLCnMn) 导航，最终 URL 为 [remorses/gpuix](https://github.com/remorses/gpuix)。[Solid manifest](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/solid/package.json) 与 [registry](https://registry.npmjs.org/@gpuix%2Fsolid) 确认包身份 `@gpuix/solid`，最新 `0.10.0`，npm 发行 2026-09-23T08:15:14.497Z；main 的额外控件导出仍不能倒算进 0.10。 | 说明 native host 可被多个 renderer 使用，不是要求把现有 React DAW 改写成 Solid。本任务继续以 `@gpuix/react` 为目标，没有为了追新扩大框架迁移。 |
| [shadcn 风格控件需求](https://x.com/kapish_dima/status/2091918292877185058)，KapishDima `@kapish_dima`，2026-08-24T15:59:21Z | “When someone made shadcn/ui → gpuix/ui / Really need it”，并引用作者 WASM 公告。 | 没有仓库、npm 包名、版本或已交付代码链接。不能把 `gpuix/ui` 字样解释成某个实际包。之后发现的 W/D 仓库分别固定于 9 月 18 日和 9 月 7 日提交，以其源码和 registry 查询为证，不靠这条需求帖证明发布状态。[W1] [D1] [N2] | 有用的是用户需求信号，不是控件存在的证据。保留 W/D 为原生源码候选，未发现可提升为“已验证直接安装”的新 X 发布证据。 |

X 补充没有改变核心排序：先验证官方当前控件和 W/D 的相关源码，再验证 resizable/DragPad 的真实缺口。最新渠道用于找新增相关能力，不用于随意升级已工作的 headless 包。X 的愿望帖、性能说法和其他 renderer 产品都没有替代一手代码核对。

## 会话流式超时的只读观察

本次按新增要求直接读取两个配置键，没有编辑配置，也没有调试或重启 OMP。

| 配置键 | 当次观察值 | 来源 | 配置描述的含义 |
| --- | --- | --- | --- |
| `cfg://providers/streamFirstEventTimeoutSeconds` | `60` 秒 | `global config`，默认 `-1` | 等待模型第一个流事件的 watchdog 阈值；不是 gpuix 应用或浏览器超时 |
| `cfg://providers/streamIdleTimeoutSeconds` | `15` 秒 | `global config`，默认 `-1` | 两次模型流事件之间静默的 watchdog 阈值；不是 HMR 或网络性能测量 |

值与要求中的 `60/15` 相符，不是本次读取发现的 stale 值。仅记录配置事实，不据此断言任何先前中断的根因。

## 一手来源

### 官方 gpuix

- [G1] [React 0.10 tag 公共导出](https://github.com/remorses/gpuix/blob/%40gpuix/react%400.10.0/packages/react/src/index.ts)。已发布 Select/Combobox/Tooltip，与 Button/Dialog 的缺口。
- [G2] [固定 main 公共导出](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/react/src/index.ts)。Button、Dialog、DismissableLayer 和 createPortal。
- [G3] [固定 main native host 类型](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/js/host.ts)。ElementType、StyleDesc、HostProps、SvgProps、CodeProps 与 AnchoredProps。
- [G4] [固定 main Dialog 实现](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/react/src/components/dialog.tsx)。full-window anchored、modal、focus 和 dismiss。
- [G5] [custom elements 计划文档](https://github.com/remorses/gpuix/blob/main/docs/custom-elements-plan.md)。Context7 返回的 `<editor>` 来自这里，不能替代 G3 的已实现类型。
- [G6] [Select 文档](https://github.com/remorses/gpuix/blob/main/_autodocs/api-reference/select.md)、[Combobox 文档](https://github.com/remorses/gpuix/blob/main/_autodocs/api-reference/combobox.md)。Context7 来源；最终仍以 G1/G2 和源码为准。
- [G7] [React 0.10 release](https://github.com/remorses/gpuix/releases/tag/%40gpuix/react%400.10.0)。native/runtime 分离、浮层圆角、输入与 promptForPaths。

### 原生社区候选

- [W1] [gpuix-base-ui README，固定 SHA](https://github.com/wdcodecn/gpuix-base-ui/blob/4f8cc44e2ddf20980f820107273961849f7ead7f/README.md)。37 个 family、native mapping、许可证。
- [W2] [gpuix-base-ui manifest](https://github.com/wdcodecn/gpuix-base-ui/blob/4f8cc44e2ddf20980f820107273961849f7ead7f/package.json)。版本与精确依赖。
- [W3] [原生 overlay/menu/context menu 实现](https://github.com/wdcodecn/gpuix-base-ui/blob/4f8cc44e2ddf20980f820107273961849f7ead7f/src/base/overlay.tsx)、[shared popup/collection](https://github.com/wdcodecn/gpuix-base-ui/blob/4f8cc44e2ddf20980f820107273961849f7ead7f/src/base/surface.tsx)。
- [W4] [NumberField、OTPField、Form 实现](https://github.com/wdcodecn/gpuix-base-ui/blob/4f8cc44e2ddf20980f820107273961849f7ead7f/src/base/form.tsx)。ScrubAreaCursor 不实现系统 cursor bridge。
- [D1] [drewnekota/gpuix-ui README，固定 SHA](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/README.md)。架构、native 控件和源码 registry。
- [D2] [primitives manifest](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/primitives/package.json)。`^0.7.0` peer 与 workspace 依赖。
- [D3] [ContextMenu](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/primitives/src/context-menu.tsx)、[DropdownMenu](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/primitives/src/dropdown-menu.tsx)。
- [D4] [Command 原生实现](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/primitives/src/command.tsx)。
- [D5] [sv 样式变体](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/core/src/variants.ts)、[core 公共导出](https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/core/src/index.ts)。
- [K1] [kotop21/gpuix-ui README，固定 SHA](https://github.com/kotop21/gpuix-ui/blob/39e322a93bbbefd7f82d5ba56ca439ab54a732b5/README.md)。旧版 host、图标与 CLI picker。
- [N2] 当次实际返回 HTTP 404、JSON `Not found` 的官方 registry 路径：[gpuix-base-ui](https://registry.npmjs.org/gpuix-base-ui)、[@gpuix-ui/core](https://registry.npmjs.org/@gpuix-ui%2Fcore)、[@gpuix-ui/primitives](https://registry.npmjs.org/@gpuix-ui%2Fprimitives)、[@gpuix-ui/react](https://registry.npmjs.org/@gpuix-ui%2Freact)。初次查询后，协调者同日另用 reader 和 curl 独立复核；GitHub 仓库可访问。结论仅为查询时不可公开取得，不是“从未发布”的证明。
- [N3] [同名 gpuix-ui registry](https://registry.npmjs.org/gpuix-ui)、[gpuix npm 搜索](https://registry.npmjs.org/-/v1/search?text=gpuix&size=40)。

### Rust bridge、资产与 headless core

- [R1] [gpui-kit v0.7.3 release](https://github.com/longbridge/gpui-kit/releases/tag/v0.7.3)、[workspace manifest](https://github.com/longbridge/gpui-kit/blob/v0.7.3/Cargo.toml)、[component manifest](https://github.com/longbridge/gpui-kit/blob/v0.7.3/crates/component/Cargo.toml)。
- [R2] GPUI Component 的 [Resizable](https://longbridge.github.io/gpui-component/docs/components/resizable)、[Data table](https://longbridge.github.io/gpui-component/docs/components/data-table)、[Editor](https://longbridge.github.io/gpui-component/docs/components/editor)、[Chart](https://longbridge.github.io/gpui-component/docs/components/chart) 文档，Context7 的一手文档来源。最新 repo/tag 已另用 R1/R3 核对。
- [R3] v0.7.3 的 [resizable.rs](https://github.com/longbridge/gpui-kit/blob/v0.7.3/crates/component/src/resizable.rs)、[dock](https://github.com/longbridge/gpui-kit/tree/v0.7.3/crates/component/src/dock)、[menu](https://github.com/longbridge/gpui-kit/tree/v0.7.3/crates/component/src/menu)、[calendar](https://github.com/longbridge/gpui-kit/blob/v0.7.3/crates/component/src/time/calendar.rs)、[otp_input](https://github.com/longbridge/gpui-kit/blob/v0.7.3/crates/component/src/input/otp_input.rs)、[chart](https://github.com/longbridge/gpui-kit/tree/v0.7.3/crates/component/src/chart)、[table](https://github.com/longbridge/gpui-kit/tree/v0.7.3/crates/component/src/table)。
- [R4] [gpuix native Cargo.toml，固定 main](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/Cargo.toml)。使用 zed submodule path GPUI，未声明 gpui-component。
- [I1] [lucide-static 官方 manifest](https://github.com/lucide-icons/lucide/blob/main/packages/lucide-static/package.json)、[Lucide 源 SVG](https://github.com/lucide-icons/lucide/tree/main/icons)。static 是资产方向，不是原 React SVG 节点兼容声明。
- [I2] [Phosphor core 官方 README](https://github.com/phosphor-icons/phosphor-core/blob/main/README.md)。明确提供 SVG 资产、weight、catalog 和 duotone 说明。
- [F1] [RHF 官方非 DOM 受控输入示例](https://github.com/react-hook-form/documentation/blob/master/src/content/docs/usecontroller/controller.mdx)，Context7 来源。
- [F2] [TanStack Form 官方 React Native 指南](https://github.com/TanStack/form/blob/main/docs/framework/react/guides/react-native.md)、[FieldApi](https://github.com/TanStack/form/blob/main/packages/form-core/src/FieldApi.ts)，Context7 来源。仅用于证明状态层适配接口。
- [T1] [TanStack Table 官方 v9 quick start](https://github.com/TanStack/table/blob/main/docs/framework/react/quick-start.md)、[React useTable 源码](https://github.com/TanStack/table/blob/main/packages/react-table/src/useTable.ts)，Context7 来源。
- [E1] [emoji-mart 官方仓库](https://github.com/missive/emoji-mart)、[独立 data 包 registry](https://registry.npmjs.org/@emoji-mart%2Fdata)。本次未验证其 Unicode 覆盖范围。
- [C1] [D3 shape 官方 README](https://github.com/d3/d3-shape/blob/main/README.md)。几何生成不等于图表 UI。
- [L1] [i18next browser detector 官方 README](https://github.com/i18next/i18next-browser-languageDetector/blob/master/README.md)。浏览器检测源和自定义 detector 接口。

原应用路径均为本次本地只读取样，未公开上传其未提交源码。复查时应在原目录读取消费者，而不能仅凭研究 worktree 中的同名文件判断当前行为。

[G1]: https://github.com/remorses/gpuix/blob/%40gpuix/react%400.10.0/packages/react/src/index.ts
[G2]: https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/react/src/index.ts
[G3]: https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/js/host.ts
[G4]: https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/react/src/components/dialog.tsx
[G5]: https://github.com/remorses/gpuix/blob/main/docs/custom-elements-plan.md
[G6]: https://github.com/remorses/gpuix/blob/main/_autodocs/api-reference/select.md
[G7]: https://github.com/remorses/gpuix/releases/tag/%40gpuix/react%400.10.0
[W1]: https://github.com/wdcodecn/gpuix-base-ui/blob/4f8cc44e2ddf20980f820107273961849f7ead7f/README.md
[W2]: https://github.com/wdcodecn/gpuix-base-ui/blob/4f8cc44e2ddf20980f820107273961849f7ead7f/package.json
[W3]: https://github.com/wdcodecn/gpuix-base-ui/blob/4f8cc44e2ddf20980f820107273961849f7ead7f/src/base/overlay.tsx
[W4]: https://github.com/wdcodecn/gpuix-base-ui/blob/4f8cc44e2ddf20980f820107273961849f7ead7f/src/base/form.tsx
[D1]: https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/README.md
[D2]: https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/primitives/package.json
[D3]: https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/primitives/src/context-menu.tsx
[D4]: https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/primitives/src/command.tsx
[D5]: https://github.com/drewnekota/gpuix-ui/blob/33527c33b1c6f9823374eef6edd3912d5ab7a5bf/packages/core/src/variants.ts
[K1]: https://github.com/kotop21/gpuix-ui/blob/39e322a93bbbefd7f82d5ba56ca439ab54a732b5/README.md
[N2]: https://registry.npmjs.org/gpuix-base-ui
[N3]: https://registry.npmjs.org/gpuix-ui
[R1]: https://github.com/longbridge/gpui-kit/releases/tag/v0.7.3
[R2]: https://longbridge.github.io/gpui-component/docs/components/resizable
[R3]: https://github.com/longbridge/gpui-kit/blob/v0.7.3/crates/component/src/resizable.rs
[R4]: https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/Cargo.toml
[I1]: https://github.com/lucide-icons/lucide/blob/main/packages/lucide-static/package.json
[I2]: https://github.com/phosphor-icons/phosphor-core/blob/main/README.md
[F1]: https://github.com/react-hook-form/documentation/blob/master/src/content/docs/usecontroller/controller.mdx
[F2]: https://github.com/TanStack/form/blob/main/docs/framework/react/guides/react-native.md
[T1]: https://github.com/TanStack/table/blob/main/docs/framework/react/quick-start.md
[E1]: https://github.com/missive/emoji-mart
[C1]: https://github.com/d3/d3-shape/blob/main/README.md
[L1]: https://github.com/i18next/i18next-browser-languageDetector/blob/master/README.md
