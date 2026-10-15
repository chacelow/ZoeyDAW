# B2 公共契约(所有 B2 切片共享)

基线:分支 `gpuix-migration` 已含 A1 核心端口、A2 原生平台、A3 共享控件、A4 原生面板、A5 引擎选型、A6 渲染器决策、A7 应用激活、B1 arrangement-core、C1 引擎后端(以派发时的 HEAD 为准)。

## 你要做什么

把 `apps/web` 里对应目录**完整**迁成 gpuix 原生实现,放进 `apps/gpuix/src/project/sections/<panel>/`。不是"做个差不多的演示":行为、状态、键盘与产品规则都要等价,并且**用已有的真实后端端口,不再造 mock**。

## 复用,不要重造

- 控件一律用 `ui/controls`(A3)和 `ui/panels`(A4)。需要的控件不存在或不够用,先 `orca orchestration ask`,不要在本切片里写第二套。
- 纯计算一律用 `project/sections/arrangement/core`(B1)与 `project/model`(A1)。不得复制。
- 数据与命令一律走 `project/adapters` 与 `project/stores`。不得在组件里持有第二份工程数据。
- 主题与度量取自 `shared/theme` 与 `CONTROL_METRICS`,不得硬编码颜色/尺寸/间距。同类组件共用同一间距 token。
- **Rust 能原生做的不要在 TS 里绕**:光标锁定/隐藏、窗口激活、文件与目录、峰值、电平、走带时钟都已经是 Rust 能力(见 `@zoeydaw/native`)。若还缺一个原生能力(例如全局快捷键、系统菜单、拖放文件、原生文件选择器),停下 ask,给出 napi 签名建议,由协调者安排一个 Rust 小切片。**不要用 JS 定时器/轮询去模拟原生事件。**

## 通用产品规则(违反即不合格)

- 点击 Pattern/Clip 不打开别的面板、不展开编辑器;编辑不发生在点击弹层里。
- Space 只控制播放,不触发已聚焦或刚点过的按钮,也不触发其按下样式。
- 交互组件有独立于 hover 的高亮态,默认开启;带可调控件的弹层在内部点击与调整期间保持打开,只在离开或关闭时收起。
- 弹层可向左/右/上/下对齐;下拉指示器固定右侧并与文字留出间距;列表项保留换行。
- 纯图标控件为正方形;数值控件宽度按内容稳定、居中显示。
- 同一滚轮调整只在悬停可调控件时生效且不隐藏光标;拖动调整隐藏光标、相对位移、结束后光标回到按下点。
- 分割条/折叠/侧栏宽度:连续变窄到限位,不是瞬时切换;折叠侧栏时子列表保持固定宽度。
- Header/标题栏/Panel 背景同色同一表面,无间隙无边框无卡片;标题保持弱化色。
- 窗口变窄时 Header 区块不得重叠:溢出自右向左渐进隐藏,可横向滚动访问。

## 约束

- 只改你的拥有路径;不动 `ui/**`、`project/{model,stores,adapters}`、`project/sections/arrangement/core`、`crates/**`。发现必须改,先 ask。
- 不新增 npm/Rust 依赖。不 push,不碰 `main`,不碰其他 worktree。
- `apps/web` 只读,不要删(迁移完成后由协调者统一删除)。
- 不得出现 `react-dom`、`@tauri-apps/*`、`document`/`window`/`localStorage` 引用;`gpuix-layers` lint 必须通过,不得关规则。

## 测试与验收

- 状态转换、边界、键盘可达性各有行为测试(`createTestRoot`)。不测转发/源码文本/incidental 默认值。纯逻辑部分用性质测试,**并做变异检查**(至少 2 个变异→失败数,写进报告)。迁移 web 对应目录里仍有意义的测试。
- `tsc --noEmit`、`bun test`、`pnpm exec eslint apps/gpuix/src/project/sections/<panel>` 全部通过(贴命令与计数)。
- **真实窗口**:`bun --hot` 打开 demo,用 `computer` 的 AX 与截图验证主路径;不能只靠类型检查。至少一次真实交互(点击、键盘、拖动、悬停弹层),附 AX/截图证据。
- **进程清理(强制)**:一切 `bun --hot` demo、窗口、service 验证完立刻结束(`write proc://<name>/kill`),`worker_done` 前贴 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"` 的零残留输出。超过 5 分钟无交互的 demo 视为泄漏。
- 报告列出:迁入清单(源→目标)、与 web 的行为差异及原因、变异表、未实现项(禁止把未实现描述成完成)、错题/已验证做法(LESSONS 格式)。

## 以 Ableton Live 为参照(用户明确要求,优先于文字描述)

- 用户的机器上已打开 **Ableton Live 12 Beta**(应用 id `com.ableton.live`,窗口标题"无标题"),里面有一个含 Group/Audio/MIDI/Return/Main 多种轨道的工程。**实现前先观察它,不要凭规格里的文字描述猜**;文字描述与观察不一致时,以观察为准,并在报告里写明差异。
- 观察方式:`computer.window({app:"Live"})` → `win.screenshot()` / `win.zoom()` / `win.ax()`。AX 里有语义信息(轨道名、音量值、循环区间、网格按钮、Clip 属性),截图/放大用于外观(颜色、间距、锚点样式)。**只做只读观察;不要在 Live 里点击、拖动、输入、改工程,也不要激活/抢走它的焦点。** 需要观察某个交互(悬停显示什么、拖动时光标/线条怎么变)时先 `orca orchestration ask` 说明具体要做的输入,由协调者决定并代为操作,避免改坏用户的工程。
- 报告必须包含一张"与 Live 对比表":每条产品规则 → Live 实际观察到的行为(附截图路径或 AX 行) → 我们的实现 → 一致/差异/未验证。**未对照 Live 验证的条目写"未验证",不得写成一致。**
- 协调者在 review 时会逐项对照 Live 再核一遍。

## UI 视觉验收(用户明确要求,强制)

严格执行 `docs/architecture/gpuix.md` 的「UI 视觉验收」一节与 `docs/architecture/gpuix-ui-standards.md`(13 节检查清单,交付时逐条回答):

- 以真实 Gallery 与业务组合视图整体评审间距、居中、尺寸、紧凑感、对齐与裁切、颜色层级，保留卡片和工具栏之间的空间关系；局部放大只用于定位具体缺陷。
- 对疑点用 AX bounds 或像素量出实际尺寸/间距，与共享 token 核对；圆角、边框、gap、padding 通过统一组件/主题入口调整，不逐个实例修补。
- DAW 的紧凑感必须体现:与 Ableton Live 同一区域并排对比,密度与留白在同一量级;不得出现网页卡片式的大圆角、大内边距、松散留白。
- 看出问题**先改再重新截图确认**,报告写修了什么;不能修的才 ask。
- 生成截图默认保存在仓库外或 Git 忽略目录，提交可重跑入口与简短结论，不批量提交 PNG。
- 协调者自己打开真实窗口整体评审，报告列发现、修复入口、实际结果与未验证路径。
