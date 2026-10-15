# gpuix 的 Web 预览、桌面能力与工具链替代

调研日期：2026-10-14。目标是 `remorses/gpuix`，不是 gpui-shell。本轮只调研，不安装依赖、不启动应用、不改产品源码、不提交。

历史范围：本文保留迁移前的替代方案与权限分析，不是当前工具链说明。旧 Web/Tauri 实现及共享 packages 已删除；日志与语言的当前 owner 是 `apps/gpuix/src/platform/log`、`apps/gpuix/src/platform/i18n`，运行与构建入口见 [setup](../agents/setup.md)。

## 代码与发布基线

- Orca Workspace 为 `GPUix Migration Research`，目录是 `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-migration`，分支为 `gpuix-migration`。
- Workspace 从已提交的 `main` 创建，基线为 `519d1c46849f7efb45963f9a910b86e6b8bea568`。原工作区 `/Volumes/PSSD/code/zoeydaw` 的未提交内容没有复制或移动。调研读取原工作区的当前源码，正式迁移前需重新核对并选择实现基线。
- npm 的 `@gpuix/react` 和 `@gpuix/native` 最新发布均为 `0.10.0`。npm 包发布时间为 2026-09-23；GitHub React release 的 published_at 为 2026-09-21，两种时间不混用。已下载官方 tarball 检查声明和包元数据，没有安装包或执行其中代码。[React 完整元数据](https://registry.npmjs.org/@gpuix%2freact)、[native 元数据](https://registry.npmjs.org/@gpuix%2fnative/latest)、[GitHub 发布记录](https://github.com/remorses/gpuix/releases/tag/%40gpuix/react%400.10.0)。
- 主干核对到 `6a5c7c142ac32f9eb0caefe0121be995cfc18631`，提交日期为 2026-10-11。主干 `package.json` 仍写 `0.10.0`，不代表其全部 API 已包含在 npm 的同名版本中。[主干提交](https://github.com/remorses/gpuix/commit/6a5c7c142ac32f9eb0caefe0121be995cfc18631)。
- 发布包 React 的 `dist/index.d.ts` 有 Select、Combobox、Tooltip、motion 和 AnimatePresence，没有 Button 和 Dialog。主干包增加了 Button、Dialog 导出。主干还切换到 `react-reconciler ^0.33.0`，发布包为 `^0.31.0`。[已发布 React tarball](https://registry.npmjs.org/@gpuix/react/-/react-0.10.0.tgz)、[主干 package.json](https://github.com/remorses/gpuix/blob/main/packages/react/package.json)。
- 发布的 native 包包括浏览器入口和 WASM，预编译桌面目标为 macOS ARM64、Linux x64 GNU 和 Windows x64。主干已加入 Windows ARM64，但不能当作 0.10.0 已发布预编译目标。[已发布 native tarball](https://registry.npmjs.org/@gpuix/native/-/native-0.10.0.tgz)、[主干 native package.json](https://github.com/remorses/gpuix/blob/main/packages/native/package.json)。

**选型判断：** 若依赖最新 Button、Dialog 或其他主干能力，应以固定提交构建并同步锁定 React adapter、native 和 WASM，而不是混用“主干 React + npm latest native”。是否实际采用该提交，仍需真实页面和平台验证。

## 开发与 Web 预览

| 当前内容 | 候选与观测版本 | 适配判断 | 验收要求 |
| --- | --- | --- | --- |
| Vite 承载 React DOM 页面 | Bun `1.4.3`，2026-10-10 发布；采用 gpuix 官方浏览器入口和 Bun HTML 路由 | 复用 React 组件树，但 renderer 改为 GPUI WASM，不是 DOM | 同一控件在浏览器可交互；原生模块不进入 Web bundle |
| Web 保存即更新 | 上游 `scripts/web.ts` 的 Bun frontend HMR/Fast Refresh | 已有官方实现可复用；不要仅复制一次打包模板 | 修改组件后当前选中、展开、输入状态保留；修改初始化入口允许明确的全页刷新 |
| 桌面 TSX 热更新 | gpuix 的 `render()` 配合 `bun --hot` | 同窗口重挂载，不是保持 Hooks 状态的 Fast Refresh | 窗口不重复创建；接受或单独设计开发态工程与视图现场恢复 |
| pnpm workspace | 保留当前 pnpm workspace，Bun 只承担运行和打包 | 不需要顺带更换包管理器或产生第二份依赖锁文件 | workspace 源码直接参与开发；改 UI 不要求先发布包 |
| TypeScript 与 JSX | `jsxImportSource: @gpuix/react` | 使用原生元素和事件类型；不能继续把 HTML refs 和 React DOM props 当作接口 | 原生与 Web 入口分别检查，公共组件使用同一 gpuix JSX 类型 |
| Storybook、Testing Library、jsdom | 原生 gallery 与 gpuix 原生测试入口；Vitest 保留 | 现有 DOM harness 不能证明原生行为，纯逻辑测试不用重写 | 代表控件真实输入、焦点、弹层、动画和截图验证 |

Bun 最新版本来自 [1.4.3 发布记录](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.3)。开发入口对照 [gpuix HMR 实现](https://github.com/remorses/gpuix/blob/main/scripts/web.ts)、[独立模板 web.ts](https://github.com/remorses/gpuix/blob/main/example-app/web.ts)、[示例 README](https://github.com/remorses/gpuix/blob/main/example-app/README.md)。Context7 查询交叉确认了 Bun HTML routes 的 `development.hmr`，但普通 React DOM 示例不能直接作为 gpuix 挂载代码。[Bun fullstack 文档](https://github.com/oven-sh/bun/blob/main/docs/bundler/fullstack.mdx)。

### Web 预览的边界

- 独立模板当前 `web:dev` 在启动时执行一次 `Bun.build`，没有官方仓库 `scripts/web.ts` 那套 frontend HMR。不能把脚本名当成功能证明。
- WASM 的共享内存需要顶层文档返回 COOP `same-origin` 和 COEP `require-corp`。跨源资源还受 CORS 或 CORP 约束。
- `WebGpuixRenderer` 是初始化单例。WASM 初始化模块不能作为热刷新边界反复执行，否则报 `GPUIX web is already running`。
- GPUI 绘制并不把 Tailwind、Base UI、Radix、Recharts 或 Lucide React 的 DOM 树变为兼容组件。
- 浏览器只能验证共享 UI。原位恢复光标、系统窗口、托盘、原生文件选择和音频设备必须在桌面验证。当前后端仍是模拟时钟和视觉电平，不是可听音频。

来源：[gpuix README](https://github.com/remorses/gpuix)、[Web 入口](https://github.com/remorses/gpuix/blob/main/scripts/web.ts)、本项目 `docs/product-prototype.md` 与 `docs/architecture/rendering.md`。

## 桌面能力替代矩阵

| 当前能力 | 候选与发布状态 | 决策 | 尚未证明的部分 |
| --- | --- | --- | --- |
| Tauri 窗口标题、最小化、最大化、全屏 | 发布的 GpuixRenderer 已有 `setWindowTitle`、`minimizeWindow`、`zoomWindow`、`toggleFullscreen` | 优先复用 gpuix，不引入另一个桌面框架 | 标题栏、traffic lights、平台缩放和实际快捷键 |
| 文件打开对话框 | 发布的 `promptForPaths()` | 优先复用；浏览器不能直接返回 OS 路径 | 取消、Unicode、多选、Linux 平台差异；保存对话框不能由打开接口推断 |
| `frontend_ready` 延迟显示 | `show: false` 后 `activateWindow()` | 可对应，但 Linux 文档声明忽略初始 show/focus 参数 | 三个平台实际启动表现 |
| 关闭询问、隐藏到托盘、显式退出 | 发布声明没有完整等价的 hide-window 和关闭拦截接口 | 保留现有行为要求，列为原生绑定缺口；不能用直接 `process.exit()` 替代 | OS 关闭按钮和 Cmd+Q、未保存状态、恢复和单实例 |
| 系统托盘 | `phtdacosta/tray-hook`，npm `1.1.1`；Rust daemon 通过 stdin/stdout 与 Node/Bun 通信 | 新候选，独立进程可避开同进程事件循环耦合；先做集成验证 | 菜单事件只解决托盘，仍需操作现有 GPUI 窗口的隐藏和恢复接口 |
| 同进程托盘 | `nglmercer/tray-icon-node`，Rust NAPI 绑定 | 备选，不视为零成本集成 | 其 `initialize/update` 与 GPUI AppKit/GTK 事件循环是否兼容 |
| 外链打开 | `sindresorhus/open` `11.0.4`，2026-09-14 发布 | 桌面候选，保留 HTTP/HTTPS URL 校验；Web 使用浏览器专用实现 | Bun 运行与打包、失败反馈、不能加载到浏览器入口 |
| 用户设置、主题、语言、关闭偏好 | `sindresorhus/conf` `16.0.0`，2026-10-12 发布 | 最新候选，仅适合低频小型设置；Web 保留独立存储实现 | 单 owner、应用路径、损坏处理、保存与重启恢复；不用于高频工程或自动化写入 |
| 原子写文件 | 现有 Rust `write_atomically` 保留核心，仅换 Tauri 边界；另查 `write-file-atomic` `8.0.0` | 优先保留现有文件 fsync、目录 fsync 与 Windows replace 语义，不凭包名降级 | Node 替代的父目录同步与 Windows 耐久性是否等价 |
| 原生日志 | 保留 `@zoeymind/logger`，替换 `createTauriLogSink` 与目录配置接入 | 不需要为了迁移引入全新日志抽象 | 轮转、日志级别、用户目录与崩溃日志保持契约 |
| 自动更新 | 发布的 `@gpuix/native` 已有 `checkUpdate`、`AvailableUpdate.downloadAndInstall()` | 优先复用；当前产品没有更新 UI，不扩展产品功能 | 签名、安装包命名、实际替换、更新后不自动重启 |
| 打包 | Bun compile 与 `cargo-packager 0.11.8`，2025-11-27 发布 | gpuix 官方建议路线；此版本是观测最新，不把较旧发布时间包装成新项目 | 资源和 daemon 嵌入、macOS 签名公证、Windows/Linux 安装 |
| Tauri SQL/OS/shell 等声明 | 按当前真实 import 和原生注册核查 | 未使用的插件不找一对一替代，也不因此新建数据库、插件 host 或音频引擎 | 正式迁移前再查消费者 |

### 平台候选来源与限制

- [tray-hook](https://github.com/phtdacosta/tray-hook)、[npm 1.1.1 元数据](https://registry.npmjs.org/tray-hook/latest)。作者称其支持六个平台架构，未在本项目运行；其 IPC 延迟和体积数字属于作者说明，不是本轮测量。GitHub 未找到正式 release，最近 push 为 2026-03-27，不能称为最近几周发布的新项目。
- [tray-icon-node](https://github.com/nglmercer/tray-icon-node) 的示例显式调用 `initialize()`、`update()` 和事件轮询。因此不能直接推断与 GPUI 同进程兼容。
- [open 11.0.4](https://github.com/sindresorhus/open/releases/tag/v11.0.4)、[npm 元数据](https://registry.npmjs.org/open/latest)。要求 Node >=20，仍需验证 Bun 的实际兼容与打包。
- [conf 16.0.0](https://github.com/sindresorhus/conf/releases/tag/v16.0.0)、[README](https://github.com/sindresorhus/conf)、[npm 元数据](https://registry.npmjs.org/conf/latest)。要求 Node >=22。README 明确不支持两个进程同时写同一个 store，每次变更读写整个 JSON；不作为项目数据库。Context7 未解析到本库，只返回 Electron wrapper，不能用该结果冒充本库文档。
- [write-file-atomic 8.0.0](https://github.com/npm/write-file-atomic/releases/tag/v8.0.0)、[npm 元数据](https://registry.npmjs.org/write-file-atomic/latest)。engine 为 `^22.22.2 || ^24.15.0 || >=26.0.0`，高于本仓库当前最低 Node 22.18.0。没有为了调研升级环境，也没有证明它与现有 Rust 实现的全部耐久性等价。
- [cargo-packager 0.11.8](https://github.com/crabnebula-dev/cargo-packager/releases/tag/cargo-packager-v0.11.8)、[gpuix README](https://github.com/remorses/gpuix)。最新 release 不等于最近发布；打包和更新替换必须在各 OS 验证。
- 查到的 [@bunlet/native 0.3.1](https://registry.npmjs.org/@bunlet%2fnative/latest) 属于另一个 WebView 框架。本轮不把另一个窗口/事件循环框架混入 gpuix 作为快捷替代。

## 应用安全与状态边界

Tauri capabilities 移除后，Node/Bun 主进程有不同的系统权限模型，不能宣称原安全边界自动保留。外链 scheme、存储路径、单实例和用户确认仍是产品契约。GPUI 绘制线程、文件操作和未来音频实时线程不得互相阻塞。

工程仍由 project runtime 拥有。浏览器与桌面使用不同平台实现，不各自建立可写工程副本。`conf` 只持有用户偏好，不能成为第二份 project store。现有本地快照只是原型快照，迁移不得顺带把它声称为真实工程文件系统。

## 本轮核实与后续验收

已实际执行 GitHub release/commit 查询、npm metadata 查询，并以文件工具读取官方 React/native tarball 的声明与包元数据。交叉查询了 Context7 的 GPUIX 和 Bun 文档。没有安装候选包，没有构建或运行 gpuix，没有运行单元测试、启动服务或进行性能测量。

实施前需要通过以下真实路径，不能以文档或编译通过代替：

1. 同一套控件在 Web 与桌面呈现并可输入，主题和语言切换保留。
2. Web 改 TSX 后保持代表性操作现场，不重新初始化 WASM。
3. 桌面关闭、托盘恢复、显式退出和光标归位不丢用户状态。
4. 仅小型设置进入低频持久化，原子文件接口保持原有耐久性要求。
5. 发布 adapter、native 和 WASM 来自同一明确版本或提交，安装包包含所有实际依赖资源。

## 已登录 Ego 中核实的 X 线索

本轮使用用户已登录的 Ego，在同一个调研 TaskSpace 内搜索公开技术内容，没有登录切换、发帖、回复、点赞、收藏、关注或读取私信。搜索词包括 `gpuix` 与 `gpuix (web OR wasm OR hot)`。帖子日期以下按 DOM 的 UTC 时间记录。

- GPUix 作者 Tommy D. Rossi（`@__morse`）在 2026-08-24 发布浏览器 WASM 支持预告。[原帖](https://x.com/__morse/status/2091894388574032149)。这条帖子用于确认作者路线，具体 Web/HMR 能力仍以 `scripts/web.ts` 和发布包为准。
- 同一作者在 2026-09-22 发布 Solid 支持说明。[原帖](https://x.com/__morse/status/2102455563183673708)。这不要求本项目从 React 改为 Solid。
- Jamon Holmgren 在 2026-09-21 的桌面框架体验帖中称 GPUIX 构建快、启动慢，并明确说明样本很小、只在一台 macOS 机器测试，没有验证 Windows 或 Linux。[完整帖子](https://x.com/jamonholmgren/status/2102146948186955833)。因此不能从“原生 GPU”推断本项目的启动时间、内存或交互帧率必然改善。该帖子也不能替代我们的同场景验证。

浏览器线索没有改变本轮技术目标。凡是帖子推荐的库，仍需核对公开源码、版本、renderer 接口和 Web/Node 执行条件后才能纳入迁移。
