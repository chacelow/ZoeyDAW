# A4 ui-panels:面板外壳与原生可调整分栏

## Target

Worktree `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-a4-ui-panels`(分支 `gpuix-a4-ui-panels`)。在 `apps/gpuix/src/ui/panels/**` 实现 `PanelShell`、`PanelDivider` 与原生 `Group`/`Panel`/`Separator`(可拖动分栏),替代 `react-resizable-panels`(DOM-only)。

## 必须满足的契约(来自 `docs/architecture/project-panels.md`、`LESSONS.md`、现有 `ProjectLayout.tsx`/`useProjectShell.ts`)

- API 对齐 react-resizable-panels v4 的**子集**,这是上层 `ProjectLayout`/`useProjectShell` 实际使用的:
  - `Group`:`orientation: "horizontal"|"vertical"`;`Panel`:`defaultSize`(**数值=像素,字符串=百分比**,例如 `defaultSize="25"` 是 25%,`defaultSize={0}` 是 0px)、`minSize`、`maxSize`、`collapsible`、`collapsedSize`、`onResize(size: {asPercentage, inPixels})`、`panelRef`(命令式句柄:`isCollapsed()`、`expand()`、`collapse()`、`resize(px)`、`getSize()`)。
  - `Separator` 经项目 `PanelDivider` 包装:竖向分隔条配水平 Group;命中区 7px,可拖动,键盘方向键调整,Esc/失焦取消。
- **PanelShell**:统一背景、固定宽度边框、圆角和 pointer-capture 激活分发。**active 只换边框颜色**,不改变尺寸,不用 ring/box-shadow/outline 外沿(见 `LESSONS.md` “Panel active 外沿被裁切”)。尺寸与间距来自 `PROJECT_METRICS`(经 `useTheme().project`),不复制数字。
- 展开 Clip 时固定高度的 Device 不被挤掉:固定高度面板放在可调 Group 之外,由布局层组装(你提供原语,不负责业务布局)。
- 左侧栏连续收窄到宽度上限,而不是瞬时切换;子列表在左侧栏折叠时保持固定宽度。
- Affect Chain 面板固定高度,垂直拖动只折叠/展开,不自由改变高度——通过 `collapsible` + 阈值切换实现(`DeviceDivider` 越过半高阈值才切换显隐,支持反向拖回)。
- 拖动期间用 gpuix 原生 pointer capture(同一节点监听 down+move+up,**不要**在 `onMouseLeave` 取消,已验证会把拖动范围砍成控件尺寸)。
- 布局计算做成**纯函数**(`computeLayout(sizes, constraints, delta) → sizes`),与渲染分离,有单元测试覆盖:像素/百分比混合、min/max 约束、折叠阈值、相邻面板的分配、不超出总尺寸、Fixed 面板不被挤压。

## Change

1. `ui/panels/layout/`:纯函数 `computeLayout` 等 + 测试(这是本切片价值最高的部分,先做)。
2. `ui/panels/Group`、`Panel`、`Separator`:用 `<div>` flex 布局 + 上述纯函数 + `useWindowSize`/元素 `onLayout`(`@gpuix/react` 有 `on-layout`)获取容器尺寸。
3. `ui/panels/PanelShell`、`PanelDivider`。
4. `ui/panels/gallery.tsx`:一个可运行 demo,复刻 `ProjectLayout` 的结构骨架(Browser 25% 可折叠 | Arrangement | 底部 Clip 可调 + 固定 Device),用于真实窗口验证。

## Constraints

- 不改 `shared/theme/**`、`ui/controls/**`、`crates/**`、`project/**`。
- 不新增依赖。
- 先读 `docs/research/gpuix-controls-ecosystem.md` 中是否已评估 gpuix 可用的 resizable 模块(研究文档提到“Rust resizable 窄 bridge 或经过验证的 GPUIX resize module”);若存在可审计的现成实现,先 ask 是否采用,而不是自造。自造也要先说明为何不用。

## Ownership

`apps/gpuix/src/ui/panels/**`。

## Observable acceptance

- `bun test src/ui/panels` 通过(含 `computeLayout` 的边界用例);`tsc --noEmit` 通过。
- `bun --hot src/ui/panels/gallery.tsx` 真实窗口:用真实 OS 拖动(`CGEventPost` 或 `computer` takeover 失败时的等价手段)拖动分隔条,AX/截图证明尺寸变化;折叠/展开、阈值切换、键盘方向键、Esc 取消各一次实测。
