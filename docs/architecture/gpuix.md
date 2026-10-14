# gpuix 目标架构与切片契约

2026-10-14。`apps/gpuix` 取代 `apps/web` + `src-tauri`：React 逻辑层不变，渲染换成 gpuix 原生元素，原生能力由 Rust napi 提供。本文是迁移期间所有切片的验收基准，与 [modules](modules.md) 的职责规则叠加生效，冲突时以本文为准。选型证据见 `docs/research/gpuix-*.md`。

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

依赖只能向下：`app → project/sections → ui → shared`；`project/adapters → platform`；`project/model` 不依赖任何上层。`ui` 不得 import `project`；`crates/engine` 不得依赖 napi。`features/*` 是迁移期的过渡目录，对应面板迁入 `project/sections` 后删除。

## 硬规则

1. **没有 DOM、没有 CSS、没有 Tailwind class**。样式是 `sx()` / `sv()` 产出的 style 对象；颜色与度量只经 `useTheme()`，不 import `colors.ts` 或 `@zoeymind/ui/metrics`。
2. **不堆样式文件**。共享外观进入控件的 `sv` variant；局部布局留在 TSX 的命名对象。
3. **时间线、轨道、Clip 用原生 `<div>` + 可见范围裁剪**，不引入 Canvas2D。waveform 用裁剪后的竖线 div；automation 曲线用 `<svg source>`（单色 tint）。
4. **Rust 能做的就在 Rust 做，不绕路**：光标、文件原子写、设置落盘、日志、外链、窗口辅助、引擎全部是 `crates/native` / `crates/engine`。TS 只做适配。不用 `osascript`、`bun:ffi` struct 返回、子进程当原生桥。
5. **接真实，不再造 Mock**。`ProjectBackend` 端口的真实实现是 Rust 引擎；`createMockProjectBackend` 只保留给不依赖原生的纯逻辑测试。集成测试直接调真实 napi 模块；只有会真实改变宿主状态的调用（隐藏/移动光标、写用户目录）才允许 mock 或指向临时目录。
6. **一个状态一个 owner**。工程状态只在 `project/stores` + `project/adapters/runtime`。UI 与手势预览不持有第二份可写工程。
7. 单一职责提交；提交标题避免 `+ & 和 与` 并列与多个 Conventional Commit 类型。

## 测试

- 框架：`bun:test`。`vi.*` → `jest.*`，`vi.setSystemTime` → `setSystemTime`（均已实测可用）。
- 纯逻辑沿用原测试断言，只换框架导入；不为通过而改断言。
- 组件行为用 `createTestRoot`（`@gpuix/react/testing`），断言布局边界、命中、状态转换；不测源码文本或转发。
- 原生模块：对真实二进制测试。需要先 `pnpm native:build`。
- 每个切片至少一次真实窗口运行（`bun --hot <demo>`）并截图/AX 验证；只报告实际运行过的验证。
- **验证完立刻关闭**自己启动的 demo/窗口/service(用带 `name` 的 service 启动、拿到证据即 `kill`);`worker_done` 前用 `ps` 确认零残留。残留的窗口会占用户本机内存与 GPU。

## 切片边界与所有权

每个 worker 只改自己拥有的路径。需要改别人路径或共享契约（`shared/theme`、`crates/native` 的公共导出、本文）时，停下并通过 escalation 报告，不自行修改。

| 切片 | 拥有路径 | 交付 |
| --- | --- | --- |
| A1 core-port | `project/{model,stores,adapters,layout}/**`、`project/types.ts` | 90 个文件与 29 个测试迁入并通过；`snapshots.ts` 改为存储端口 |
| A2 native-platform | `crates/native/src/**`（`cursor.rs` 已完成，不动）、`apps/gpuix/src/platform/**`、`packages/i18n` 的去 DOM 化 | atomic_file、设置、日志、外链、i18n 存储端口；关闭拦截可行性结论 |
| A3 ui-controls | `ui/controls/**` | 约 40 个被消费的控件符号 |
| A4 ui-panels | `ui/panels/**` | PanelShell、PanelDivider、原生 resizable Group/Panel |
| A5 engine-spike | `crates/engine/**`、`docs/research/engine-playback-graph.md` | firewheel / kira / rodio 实测对比与结论 |

## 完成定义（每个切片）

- `tsc --noEmit`、`bun test`、`cargo check`（涉及 Rust）通过；`ultracite` 预提交门禁通过，不用 `--no-verify`。
- 本切片无 `react-dom`、`@tauri-apps/*`、`document`/`window`/`localStorage` 引用。
- 不新增 npm 依赖；确需新增先 escalation。Rust 依赖限于本文与研究文档点名的 crate，新增同样先 escalation。
- 在自己的分支提交，不 push、不碰 `main`、不碰其他 worktree。
- 涉及界面的切片，按「UI 视觉验收」逐项完成并附证据；缺证据的视觉声明不算完成。
- 交付报告写清：实际运行的命令与结果、未实现项及原因、对共享契约的任何需求。

## UI 视觉验收（涉及界面的切片必做）

类型检查与 AX 树不能证明界面对。凡是改了可见界面的切片，必须在真实窗口里**逐个看仔细**，并把结论写进报告。

详细检查项见 [gpuix UI 规范](gpuix-ui-standards.md)（紧凑感、尺寸与间距、对齐居中、排版、颜色层级、状态、指针与拖动、弹层、键盘焦点、可访问性、动效、性能、验收清单）。

1. **逐个元素看**：画廊或 demo 里每个控件、每个状态（默认、悬停、按下、聚焦、禁用、预编辑、编辑、折叠、展开）各截一张，再用 `win.zoom()` 放大看细节。不接受只截一张全屏图就说"看起来对"。
2. **必查项**（每项在报告里给结论与证据，路径或 AX 行）：
   - **间距**：相邻控件、标题与内容、面板边缘的 gap 是否都取自共享 token，同类位置是否相等；有没有多出来或缺失的 gap。
   - **居中**：数值、文字、图标是否水平与垂直居中；数值控件内容居中且宽度不随内容抖动。
   - **尺寸**：控件高度取共享度量；纯图标控件是正方形；同组控件等高；没有硬编码的单个像素值。
   - **紧凑感**：这是 DAW/工作站，信息密度高。控件不得松散、不得有无意义留白、不得出现"网页卡片"式的大圆角大内边距。与 Ableton Live 同一区域并排对比，密度和留白应在同一量级。
   - **对齐与裁切**：文字不溢出、不被裁切、省略处理正确；图标与文字基线对齐；相邻边框不出现双线或缺口。
   - **颜色与层级**：背景、面板、边框、弱化文字取自主题 token；hover/active/disabled 彼此可区分；网格线与分隔线不是最亮元素也不会看不见。
3. **对照参照物**：有 Ableton Live 对应界面的，先只读观察 Live，再并排对比，报告附『与 Live 对比表』（观察→实现→一致/差异/未验证）。没有对应界面的，对照本项目已合并的同类控件。
4. **放大看，不凭印象**：对每个尺寸/间距，用 `win.ax()` 的 bounds 或截图像素量出实际数值，再与 token 值核对；差 1px 也要说明原因。
5. **发现问题要修，不要只记录**：看出来的间距不齐、没居中、过松，先改再重新截图确认，报告里写修了什么。不能修的（超出所有权、需要共享契约变更）才 ask。
6. **证据可复查**：截图存在仓库外的临时路径时，把关键几张复制到该切片目录的 `evidence/` 下提交（体积小、命名含状态与日期），否则 reviewer 无法复核。
7. 协调者 review 时会自己打开窗口，对照同一份清单再看一遍；报告里没有逐项证据的视觉声明按"未验证"处理。

## 渲染器版本决策

2026-10-14 采纳 [gpuix 主干自建](../research/gpuix-main-build.md)方案 B：固定 `remorses/gpuix` `6a5c7c142ac32f9eb0caefe0121be995cfc18631`，经 `scripts/gpuix-main/build.sh` 构建，包名 `@zoeydaw/gpuix-native`。

- 依据：npm 0.10.0 缺 `onLayout`，主干已有（比 0.10.0 多 70 个提交与 37 个未发布 changeset）；上游近 30 天 109 个提交，更新频繁，等发布无法定期；同类 `react-native-gpui`（14 星，仅 macOS arm64）、`gpui-react`（21 星，demo 级）成熟度不足。
- 代价：干净构建约 400 秒、1.8 GiB 磁盘、最大 RSS 约 884 MiB；改 renderer 一行重建约 67 秒；上游主要由单人维护，必须固定 SHA 与 Cargo.lock，升级时同时核对 native、JS host、React 三者。
- 落地条件：切换包解析时统一为一份 renderer，不保留两套；保留上游许可证与 THIRD_PARTY_NOTICES；升级验收沿用报告中的 31 个测试、四个真实窗口、`onLayout` 时序与关闭拦截转换。
- 另：A3、A4 保留的文字宽度估算与测量采样，在切换后改用 `onLayout` 事件和后续的 `measureText`，同一时刻只保留一种 owner。
