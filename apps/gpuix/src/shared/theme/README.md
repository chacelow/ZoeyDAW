# shared/theme

主题的唯一 owner：颜色、配色预设、共享几何、原生语义外观 token、`sx`/`sv`。业务只经 `useTheme()` 读取，不 import `colors.ts` 或 `presets.data.ts`。

## 文件

| 文件 | 职责 |
| --- | --- |
| `ThemeProvider.tsx` | `ThemeProvider` 与 `useTheme()`。无内部 state：`appearance`、`preset`、完整 `colors/design/layout/control/transportControl/project` 由组合根受控传入，切换不重挂载子树。省略分组采用集中默认值；省略 layout 时从当前 control/project 派生，不合并 partial、不写设置。 |
| `presets.ts` | `THEME_PRESETS`、`ThemePresetId`、`DEFAULT_THEME_PRESET`、`getThemePreset(id)`、`isThemePresetId(value)`；`baseColors` 是语义 palette，`colors` 是默认配方的 light/dark 缓存。 |
| `presets.data.ts` | gpuix 主题预设数据源；迁移后直接维护，颜色字面量保持原精度。 |
| `metrics/control-metrics.json` | 控件与工程几何的单一数据源，由 `metrics/config.ts` 直接导入；无 CSS 生成路径。 |
| `colors.ts` | `ThemeColors`、`DerivedThemeColors` 与唯一的 `derive(base, scheme, recipes)`。 |
| `color-mix.ts` | 把 `color-mix(in oklab, …)` 解析成 hex8。 |
| `content-color.ts` | 轨道、Clip 的 `var(--chart-N)` 内容色按当前主题解析。 |
| `design-tokens.ts` | 原生 `DesignTokens`、Card 语义变体与默认值；几何默认值从本地 metrics 派生。 |
| `design-details.ts` | 状态、指针、动效、浮层、通知、空态与编辑器绘制的集中设计条目。 |
| `color-recipes.ts` | 混色比例与语义别名；MIDI velocity 的可配置色阶解析；协议值 127 不属于主题。 |
| `layout-tokens.ts` | 面板约束、首页宽度与解析后的轨道/编排几何；`createLayoutTokens(control, project)`、`DEFAULT_LAYOUT_TOKENS`。 |

## 原生设计入口

`Theme.design` 始终是完整的 `DesignTokens`。`Theme.control`、`transportControl`、`project` 继续拥有原有高度、字体、图标与工程度量；`Theme.layout` 拥有面板与纯几何。这些组支持运行时受控替换。`colors` 可提供包含全部语义角色的 `Theme["colors"]`，用于运行时颜色覆盖和原生测试输入；传入时整体采用并跳过派生，省略时保留 preset/scheme 与配方的原缓存路径。纯轨道布局显式接收 `theme.layout.track`，不读取 JSON；应用把 layout 注入 `ArrangementScene.geometry`，更新只读几何不改写持久轨高。

- `shape.controlRadius` 统一 Button、数值壳、Input、ControlGroup、MotionTabs 与设置导航的同类圆角。Toggle 与 ListRow 有各自的形状语义，默认值分别为2与0，不再借 gap 作为 radius。
- `shape.panelRadius` 默认7，独立于 `project.panelGap`。PanelShell 只消费形状与边框，不改变 Group/Panel 的求解、resize 或拖动 owner。
- `shape.indicatorRadius` 保持等宽高选中徽标的圆形语义，默认值是 control-track 高度的一半；不借用 control gap 或整段控件高度作为圆角。
- `controlBorderWidth=0` 时，数值与下拉宽度按真实 `borderWidth * 2` 推导；滚动条的内长和 thumb 横截面同样扣真实边框。Focus ring 与单选指示器描边是功能标记，独立于外壳边框。
- `typography.numberFontFamily` 是数值字体的唯一入口（默认 Menlo）。DragPadNumber 的测量样本、显示文字和真实 input 共用该值；覆盖字体时缓存按字体键重新测量，编辑态保留同一外壳宽度。
- `cards` 保存 `default`、`sm`、`controls`、`project` 的独立 radius/inset/gap。改变 inset 不会改变 radius。`insetOwner` 明确内边距由外壳还是 Header/Content 持有，避免嵌套双重 padding。
- Menu 与 Popover 是不同 family，默认 surface radius 都为4，但 inset 分别为4与8。Menu 与 DropdownButton 弹层复用 ListRow 基础 chrome，再统一使用 `menu.rowHeight/rowInset/rowGap`：行高由默认 control track 与上下 inset 推导，checkbox/radio/grid 共享同一尺寸；`separatorInset` 统一分隔线两侧的垂直留白，水平抵消 surface inset；`swatchRingWidth` 控制色格选中环。Popover 内容 gap6 仍由自身 token 持有。
- `design.colorRecipes` 控制混色、透明洗色与语义关联；默认配方复用预设缓存，覆盖配方按 scheme 重新派生。`contentFill(color, colors, paperTint)` 显式接收 `design.colorRecipes.contentPaperTint`，没有内部固定 tint。
- `layout.track` 一次解析控件行高、间距、边框、折叠高、标题高、resize 步长/阈值与上限。行与 Clip 投影携带同一 `trackGeometry`，命中与绘制不各读默认值。
- `layout.clipEditor.colorSwatchSize/nameWidth` 与 `layout.scrollArea.defaultHeight` 分别拥有 Clip 色块、名称输入宽度和滚动区域缺省高度。省略 layout 时在 `createLayoutTokens()` 中按原关系解析（默认8/200/260）；完整 layout 显式值优先。ScrollArea 的 `size`、`height`、`style.height` 和 `fill` 仍优先于缺省高度。

组合 Gallery 左侧与设置 Appearance 共用 `app/theme-editor/ThemeEditor`，不再保留 flat/spacious 只读演示或独立 controlScale 偏移。Gallery 的主题库属于页面会话，设置页主题库属于应用偏好。两处都使用同一 `resolveThemeOverrides(library, appearance)`，修改立即作用于周围的 ThemeProvider，工程与控件编辑状态不重挂载。Gallery 侧栏使用 ScrollArea，仍位于控件环境 Provider 内。

## 预设来源

- 2026-10 迁移时完整保留 Default 与 42 个 tweakcn 预设；原 Web/CSS 输入已删除，当前权威来源是 `presets.data.ts`。
- 颜色原样复制：hex 与 `oklch()` 字面量保持源精度，不经 HSL 转换。gpuix 的 csscolorparser 直接接受两者。
- id：Web 的 Default 是空字符串 `""`，gpuix 用 `"default"`。持久化的旧值 `""` 读成 `null`，回退 Default。

## 持久化

`platform/settings/theme-preset.ts` 的 `createThemePresetSetting(isThemePresetId, DEFAULT_THEME_PRESET)`：`get()` 校验，未知、已删除或旧格式的 id 返回 `null`（调用方回退 Default），读取不写文件。其他设置的写入会把旧值原样带过去，所以组合根启动时调用一次 `repair()`：存的是无效 id 时写入 `default` 并返回 `true`。`platform` 不能 import `shared/theme`，预设校验与 Default id 由组合根注入。

用户主题由 `CustomTheme` 保存 `custom:` id、名称、基础预设、light/dark 两套 partial palette、partial design、default/transport 控件度量和 project 几何。`ThemeLibrary` 同时保存主题列表与当前 `ThemeSelection`（内置 id 或自定义 id）。颜色在基础预设上合并后调用唯一的 `derive()`；design 深合并默认值，度量合并集中默认值，再把完整分组传给 Provider，layout 仍从解析后的 control/project 派生。

`app/theme-editor/schema.ts` 的 `THEME_FIELDS` 是数值和颜色编辑、范围校验、分组及文案 key 的唯一列表：包含两套基础 palette、全部形状/间距/尺寸数值（不开放混色配方、指针枚举及动效）、default/transport 度量与 project 几何；数字字体族另以文本输入编辑。颜色复用现有 culori 解析器；JSON 边界丢弃非法字段并 `logger.warn`，非法元数据不导入。新建复制当前覆盖；内置预设只读；导入使用新的 id，不覆盖同名主题。删除正在使用的自定义主题回到其基础预设。

应用通过 `createThemeLibraryStore(createSettingStorage("themeLibrary"), basePreset)` 保存完整 JSON 字符串，沿用原生 settings 原子写机制；Rust 的可选字段兼容旧设置文件。`themePreset` 保留当前基础预设作为旧偏好回退，不保存第二份自定义内容。导出后 JSON 留在可复制 Input；导入可直接粘贴，不启动文件对话框。保存失败保留内存编辑并显示未持久化状态。

## 字段对照

预设提供的字段（`ThemeColors`），每个预设 light/dark 各一份；语义 palette 允许 `success`、`arrangementClipSelected` 与 `arrangementClipPaper` 独立于图表色和其他预设调整。旧 palette 不声明这些项时，由 `presets.data.ts` 集中填入保持原样的默认值。

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
| `--arrangement-clip-selected` | `arrangementClipSelected` | 预设的独立语义色 |
| `--arrangement-clip-paper` | `arrangementClipPaper` | 预设的独立语义色 |
| 通知成功 | `success` | 预设独立语义色；未声明时采用该预设 chart2 的初值，派生后不再作为 chart2 别名 |
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

上述历史配方的比例与语义别名现均在 `design.colorRecipes`，默认结果不变。新增 destructive 状态、listRowHover、dialogBackdrop、编辑器洗色与钢琴键配方已具备来源。

## 不变量（`presets.test.ts`）

43 个预设 × 2 个模式：每个派生角色都存在，是 gpuix 能解析的 hex/oklch，RGB 通道有限。每个预设的明暗方向都与 Default 一致：light 的 `background` 比 dark 亮，`foreground` 比 dark 暗；Arrangement 表面向 foreground 递进（light 中 `surfaceSelected < surfaceAlt < surface`，dark 中相反）；`arrangementClipInk` 在两种模式下都比 `arrangementClipPaper` 暗。逐一核对过，没有例外。

不作为不变量的关系：`arrangementLine` 与 `arrangementSurface` 的亮度顺序。Default light 的线比表面亮（`border` 92.2% 高于 card 混 14% foreground 的表面），这个顺序在 24 个预设 light 中反转，dark 中 Retro Arcade 反转。这是预设作者对 `border`/`muted` 的取值，Web 同样如此渲染，不改写。
