# shared/theme

主题的唯一 owner：颜色、配色预设、共享度量、`sx`/`sv`。各切片只经 `useTheme()` 读取，不 import `colors.ts` 或 `presets.data.ts`。

## 文件

| 文件 | 职责 |
| --- | --- |
| `ThemeProvider.tsx` | `ThemeProvider` 与 `useTheme()`。无内部 state：`appearance`、`preset` 由组合根受控传入，切换只换 context value，不重挂载子树。都不传时等于旧行为（`defaultAppearance`，缺省 dark，Default 预设）。 |
| `presets.ts` | `THEME_PRESETS`（Web 菜单顺序，Default 在首位）、`ThemePresetId`、`DEFAULT_THEME_PRESET`、`getThemePreset(id)`、`isThemePresetId(value)`。每个预设的 light/dark 在模块加载时各派生一次。 |
| `presets.data.ts` | 生成文件，不手改。 |
| `generate-presets.mjs` | 生成器：`node apps/gpuix/src/shared/theme/generate-presets.mjs`；`--check` 校验生成结果未过期。 |
| `web-tokens.ts` | `ThemeColors` 字段 → Web CSS 变量的唯一对照表，生成器与类型都从它来。 |
| `colors.ts` | `ThemeColors`、`DerivedThemeColors` 与唯一的 `derive(base, scheme)`。 |
| `color-mix.ts` | 把 `color-mix(in oklab, …)` 解析成 hex8。 |
| `content-color.ts` | 轨道、Clip 的 `var(--chart-N)` 内容色按当前主题解析。 |

## 预设来源

- Default：`apps/web/src/index.css` 的 `:root` 与 `.dark`（Web 选 Default 时清空覆盖值，露出的就是这两块）。
- 其余 42 个：`packages/ui/src/theme/theme-presets.ts`（tweakcn）。Web 列表共 43 项（含 Default），不是 44。
- 颜色原样复制：hex 与 `oklch()` 字面量保持源精度，不经 HSL 转换。gpuix 的 csscolorparser 直接接受两者。
- id：Web 的 Default 是空字符串 `""`，gpuix 用 `"default"`。持久化的旧值 `""` 读成 `null`，回退 Default。

## 持久化

`platform/settings/theme-preset.ts` 的 `createThemePresetSetting(isThemePresetId)`：读取时校验，未知、已删除或旧格式的 id 返回 `null`（调用方回退 Default），读取不写文件；下一次 `set` 覆盖旧值。`platform` 不能 import `shared/theme`，预设校验由组合根注入。

## 字段对照

预设提供的字段（`ThemeColors`），每个预设 light/dark 各一份：

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
| `radius` | 圆角、尺寸来自共享度量（`CONTROL_METRICS`/`PROJECT_METRICS`），不随预设变化 |
| `font-sans`、`font-serif`、`font-mono` | `Theme` 没有字体字段，文字用系统字体；预设字体（Inter、Lora 等）不随应用打包 |
| `letter-spacing`、`spacing` | 同 `radius`，度量不随预设变化 |
| `shadow-color`、`shadow-opacity`、`shadow-blur`、`shadow-spread`、`shadow-offset-x`、`shadow-offset-y` | 工作站层级用颜色与细线表达，不用阴影（UI 规范第 1 节） |

## 不变量（`presets.test.ts`）

43 个预设 × 2 个模式：每个派生角色都存在，是 gpuix 能解析的 hex/oklch，RGB 通道有限。每个预设的明暗方向都与 Default 一致：light 的 `background` 比 dark 亮，`foreground` 比 dark 暗；Arrangement 表面向 foreground 递进（light 中 `surfaceSelected < surfaceAlt < surface`，dark 中相反）；`arrangementClipInk` 在两种模式下都比 `arrangementClipPaper` 暗。逐一核对过，没有例外。

不作为不变量的关系：`arrangementLine` 与 `arrangementSurface` 的亮度顺序。Default light 的线比表面亮（`border` 92.2% 高于 card 混 14% foreground 的表面），这个顺序在 24 个预设 light 中反转，dark 中 Retro Arcade 反转。这是预设作者对 `border`/`muted` 的取值，Web 同样如此渲染，不改写。
