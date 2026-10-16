# 产品 style-layout 硬编码清单

## 结论与口径

本切片只审计 `apps/gpuix/src` 的产品 TS/TSX；排除 tests、verification、demo、evidence、gallery、presets.data.ts、locales。未运行构建、测试、安装或窗口操作。统计单位为**迁移组**（同一语义/字面值的多个位置合并），不是正则命中行数；每行可包含多个相关字面值。

| 子类别                    | 迁移组数 |
| ------------------------- | -------: |
| 1. 工程面板与窗口约束     |        6 |
| 2. 浮层、占位与控件几何   |        9 |
| 3. 边框、线条、focus ring |        8 |
| 4. 颜色、混色配方         |        9 |
| 5. 透明度与视觉状态       |       10 |
| 6. 字体与图标             |        6 |
| 7. 编排/MIDI 几何与密度   |        6 |
| 8. 动效、通知与指针映射   |        6 |
| **合计**                  |   **60** |

A = 已有同语义 token 却绕过；B = 缺少对应可配置项（即使使用 token × 固定倍数，配方仍未配置）；C = 留在代码的算法/协议/结构常量。A/B 标在表中；“A/B”表示同一组里不同用途必须拆分，不能因值相同就全映射到一个 token。

关键架构事实：`ThemeProvider.tsx:41,57-60` 只有 `design` 可由 provider 输入覆盖，`control`、`transportControl`、`project` 始终取静态 JSON。因此“已通过 useTheme”不等于已具备用户可调/运行时切换能力。`project/layout/track.ts:1-15,27` 直接绑定 JSON，绕开 context；将来注入 metrics 时模型几何与画面可能分叉。

下文 `S` = `apps/gpuix/src`。每个位置均为仓库相对路径，写作 `S/...:行`。

## 1. 工程面板与窗口约束（6 组）

| ID/类 | 字面值 | 全部相关位置 | 控制内容 → 应归属 |
| --- | --- | --- | --- |
| 1.1 B | `25%`,`50%`,`30%`,`40%`,`20%`,`70%` | `S/app/project/layout-constraints.ts:8-13`；消费 `S/app/project/ProjectLayout.tsx:59,61,75,134-136` | Browser 初始/最大、Arrangement 最小、Clip 初始/最小/最大；PROJECT_LAYOUT 已从组件抽出但仍是第二配置中心 → 新 `layout.project.panels`，持久化用户实际尺寸与默认设计约束分离 |
| 1.2 B | `1280`,`800` | `S/main.tsx:53-54` | 初始窗口宽高（注释说明复制 tauri 配置）→ 新 `layout.window.initialSize` / window setting；不要写入 theme typography |
| 1.3 B | `720`,`520`,`168` | `S/ui/controls/SettingsShell/index.tsx:133,155-156` | Settings 窗体和侧栏 → `theme.design.settings` 扩展 shellWidth/shellHeight/navigationWidth |
| 1.4 B | `4 * DEFAULT_TRACK_HEIGHT` | `S/project/layout/track.ts:12` | 轨道最大高 280 是固定默认轨道高倍数 → `theme.project.maxTrackHeight` / layout constraints；默认高 70 已在 metrics，不应再新建副本 |
| 1.5 B | `identityWidth * 2`,`track * 2`,`defaultTrackHeight * 4` | `S/app/settings/ThemePresetGrid.tsx:23-24,39` | 色板列宽/色块高/滚动区高借用轨道 token → 新 `design.settings.presetGrid`；不是重复的轨道尺寸 |
| 1.6 B | `controlsWidth * 3` | `S/app/home/HomePage.tsx:49` | 首页最大内容宽借用轨道控制宽 → 新 `layout.home.maxWidth` |

## 2. 浮层、占位与控件几何（9 组）

| ID/类 | 字面值 | 全部相关位置 | 控制内容 → 应归属 |
| --- | --- | --- | --- |
| 2.1 B | `320` | `S/ui/controls/DropdownButton/index.tsx:92`；`S/ui/controls/DragPreviewArea/index.tsx:216` | 菜单最大宽/拖动预览最大宽，重复字面值不同语义 → `design.menu.maxWidth`、`design.dragPreview.maxWidth` |
| 2.2 B | `300` | `S/ui/controls/DropdownButton/index.tsx:93` | 下拉最大高度 → `design.menu.maxHeight` |
| 2.3 B | `sideOffset = 4` | `S/ui/controls/DropdownButton/index.tsx:64`；`S/ui/controls/Menu/content.tsx:34`；`S/ui/controls/Popover/index.tsx:153`；`S/ui/controls/PopupButton/index.tsx:40` | 浮层与触发器距离 → 新 `design.overlay.sideOffset`，各组件默认统一读取 |
| 2.4 B | `collisionPadding = 8` | `S/ui/controls/Menu/content.tsx:35`；`S/ui/controls/Popover/index.tsx:154` | 视口边缘安全区 → `design.overlay.collisionPadding`；不能只因与 popover.inset 同为 8 而合并 |
| 2.5 B | `track * 10`,`track * 12` | `S/ui/controls/Menu/content.tsx:76`；`S/ui/controls/Popover/index.tsx:183` | 菜单/popover 默认宽度 → 各自 width token；字体/控件高不应决定内容面板宽 |
| 2.6 A/B | `gap:8`,`padding:8` | `S/ui/controls/DragPreviewArea/index.tsx:214-215` | 预览内边距可复用 `design.popover.inset`（8）；gap 应有 dragPreview.gap 或明确采用 popover.gap（现为 6），不要假称已有相同语义 gap |
| 2.7 B | `gap * 4`,`gap * 6`,`gap * 3`,`track-gap * 2` | `S/ui/controls/Empty/index.tsx:21-23,45` | 空态间距/内边距/圆角/内容 gap → 新 `design.empty` |
| 2.8 B | `gap * 3`,`icon * 6`,`track * 3` | `S/ui/controls/Loading/index.tsx:47,61-62` | loading 间距、品牌图尺寸 → 新 `design.loading` |
| 2.9 B | `gap * 3`,`gap * 2`,`controlsWidth` | `S/ui/controls/Toaster/index.tsx:141-149,167-170`；`S/ui/controls/Loading/index.tsx:68` | Toast 边缘距离/stack gap/内边距/圆角/宽度；loading 进度宽借用轨道宽 → 新 `design.toast`、`design.loading.progressWidth` |

## 3. 边框、线条、focus ring（8 组）

| ID/类 | 字面值 | 全部相关位置 | 控制内容 → 应归属 |
| --- | --- | --- | --- |
| 3.1 A | `borderWidth:1` | `S/app/settings/ThemePresetGrid.tsx:77`；`S/ui/controls/Toaster/index.tsx:169`；`S/project/sections/footer/EffectChain/DeviceCard/index.tsx:78`；`S/project/sections/arrangement/tracks/TrackRows/index.tsx:123` | swatch/control/card/拖动目标边框 → 已有 `design.shape.controlBorderWidth/cardBorderWidth`，选择语义正确 token |
| 3.2 B | `1` | `S/ui/controls/Separator/index.tsx:25`；`S/ui/controls/ControlGroup/index.tsx:59`；`S/ui/controls/DropdownButton/index.tsx:176`；`S/ui/controls/Menu/index.tsx:342` | 分隔线厚度 → 新 `design.shape.separatorWidth`；不等同 panelBorder=2 |
| 3.3 B | `marginTop/Bottom:3`、`:4` | `S/ui/controls/DropdownButton/index.tsx:178-179`；`S/ui/controls/Menu/index.tsx:344-345` | 同为菜单分隔线，却两套 margin → 新 `design.menu.separatorInset` |
| 3.4 A | `outlineWidth:1`,`outlineOffset:-1` | `S/project/sections/clip-edit/audio/SourceMarker.tsx:92`；`S/project/sections/clip-edit/midi/PianoKeys.tsx:104`；`S/project/sections/clip-edit/midi/VelocityLane.tsx:158`；offset 另见 `S/project/sections/clip-edit/pattern/PatternSteps.tsx:125` | 宽度已有 `design.shape.focusRingWidth`；负 offset 应按 ring width 推导，不能固定 -1 |
| 3.5 B | `border*Width:1` | `S/project/sections/clip-edit/audio/AudioWaveformOverview.tsx:54,82`；`S/project/sections/clip-edit/audio/AudioWaveformRulers.tsx:111`；`S/project/sections/clip-edit/audio/SourceMarker.tsx:153`；`S/project/sections/clip-edit/midi/MidiRuler.tsx:52,96`；`S/project/sections/clip-edit/midi/PianoKeys.tsx:67,95`；`S/project/sections/clip-edit/midi/NoteGrid.tsx:176,217`；`S/project/sections/arrangement/timeline/rulers/index.tsx:73,174`；`S/project/sections/arrangement/tracks/GroupRails/index.tsx:43`；`S/project/sections/arrangement/timeline/minimap/Overview.tsx:34` | 编辑器分界线/loop/选框/notes 边框 → 新 editor stroke families；其中交互框可明确复用 controlBorderWidth |
| 3.6 B | `width/height:1` | `S/project/sections/arrangement/lane/LaneOverlay/index.tsx:80,109,124`；`S/project/sections/arrangement/tracks/Row/index.tsx:139`；`S/project/sections/arrangement/timeline/rulers/index.tsx:274`；`S/project/sections/arrangement/timeline/minimap/Overview.tsx:67`；`S/project/sections/arrangement/timeline/minimap/Playhead.tsx:27`；`S/project/sections/footer/EffectChain/index.tsx:258`；`S/project/sections/clip-edit/audio/AudioWaveformLayer.tsx:83,95,150`；`S/project/sections/clip-edit/audio/SourceMarker.tsx:167`；`S/project/sections/clip-edit/midi/MidiRuler.tsx:77`；`S/project/sections/clip-edit/midi/VelocityLane.tsx:96,155`；`S/project/sections/arrangement/lane/ClipContents.tsx:170` | playhead/insertion/selection/marker/loop/velocity 线宽 → `theme.project` 各语义线宽或共享 hairline；已有 arrangementGridMajorLineWidth=1 只覆盖网格，不能泛化为所有线 |
| 3.7 A/B | `strokeWidth:1`、网格 minor 宽 `1`、note inset `+1/-1` | `S/project/sections/clip-edit/midi/note-paint.ts:95-98,144-150`；`S/project/sections/arrangement/core/rulers/grid-quads.ts:31` | MIDI note stroke 可复用 controlBorderWidth；MIDI/grid minor stroke 和行间 inset 需 editor geometry token |
| 3.8 B | `borderRadius:0`,`gap:0` | `S/project/sections/arrangement/lane/interactions/automation/ValueEditor/index.tsx:160`；`S/project/sections/arrangement/lane/interactions/clip/NameEditor/index.tsx:104`；`S/project/sections/footer/index.tsx:89-90` | 这几个 0 是设计性方角/无缝 tabs（非算法零），应有 `design.editor.inlineRadius`、footer tab shape/joinedGroupGap |

## 4. 颜色、混色配方（9 组）

| ID/类 | 字面值 | 全部相关位置 | 控制内容 → 应归属 |
| --- | --- | --- | --- |
| 4.1 B | `oklch(0.65 0.17 265)`、`oklch(0.65 0.18 230)` | `S/project/model/reducers.ts:63` | 新建 group/其他轨道默认颜色直接写入文档 → 新 `projectDefaults.trackPalette`；既有项目保存的用户颜色仍为内容数据，不应随主题被改写 |
| 4.2 B | `oklch(87% 0.05 220deg)`、`oklch(97% 0.005 90deg)` | `S/shared/theme/colors.ts:40-41,87-88` | 已集中但所有 preset 固定 clipSelected/clipPaper → 纳入 theme preset 的语义色，而不是当成组件绕过 token |
| 4.3 B | `20/10`,`30/20`,`40`,`40/20` | `S/ui/controls/Button/index.tsx:51,55,96,98-100` | destructive active/highlight/focus 随明暗分支配色 → `theme.colors` 派生 destructive state tokens 或新 color recipe 配置 |
| 4.4 B | `90` | `S/ui/controls/ListRow/index.tsx:55` | row hover 混色百分比 → derived listRowHover |
| 4.5 A | `10`（foreground + transparent） | `S/app/dialog/ModalDialog.tsx:42` | 与 `S/shared/theme/colors.ts:90` 的 canvasScrollbar 配方相同；语义应新增 dialogBackdrop（不要直接用 scrollbar token）并集中 derive recipe；A 指绕过既有集中派生机制，不是已有 dialogBackdrop 字段 |
| 4.6 B | `12`,`45`,`30`,`20` | `S/project/sections/clip-edit/audio/AudioWaveformOverview.tsx:84`；`S/project/sections/clip-edit/audio/AudioWaveformRulers.tsx:109`；`S/project/sections/clip-edit/audio/SourceMarker.tsx:90`；`S/project/sections/clip-edit/midi/NoteGrid.tsx:219` | overview viewport、audio loop、marker hover、marquee fill 的透明混色 → editor semantic fill recipes |
| 4.7 B | `75`,`80` | `S/project/sections/clip-edit/midi/PianoKeys.tsx:53,56-57` | 明暗主题钢琴白/黑键配方 → derived pianoIvory/pianoEbony |
| 4.8 B | `60`,`55 + velocity/127*45`,`35 + velocity/127*65` | `S/project/sections/clip-edit/midi/note-paint.ts:103,134-135` | note 边框/选中与未选中的 velocity 色阶 → `design.editor.notePaint` / theme color recipe；127 属 MIDI 协议不迁移 |
| 4.9 B | `30,10,18,26,4,78,86,84,50`；chart2/3/4/destructive 别名 | `S/shared/theme/colors.ts:89-106`；Toast success 直取 chart2 `S/ui/controls/Toaster/index.tsx:175` | 已在统一 derive 中，无组件硬编码问题，但 recipe 系数/语义关联不可随 preset 调整 → 如要求所有视觉可配置，扩展 preset recipes；success 应独立语义色，不借 chart2 |

## 5. 透明度与视觉状态（10 组）

| ID/类 | 字面值 | 全部相关位置 | 控制内容 → 应归属 |
| --- | --- | --- | --- |
| 5.1 B | disabled `0.5` | `S/ui/controls/chrome.ts:59`；`S/ui/controls/Input/index.tsx:51`；`S/ui/controls/Label/index.tsx:37`；`S/ui/controls/ListRow/index.tsx:74`；`S/ui/controls/MotionTabs/index.tsx:90`；`S/ui/controls/RadioGroup/index.tsx:94`；`S/ui/controls/SettingsShell/index.tsx:63`；`S/ui/controls/ToggleGroup/index.tsx:135`；`S/ui/controls/DragPreviewArea/index.tsx:160`；`S/ui/controls/DropdownButton/index.tsx:218`；`S/ui/controls/ScrollArea/ControlledScrollbar.tsx:71`；`S/project/sections/footer/EffectChain/DeviceCard/index.tsx:188` | 全局 disabled opacity → 新 `design.states.disabledOpacity` |
| 5.2 B | ghost/selection `0.5` | `S/project/sections/arrangement/lane/ClipCard.tsx:40`；`S/project/sections/arrangement/lane/LaneRow/Contents.tsx:112` | clip ghost / 时间范围选择，和 disabled 同值不同语义 → editor ghostOpacity/rangeOpacity |
| 5.3 B | `0.4` | `S/ui/controls/DragPreviewArea/index.tsx:159`；`S/project/sections/clip-edit/audio/AudioWaveformLayer.tsx:97` | drag source opacity / 波形中心线 → states.dragSourceOpacity、editor.waveformAxisOpacity |
| 5.4 B | `0.85` | `S/ui/controls/DragPreviewArea/index.tsx:217`；`S/project/sections/arrangement/lane/LaneRow/Contents.tsx:173` | drag preview / group clip preview → 分别的 opacity token |
| 5.5 B | `0.2` | `S/project/sections/arrangement/lane/LaneRow/Contents.tsx:229` | 绘制范围 tint → editor.drawPreviewOpacity |
| 5.6 B | `0.1` | `S/project/sections/arrangement/lane/ClipContents.tsx:186` | clip loop shading → editor.clipLoopShadeOpacity |
| 5.7 B | `0.35` | `S/project/sections/clip-edit/midi/MidiRuler.tsx:65` | MIDI loop band → editor.midiLoopOpacity |
| 5.8 B | `0.45`,`0.55` | `S/project/sections/clip-edit/midi/note-paint.ts:95`；`S/project/sections/arrangement/core/rulers/grid-quads.ts:3` | MIDI major/minor 与 arrangement minor 网格透明度；0.55 重复 → project.gridOpacity family |
| 5.9 B | `0.3` | `S/ui/controls/DragPad/DragPadNumber.tsx:134` | 数值拖动 fill → design.dragPad.fillOpacity |
| 5.10 B | `0.5`,`30%` | `S/ui/controls/Progress/index.tsx:45,48` | indeterminate fill opacity 与占用宽 → design.progress.indeterminateOpacity/widthFraction；determinate 的比例数学不迁移 |

## 6. 字体与图标（6 组）

| ID/类 | 字面值 | 全部相关位置 | 控制内容 → 应归属 |
| --- | --- | --- | --- |
| 6.1 B | `fontWeight:600` | `S/app/home/HomePage.tsx:63`；`S/app/router/NotFoundPage.tsx:27`；`S/app/settings/SettingsDialog.tsx:212`；`S/app/shell/TitleBar.tsx:56`；`S/app/window/UnsavedCloseDialog.tsx:42`；`S/project/sections/clip-edit/NameInput.tsx:54`；`S/ui/controls/Card/index.tsx:177`；`S/ui/controls/Empty/index.tsx:63`；`S/ui/controls/LoadErrorScreen/index.tsx:71`；`S/ui/controls/MotionTabs/index.tsx:85`；`S/ui/controls/Popover/index.tsx:275`；`S/ui/controls/SettingsShell/index.tsx:194`；`S/ui/controls/Toaster/index.tsx:183` | heading/title/selected tab 共用硬编码 semibold → 扩展 design.typography.weights，按语义引用 |
| 6.2 B | `fontWeight:500` | `S/app/home/HomePage.tsx:101`；`S/app/router/RouteErrorBoundary.tsx:111`；`S/app/settings/ThemePresetGrid.tsx:122`；`S/project/sections/arrangement/tracks/TrackIdentity/index.tsx:150` | medium 文本 → typography.weights.medium |
| 6.3 已集中 | `Menlo` | `S/shared/theme/design-tokens.ts:62`；消费者 `S/ui/controls/DragPad/DragPadNumber.tsx:92,215,226` | 数字字体已通过 design.typography.numberFontFamily，无产品 Menlo 直写副本；普通 UI 字体未在 DesignTokens 显式定义，若要全字体配置可扩展 typography.fontFamily |
| 6.4 B | `strokeWidth = 2` | `S/ui/controls/Icon/index.tsx:34` | Lucide stroke 是视觉偏好，不是协议限值 → design.icon.strokeWidth；图标实际尺寸经 control/transport icon metric（非硬编码尺寸） |
| 6.5 B | `strokeWidth:2` | `S/project/sections/footer/EffectChain/DeviceDisplay/index.tsx:28` | device response curve 描边 → project.deviceResponseStrokeWidth，与 icon stroke 语义不同 |
| 6.6 B | `200`,`60` | `S/project/sections/footer/EffectChain/DeviceDisplay/index.tsx:19-20,26-27` | Shape intrinsic 宽高（外部 style 100% 拉伸）→ device display geometry 的单一基准；如只是 SVG 坐标域，应与 path/viewBox 同步留为 C，而非把屏幕尺寸设为 200×60 |

## 7. 编排/MIDI 几何与密度（6 组）

| ID/类 | 字面值 | 全部相关位置 | 控制内容 → 应归属 |
| --- | --- | --- | --- |
| 7.1 B | `17`,`17`,`18` | `S/project/sections/arrangement/core/layout.ts:11-14` | marker/loop/time ruler 高；BAR_RULER_HEIGHT=两者之和是推导值 → project arrangement ruler metrics；不能因 midiRulerHeight=34 数值相等就混用 |
| 7.2 B | `6`,`7`,`4` | `S/project/sections/arrangement/core/clip-geometry.ts:13-14`；`S/project/sections/arrangement/core/automation/geometry.ts:18` | clip resize hit edge、fade hit handle、automation point radius → 新 project hit geometry；arrangementFadeHandleSize=5 是绘制尺寸，不等于 hit size=7 |
| 7.3 B | `2`,`4`,`1`,`3` | `S/project/sections/arrangement/core/layout.ts:117`；`S/project/sections/arrangement/core/clip-geometry.ts:47-51,84`；`S/project/sections/arrangement/core/automation/geometry.ts:35,37` | clip minWidth/minHeight、top/inset/border compensation、body threshold、fade margin → editor clip geometry；补偿量应引用对应 stroke/token，而不是独立视觉 magic number |
| 7.4 B | `6`,`0.25` | `S/project/sections/arrangement/core/viewport/minimap.ts:4-5` | minimap edge hit width、pan drag scale → 新 interaction.minimap；不要借用 midiRowMinHeight=6 |
| 7.5 B | `[128,64,32,16,MIN_GRID_CELL_PX]` | `S/project/model/grid.ts:10` | adaptive grid 屏幕密度阈值 → interaction.gridDensity / layout.grid；节拍分割数字是领域常量，与这些 px 阈值分开 |
| 7.6 B | `2` top/bottom、`1` center marker；minimap `rowHeight-1` | `S/ui/controls/DragPad/DragPadNumber.tsx:164-167`；`S/project/sections/arrangement/timeline/minimap/Overview.tsx:50` | center marker inset/width、minimap clip row 内边距 → design.dragPad.centerMarker、project.minimapClipInset；不能仅靠控制尺寸 token 覆盖这些视觉量 |

## 8. 动效、通知与指针映射（6 组）

| ID/类 | 字面值 | 全部相关位置 | 控制内容 → 应归属 |
| --- | --- | --- | --- |
| 8.1 B | `0.16`,`easeOut` | `S/ui/controls/MotionTabs/index.tsx:132` | tabs 淡入 160ms / easing → 新 design.motion.tabs；reducedMotion 的 0 duration 应保留为禁用分支，不改变可访问性 |
| 8.2 B | `4200` | `S/ui/controls/Toaster/index.tsx:37` | 默认通知展示时间（不是动画）→ 新 preference.notifications.duration |
| 8.3 B | `8`,`4` | `S/ui/controls/Toaster/index.tsx:77,79,155` | 队列容量/显示条数 → 新 notification presentation policy；loading duration=0 是持久通知语义，留 C |
| 8.4 B | `pointer`,`not-allowed`,`default`,`text` | `S/ui/controls/chrome.ts:27,60`；`S/ui/controls/ListRow/index.tsx:52,75`；`S/ui/controls/Input/index.tsx:51`；`S/ui/controls/MotionTabs/index.tsx:74,91`；`S/ui/controls/RadioGroup/index.tsx:85,94`；`S/ui/controls/SettingsShell/index.tsx:45,64`；`S/ui/controls/ToggleGroup/index.tsx:107,136`；`S/ui/controls/Menu/index.tsx:133`；`S/ui/controls/DragPad/DragPadNumber.tsx:116,218`；`S/project/sections/clip-edit/midi/NoteGrid.tsx:103` | 普通/禁用/编辑指针 → 新 design.cursors，按 action/state 映射；不是 keyboard K1 范围 |
| 8.5 B | `grab`,`grabbing`,`ns-resize`,`ew-resize`,`row-resize` | `S/ui/controls/DragPreviewArea/index.tsx:158-160`；`S/project/sections/footer/EffectChain/DeviceCard/index.tsx:140`；`S/project/sections/arrangement/tracks/TrackResizeOverlay/index.tsx:64`；`S/project/sections/clip-edit/audio/AudioWaveformOverview.tsx:53`；`S/project/sections/clip-edit/audio/SourceMarker.tsx:89`；`S/project/sections/clip-edit/midi/VelocityLane.tsx:120`；`S/ui/panels/CollapseDivider/index.tsx:71`；`S/project/sections/arrangement/timeline/rulers/index.tsx:47` | drag/resize 指针语义 → design.cursors semantic map；最后一处 state 初值 default 保留但输出需映射 |
| 8.6 B | `grabbing`,`ns-resize`,`crosshair`,`default`,`move`,`ew-resize` | `S/project/sections/arrangement/lane/interactions/automation/gestures.ts:49,90,145,161,199`；`S/project/sections/arrangement/lane/interactions/clip/fade.ts:37`；`S/project/sections/arrangement/lane/interactions/clip/resize.ts:22`；`S/project/sections/arrangement/lane/interactions/clip/timeRange.ts:24`；`S/project/sections/arrangement/lane/interactions/controller.ts:63` | controller 直接输出 CSS cursor；应返回语义 interaction state，由共享 cursor mapping 解析；不要只迁 JSX 忽略 controller |

## 已统一与重复核查（防止重复建设）

| 权威来源 | 定义值/位置 | 核查结论 |
| --- | --- | --- |
| control metrics | `S/shared/theme/metrics/control-metrics.json:2-18`：default track=13/gap=4/pad=1.5/icon=10/font=9；transport track=20/gap=4/pad=2/icon=14/font=12 | controls Button/IconSlot/DragPad/Input/ListRow 等实际用 useTheme；未见产品中重新定义整套控件尺寸。数字 4/2 等出现在其他语义不等于重复 token |
| project panel/track/browser/footer | 同文件 `:21-38`：panelGap=7/panelBorder=2/controlsWidth=304/identityWidth=100/routingWidth=74/defaultTrackHeight=70/footerDeviceHeight=184/deviceCardWidth=256/browserNavigationWidth=90/browserResultsWidth=140/trackBorder=2/minimap=32..90/timelineMinHeight=160/autoScrollEdge=42 | ProjectLayout 的 Browser min 是 navigation+results+gap，已正确推导；footer/device/browser 主要高宽已正确 theme.project；minimap 已有 32..90，勿再次新增固定值；剩余 PROJECT_LAYOUT 百分比缺 home |
| arrangement visuals | 同文件 `:39-62`：marker 6×4/inset2/labelInset7/editorMinWidth60.48/gridMajorWidth1/preview note与step、loop ticks、group bands、fade size5 | 多数 preview 绘制经 theme.project；rulers `:30-33,189` 固定 triangle 6×4 是 viewBox 规范坐标，不是遗漏的屏幕 marker 尺寸（屏幕宽高 `:190-191` 已用 token） |
| MIDI/audio/window/status | 同文件 `:63-75`：titlebar28/traffic8,68/key54/ruler34/velocity40/handle4/row6..18/audioRuler39/status22.68/dropdownMin100.8 | MIDI/audio 主几何已有 home；MidiRuler 与 arrangement 总高恰同为34不能互借；dropdown min 已 token，但 max320/300 没有 |
| design tokens | `S/shared/theme/design-tokens.ts:61-144` | shape/input/card/spacing/menu/popover/settings/tabs 都已有统一默认，默认值不是组件硬编码，应保留集中定义；3.1/3.4 仍绕过。`panelRadius:7` 恰等 panelGap7 是不同语义，不应合并 |
| runtime 注入缺口 | `S/shared/theme/ThemeProvider.tsx:41,57-60`；`S/project/layout/track.ts:1-15,27` | design 已可覆盖；project/control 没有 provider override；track/model 直接 import 同一个 JSON，并非“复制 literal”，但新统一配置必须同时向纯模型 geometry 提供解析后的 metrics，避免视觉/命中/viewport 三套尺寸 |

## C：不应迁移为用户/主题配置

| 类别 | 位置/字面值 | 保留理由 |
| --- | --- | --- |
| CSS 布局结构 | `S/app/AppShell.tsx:97-98,110`；`S/app/project/ProjectLayout.tsx:96-98,109,119`；`S/ui/panels/Group/index.tsx:127-131`；`S/ui/panels/Panel/index.tsx:89-100`；产品其余 minWidth/minHeight=0、width/height=100%、flexGrow/shrink=0/1、absolute top/left=0 同类 | flex 收缩、拉伸和坐标原点是结构算法，不应机械 token 化。例外：3.8 的 radius=0 是视觉选择 |
| SVG 坐标与序列化 | `S/ui/controls/Icon/index.tsx:51` `0 0 24 24`；`S/project/sections/arrangement/timeline/rulers/index.tsx:30-33,189` `0 0 6 4`；`S/project/sections/arrangement/core/rulers/grid-quads.ts:20-34` Float32Array×4/offset索引 | 图标/viewBox 基准和 rectangle tuple stride；与屏幕 icon size/stroke 不同 |
| 归一化、MIDI、浮点误差 | `S/project/sections/clip-edit/midi/layout.ts:195-196` `1e-9`；`S/project/sections/clip-edit/midi/VelocityLane.tsx:65,145-147` 127；`S/project/sections/clip-edit/midi/note-paint.ts:134-135` 127；`S/project/sections/arrangement/core/automation/drawing.ts:124-125` 1000/.0001/.000001 | 数值比较/速度协议/防相邻事件重叠，不是视觉主题；automation freehand sample divisor3 `:75` 是采样策略而非 padding，可归 interaction 策略而非 theme |
| 可访问性与隐藏测量 | `S/ui/controls/useMeasuredTextWidth.tsx:39` opacity0；`S/ui/controls/MotionTabs/index.tsx:130-132` reducedMotion 0/opacity端点；各 tabIndex/aria-level | 隐藏测量及可访问性语义，不能让主题更改成可见或禁用 reducedMotion |
| 内容颜色 | `S/project/sections/arrangement/timeline/minimap/Overview.tsx:51` resolveContentColor；`S/project/sections/arrangement/lane/LaneRow/Contents.tsx:172` track/clip.color；Piano/current note 的 pitch/domain 索引 | 用户保存的 track/clip 颜色是文档内容，不能所有颜色都强制覆盖为 preset。只有新建默认（4.1）需映射 |
| logging 颜色 | `S/platform/log/colors.ts:5-11,44-50` `#6b7280/#3b82f6/#f59e0b/#ef4444/#10b981/#9ca3af/#8b5cf6`；`S/platform/log/formatter.ts:55` `#9ca3af`；`S/platform/log/logo.ts:7,9` `#FFCC00/#10b981` | 终端 ANSI/诊断配色非产品界面 theme；colors.ts 已是 logger 自己的 palette。formatter/logo 旁路可以单独整理 logger palette，但不应连到 React useTheme |

## 搜索覆盖与边界

按 TS/TSX 搜索了尺寸、spacing、border/radius、font、opacity、zIndex、shadow、color literals/colorMix、animation、cursor、常量命名与直接 metrics imports，并追读 provider、JSON、design schema、project panel constraints、track layout、derived colors。产品结果中未找到独立硬编码 `zIndex`、`boxShadow`、`letterSpacing`；`lineHeight` 的 DeviceCard 使用 theme.control（`S/project/sections/footer/EffectChain/DeviceCard/index.tsx:173`），不是 raw 数值。图标一般通过 icon metric；数字字体通过 numberFontFamily。未把未发现项列成待迁移功能。

Keyboard shortcut 此切片不另行统计/设计（交由 K1 清单）；这里只列 cursor 映射。此报告没有生成或运行自动审计脚本，因此统计为上面可追溯的60迁移组，不宣称机器证明的全仓literal总数。
