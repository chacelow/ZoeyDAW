# gpuix 架构

`apps/gpuix` 是 React 逻辑层加 gpuix 原生元素，原生能力由 Rust napi 提供。本文与 [modules](modules.md) 的职责规则叠加生效，冲突时以本文为准。

## 目录与依赖方向

```text
apps/gpuix/src/
├─ main.tsx              入口：只挂载 app，不含逻辑
├─ app/                  应用外壳：窗口 chrome、路由、设置、Provider 组合、ProjectLayout
├─ project/              工程领域，唯一的工程状态 owner
│  ├─ model/             纯函数与类型，无 React、无原生
│  ├─ stores/            Zustand 工程 Store
│  ├─ adapters/          project runtime、引擎端口、快照；通过 platform 接口使用外部能力
│  ├─ layout/            轨道展示几何（由 ui/theme 度量派生）
│  └─ sections/          Arrangement / Footer / Browser / TransportBar / StatusStrip
├─ ui/                   共享 UI 内核，不认识工程
│  ├─ controls/          Button、DragPad*、Popup/Menu、Card…
│  └─ panels/            PanelShell、PanelDivider、resizable Group/Panel
├─ shared/theme/         主题、token、`sx`/`sv`、`useTheme()`
├─ platform/             `@zoeydaw/native` 的 TS 适配与存储/窗口/日志端口
crates/
├─ native/               napi 桥：光标、文件、设置、日志、窗口辅助、引擎胶水
└─ engine/               纯 Rust 引擎核心：协议状态、走带时钟、混音、遥测；不依赖 napi
```

依赖只能向下：`app → project/sections → ui → shared`；`project/sections → project/adapters`；`project/sections → platform` 与 `project/adapters → platform` 只经 platform 的 TS 端口（帧 `platform/frame`、窗口激活 `platform/window`、剪贴板、键盘、光标 `platform/cursor` 等），不直接 import `@zoeydaw/native`；`project/model` 不依赖任何上层。`ui` 不得 import `project` 或 `platform`，原生能力由组合根经 Provider 注入（如 `ControlEnvironmentProvider` 的 `cursorLock`）。`crates/engine` 不得依赖 napi。以上由 `tooling/eslint/gpuix-layers.js` 强制。`features/*` 是迁移期的过渡目录，对应面板迁入 `project/sections` 后删除。

原生帧：动画与电平衰减只用 `platform/frame` 的 `useAnimationFrame`，不写 `setInterval`/`setTimeout` 定时链。它要求祖先有 `AnimationFrameProvider`。整个应用只在组合根挂一个 Provider，`source` 是同一个 renderer 上的 `createAnimationFrameSource(renderer)`；独立验证入口自己挂一个，代替组合根。

## 硬规则

1. **没有 DOM、没有 CSS、没有 Tailwind class**。样式是 `sx()` / `sv()` 产出的 style 对象；颜色与度量只经 `useTheme()`，不 import `colors.ts` 或 `shared/theme/metrics`（纯 `project/layout` 与窗口入口的既有直接度量读取除外）。
2. **不堆样式文件**。共享外观进入控件的 `sv` variant；局部布局留在 TSX 的命名对象。
3. **时间线、轨道、Clip 的交互 host 用原生 `<div>` + 可见范围裁剪**，不引入 Canvas2D。波形复用 `shared/waveform/PeakColumns`；波形、网格与预览音符的非交互几何复用 `shared/quads/QuadBatch` 批绘制，不恢复逐列 div 路径。automation 曲线用 `<svg source>`（单色 tint）。
4. **Rust 能做的就在 Rust 做，不绕路**：光标、文件原子写、设置落盘、日志、外链、窗口辅助、引擎全部是 `crates/native` / `crates/engine`。TS 只做适配。不用 `osascript`、`bun:ffi` struct 返回、子进程当原生桥。
5. **接真实，不再造 Mock**。`ProjectBackend` 端口的真实实现是 Rust 引擎；`createMockProjectBackend` 只保留给不依赖原生的纯逻辑测试。集成测试直接调真实 napi 模块；只有会真实改变宿主状态的调用（隐藏/移动光标、写用户目录）才允许 mock 或指向临时目录。
6. **一个状态一个 owner**。工程状态只在 `project/stores` + `project/adapters/runtime`。UI 与手势预览不持有第二份可写工程。
7. 单一职责提交；提交标题避免 `+ & 和 与` 并列与多个 Conventional Commit 类型。
8. **提交的代码、脚本、测试与配置不写死绝对路径**（`/Volumes`、`/Users`、`/tmp`、`/private`、`/var/folders` 等）。仓库内路径从仓库根、`import.meta.dir` 或 `git rev-parse` 推导；仓库外目录（vendor 根、Cargo target、证据输出）用环境变量或命令行参数传入，默认值也从 git 推导；临时目录用 `mktemp` / `os.tmpdir()`。报告与证据 markdown 里引用实际路径不受限。review scan 的 `absolute-path` 规则执行这一条（2026-10-16 用户要求）。

## 测试

- 框架：`bun:test`。`vi.*` → `jest.*`，`vi.setSystemTime` → `setSystemTime`（均已实测可用）。
- 纯逻辑沿用原测试断言，只换框架导入；不为通过而改断言。
- 组件行为用 `createTestRoot`（`@gpuix/react/testing`），断言布局边界、命中、状态转换；不测源码文本或转发。
- 原生模块：对真实二进制测试。需要先 `pnpm native:build`。
- UI 改动至少一次真实窗口运行（`bun --hot <入口>`）并截图/AX 验证；只报告实际运行过的验证。
- **验证完立刻关闭**自己启动的 demo/窗口/service（用带 `name` 的 service 启动、拿到证据即 `kill`），收尾前用 `ps` 确认零残留。残留的窗口会占用户本机内存与 GPU。

## 完成定义

- `tsc --noEmit` 与改动范围内的 `bun test`、`cargo check`（涉及 Rust）通过；`ultracite` 预提交门禁通过，不用 `--no-verify`。
- 无 `react-dom`、`@tauri-apps/*`、`document`/`window`/`localStorage` 引用。
- 不新增 npm 依赖；Rust 依赖限于本文与研究文档点名的 crate，新增先问用户（见 `AGENTS.md` 封闭清单）。
- 涉及界面的改动，按「UI 视觉验收」逐项完成；缺证据的视觉声明不算完成。
- 跑 `node scripts/gpuix-review-scan.mjs`：`HARD` 清零，`WARN` 逐条判断。改动涉及工程模型、引擎、渲染器补丁、共享 UI 契约或组合契约时，提交前按下面的「代码质量底线」自查一遍 diff。
- 汇报写清实际运行的命令与结果、未实现项及原因。

### 代码质量底线

这些来自严格可维护性审查，目标是 Clean Code Base：删除复杂度，而不是搬运复杂度。

- **文件体量**：单文件超过 600 行要给拆分理由，**不得把一个文件从 1000 行以下推到 1000 行以上**；按职责拆（状态机、纯计算、渲染、控制器各自一个文件），不按「前半后半」拆。
- **不长出意大利面**：不在不相关的流程里插入零散的特例分支和一次性布尔开关；能用一个有名字的小模型、查表或状态机表达的，就不写条件链。
- **不造薄包装**：只转发参数的 helper、身份包装、为将来预留的抽象一律删；需要时再加。
- **复用唯一的实现**：新增前先查是否已有（`core`、`project/model`、`ui/controls`、`platform`）；发现重复，保留拥有者那份，另一份删除，不留两套。
- **类型边界清晰**：不用 `any`、不为了过编译乱加 `as`、不用可选参数掩盖未定的不变量；边界处校验，内部用可信类型。
- **逻辑放对层**：纯计算进 `core`/`model`，原生能力进 `crates/*`，UI 只拼装；不让特性逻辑漏进共享路径。
- **一个状态一个 owner**：不出现第二份可写状态、第二套定时器、第二个事件注册点。
- **产品代码不含 mock、模拟数据或被跳过的测试。**
- **没有 TODO 占位**：未实现的部分在报告里写明，不留 stub 冒充完成。

### 测试范围（用户 2026-10-17）

测试只写在核心与主流程：工程模型与编辑事务、保存与打开、引擎播放与遥测、Arrangement 的时间线与选择拖动、Clip 编辑器的编辑主路径、跨面板组合契约。这些地方的缺陷会让用户丢数据或主流程失效，一条测试要能在真实实现上抓到一个用户可见缺陷。

不写下列测试：

- 文案、i18n 键值、默认值、配置字段的逐项复述；改一个字符串不需要测试。
- 只验证参数转发、Provider 接线、组件能渲染、样式值等于 token。
- 同一行为按多种写法、多种语法、多个路径重复断言。
- 为了让扫描出现测试文件而新增的测试。

UI 外观与交互由真实窗口观察验收，不用逐控件逐状态的单元测试代替。变异检查只在重写核心算法或修复曾经回归的缺陷时做一次，结果写进报告，不为每个改动新增变异入口脚本。现有测试中属于上述“不写”的，修改附近代码时顺手删除。

## UI 视觉验收（涉及界面的改动必做）

类型检查与 AX 树不能证明界面对。改了可见界面，必须在真实 Gallery 与业务组合视图里检查整体。

详细检查项见 [gpuix UI 规范](gpuix-ui-standards.md)（紧凑感、尺寸与间距、对齐居中、排版、颜色层级、状态、指针与拖动、弹层、键盘焦点、可访问性、动效、性能、验收清单）。

1. **先看组合整体**：同屏展示控件组、卡片、工具栏和折叠面板，检查跨区域的对齐、间距与密度。状态通过实际操作及有效原生回归覆盖；局部放大只用于定位缺陷，不逐个小按钮批量截图。
2. **必查项**（每项在报告里给结论与证据，路径或 AX 行）：
   - **间距**：相邻控件、标题与内容、面板边缘的 gap 是否都取自共享 token，同类位置是否相等；有没有多出来或缺失的 gap。
   - **居中**：数值、文字、图标和展开/收起按钮水平、垂直居中；在相邻卡片与面板标题之间比较，数值宽度不随内容抖动。
   - **尺寸**：控件高度取共享度量；纯图标控件是正方形；同组控件等高；没有硬编码的单个像素值。
   - **紧凑感**：这是 DAW/工作站，信息密度高。控件不得松散、不得有无意义留白、不得出现"网页卡片"式的大圆角大内边距。与 Ableton Live 同一区域并排对比，密度和留白应在同一量级。
   - **对齐与裁切**：文字不溢出、不被裁切、省略处理正确；图标与文字基线对齐；相邻边框不出现双线或缺口。
   - **颜色与层级**：背景、面板、边框、弱化文字取自主题 token；hover/active/disabled 彼此可区分；网格线与分隔线不是最亮元素也不会看不见。
3. **对照参照物**：有 Ableton Live 对应界面的，先只读观察 Live，再并排对比，报告附『与 Live 对比表』（观察→实现→一致/差异/未验证）。没有对应界面的，对照本项目已合并的同类控件。
4. **统一入口**：圆角、边框、gap、padding 由共享 token 或组件变体拥有，业务实例不另写一套；用代表性组合的 AX bounds 核对疑点，改变一个入口应影响所有同类调用。
5. **发现问题要修，不要只记录**：看出来的间距不齐、没居中、过松，先改再重新截图确认。
6. **证据可复查**：提交可重跑的 Gallery/业务验证入口。截图默认保存在仓库外或 Git 忽略目录，不批量提交生成图片。
