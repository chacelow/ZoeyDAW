# A3b 控件画廊修正与验收报告

2026-10-15。证据根目录为 `scripts/gpuix-main/evidence/a3b-gallery-polish/`，本文所有截图和 AX 链接均指向该目录下的持久文件。

## 结论与证据边界

代码增量已完成集成门禁，但**完整视觉验收尚未完成**。历史截图不能证明当前实现，尤其不能证明 shared Icon、G1 光标锚点、F1 原生布局与 F2 事件切换后的外观。当前 GUI 补证以 Runtime 返回的实际文件为准，不把类型检查、AX 存在或旧图数量当成视觉通过。

本报告只涉及共享控件和画廊。数值变化是 UI 参数，不包含音频引擎、实际播放或工程落盘的完成声明。

| 证据层 | 基线与用途 | 限制 |
| --- | --- | --- |
| `historical/` | A3b 早期原生窗口批次，处于当前 Icon/G1/F1/F2 切换之前；`measurements.json` 有 245 条唯一 control/state/variant 记录 | 属于 0.10 迁移阶段的旧证据，未保存可逐图核验的 renderer 二进制 SHA；不能冒称当前固定主干渲染结果 |
| 当前源码 | 固定 gpuix 主干 `6a5c7c142ac32f9eb0caefe0121be995cfc18631` 与仓库受控补丁；`scripts/gpuix-main/config.json` 列出 patch 集合 | 配置不是窗口实际加载二进制的运行时证明 |
| 当前自动化 | 主代理最近观察到的 full tsc、bun、eslint、scan 与 cargo 结果，见后文 | 本报告任务未重跑检查；测试通过不替代逐状态截图 |
| 当前 GUI | 见“当前窗口补证” | 只列实际存在的截图、AX 与操作，不沿用历史 pass |

历史 PNG 合计 1,268,363 bytes，约 1.27 MB。此数只描述已有文件体积，不是验收覆盖率。旧文件名里的 `final` 仅指当时那一批截图的末次捕获。历史 metadata 已补充这一限定。

## 修正前后

Before 来自任务原始观察、失败回归或被替换的实现。After 是当前代码契约；“测试通过”和“真实窗口视觉通过”分开记录。

| 修正 | Before | After | 依据与证据层 |
| --- | --- | --- | --- |
| 同行水平间距 | 写死 `gap: 10`，同类区域松散 | compact 行使用 `--spacing-control-gap = 2` | 历史 AX 可复算 2px；当前源码 `gallery/controls.tsx` 的 `row` |
| 行间距与卡片内容布局 | 垂直 gap 为 0、3、4px，首两行贴死；CardContent 没有明确的 flex column owner | CardContent 为 flex column，行 gap、标题与内容 gap、卡片 inset 统一取 `--spacing-control-track-gap = 4` | 历史 y204/h13 → y221 的 gap4；当前源码 |
| 面板与卡片间距 | `gap: 12/16`、`padding: 12/16` 等裸值 | 根 padding 和 panel/card-row gap 取 `PROJECT_METRICS.panelGap = 7`；卡片宽取 `controlsWidth = 304` | 历史观察与当前源码；没有新增本地替代 token |
| Transport 分区 | h20 Transport BPM 与 h13 默认控件混行，撑高默认行 | Transport 独立卡片和 ControlGroup，h20；compact 行 h13 | 历史默认截图；当前 group 内 gap 使用 transport token3，不把 transport 误记为 compact gap2 |
| 紧凑表单高度 | Radio、Label 曾实测h15，与默认组h13不齐；Input原本已是h13 | 修正Radio、Label为默认13px共享高度；Input维持h13；图标按钮13×13，Transport20×20 | 历史默认AX；旧pressed Radio的h15是旧批次记录，不算当前尺寸通过 |
| 按下反馈 | 原生按下外观缺少明确反馈 | Button、切换等按原生状态绘制反馈，尺寸不因反馈扩大 | 自动化样式/几何回归；真实 held 帧仍未验证 |
| 工具栏 Space | Button、ToggleGroup、Popup/Popover/Select 根 trigger、Menu 根 trigger 可把 Space 用于自身激活 | Space 不激活、不进入按下样式、不消费，留给窗口播放 owner；Enter 激活 | 原生键盘回归与 triggerSpace 变异；旧 Space AX 仅证明旧批次 |
| 弹层选项 Space | 菜单或 Select 选项选择可能泄漏至窗口播放 | 选择一次并消费，关闭后回焦 trigger | Menu/DropdownButton 原生测试；itemstop 变异2失败 |
| 表单键盘例外 | 中途曾把公共 activation 改成 Enter-only，连表单一起影响 | RadioGroup、SettingsShell 对话框选项、Card/Label 保留 Space；MotionTabs 在本组件内只用 Enter | 当前共享规则与调用方契约；不把中途方案当最终行为 |
| Menu SubTrigger 例外 | “all MenuTrigger” 的措辞与 `menuitem` 语义有歧义 | 根 trigger 留 Space 给播放；弹层 SubTrigger 是 menuitem，Space 打开子菜单并消费 | Spec 仲裁后的明确例外，不修改共享 activation 规则 |
| Input 与数值编辑键盘隔离 | 输入字符或 Space 可到达窗口快捷键；旧 helper 与 native 事件契约不一致 | 可打印键停止传播但不 preventDefault；原生编辑 action 优先；未消费的 Tab/Escape/Up/Down/Cmd-S/Ctrl-S 仍到窗口；readOnly/disabled 拒绝改值 | `Input/README.md` 的真实 Native TestRenderer 行为回归 |
| DropdownButton.fill | 只改 trigger 或固定宽度，不能保证外层与实际父宽一致 | 外层与 trigger 都填满实际父宽74或304，默认仍 intrinsic；side/align 保持 | 历史 fill bounds 与当前 native 几何测试 |
| Dropdown 最小宽度 | 组件内遗留单独尺寸值 | 非 matchTriggerWidth 的弹层使用共享 `PROJECT_METRICS.dropdownMinWidth = 100.8` | 当前共享 token；不是120，不新增组件本地常量 |
| hideIcon | 数值控件总预留图标和 gap，窄壳无独立无图标模式 | `hideIcon` 去掉图标位；compact示例22px，普通图标版本34px；预编辑/编辑用内边距内1px宽插入符形，不占布局 | hideIcon变异22→34被捕获；当前默认/预编辑/编辑有裁图，仍缺全主题与真实编辑shell宽重测 |
| 数值宽度测量切换 | 旧renderer缺onLayout，样本文本测量依赖临时定时采样 | native onLayout测量已挂载样本文本，缓存按字体和样本；min/max/default/widthSamples决定稳定宽度，live value/draft不参与 | 首帧估算到实测仍可能修正0或1px；不把未发生的draft变宽写成已复现缺陷，也不宣称首帧绝无可见修正 |
| Bar/Bipolar 实际内宽 | fill 与中线复用 intrinsic width，铺满/resize 时偏离实际 shell | root native onLayout 决定 innerWidth，扣实际边框；中线按线条中点居中；idle/preEdit/edit/resize 共用 | 50px、33px 几何回归；intrinsic-width 变异6失败，偏差8.5–17px |
| 数值滚轮所有权 | 控件改值的同时祖先 ScrollArea 也滚动 | root `pointerEvents: auto` 独占命中；fill/caret/center overlay 为 none；控件外仍能滚动祖先 | wheel-auto 变异使 ancestor offset0→−16并失败 |
| 滚轮方向 | 模型对有符号 delta 反向使用 | 正 delta 加值，负 delta 减值，保留量化、钳制、共享比例 | native raw delta 与实际 scroll offset 诊断；物理 trackpad/natural-scroll 未验证 |
| dragStep | 拖动、滚轮与文本/键盘精度共用 step | 可选 `dragStep` 仅控制拖动和滚轮，默认step；输入格式、量化、箭头仍用step；每步4px不变 | 六个原生回归；删除转发4失败；`.25` 起点粗拖4px得1，Escape回`.25` |
| Menu 后代 Enter | 后代控件 Enter 可能激活祖先 dropdown trigger | 保留 defaultPrevented 和来源守卫；专用 Shift-F10/ContextMenu 仍可从聚焦后代打开上下文菜单 | descendantEnter guard 变异1失败；专用 shortcut 退回原因已修复 |
| 嵌套右键 | 交互后代 painted hitbox 吞祖先右键，原 mouseDown 路径无法修复 | 消费 F2 原生 `onContextMenu`，最近作用域处理，移除旧右键分发绕行 | 两条未跳过 native pointer regression，当前 full suite0fail；旧报告 blocker 已过时 |
| Menu 职责拆分 | state、trigger、navigation、popup、item 混在大文件 | 分到 model/context/trigger/navigation/content/item composition，公共 exports 保持；refactor阶段不改测试 | 两轴审查无硬问题；现有测试 byte-identical 要求不以删除断言满足 |
| 菜单选中回焦 owner | item 自行遍历 parent 链并找根 trigger | `navigation.ts` 的 `finishSelection` 统一关闭整树和恢复根 trigger 焦点，Tab/outside dismiss 不改变 | Standards 判断项已落实，不增第二个 controller |
| destructive active | 激活态被通用 primary 配色覆盖 | active destructive 保留 danger foreground/wash/hover/focus；disabled和highlight=false规则保留 | dark/light 自动化颜色比较；active-danger变异2失败；当前视觉单列未验证 |
| Button 调用方语义 | 默认 role/tabIndex 覆盖调用方 | 调用方 role/tabIndex 优先，默认button/0，Enter仍尊重prevented | 原生Tab顺序与AX角色回归；各变异失败 |
| DragPreviewArea source 语义 | role/tabIndex落到wrapper或额外创建Tab入口 | role/tabIndex属于实际source，默认button/0；wrapper固定group，不新增焦点owner | 原生Tab/AX/source drag/Escape回归；sourceTab/role/wrapper变异各失败 |
| 原生主干切换 | readOuterBounds边框/内边距修正、center offset轮询、focus sampler、手动Tab owner | 生产与测试直用原生bounds/onLayout/focusVisible/KeyEvent；删除旧API与所有调用者，单React/native runtime | 当前代码审查和门禁；不保留兼容shim |
| shared Icon | 控件/画廊存在手写SVG与深层相对导入 | 共享Icon使用lucide与必要Phosphor资源，跨深目录用`@/`，lint强制 | eslint与scan；历史icon图不能证明现在的渲染 |

G1 光标锚点是共享原生增量的消费，不冒称本报告任务实现。旧做法在 JS 处理 mouseDown 时读取 OS 当前位置，可能得到已移动10pt的点。当前端口接收事件按下点并经原生坐标换算；既有 G1 读回记录显示两条40pt路径均回到按下点 `(412,293)`、误差0pt。该记录不等于本轮 current GUI 重新取证；人手速度、多屏与全屏实机仍未验证。

## 像素与 token 对照

下表历史值来自 [历史 measurements.json](historical/measurements.json) 与原任务的 AX 观察。当前列区分源码目标与当前窗口测量，绝不把 token 数字写成实测。AX按工具报告的原生坐标单位记值，与token数值对照；当前display scale未知，不宣称物理像素与pt换算，也不从放大图反推Retina倍率。

| 项目 | 修正前观察 | 历史窗口 AX / 观察 | 当前 token / 契约 | 当前窗口 AX |
| --- | --- | --- | --- | --- |
| compact 同行 gap | 10px | button x762/w40 → icon x804，gap2；number x762/w34 → bar x798，gap2 | `default.--spacing-control-gap = 2` | 当前button x442/w40 → icon x484，gap2；number x442/w34 → bar x478，gap2；与token一致 |
| 行间 gap | 0、3、4px混用 | 第一行y204/h13 → 第二行y221，gap4；下一行y238，gap4 | `default.--spacing-control-track-gap = 4` | 当前y204/h13 → y221 → y238，均gap4；与token一致 |
| 卡片内边距与标题/内容 gap | 裸12/16 | 既有画廊观察4；measurements只保存控件bounds，不包含完整卡片节点树 | `default.--spacing-control-track-gap = 4` | 当前normal gallery有总览，无卡片各层bounds，未验证 |
| 卡片宽 | 未作为统一契约 | 既有画廊观察304 | `project.controlsWidth = 304` | 当前normal gallery卡片宽未重测；不能拿fill parent304代替卡片bounds |
| 面板/卡片组 gap与根inset | 裸12/16 | 既有画廊观察7 | `project.panelGap = 7` | StateGallery root x435，首控件x442，左inset7；normal gallery卡片组gap未重测 |
| 默认控件高 | transport混行 | 默认矩阵h13 | `default.--spacing-control-track = 13` | 当前默认fixture各compact shell h13；与token一致 |
| Transport高 | h20混入默认行 | 数值45×20，icon20×20 | `transport.--spacing-control-track = 20` | 当前number45×20、icon20×20；normal总览独立区可见 |
| Transport内部gap | 未分区 | number x762/w45 → icon x810，gap3 | `transport.--spacing-control-gap = 3` | 当前number x442/w45 → icon x490，gap3；与transport token一致 |
| compact icon按钮 | 与文字控件混看 | 13×13 | shell由track13决定；内部icon token10 | 当前State icon13×13；icon实际path像素包围盒未量 |
| 普通数值宽 | 旧布局基线 | number34、bar34、bipolar45、pan39 | 原生最宽样本文本 + icon10 + gap2 + padding1.5×2 + border2 | 当前默认分别34、34、45、39；实测稳定编辑shell另有边界说明 |
| Transport数值宽 | 旧布局基线 | 45 | 原生最宽样本文本 + icon14 + gap3 + padding2×2 + border2 | 当前默认45；预编辑/编辑未补当前图 |
| hideIcon宽 | 旧矩阵无此fixture | 未验证 | 原生最宽样本文本 + padding + border；自动化示例22，非固定width token | 当前默认shell22×13；编辑textfield18×15是不同节点，不算shell重测 |
| fill窄parent与trigger | 旧固定/intrinsic路径 | parent与trigger均x762/y370/w74/h13 | `project.routingWidth = 74`，fill100% | 当前parent与trigger均x442/y370/w74/h13，匹配实际父宽 |
| fill宽parent与trigger | 旧固定/intrinsic路径 | parent与trigger均x838/y370/w304/h13 | `project.controlsWidth = 304`，fill100% | 当前parent与trigger均x518/y370/w304/h13，匹配实际父宽 |
| 下拉非匹配最小宽 | 单独尺寸值 | 历史图不证明当前最小宽 | `project.dropdownMinWidth = 100.8` | 当前GUI未打开非匹配宽弹层，未验证 |

数值预编辑/编辑的历史 metadata 保存的是进入编辑前的 shell bounds，不能把其 native textfield 子节点当同一个bounds，也不能只靠这份JSON断言编辑壳从未变宽。当前 native renderer 几何回归覆盖宽度稳定与 resize。历史 toggle 在默认/active记录w22，在focus/hover记录w18，对应文字内容不同，不能宣称所有控件宽度在所有状态固定。旧 Radio pressed记录h15、部分pressed记录y变化，也不构成当前尺寸或held外观通过。

## 与 Live 的只读比较

仅复用已有 [Live BPM局部](historical/live-bpm-reference.png)，本报告与Runtime均未focus、点击或修改Live。gallery侧可对照当前 [compact数值4×裁图](current/number-default-dark-en-2026-10-15-e18-4x.png) 与 [Transport数值4×裁图](current/transport-number-default-dark-en-2026-10-15-e47-4x.png)。这是旧只读参照与当前静态窗口的密度比较，不补造Live其他状态。

| Live 观察 | 画廊实现 / 观察 | 一致、差异或未验证 |
| --- | --- | --- |
| clip BPM x181/y758/w40/h14 | 当前compact number34×13，历史相同 | 高度同量级，gallery低1px且窄6px；格式与图标结构不同，不要求复制40px |
| `/2` x223/w21/h14；前一控件右缘221，gap2 | 当前compact相邻控件实测gap2 | 水平密度一致；不推断其他Live控件gap |
| `×2` x244/w21/h14；`/2`右缘244，gap0 | 当前compact同行统一gap2 | 有意保留项目共享gap，不把Live该处相接边框推广到全部控件 |
| 同区三个控件均h14 | 当前compact h13，Transport h20且正常总览独立成区 | 默认密度同量级；Transport是不同尺寸档，不能用它声称复制该clip区域 |
| 窄BPM显示无独立图标 | 当前hideIcon默认shell22×13，有预编辑/编辑裁图 | 当前确有无图标变体；Live编辑指示未实测，不能宣称caret外观一致 |
| Live编辑、hover、pressed、focus、disabled状态 | 已有crop只含静态局部 | 未验证；不能推断Live其他状态，更不宣称音频行为一致 |

## 历史逐控件逐状态索引

下表每个链接都是 `historical/` 中已有的真实文件。标“历史”只表示有对应旧截图，**不表示当前状态通过，也不表示本次报告任务已对所有图重新放大验收**。没有文件的格子保守记“未验证”，没有用未经API核对的N/A掩盖缺口。

所有 `pressed` 文件均标未验证。旧捕获虽然通过held computer调用发起，但没有证明截图与按住同一时刻；`LESSONS.md` 明确记载截图会等拖动释放后才返回。active/selected图不能替代held pressed图。

| 控件 | 默认 | hover | 按住 pressed | focus | disabled | active | 预编辑 | 编辑 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| button | 历史 [button-default-dark-en.png](historical/button-default-dark-en.png) | 历史 [button-hover-dark-en.png](historical/button-hover-dark-en.png) | 未验证；旧文件 [button-pressed-dark-en.png](historical/button-pressed-dark-en.png) | 历史 [button-focus-dark-en.png](historical/button-focus-dark-en.png) | 历史 [button-disabled-dark-en.png](historical/button-disabled-dark-en.png) | 历史 [button-active-dark-en.png](historical/button-active-dark-en.png) | 未验证 | 未验证 |
| icon-button | 历史 [icon-button-default-dark-en.png](historical/icon-button-default-dark-en.png) | 历史 [icon-button-hover-dark-en.png](historical/icon-button-hover-dark-en.png) | 未验证；旧文件 [icon-button-pressed-dark-en.png](historical/icon-button-pressed-dark-en.png) | 历史 [icon-button-focus-dark-en.png](historical/icon-button-focus-dark-en.png) | 历史 [icon-button-disabled-dark-en.png](historical/icon-button-disabled-dark-en.png) | 未验证 | 未验证 | 未验证 |
| outline | 历史 [outline-default-dark-en.png](historical/outline-default-dark-en.png) | 历史 [outline-hover-dark-en.png](historical/outline-hover-dark-en.png) | 未验证；旧文件 [outline-pressed-dark-en.png](historical/outline-pressed-dark-en.png) | 历史 [outline-focus-dark-en.png](historical/outline-focus-dark-en.png) | 历史 [outline-disabled-dark-en.png](historical/outline-disabled-dark-en.png) | 未验证 | 未验证 | 未验证 |
| secondary | 历史 [secondary-default-dark-en.png](historical/secondary-default-dark-en.png) | 历史 [secondary-hover-dark-en.png](historical/secondary-hover-dark-en.png) | 未验证；旧文件 [secondary-pressed-dark-en.png](historical/secondary-pressed-dark-en.png) | 历史 [secondary-focus-dark-en.png](historical/secondary-focus-dark-en.png) | 历史 [secondary-disabled-dark-en.png](historical/secondary-disabled-dark-en.png) | 未验证 | 未验证 | 未验证 |
| ghost | 历史 [ghost-default-dark-en.png](historical/ghost-default-dark-en.png) | 历史 [ghost-hover-dark-en.png](historical/ghost-hover-dark-en.png) | 未验证；旧文件 [ghost-pressed-dark-en.png](historical/ghost-pressed-dark-en.png) | 历史 [ghost-focus-dark-en.png](historical/ghost-focus-dark-en.png) | 历史 [ghost-disabled-dark-en.png](historical/ghost-disabled-dark-en.png) | 未验证 | 未验证 | 未验证 |
| destructive | 历史 [destructive-default-dark-en.png](historical/destructive-default-dark-en.png) | 历史 [destructive-hover-dark-en.png](historical/destructive-hover-dark-en.png) | 未验证；旧文件 [destructive-pressed-dark-en.png](historical/destructive-pressed-dark-en.png) | 历史 [destructive-focus-dark-en.png](historical/destructive-focus-dark-en.png) | 历史 [destructive-disabled-dark-en.png](historical/destructive-disabled-dark-en.png) | 未验证 | 未验证 | 未验证 |
| link | 历史 [link-default-dark-en.png](historical/link-default-dark-en.png) | 历史 [link-hover-dark-en.png](historical/link-hover-dark-en.png) | 未验证；旧文件 [link-pressed-dark-en.png](historical/link-pressed-dark-en.png) | 历史 [link-focus-dark-en.png](historical/link-focus-dark-en.png) | 历史 [link-disabled-dark-en.png](historical/link-disabled-dark-en.png) | 未验证 | 未验证 | 未验证 |
| number | 历史 [number-default-dark-en.png](historical/number-default-dark-en.png) | 历史 [number-hover-dark-en.png](historical/number-hover-dark-en.png) | 未验证；旧文件 [number-pressed-dark-en.png](historical/number-pressed-dark-en.png) | 历史 [number-focus-dark-en.png](historical/number-focus-dark-en.png) | 历史 [number-disabled-dark-en.png](historical/number-disabled-dark-en.png) | 未验证 | 历史 [number-pre-edit-dark-en.png](historical/number-pre-edit-dark-en.png) | 历史 [number-edit-dark-en.png](historical/number-edit-dark-en.png) |
| bar | 历史 [bar-default-dark-en.png](historical/bar-default-dark-en.png) | 历史 [bar-hover-dark-en.png](historical/bar-hover-dark-en.png) | 未验证；旧文件 [bar-pressed-dark-en.png](historical/bar-pressed-dark-en.png) | 历史 [bar-focus-dark-en.png](historical/bar-focus-dark-en.png) | 历史 [bar-disabled-dark-en.png](historical/bar-disabled-dark-en.png) | 未验证 | 历史 [bar-pre-edit-dark-en.png](historical/bar-pre-edit-dark-en.png) | 历史 [bar-edit-dark-en.png](historical/bar-edit-dark-en.png) |
| bipolar | 历史 [bipolar-default-dark-en.png](historical/bipolar-default-dark-en.png) | 历史 [bipolar-hover-dark-en.png](historical/bipolar-hover-dark-en.png) | 未验证；旧文件 [bipolar-pressed-dark-en.png](historical/bipolar-pressed-dark-en.png) | 历史 [bipolar-focus-dark-en.png](historical/bipolar-focus-dark-en.png) | 历史 [bipolar-disabled-dark-en.png](historical/bipolar-disabled-dark-en.png) | 未验证 | 历史 [bipolar-pre-edit-dark-en.png](historical/bipolar-pre-edit-dark-en.png) | 历史 [bipolar-edit-dark-en.png](historical/bipolar-edit-dark-en.png) |
| pan | 历史 [pan-default-dark-en.png](historical/pan-default-dark-en.png) | 历史 [pan-hover-dark-en.png](historical/pan-hover-dark-en.png) | 未验证；旧文件 [pan-pressed-dark-en.png](historical/pan-pressed-dark-en.png) | 历史 [pan-focus-dark-en.png](historical/pan-focus-dark-en.png) | 历史 [pan-disabled-dark-en.png](historical/pan-disabled-dark-en.png) | 未验证 | 历史 [pan-pre-edit-dark-en.png](historical/pan-pre-edit-dark-en.png) | 历史 [pan-edit-dark-en.png](historical/pan-edit-dark-en.png) |
| toggle | 历史 [toggle-default-dark-en.png](historical/toggle-default-dark-en.png) | 历史 [toggle-hover-dark-en.png](historical/toggle-hover-dark-en.png) | 未验证；旧文件 [toggle-pressed-dark-en.png](historical/toggle-pressed-dark-en.png) | 历史 [toggle-focus-dark-en.png](historical/toggle-focus-dark-en.png) | 历史 [toggle-disabled-dark-en.png](historical/toggle-disabled-dark-en.png) | 历史 [toggle-active-dark-en.png](historical/toggle-active-dark-en.png) | 未验证 | 未验证 |
| dropdown | 历史 [dropdown-default-dark-en.png](historical/dropdown-default-dark-en.png) | 历史 [dropdown-hover-dark-en.png](historical/dropdown-hover-dark-en.png) | 未验证；旧文件 [dropdown-pressed-dark-en.png](historical/dropdown-pressed-dark-en.png) | 历史 [dropdown-focus-dark-en.png](historical/dropdown-focus-dark-en.png) | 历史 [dropdown-disabled-dark-en.png](historical/dropdown-disabled-dark-en.png) | 历史 [dropdown-active-dark-en.png](historical/dropdown-active-dark-en.png) | 未验证 | 未验证 |
| popup | 历史 [popup-default-dark-en.png](historical/popup-default-dark-en.png) | 历史 [popup-hover-dark-en.png](historical/popup-hover-dark-en.png) | 未验证；旧文件 [popup-pressed-dark-en.png](historical/popup-pressed-dark-en.png) | 历史 [popup-focus-dark-en.png](historical/popup-focus-dark-en.png) | 历史 [popup-disabled-dark-en.png](historical/popup-disabled-dark-en.png) | 历史 [popup-active-dark-en.png](historical/popup-active-dark-en.png) | 未验证 | 未验证 |
| label | 历史 [label-default-dark-en.png](historical/label-default-dark-en.png) | 历史 [label-hover-dark-en.png](historical/label-hover-dark-en.png) | 未验证；旧文件 [label-pressed-dark-en.png](historical/label-pressed-dark-en.png) | 历史 [label-focus-dark-en.png](historical/label-focus-dark-en.png) | 历史 [label-disabled-dark-en.png](historical/label-disabled-dark-en.png) | 未验证 | 未验证 | 未验证 |
| input | 历史 [input-default-dark-en.png](historical/input-default-dark-en.png) | 历史 [input-hover-dark-en.png](historical/input-hover-dark-en.png) | 未验证；旧文件 [input-pressed-dark-en.png](historical/input-pressed-dark-en.png) | 历史 [input-focus-dark-en.png](historical/input-focus-dark-en.png) | 历史 [input-disabled-dark-en.png](historical/input-disabled-dark-en.png) | 未验证 | 未验证 | 历史 [input-edit-dark-en.png](historical/input-edit-dark-en.png) |
| radio | 历史 [radio-default-dark-en.png](historical/radio-default-dark-en.png) | 历史 [radio-hover-dark-en.png](historical/radio-hover-dark-en.png) | 未验证；旧文件 [radio-pressed-dark-en.png](historical/radio-pressed-dark-en.png) | 历史 [radio-focus-dark-en.png](historical/radio-focus-dark-en.png) | 历史 [radio-disabled-dark-en.png](historical/radio-disabled-dark-en.png) | 历史 [radio-active-dark-en.png](historical/radio-active-dark-en.png) | 未验证 | 未验证 |
| toggle-group | 历史 [toggle-group-default-dark-en.png](historical/toggle-group-default-dark-en.png) | 历史 [toggle-group-hover-dark-en.png](historical/toggle-group-hover-dark-en.png) | 未验证；旧文件 [toggle-group-pressed-dark-en.png](historical/toggle-group-pressed-dark-en.png) | 历史 [toggle-group-focus-dark-en.png](historical/toggle-group-focus-dark-en.png) | 历史 [toggle-group-disabled-dark-en.png](historical/toggle-group-disabled-dark-en.png) | 历史 [toggle-group-active-dark-en.png](historical/toggle-group-active-dark-en.png) | 未验证 | 未验证 |
| tabs | 历史 [tabs-default-dark-en.png](historical/tabs-default-dark-en.png) | 历史 [tabs-hover-dark-en.png](historical/tabs-hover-dark-en.png) | 未验证；旧文件 [tabs-pressed-dark-en.png](historical/tabs-pressed-dark-en.png) | 历史 [tabs-focus-dark-en.png](historical/tabs-focus-dark-en.png) | 未验证 | 历史 [tabs-active-dark-en.png](historical/tabs-active-dark-en.png) | 未验证 | 未验证 |
| transport-number | 历史 [transport-number-default-dark-en.png](historical/transport-number-default-dark-en.png) | 历史 [transport-number-hover-dark-en.png](historical/transport-number-hover-dark-en.png) | 未验证；旧文件 [transport-number-pressed-dark-en.png](historical/transport-number-pressed-dark-en.png) | 历史 [transport-number-focus-dark-en.png](historical/transport-number-focus-dark-en.png) | 历史 [transport-number-disabled-dark-en.png](historical/transport-number-disabled-dark-en.png) | 未验证 | 历史 [transport-number-pre-edit-dark-en.png](historical/transport-number-pre-edit-dark-en.png) | 历史 [transport-number-edit-dark-en.png](historical/transport-number-edit-dark-en.png) |
| transport-icon | 历史 [transport-icon-default-dark-en.png](historical/transport-icon-default-dark-en.png) | 历史 [transport-icon-hover-dark-en.png](historical/transport-icon-hover-dark-en.png) | 未验证；旧文件 [transport-icon-pressed-dark-en.png](historical/transport-icon-pressed-dark-en.png) | 历史 [transport-icon-focus-dark-en.png](historical/transport-icon-focus-dark-en.png) | 历史 [transport-icon-disabled-dark-en.png](historical/transport-icon-disabled-dark-en.png) | 未验证 | 未验证 | 未验证 |

## 深浅色与中英文历史矩阵

以下默认与禁用图片覆盖dark/light × en/zh。hover、focus、active、预编辑与编辑仅有dark-en旧批次。tabs没有disabled图片，保留未验证；不能因为没有截图就判API不支持。

| 控件 | dark-en 默认 / 禁用 | dark-zh 默认 / 禁用 | light-en 默认 / 禁用 | light-zh 默认 / 禁用 |
| --- | --- | --- | --- | --- |
| button | [button-default-dark-en.png](historical/button-default-dark-en.png) / [button-disabled-dark-en.png](historical/button-disabled-dark-en.png) | [button-default-dark-zh.png](historical/button-default-dark-zh.png) / [button-disabled-dark-zh.png](historical/button-disabled-dark-zh.png) | [button-default-light-en.png](historical/button-default-light-en.png) / [button-disabled-light-en.png](historical/button-disabled-light-en.png) | [button-default-light-zh.png](historical/button-default-light-zh.png) / [button-disabled-light-zh.png](historical/button-disabled-light-zh.png) |
| icon-button | [icon-button-default-dark-en.png](historical/icon-button-default-dark-en.png) / [icon-button-disabled-dark-en.png](historical/icon-button-disabled-dark-en.png) | [icon-button-default-dark-zh.png](historical/icon-button-default-dark-zh.png) / [icon-button-disabled-dark-zh.png](historical/icon-button-disabled-dark-zh.png) | [icon-button-default-light-en.png](historical/icon-button-default-light-en.png) / [icon-button-disabled-light-en.png](historical/icon-button-disabled-light-en.png) | [icon-button-default-light-zh.png](historical/icon-button-default-light-zh.png) / [icon-button-disabled-light-zh.png](historical/icon-button-disabled-light-zh.png) |
| outline | [outline-default-dark-en.png](historical/outline-default-dark-en.png) / [outline-disabled-dark-en.png](historical/outline-disabled-dark-en.png) | [outline-default-dark-zh.png](historical/outline-default-dark-zh.png) / [outline-disabled-dark-zh.png](historical/outline-disabled-dark-zh.png) | [outline-default-light-en.png](historical/outline-default-light-en.png) / [outline-disabled-light-en.png](historical/outline-disabled-light-en.png) | [outline-default-light-zh.png](historical/outline-default-light-zh.png) / [outline-disabled-light-zh.png](historical/outline-disabled-light-zh.png) |
| secondary | [secondary-default-dark-en.png](historical/secondary-default-dark-en.png) / [secondary-disabled-dark-en.png](historical/secondary-disabled-dark-en.png) | [secondary-default-dark-zh.png](historical/secondary-default-dark-zh.png) / [secondary-disabled-dark-zh.png](historical/secondary-disabled-dark-zh.png) | [secondary-default-light-en.png](historical/secondary-default-light-en.png) / [secondary-disabled-light-en.png](historical/secondary-disabled-light-en.png) | [secondary-default-light-zh.png](historical/secondary-default-light-zh.png) / [secondary-disabled-light-zh.png](historical/secondary-disabled-light-zh.png) |
| ghost | [ghost-default-dark-en.png](historical/ghost-default-dark-en.png) / [ghost-disabled-dark-en.png](historical/ghost-disabled-dark-en.png) | [ghost-default-dark-zh.png](historical/ghost-default-dark-zh.png) / [ghost-disabled-dark-zh.png](historical/ghost-disabled-dark-zh.png) | [ghost-default-light-en.png](historical/ghost-default-light-en.png) / [ghost-disabled-light-en.png](historical/ghost-disabled-light-en.png) | [ghost-default-light-zh.png](historical/ghost-default-light-zh.png) / [ghost-disabled-light-zh.png](historical/ghost-disabled-light-zh.png) |
| destructive | [destructive-default-dark-en.png](historical/destructive-default-dark-en.png) / [destructive-disabled-dark-en.png](historical/destructive-disabled-dark-en.png) | [destructive-default-dark-zh.png](historical/destructive-default-dark-zh.png) / [destructive-disabled-dark-zh.png](historical/destructive-disabled-dark-zh.png) | [destructive-default-light-en.png](historical/destructive-default-light-en.png) / [destructive-disabled-light-en.png](historical/destructive-disabled-light-en.png) | [destructive-default-light-zh.png](historical/destructive-default-light-zh.png) / [destructive-disabled-light-zh.png](historical/destructive-disabled-light-zh.png) |
| link | [link-default-dark-en.png](historical/link-default-dark-en.png) / [link-disabled-dark-en.png](historical/link-disabled-dark-en.png) | [link-default-dark-zh.png](historical/link-default-dark-zh.png) / [link-disabled-dark-zh.png](historical/link-disabled-dark-zh.png) | [link-default-light-en.png](historical/link-default-light-en.png) / [link-disabled-light-en.png](historical/link-disabled-light-en.png) | [link-default-light-zh.png](historical/link-default-light-zh.png) / [link-disabled-light-zh.png](historical/link-disabled-light-zh.png) |
| number | [number-default-dark-en.png](historical/number-default-dark-en.png) / [number-disabled-dark-en.png](historical/number-disabled-dark-en.png) | [number-default-dark-zh.png](historical/number-default-dark-zh.png) / [number-disabled-dark-zh.png](historical/number-disabled-dark-zh.png) | [number-default-light-en.png](historical/number-default-light-en.png) / [number-disabled-light-en.png](historical/number-disabled-light-en.png) | [number-default-light-zh.png](historical/number-default-light-zh.png) / [number-disabled-light-zh.png](historical/number-disabled-light-zh.png) |
| bar | [bar-default-dark-en.png](historical/bar-default-dark-en.png) / [bar-disabled-dark-en.png](historical/bar-disabled-dark-en.png) | [bar-default-dark-zh.png](historical/bar-default-dark-zh.png) / [bar-disabled-dark-zh.png](historical/bar-disabled-dark-zh.png) | [bar-default-light-en.png](historical/bar-default-light-en.png) / [bar-disabled-light-en.png](historical/bar-disabled-light-en.png) | [bar-default-light-zh.png](historical/bar-default-light-zh.png) / [bar-disabled-light-zh.png](historical/bar-disabled-light-zh.png) |
| bipolar | [bipolar-default-dark-en.png](historical/bipolar-default-dark-en.png) / [bipolar-disabled-dark-en.png](historical/bipolar-disabled-dark-en.png) | [bipolar-default-dark-zh.png](historical/bipolar-default-dark-zh.png) / [bipolar-disabled-dark-zh.png](historical/bipolar-disabled-dark-zh.png) | [bipolar-default-light-en.png](historical/bipolar-default-light-en.png) / [bipolar-disabled-light-en.png](historical/bipolar-disabled-light-en.png) | [bipolar-default-light-zh.png](historical/bipolar-default-light-zh.png) / [bipolar-disabled-light-zh.png](historical/bipolar-disabled-light-zh.png) |
| pan | [pan-default-dark-en.png](historical/pan-default-dark-en.png) / [pan-disabled-dark-en.png](historical/pan-disabled-dark-en.png) | [pan-default-dark-zh.png](historical/pan-default-dark-zh.png) / [pan-disabled-dark-zh.png](historical/pan-disabled-dark-zh.png) | [pan-default-light-en.png](historical/pan-default-light-en.png) / [pan-disabled-light-en.png](historical/pan-disabled-light-en.png) | [pan-default-light-zh.png](historical/pan-default-light-zh.png) / [pan-disabled-light-zh.png](historical/pan-disabled-light-zh.png) |
| toggle | [toggle-default-dark-en.png](historical/toggle-default-dark-en.png) / [toggle-disabled-dark-en.png](historical/toggle-disabled-dark-en.png) | [toggle-default-dark-zh.png](historical/toggle-default-dark-zh.png) / [toggle-disabled-dark-zh.png](historical/toggle-disabled-dark-zh.png) | [toggle-default-light-en.png](historical/toggle-default-light-en.png) / [toggle-disabled-light-en.png](historical/toggle-disabled-light-en.png) | [toggle-default-light-zh.png](historical/toggle-default-light-zh.png) / [toggle-disabled-light-zh.png](historical/toggle-disabled-light-zh.png) |
| dropdown | [dropdown-default-dark-en.png](historical/dropdown-default-dark-en.png) / [dropdown-disabled-dark-en.png](historical/dropdown-disabled-dark-en.png) | [dropdown-default-dark-zh.png](historical/dropdown-default-dark-zh.png) / [dropdown-disabled-dark-zh.png](historical/dropdown-disabled-dark-zh.png) | [dropdown-default-light-en.png](historical/dropdown-default-light-en.png) / [dropdown-disabled-light-en.png](historical/dropdown-disabled-light-en.png) | [dropdown-default-light-zh.png](historical/dropdown-default-light-zh.png) / [dropdown-disabled-light-zh.png](historical/dropdown-disabled-light-zh.png) |
| popup | [popup-default-dark-en.png](historical/popup-default-dark-en.png) / [popup-disabled-dark-en.png](historical/popup-disabled-dark-en.png) | [popup-default-dark-zh.png](historical/popup-default-dark-zh.png) / [popup-disabled-dark-zh.png](historical/popup-disabled-dark-zh.png) | [popup-default-light-en.png](historical/popup-default-light-en.png) / [popup-disabled-light-en.png](historical/popup-disabled-light-en.png) | [popup-default-light-zh.png](historical/popup-default-light-zh.png) / [popup-disabled-light-zh.png](historical/popup-disabled-light-zh.png) |
| label | [label-default-dark-en.png](historical/label-default-dark-en.png) / [label-disabled-dark-en.png](historical/label-disabled-dark-en.png) | [label-default-dark-zh.png](historical/label-default-dark-zh.png) / [label-disabled-dark-zh.png](historical/label-disabled-dark-zh.png) | [label-default-light-en.png](historical/label-default-light-en.png) / [label-disabled-light-en.png](historical/label-disabled-light-en.png) | [label-default-light-zh.png](historical/label-default-light-zh.png) / [label-disabled-light-zh.png](historical/label-disabled-light-zh.png) |
| input | [input-default-dark-en.png](historical/input-default-dark-en.png) / [input-disabled-dark-en.png](historical/input-disabled-dark-en.png) | [input-default-dark-zh.png](historical/input-default-dark-zh.png) / [input-disabled-dark-zh.png](historical/input-disabled-dark-zh.png) | [input-default-light-en.png](historical/input-default-light-en.png) / [input-disabled-light-en.png](historical/input-disabled-light-en.png) | [input-default-light-zh.png](historical/input-default-light-zh.png) / [input-disabled-light-zh.png](historical/input-disabled-light-zh.png) |
| radio | [radio-default-dark-en.png](historical/radio-default-dark-en.png) / [radio-disabled-dark-en.png](historical/radio-disabled-dark-en.png) | [radio-default-dark-zh.png](historical/radio-default-dark-zh.png) / [radio-disabled-dark-zh.png](historical/radio-disabled-dark-zh.png) | [radio-default-light-en.png](historical/radio-default-light-en.png) / [radio-disabled-light-en.png](historical/radio-disabled-light-en.png) | [radio-default-light-zh.png](historical/radio-default-light-zh.png) / [radio-disabled-light-zh.png](historical/radio-disabled-light-zh.png) |
| toggle-group | [toggle-group-default-dark-en.png](historical/toggle-group-default-dark-en.png) / [toggle-group-disabled-dark-en.png](historical/toggle-group-disabled-dark-en.png) | [toggle-group-default-dark-zh.png](historical/toggle-group-default-dark-zh.png) / [toggle-group-disabled-dark-zh.png](historical/toggle-group-disabled-dark-zh.png) | [toggle-group-default-light-en.png](historical/toggle-group-default-light-en.png) / [toggle-group-disabled-light-en.png](historical/toggle-group-disabled-light-en.png) | [toggle-group-default-light-zh.png](historical/toggle-group-default-light-zh.png) / [toggle-group-disabled-light-zh.png](historical/toggle-group-disabled-light-zh.png) |
| tabs | [tabs-default-dark-en.png](historical/tabs-default-dark-en.png) / 未验证 | [tabs-default-dark-zh.png](historical/tabs-default-dark-zh.png) / 未验证 | [tabs-default-light-en.png](historical/tabs-default-light-en.png) / 未验证 | [tabs-default-light-zh.png](historical/tabs-default-light-zh.png) / 未验证 |
| transport-number | [transport-number-default-dark-en.png](historical/transport-number-default-dark-en.png) / [transport-number-disabled-dark-en.png](historical/transport-number-disabled-dark-en.png) | [transport-number-default-dark-zh.png](historical/transport-number-default-dark-zh.png) / [transport-number-disabled-dark-zh.png](historical/transport-number-disabled-dark-zh.png) | [transport-number-default-light-en.png](historical/transport-number-default-light-en.png) / [transport-number-disabled-light-en.png](historical/transport-number-disabled-light-en.png) | [transport-number-default-light-zh.png](historical/transport-number-default-light-zh.png) / [transport-number-disabled-light-zh.png](historical/transport-number-disabled-light-zh.png) |
| transport-icon | [transport-icon-default-dark-en.png](historical/transport-icon-default-dark-en.png) / [transport-icon-disabled-dark-en.png](historical/transport-icon-disabled-dark-en.png) | [transport-icon-default-dark-zh.png](historical/transport-icon-default-dark-zh.png) / [transport-icon-disabled-dark-zh.png](historical/transport-icon-disabled-dark-zh.png) | [transport-icon-default-light-en.png](historical/transport-icon-default-light-en.png) / [transport-icon-disabled-light-en.png](historical/transport-icon-disabled-light-en.png) | [transport-icon-default-light-zh.png](historical/transport-icon-default-light-zh.png) / [transport-icon-disabled-light-zh.png](historical/transport-icon-disabled-light-zh.png) |

## 历史行为证据与当前自动化证明

| 场景 | 实际已有观察 | 持久证据与限制 |
| --- | --- | --- |
| Space不激活toolbar Button | before/after AX均为`State button (on)`；键盘log从escape到space | [按前AX](historical/beforeSpace.ax.txt)、[按后AX](historical/afterSpace.ax.txt)；只证明旧批次状态未变且事件到该fixture根，不证明真实音频播放 |
| Tab到达下一控件 | Button focused → State icon focused | [Tab后AX](historical/afterTab.ax.txt)；没有证明当前native focusVisible像素 |
| 输入含Space与中文 | AX为`Native inputInput with space 输入` | [拖动后AX](historical/dragAX.ax.txt)第34行；是旧批次，不代替当前所有编辑action回归 |
| popup内拖动后仍打开 | AX包含popup window与内部数值130 | [拖动AX](historical/dragAX.ax.txt)第51–54行 |
| popup内wheel后仍打开 | AX包含popup window与内部数值118 | [滚轮AX](historical/wheelAX.ax.txt)第59–62行、[旧弹层图](historical/popup-wheel-open-dark-en.png)；两份AX来自不同捕获过程，不能硬拼成130→118的一次连续操作 |
| 窄/宽fill弹层打开 | 现有两张open图和parent/trigger bounds | [窄open](historical/dropdown-fill-narrow-open-dark-en.png)、[宽open](historical/dropdown-fill-wide-open-dark-en.png)；F1切换后的anchored alignment仍需当前GUI复核 |
| 当前键盘、布局、命中 | Native TestRenderer测试和失败变异见下表 | 自动化不是物理键鼠或截图；当前真实Tab/Space、popup操作另列 |

### 最近已观察的集成门禁

这是主代理最后一次实际观察结果的记录，本报告任务没有执行build、测试、lint、formatter或commit。

| 位置 | 命令 | 最近实际结果 | 证据层 |
| --- | --- | --- | --- |
| `apps/gpuix` | `bunx tsc --noEmit` | 0错误 | 主代理full gate |
| `apps/gpuix` | `bun test` | 993 pass，1 todo，0 fail，156 files | 主代理full gate；保留todo，不写全绿零待办 |
| 仓库根 | `pnpm exec eslint apps/gpuix/src` | exit0 | 主代理full gate |
| 仓库根 | `node scripts/gpuix-review-scan.mjs` | 0 HARD，0 WARN | 主代理full gate；扫描不是完整视觉审查 |
| 仓库根 | `cargo check` | 通过，最后已观察记录 | 本轮报告未重跑，不能冒称与最新截图同刻 |
| 仓库根 | `cargo test` | 49 tests，4 suites通过，最后已观察记录 | 共享原生基线兼容；本切片未新增Rust源码 |

### 回归变异记录

下表记录主代理实际观察到的失败，变异已还原。不是“计划变异”，也不靠删弱既有断言获得green；本报告未重跑这些命令。失败数字是各次变异运行结果，不能相加当新增测试数量。

| 变异 | 实际失败 / 差异 | 证明的范围 |
| --- | --- | --- |
| hideIcon仍保留图标宽 | 期望22px，实际34px，失败 | 图标空间确实移除，不只是把图标画透明 |
| fill/center复用intrinsic width | 6失败，偏差8.5–17px | 50/33px父宽、编辑及resize需要实际onLayout内宽 |
| 移除数值root `pointerEvents:auto` | 祖先offset由0变−16并失败 | 数值wheel命中隔离，非只检查样式字符串 |
| trigger重新接受Space | 2失败 | 根菜单Space不能激活且需到窗口owner |
| 移除MenuItem stopPropagation | 2失败 | 菜单项选中与窗口播放不能同时执行 |
| 去掉descendant Enter来源guard | 1失败 | 子控件Enter不能误激活祖先trigger |
| 不向NumericPad/useDragPad转发dragStep | 4失败 | 拖动、滚轮粗精度确实独立于typed step |
| destructive active退回通用primary | 2失败 | dark/light danger active层级保留 |
| Button忽略source tabIndex | 失败 | 原生Tab跳过调用方排除的Button |
| Button忽略调用方role | 失败 | AX角色遵守调用方 |
| DragPreviewArea忽略source tabIndex | 失败 | 实际source的Tab入口遵守调用方 |
| DragPreviewArea忽略source role | 失败 | 实际source的AX角色正确 |
| DragPreviewArea wrapper误为button/额外入口 | 失败 | wrapper group与source owner不重复 |

### 两轴自审与仲裁

| 轴 | 发现 | 处置 |
| --- | --- | --- |
| Standards | 未发现可确定的新增硬问题；提出item遍历parent链恢复焦点的维护性判断项 | 选中完成操作已收敛至navigation的`finishSelection`，item不再拥有根菜单遍历策略 |
| Spec | 未发现明确新增实现缺陷；根MenuTrigger和SubTrigger的Space语义措辞有歧义 | 根trigger禁Space，弹层`menuitem`语义SubTrigger保留Space并消费；例外明确落在菜单项语义，不扩散到工具栏 |
| 原生依赖 | 早期嵌套右键、native布局与focusVisible被列为blocked | 当前已消费F1/F2；旧报告中的阻塞不能沿用。视觉证据不足是另一个问题，不由依赖合入自动消除 |

## 当前窗口补证

第二次授权为06:04–06:14 UTC；Runtime在06:13:37 UTC结束桌面会话，10个自有命名gallery服务均已停止。首次授权在开始前过期的记录保留为provenance，不把首次失败当作这次重试结果。未对Live进行focus、点击或修改。

实际文件见 [Runtime manifest](current/runtime-manifest.json) 与 [裁图索引](current/cropped-images.json)。本次是当前工作树运行的`@gpuix/react` native gallery，每个命名服务均记录created native window与mount complete；窗口报告1050×808，配置内容高780。源码配置固定renderer主干SHA见前文；manifest未提供实际加载二进制的版本指纹，所以该SHA只作源码/配置基线，不冒充逐窗口二进制读回。

本次共有28个capture条目，其中1张computer.zoom放大图只有图片，其余条目包含full截图、AX文本与JSON。它们包括8张默认/禁用四组合全图、正常gallery总览，以及真实Tab/Space/Enter、数值预编辑/编辑、popup调整的前后记录。另有40张4×裁图，由真实截图裁切并nearest放大，不注入样式或重画；数量包含group、parent和成员重复，不代表40个独立状态已通过。

裁图用baseline AX bounds及窗口阴影帧校准定位，比例约0.865714。活动或编辑后原ref可能已经替换，裁图中的旧ref和target只是定位来源，不是同刻AX身份/宽度读回。截图放大便于观察，但不把4×后的边缘像素直接当逻辑px测量。

### 当前主题与语言矩阵

| 当前组合 | 默认真实截图与AX | 禁用真实截图与AX | 覆盖限制 |
| --- | --- | --- | --- |
| dark-en | [截图](current/states-default-dark-en.png) / [AX](current/states-default-dark-en.ax.txt) | [截图](current/states-disabled-dark-en.png) / [AX](current/states-disabled-dark-en.ax.txt) | 全图已取；除dark-en默认外未逐控件放大 |
| dark-zh | [截图](current/states-default-dark-zh.png) / [AX](current/states-default-dark-zh.ax.txt) | [截图](current/states-disabled-dark-zh.png) / [AX](current/states-disabled-dark-zh.ax.txt) | 全图已取；除dark-en默认外未逐控件放大 |
| light-en | [截图](current/states-default-light-en.png) / [AX](current/states-default-light-en.ax.txt) | [截图](current/states-disabled-light-en.png) / [AX](current/states-disabled-light-en.ax.txt) | 全图已取；除dark-en默认外未逐控件放大 |
| light-zh | [截图](current/states-default-light-zh.png) / [AX](current/states-default-light-zh.ax.txt) | [截图](current/states-disabled-light-zh.png) / [AX](current/states-disabled-light-zh.ax.txt) | 全图已取；除dark-en默认外未逐控件放大 |

默认dark-en中compact控件处于同一紧凑高度，纯图标壳为方形；light-zh全图可见中文标签与浅色层级。这里只确认实际有图及静态观察，没有替所有状态宣称文字居中、裁切、颜色区别均已验收。

### 当前逐控件逐状态

表中“4×裁图”证明文件存在且来自真实窗口，不自动意味着该状态的全部视觉检查通过。“全图已有”不满足每控件每状态各一张放大的要求。所有pressed均未验证；缺图不使用N/A掩盖。

| 控件 / fixture | 默认 | hover | pressed | Tab focusVisible | disabled | active / selected / open | 预编辑 | 编辑 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| button | [4×裁图](current/button-default-dark-en-2026-10-15-e5-4x.png) | [真实move裁图；hover语义未验证](current/button-hover-dark-en-2026-10-15-e5-4x.png) | 未验证 | [实际Tab后裁图](current/button-focus-dark-en-2026-10-15-e5-4x.png) | 全图已有；逐控件放大未验证 | [Enter后裁图](current/button-active-dark-en-2026-10-15-e5-4x.png) + [on AX](current/states-active-dark-en.ax.txt) | 未验证 | 未验证 |
| icon-button | [4×裁图](current/icon-default-dark-en-2026-10-15-e7-4x.png) | 未验证 | 未验证 | [实际Tab到达AX；逐控件放大未验证](current/keyboard-tab-next-dark-en.ax.txt) | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| outline | [4×裁图](current/outline-default-dark-en-2026-10-15-e8-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| secondary | [4×裁图](current/secondary-default-dark-en-2026-10-15-e10-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| ghost | [4×裁图](current/ghost-default-dark-en-2026-10-15-e12-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| destructive | [4×裁图](current/delete-default-dark-en-2026-10-15-e14-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| link | [4×裁图](current/link-default-dark-en-2026-10-15-e16-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| number | [4×裁图](current/number-default-dark-en-2026-10-15-e18-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | [click后裁图](current/number-pre-edit-dark-en-2026-10-15-e18-4x.png) | [textfield裁图](current/number-edit-dark-en-2026-10-15-e18-4x.png) |
| bar | [4×裁图](current/bar-default-dark-en-2026-10-15-e20-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| bipolar | [4×裁图](current/bipolar-default-dark-en-2026-10-15-e22-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| pan | [4×裁图](current/pan-default-dark-en-2026-10-15-e24-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| toggle | [4×裁图](current/toggle-default-dark-en-2026-10-15-e26-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | [共享active后on全图；逐控件放大未验证](current/states-active-dark-en.png) | 未验证 | 未验证 |
| dropdown | [4×裁图](current/dropdown-default-dark-en-2026-10-15-e28-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| popup | [4×裁图](current/popup-default-dark-en-2026-10-15-e31-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | [open AX；独立弹层像素未验证](current/popup-open-dark-en.ax.txt) | 未验证 | 未验证 |
| label | [4×裁图](current/input-label-default-dark-en-2026-10-15-e33-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| input | [4×裁图](current/input-default-dark-en-2026-10-15-e34-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| radio | [4×裁图](current/radio-group-default-dark-en-2026-10-15-e35-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| toggle-group | [4×裁图](current/tool-group-default-dark-en-2026-10-15-e38-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| tabs | [4×裁图](current/tabgroup-default-dark-en-2026-10-15-e41-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| transport-number | [4×裁图](current/transport-number-default-dark-en-2026-10-15-e47-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| transport-icon | [4×裁图](current/transport-icon-default-dark-en-2026-10-15-e49-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| icon-free-number | [4×裁图](current/icon-free-number-default-dark-en-2026-10-15-e60-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | [click后裁图](current/icon-free-number-pre-edit-dark-en-2026-10-15-e60-4x.png) | [textfield裁图](current/icon-free-number-edit-dark-en-2026-10-15-e60-4x.png) |
| filled-narrow-selector | [4×裁图](current/filled-narrow-selector-default-dark-en-2026-10-15-e51-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| filled-wide-selector | [4×裁图](current/filled-wide-selector-default-dark-en-2026-10-15-e55-4x.png) | 未验证 | 未验证 | 未验证 | 全图已有；逐控件放大未验证 | 未验证 | 未验证 | 未验证 |
| popup-number | [popup内120 AX；独立像素未验证](current/popup-adjust-before-dark-en.ax.txt) | 未验证 | 未验证 | 未验证 | 未验证 | 未验证 | 未验证 | 未验证 |

normal gallery的Card、ControlGroup、IconSlot、菜单与Popover、反馈、SettingsShell、DragPreviewArea等仅有 [正常画廊总览](current/overview-dark-en.png) 与 [AX](current/overview-dark-en.ax.txt)，没有补齐逐控件全状态，详列如下。某些静态组件可能不支持交互状态，但本次未逐API分类，因此保守写未验证，不擅自标N/A。

| 正常画廊中未进入旧状态矩阵的控件 | 默认 / hover / pressed / focus / disabled / active | 展开 / 折叠 / 编辑 / 拖动等专用状态 |
| --- | --- | --- |
| Card（含header/title/description/content） | 未验证 | 未验证 |
| ControlGroup / IconSlot | 未验证 | 未验证 |
| ContextMenuTrigger | 未验证 | 未验证 |
| ContextMenuItem / RadioItem | 未验证 | 未验证 |
| ContextMenuSubTrigger / SubContent | 未验证 | 未验证 |
| ContextMenuContent / Label / Separator | 未验证 | 未验证 |
| DropdownMenuTrigger | 未验证 | 未验证 |
| DropdownMenuItem / CheckboxItem | 未验证 | 未验证 |
| DropdownMenuSubTrigger / SubContent | 未验证 | 未验证 |
| DropdownMenuContent / Portal | 未验证 | 未验证 |
| PopoverTrigger | 未验证 | 未验证 |
| PopoverContent / Header / Title | 未验证 | 未验证 |
| Empty（含header/title/description） | 未验证 | 未验证 |
| Separator | 未验证 | 未验证 |
| Progress | 未验证 | 未验证 |
| Loading | 未验证 | 未验证 |
| LoadErrorScreen / Retry | 未验证 | 未验证 |
| ScrollArea / Scrollbar | 未验证 | 未验证 |
| Toaster / toastLoading / toast替换 | 未验证 | 未验证 |
| SettingsShell / SettingsNavItem | 未验证 | 未验证 |
| DragPreviewArea source / preview | 未验证 | 未验证 |

### 当前真实键盘与动态操作

| 操作 | 实际观察 | 证据与结论 |
| --- | --- | --- |
| 初次Tab | `State button (off)`变为focused | [Tab AX](current/states-after-tab-dark-en.ax.txt)、[Tab 4×裁图](current/button-focus-dark-en-2026-10-15-e5-4x.png)；该按钮入口已实际到达，不能推广全部控件焦点环 |
| 聚焦Button后Space | 仍off，keyboard log为space | [Space AX](current/states-after-space-dark-en.ax.txt)、[截图](current/states-after-space-dark-en.png)；未激活且到fixture根，不宣称音频播放已执行 |
| 随后Enter | Button e69为on，toggle同步on | [Enter AX](current/states-active-dark-en.ax.txt)、[裁图](current/button-active-dark-en-2026-10-15-e5-4x.png)；fixture共享active，不能当toggle直接Space验收 |
| 再次Tab | Button off → State icon focused | [后续Tab AX](current/keyboard-tab-next-dark-en.ax.txt)、[截图](current/keyboard-tab-next-dark-en.png)；有真实顺序证据，未覆盖完整Tab循环 |
| 普通number click / Enter | click后incrementor focused；Enter后textfield120 | [预编辑AX](current/number-preedit-dark-en.ax.txt)、[编辑AX](current/number-edit-dark-en.ax.txt)与表中裁图；没有键入修改后的当前数值证据 |
| icon-free click / Enter / Escape | click后数值壳22×13；Enter后textfield120；Escape退出 | [预编辑](current/icon-free-preedit-dark-en.png)、[编辑](current/icon-free-edit-dark-en.png)、[Escape AX](current/icon-free-after-escape-dark-en.ax.txt)；可见插入符形，未完成全部主题/状态caret验收 |
| 编辑bounds限制 | baseline shell x442/y387/w22/h13；实际编辑textfield x444/y386/w18/h15 | shell和textfield是不同节点，不能由18px编辑子节点反推shell宽度稳定或改变；仍以原生几何回归证明shell契约，真实编辑shell bounds未验证 |
| hover尝试 | Runtime实际move到窗口逻辑(27,60)，有真实截图，无hover语义读回 | [move后裁图](current/button-hover-dark-en-2026-10-15-e5-4x.png)；保留“观察图”，不当独立hover状态已证实。较早`states-hover`文件不作为hover通过证据 |
| popup内wheel | −4无数值变化；−60令120→116，popup仍存在 | [before AX](current/popup-adjust-before-dark-en.ax.txt)、[小wheel AX](current/popup-after-wheel-dark-en.ax.txt)、[大wheel AX](current/popup-after-wheel-large-dark-en.ax.txt)、[截图](current/popup-after-wheel-large-dark-en.png)；该真实路径已观察 |
| popup内drag | background drag失败，按工具提示takeover重试路径`[[152,120],[152,110],[152,95]]`；116→122并focused，popup仍打开 | [drag AX](current/popup-after-drag-dark-en.ax.txt)、[截图](current/popup-after-drag-dark-en.png)；不伪造失败首次调用成功，也不声称此次测了光标锚点 |
| popup Space限制 | 已open → Escape → click重开 → Space，最终仍open | [popup Space AX](current/popup-after-space-dark-en.ax.txt)；没有closed trigger聚焦后Space前后，故“关闭的popup trigger Space不激活”真实窗口未验证 |
| destructive active | 本次只有默认Delete，激活的是普通State button | 当前danger active真实窗口未验证；自动化dark/light与2失败变异另有证明 |
| pressed held | 没有同时按住读回与截图 | 未验证；active图和释放后drag图不能替代 |

当前仍缺：除Button尝试外的逐控件hover；所有真实held pressed；完整Tab/focusVisible环；大部分active/selected；bar/bipolar/pan/transport预编辑与编辑；Input当前键入；filled下拉打开/选择与F1对齐；closed trigger的真实Space；Menu/SubTrigger/ContextMenu真实键鼠；danger active；四组合的逐控件放大与完整状态；性能frame/耗时/挂载节点数据。没有将这些缺口改写成通过。

原生popup作为独立layer出现在AX中，但父窗口截图未包含该layer的可见内容。因此当前popup保持打开与120→116→122的结论只来自AX，不把父窗口图片写成popup本体的像素验收。

### 进程与桌面清理

Runtime的10个命名服务、pid与逐项停止UTC记录在manifest中；06:13:37 UTC精确gallery标题查询为空，computer会话已关闭。主代理随后实际执行以下强制全局残留检查，本报告没有重跑：

```sh
ps -axo pid,etime,command | grep -E 'bun .*--hot|cargo run|gallery|demo'
```

结果为“无匹配，输出为空，grep退出码1”，即该检查未发现残留进程。只清理本任务自己启动的服务，没有停止用户服务。

## UI规范第13节逐项结论

| 检查 | 已有证据 | 当前结论 |
| --- | --- | --- |
| 每个控件每个状态各一张放大截图 | 历史矩阵、current40张裁图与完整缺口表 | 未完成；40张包括group/parent重复，不是全状态覆盖；pressed全部未验证 |
| 间距：同类位置同一token | 当前AX复算compact gap2、row4、Transport gap3、StateGallery左inset7 | 这些fixture测量与token一致；normal卡片inset/宽度/panel gap未完整重测 |
| 居中：文字、数值、图标 | 当前dark-en默认与number/icon-free编辑裁图，native fill/midpoint回归 | 部分静态图已观察；全主题全状态文字基线、caret、icon居中未完整验证 |
| 尺寸：同组等高、图标正方形 | 当前compact h13、Transport h20、icon13×13/20×20、fill74/304 | 默认fixture已量；真实编辑shell与全状态未完整验证，不混淆textfield与shell |
| 紧凑感：与Live同区域并排 | 旧只读Live crop + 当前compact/Transport裁图与bounds表 | 默认密度可比较，默认13vs Live14说明差1；没有Live当前各状态或当前全区域逐状态并排 |
| 深浅色、中文英文各一遍 | 当前8张默认/disabled矩阵全图与AX | 四组合默认/disabled有真实图；除dark-en默认外未逐控件放大，全状态未完成 |
| 键盘：Tab、焦点环、Space | 当前真实Tab到Button再icon；Button Space不激活，根元素状态栏观察到Space；Enter激活 | 这些路径已观察；根元素状态栏不等同WindowKeyboard订阅读回，完整焦点环、全控件与closed popup trigger Space未验证 |
| 动态交互：拖动、滚轮、弹层保持打开 | 当前popup120→116 wheel→122 drag，AX保持popup | 该路径已观察；光标复位、其他弹层/菜单、物理trackpad与人手速度未验证 |
| 性能：可见范围裁剪 | 本报告没有当前frame统计、耗时与挂载节点数 | 未验证；full test数量不是性能证据，不虚构benchmark |

第13节规定没有证据按未验证处理。因此，代码门禁通过与已发送merge_ready不等于A3b完整视觉验收完成。缺少当前逐控件逐状态证据时，本报告不建议按“视觉已全验收”合并。
