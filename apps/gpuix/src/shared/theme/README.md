# shared/theme

主题的唯一 owner：颜色、配色预设、共享几何、原生语义外观 token、`sx`/`sv`。各切片只经 `useTheme()` 读取，不 import `colors.ts` 或 `presets.data.ts`。

## 文件

| 文件 | 职责 |
| --- | --- |
| `ThemeProvider.tsx` | `ThemeProvider` 与 `useTheme()`。无内部 state：`appearance`、`preset`、完整 `design` 由组合根受控传入，切换只换 context value，不重挂载子树。省略 `design` 使用 `DEFAULT_DESIGN_TOKENS`，不合并 partial、不写设置。 |
| `presets.ts` | `THEME_PRESETS`（Web 菜单顺序，Default 在首位）、`ThemePresetId`、`DEFAULT_THEME_PRESET`、`getThemePreset(id)`、`isThemePresetId(value)`。每个预设的 light/dark 在模块加载时各派生一次。 |
| `presets.data.ts` | 生成文件，不手改。 |
| `generate-presets.mjs` | 生成器：`node apps/gpuix/src/shared/theme/generate-presets.mjs`；`--check` 校验生成结果未过期。 |
| `web-tokens.ts` | `ThemeColors` 字段 → Web CSS 变量的唯一对照表，生成器与类型都从它来。 |
| `colors.ts` | `ThemeColors`、`DerivedThemeColors` 与唯一的 `derive(base, scheme)`。 |
| `color-mix.ts` | 把 `color-mix(in oklab, …)` 解析成 hex8。 |
| `content-color.ts` | 轨道、Clip 的 `var(--chart-N)` 内容色按当前主题解析。 |
| `design-tokens.ts` | 原生 `DesignTokens`、Card 语义变体与默认值。shape 独立于 spacing，旧 Web 包只作为既有几何默认值来源，不向旧包添加新逻辑。 |

## 原生设计入口

`Theme.design` 始终是完整的 `DesignTokens`。控件外壳、Input、Card、ControlGroup、Menu/Popover、PanelShell 从这里读取圆角、边框、内边距与间距；`Theme.control`、`transportControl`、`project` 继续拥有原有高度、字体、图标尺寸与工程几何。

- `shape.controlRadius` 统一 Button、数值壳、Input、ControlGroup、MotionTabs 与设置导航的同类圆角。Toggle 与 ListRow 有各自的形状语义，默认值分别为2与0，不再借 gap 作为 radius。
- `shape.panelRadius` 默认7，独立于 `project.panelGap`。PanelShell 只消费形状与边框，不改变 Group/Panel 的求解、resize 或拖动 owner。
- `shape.indicatorRadius` 保持等宽高选中徽标的圆形语义，默认值是 control-track 高度的一半；不借用 control gap 或整段控件高度作为圆角。
- `controlBorderWidth=0` 时，数值与下拉宽度按真实 `borderWidth * 2` 推导；滚动条的内长和 thumb 横截面同样扣真实边框。Focus ring 与单选指示器描边是功能标记，独立于外壳边框。
- `cards` 保存 `default`、`sm`、`controls`、`project` 的独立 radius/inset/gap。改变 inset 不会改变 radius。`insetOwner` 明确内边距由外壳还是 Header/Content 持有，避免嵌套双重 padding。
- Menu 与 Popover 是不同 family，默认 surface radius 都为4，但 inset 分别为4与8；Menu item radius2、inline padding6 与 Popover 内容 gap6 各有明确字段，不混成按钮形状。

组合 Gallery 的默认、flat、加大间距是只读演示配置，不是用户主题编辑器。入口 `bun --hot apps/gpuix/src/gallery/controls.tsx` 需要已批准的独占桌面时段；小量整页取证为 `bun apps/gpuix/src/gallery/verification/evidence.tsx`，默认创建系统临时目录下私有的 `zoeydaw-a3-composition-*` 目录并输出真实路径，不批量提交图片。

本轮没有声称整个应用已 token 化。业务私有布局、反馈组件的既有内部布局、用户内容色与工程几何不扩。已知 HomePage 的 Card 实例覆盖由 app-shell owner 迁到 `size="project"`，本切片不越界修改 app。

## 预设来源

- Default：`apps/web/src/index.css` 的 `:root` 与 `.dark`（Web 选 Default 时清空覆盖值，露出的就是这两块）。
- 其余 42 个：`packages/ui/src/theme/theme-presets.ts`（tweakcn）。Web 列表共 43 项（含 Default），不是 44。
- 颜色原样复制：hex 与 `oklch()` 字面量保持源精度，不经 HSL 转换。gpuix 的 csscolorparser 直接接受两者。
- id：Web 的 Default 是空字符串 `""`，gpuix 用 `"default"`。持久化的旧值 `""` 读成 `null`，回退 Default。

## 持久化

`platform/settings/theme-preset.ts` 的 `createThemePresetSetting(isThemePresetId, DEFAULT_THEME_PRESET)`：`get()` 校验，未知、已删除或旧格式的 id 返回 `null`（调用方回退 Default），读取不写文件。其他设置的写入会把旧值原样带过去，所以组合根启动时调用一次 `repair()`：存的是无效 id 时写入 `default` 并返回 `true`。`platform` 不能 import `shared/theme`，预设校验与 Default id 由组合根注入。

## 字段对照

预设提供的字段（`ThemeColors`），每个预设 light/dark 各一份。这是迁移前 gpuix 已有的 23 个字段，未增减；`secondaryForeground` 目前没有产品消费者，保留以与 `secondary` 成对（`Button` 的 secondary 变体使用 `secondary`），不单独删除：

| Web CSS 变量              | `ThemeColors` 字段    |
| ------------------------- | --------------------- |
| `--background`            | `background`          |
| `--foreground`            | `foreground`          |
| `--card`                  | `card`                |
| `--card-foreground`       | `cardForeground`      |
| `--popover`               | `popover`             |
| `--popover-foreground`    | `popoverForeground`   |
| `--primary`               | `primary`             |
| `--primary-foreground`    | `primaryForeground`   |
| `--secondary`             | `secondary`           |
| `--secondary-foreground`  | `secondaryForeground` |
| `--muted`                 | `muted`               |
| `--muted-foreground`      | `mutedForeground`     |
| `--accent`                | `accent`              |
| `--accent-foreground`     | `accentForeground`    |
| `--destructive`           | `destructive`         |
| `--border`                | `border`              |
| `--input`                 | `input`               |
| `--ring`                  | `ring`                |
| `--chart-1` … `--chart-5` | `chart1` … `chart5`   |

`derive()` 在其上增加的角色（`DerivedThemeColors`），公式与 Web `index.css` 一致：

| Web CSS 变量 | 字段 | 来源 |
| --- | --- | --- |
| `--arrangement-clip-selected` | `arrangementClipSelected` | Web `:root` 常量，任何预设与模式都不覆盖 |
| `--arrangement-clip-paper` | `arrangementClipPaper` | 同上 |
| `--editor-shell` | `editorShell` | `color-mix(muted 30%, background)` |
| `--canvas-scrollbar(-hover/-active)` | `canvasScrollbar(Hover/Active)` | `foreground` 10%/18%/26% 透明 |
| `--scrollbar-track` | `scrollbarTrack` | `color-mix(foreground 4%, background)` |
| `--arrangement-surface-selected` | `arrangementSurfaceSelected` | `color-mix(card 78%, foreground)` |
| `--arrangement-surface` | `arrangementSurface` | `color-mix(card 86%, foreground)` |
| `--arrangement-surface-alt` | `arrangementSurfaceAlt` | `color-mix(card 84%, foreground)` |
| `--arrangement-line` | `arrangementLine` | `light-dark(border, muted)` |
| `--arrangement-automation`、`--arrangement-meter-danger` | `arrangementAutomation`、`arrangementMeterDanger` | `destructive` |
| `--arrangement-volume`、`--arrangement-meter-good` | `arrangementVolume`、`arrangementMeterGood` | `chart-2` |
| `--arrangement-meter-warn` | `arrangementMeterWarn` | `light-dark(chart-4, chart-3)` |
| `--arrangement-meter-peak` | `arrangementMeterPeak` | `muted-foreground` |
| `--arrangement-clip-ink` | `arrangementClipInk` | `light-dark(foreground, card)` |
| `--arrangement-fade-mask` | `arrangementFadeMask` | `color-mix(clip-ink 50%, transparent)` |

## gpuix 不消费、迁移时丢弃的预设 token

| Web token | 丢弃原因 |
| --- | --- |
| `destructive-foreground` | gpuix 没有消费者；Web 的 `index.css` 也未定义它 |
| `sidebar`、`sidebar-foreground`、`sidebar-primary`、`sidebar-primary-foreground`、`sidebar-accent`、`sidebar-accent-foreground`、`sidebar-border`、`sidebar-ring` | gpuix 没有 shadcn sidebar；侧栏表面用 `card`/`muted` |
| `radius` | 预设不控制形状；原生圆角来自 `Theme.design`，几何高度/图标尺寸仍由共享 metrics 提供 |
| `font-sans`、`font-serif`、`font-mono` | `Theme` 没有字体字段，文字用系统字体；预设字体（Inter、Lora 等）不随应用打包 |
| `letter-spacing`、`spacing` | 不随配色预设变化；原生语义间距由 `Theme.design` 与既有几何 metrics 分工提供 |
| `shadow-color`、`shadow-opacity`、`shadow-blur`、`shadow-spread`、`shadow-offset-x`、`shadow-offset-y` | 工作站层级用颜色与细线表达，不用阴影（UI 规范第 1 节） |

## 不变量（`presets.test.ts`）

43 个预设 × 2 个模式：每个派生角色都存在，是 gpuix 能解析的 hex/oklch，RGB 通道有限。每个预设的明暗方向都与 Default 一致：light 的 `background` 比 dark 亮，`foreground` 比 dark 暗；Arrangement 表面向 foreground 递进（light 中 `surfaceSelected < surfaceAlt < surface`，dark 中相反）；`arrangementClipInk` 在两种模式下都比 `arrangementClipPaper` 暗。逐一核对过，没有例外。

不作为不变量的关系：`arrangementLine` 与 `arrangementSurface` 的亮度顺序。Default light 的线比表面亮（`border` 92.2% 高于 card 混 14% foreground 的表面），这个顺序在 24 个预设 light 中反转，dark 中 Retro Arcade 反转。这是预设作者对 `border`/`muted` 的取值，Web 同样如此渲染，不改写。
