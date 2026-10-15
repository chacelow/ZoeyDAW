# A3 ui-controls:共享控件库(gpuix 原生)

## Target

Worktree `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-a3-ui-controls`(分支 `gpuix-a3-ui-controls`)。在 `apps/gpuix/src/ui/controls/**` 建立共享控件。只迁 `apps/web` 实际消费的符号,不迁 `packages/ui` 的整个 43k LOC。

## 被消费的符号清单(实测自 `apps/web/src`,共 78 个,以下为需要实现的控件与行为)

- **Button 族**:`Button`、`DropdownButton`、`PopupButton`、`IconSlot`
- **数值拖动族**:`DragPadNumber`、`DragPadBar`、`DragPadBipolar`、`DragPadToggle`、`PanControl`
- **菜单族**:`ContextMenu{,Trigger,Content,Item,Label,Separator,RadioGroup,RadioItem,Sub,SubTrigger,SubContent}`、`DropdownMenu{,Trigger,Content,Item,CheckboxItem,Portal,Sub,SubTrigger,SubContent}`、`Popover{,Trigger,Content,Header,Title}`
- **容器/反馈**:`Card{,Header,Title,Description,Content}`、`Empty{,Header,Title,Description}`、`Separator`、`Progress`、`Loading`、`LoadErrorScreen`、`ScrollArea`、`Toaster`/`toast`/`toastLoading`
- **表单**:`Label`、`Input`、`RadioGroup{,Item}`、`ToggleGroup{,Item}`、`SettingsShell`、`SettingsNavItem`、`MotionTabs`
- **环境与拖拽**:`ControlEnvironment`、`ControlEnvironmentProvider`、`ControlGroup`、`ControlInfo`、`useInfoBinding`、`DragPreviewArea`
- 主题类(`ThemeProvider/useTheme/THEME_PRESETS/applyThemeOrClear/Theme/ThemePreset`)与度量(`CONTROL_METRICS/PROJECT_METRICS`)已由 `shared/theme` 提供,不属于你;若主题预设缺口(`THEME_PRESETS`、切换)需要改 `shared/theme`,ask。

## Change

1. **复用已完成的 DragPad**:`apps/gpuix/src/features/drag-pad/**` 已有 `DragPadNumber`(相对拖动 + Rust 光标锁 + 预编辑/编辑 + wheel + 双击重置,26 个测试)。把它迁入 `ui/controls/DragPad/` 作为族的基础,并在其上实现 `DragPadBar`(带填充条)、`DragPadBipolar`(中心原点)、`DragPadToggle`(点击切换,同尺寸同样式)、`PanControl`。**同一个拖动比例、同一个 hook(`useDragPad`)、同一个尺寸度量**,各变体只是 `sv` variant;不要写第二套拖动逻辑。track-mixer 的 `useRelativeDrag`/`DragControlShell`(`features/track-mixer`)是较弱的早期版本,不要复用。
2. **Button 变体**:点击切换激活态 variant、独立于 hover 的 highlight 状态(默认开,可关)、图标变色随共享按钮行为;图标专用按钮为正方形。变体统一用 `sv`。
3. **菜单/弹层**:优先使用 `@gpuix/react` 已发布的 `Select`、`Combobox`、`Tooltip`,以及 `docs/research/gpuix-controls-ecosystem.md` 评估过的社区源码(`wdcodecn/gpuix-base-ui`、`drewnekota/gpuix-ui`)。先读该调研文档再选;采用社区源码要固定 SHA、审计、改成注入项目 token,并 ask 后再引入依赖或拷贝源码。弹层可向左/右/上/下对齐、保留换行、下拉指示器固定右侧;含可调控件的弹层在内部点击与调整期间保持打开。
4. **`ControlEnvironment`**:应用作用域提供;画廊作用域独立;`useInfoBinding` 把组件类型映射为 Footer Info(不发布资源名/输入值)。
5. **度量**:`CONTROL_METRICS` 的紧凑控件为共享默认。数值控件宽度按实际格式化字符串**测量**:gpuix 无 `measureText`,先评估 Rust 侧用 `ab_glyph`/`cosmic-text` 或 GPUI 的 text system 暴露测量函数的可行性(若可行,在 `crates/native` 增加 `measureText` 属于契约变更→**ask**;不行则保留现有字符宽度估算并在报告写明限制)。
6. 每个控件有 `index.tsx` 主组件 + 同目录测试(`createTestRoot`):覆盖状态转换、命中/尺寸边界、键盘可达性,不测转发/源码文本。a11y lint(`jsx-a11y`、`github/a11y-*`)要真修,不得关规则;role 必须配 `tabIndex={0}` + `aria-disabled`,而不是三元 `tabIndex`(lint 静态分析认不出)。
7. 一个 `ui/controls/gallery.tsx` 画廊(替代 `ControlSizingDemo` 与 Storybook 的消费价值):展示全部控件与变体,`bun --hot` 可运行。

## Constraints

- 不改 `shared/theme/**`、`crates/**`、`project/**`、`ui/panels/**`。需要的契约变更一律 ask。
- 不新增 npm 依赖,不拷贝大块第三方源码,先 ask。
- 不要为 `packages/ui` 里**未被消费**的控件写任何东西(日历、图表、数据表、代码编辑器、Emoji picker 等)。
- 禁止 `any`、内联 `import("pkg").Type`;类型导入用顶层 `import type`;已知路径用静态 import。

## Ownership

`apps/gpuix/src/ui/controls/**`。迁入 DragPad 后,`apps/gpuix/src/features/drag-pad/**` 在你的分支里 `git mv` 到新位置(不要留两份)。

## Observable acceptance

- `bun test src/ui/controls` 通过;`tsc --noEmit` 通过;`ultracite` 门禁通过。
- `bun --hot src/ui/controls/gallery.tsx` 打开真实窗口,AX 树里能看到全部控件;对每类控件至少一次真实交互(点击切换、菜单展开选择、DragPad 真实拖动 120→130、弹层内连续调整不关闭),附 AX/截图证据。
- DragPad 在真实窗口里拖动后,光标读回与按下点一致(`@zoeydaw/native.cursorPosition()` 实测)。
