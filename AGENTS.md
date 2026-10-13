# zoeydaw

Web-UI DAW。Rust 做音频核心、插件 host、Mixer；Tauri 2 做桌面壳，React 做前端。
当前状态：**Web 交互原型**，已有首页、单项目面板、Browser 和编排时间线。工程数据、模拟播放与本地快照由 adapter 提供。没有接入真实文件系统、音频引擎或插件 host。

## 技术栈

- **Native**：Tauri 2 + Rust 1.77 (`src-tauri/`)
- **Web**：React 19 + Vite 7 + Tailwind v4 + TypeScript 5 (`apps/web/`)
- **Workspace**：pnpm 10 (`pnpm-workspace.yaml`)
- **共享包**：`packages/ui`、`packages/i18n`、`packages/logger`、`packages/shared`（当前仍挂 `@zoeymind/*` 命名空间，后续独立 PR 整体改名）

## 应用生命周期

用户手动跑 `pnpm tauri:dev` 并全程保持运行观察热更新。Agent **不启动、不重启**应用。

- 改 `apps/web/**/*.ts(x)` → Vite HMR 自动生效；Agent 继续下一步
- 改 `src-tauri/**/*.rs`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/**`、`Cargo.toml` 依赖、原生 plugin 注册 → 明确告诉用户"需要重启 tauri:dev"
- 类型 / 单测这类无副作用的可以直接跑

## 常用命令

Agent 可直接跑（无副作用）：

- `pnpm --filter @zoeydaw/web typecheck`
- `pnpm --filter @zoeydaw/web test`
- `pnpm --filter @zoeydaw/web exec eslint <files>`
- `cargo check --manifest-path src-tauri/Cargo.toml`

只给用户参考，Agent 不主动跑：

- `pnpm tauri:dev`（用户持有）
- `pnpm tauri:build`

## 边界

- ✅ **Always** — UI 组件从 `@zoeymind/ui` 引；pre-commit 自动 prettier + eslint；跨文件重命名用 `lsp rename`
- ⚠️ **Ask first** — 改 `src-tauri/tauri.conf.json`；动 `packages/ui/src/` 公共 API；新增 npm 依赖；改 `.github/workflows/`
- 🚫 **Never** — 提交 secrets / token / API key；自启动 / 自重启 `pnpm tauri:dev`

## Commit confirmation

`.husky/pre-commit` 每次 commit 拦一次确认。非交互式提交必须显式携带：

```
USER_CONFIRM_HASH=$(git write-tree) git commit -m "..."
```

每一次 commit 都需要独立的"我确认"，用户须在**本次 commit 上下文**里显式说出三个字。隐含语气（"提交吧" / "commit 一下" / "push 吧"）都不算。违规审计日志在 `.git/commit-audit.log`。

## 产品定位

Web-UI DAW。前端 React 做所有交互，Rust 做音频实时处理、CLAP + VST3 插件 host、工程读写。目标之一是兼容 Ableton Live `.als`。

Prototype 阶段按界面需求反推 Rust 需求，不要先铺引擎、先铺架构。界面能跑 → 需求可见 → 再落 Rust。

## UI 组件文件约定（硬性）

**任何一个 UI 组件默认写成文件夹 + `index.tsx`，不要用单文件**。

```
components/XxxThing/
├─ index.tsx          # 主组件 + 公共 props；只从这里 export
├─ XxxThingItem.tsx   # 子组件；grow 到不止一个 UI 片段就拆出来
├─ useXxxThing.ts     # 复杂状态；拆成 hook
├─ XxxThing.types.ts  # 过大的类型抽这里（否则留 index.tsx 里）
└─ XxxThing.test.tsx  # 单测与组件同住
```

理由：
- 第一版可能只有 `index.tsx` 几十行；加一个 subitem / hook / 子视图不用再做一次 "单文件 → 文件夹" 的大重构。
- import 不受影响（`from "./XxxThing"` 自动走 `index.tsx`）。
- diff review 一个组件所有东西收在同一个目录，读起来线性。

什么时候可以**单文件**：一次性 helper、`.d.ts`、barrel `index.ts`、单纯枚举/类型文件（`types.ts`）。其他一律文件夹。

新建 UI 时自己先问："这个组件以后会不会分化出子组件 / 子状态 / 单测？" 大概率会 → 直接文件夹。

## 项目视图：Panel 组装规范

DAW 的多面板界面统一用这个结构。改之前读 `apps/web/src/pages/project/ProjectLayout.tsx`。

### 文件分层

```
apps/web/src/
├─ components/panels/              # 通用 panel 原语（跨页面可复用）
│  ├─ PanelShell/index.tsx         # 卡片外壳：bg-card + border + rounded + active 高亮
│  ├─ PanelDivider/index.tsx       # react-resizable-panels Separator 的项目壳
│  └─ index.ts                     # barrel: re-export 以上
└─ pages/project/
   ├─ index.tsx                    # 路由入口 (ProjectPage)
   ├─ ProjectLayout.tsx            # 纯结构拼装（Group/Panel/PanelShell + sections）
   ├─ useProjectShell.ts           # 顶层状态 hook（active section/rail、折叠态、面板句柄）
   ├─ types.ts                     # SectionId / RailId 枚举
   └─ sections/                    # 每个 section 一个文件夹，index.tsx 导出主组件
      ├─ TransportBar/index.tsx    # 顶 chrome 条（bg-background）
      ├─ StatusStrip/index.tsx     # 底 chrome 条（bg-background）
      ├─ BrowserPanel/             # Browser 交互与演示数据
      │  ├─ index.tsx              # 状态与内容，renderBody 提供布局槽位
      │  └─ BrowserNavigation/index.tsx # 分类导航
      ├─ ArrangementPanel/index.tsx # 主编辑区
      └─ FooterPanel/index.tsx     # 底部信息 / 快捷操作
```

加新 section：建一个 `sections/XxxPanel/index.tsx` + 在 `types.ts` 的 `SectionId` 加一个值 + 在 `ProjectLayout` 塞一个 `<Panel><PanelShell id="xxx">...<XxxPanel />...</PanelShell></Panel>`。不要在 ProjectLayout 以外的地方自己拼 Group/Panel 结构。

Browser 内部双栏也由 `ProjectLayout` 组装 `Group` / `Panel`，通过 `BrowserPanel.renderBody` 插槽传入。内部两栏继承同一面板底色，不额外包 `PanelShell`；分隔条保留拖动命中区，用居中的 1px `border` token 线显示边界。分类栏文字随宽度连续裁切，图标位置不变；资源栏保留最小宽度。

### Panel 外壳规则（PanelShell）

- 任何一个 panel 卡片都包一层 `<PanelShell id={...} active={...} onActivate={...}>`。
- 外壳做且只做：`bg-card` 底色、`border-border`/`border-ring` 1px 边、`rounded-md` 圆角、`transition-colors` 过渡、`onPointerDownCapture` 冒泡 active id。
- active 高亮 **只换 1px border 颜色**。不要加外沿 `ring-*`、外沿 `box-shadow` 或 `outline`：`react-resizable-panels` v4 的 `Panel` / `Group` 内置 `overflow: hidden` 不可覆盖，外沿效果会被兄弟或父级裁掉，视觉上出现"三边 ring + 一边断"的方框残影。踩过。
- section 组件内部不写 `rounded-*` / `border` / 外壳 bg，让 PanelShell 统一负责。

### 分隔条（PanelDivider）

- 竖拖用 `orientation="vertical"`（配 `Group orientation="horizontal"`），横拖用 `orientation="horizontal"`。
- 6px 宽/高，`bg-background` 看起来就是面板之间的 gap，hover `bg-primary/40`。
- 不要和 panel 的 `border` 叠（叠会出双线）。section 组件也不要加 `border-r`/`border-l`/`border-t`。

### 通用控件交互

- 通用控件和通用样式统一维护在 `packages/ui/src/controls`，业务面板从 `@zoeymind/ui` 导入。
- 新增 `--text-*` 或 `--spacing-*` token 时，同步 `packages/ui/src/cn.ts` 的合并配置；激活色切换后，字号和控件尺寸必须保持不变。
- Arrangement 的视觉调整限定在 `.project-arrangement` 内；Header 排列限定在 `.project-transport` 内。保留侧栏内容和样式、全局主题、标题栏与 Footer，除非当轮明确要求修改。Header 排列不覆盖共享控件的字号和尺寸。
- 激活项通过 `aria-selected`、`aria-pressed`、`aria-current` 或 `data-active` 标识。`packages/ui/src/styles/globals.css` 的 Hover 变体排除激活项；列表激活色也优先于菜单的 Focus 色。
- Footer Info 只发布 `packages/ui/src/controls/ControlEnvironment` 定义的组件类型，由语言包给出固定说明，不发布资源名、输入值或即时参数。
- 拖拽 Ghost 复用 `packages/ui/src/DragPreviewArea` 和已安装的 Motion。组件只负责预览动画与取消，当前所有 Panel 均禁用资源放置；保留 Esc、失焦和减少动态效果的处理。

### 工程状态与编排

- 修改工程字段、保存范围或模拟命令前，先读 `apps/web/src/pages/project/stores/README.md` 与 `apps/web/src/pages/project/adapters/README.md`。页面通过 adapter 的 `useProjectState` 和 `projectActions` 读写组合 store。
- 快照保存 `document` 与 `workspace`；播放、选区、电平、编辑事务和波形缓存属于临时状态或派生数据。
- 编排由外层 `Timeline` 组装独立 `MiniMap`、标尺、轨道和 clip。让 Timeline controller 统一提供时间范围、缩放和滚动，所有轨道内容与标尺共用一个滚动视口。

### react-resizable-panels v4 坑

- `defaultSize={18}` 是 **18 像素**；要百分比写 **字符串** `defaultSize="18"`。
- 组件 ref 不走 `ref=`；用 `panelRef={handle}`、`groupRef={handle}`。
- 没有 `onCollapse` / `onExpand`；用 `onResize` 回调 + `panel.isCollapsed()` 自己判。
- Group 方向属性是 `orientation`（不是 `direction`）。
- 分隔条组件叫 `Separator`（本仓里包装成 `PanelDivider`）。
- `Group` / `Panel` 的 `overflow` / `display` / `flex-direction` / `flex-wrap` 不可覆盖。

### 颜色 token（硬性）

全部走 design token，禁 hex / `bg-white` / `bg-gray-*` 这类 Tailwind 原生色阶：

| 用途 | token |
| --- | --- |
| 窗口 chrome / 融 gap 色 | `bg-background` / `text-foreground` |
| Panel 卡片 | `bg-card` / `border-border` |
| Active panel 边 | `border-ring` |
| 侧栏 (IconRail 等) | `bg-sidebar` / `text-sidebar-foreground` / `bg-sidebar-accent` / `text-sidebar-accent-foreground` |
| 次级面 / 轨道卡片 | `bg-muted` |
| 内部分隔线 | `border-border` |
| hover 态 | `hover:bg-accent hover:text-accent-foreground`（或侧栏变体） |
| 主色 / 焦点环 | `bg-primary` / `ring-ring` |
| 破坏性操作 | `bg-destructive` |

全局 `--radius` / `--spacing` 在 `apps/web/src/index.css`，panel 的圆角走 `rounded-md`（= `calc(--radius - 2px)`）。

### 规范外形变更流程

面板结构、active 行为、token 用法有变 → 先改这段 + ProjectLayout + PanelShell，再改具体 section。别散在各处补丁。
