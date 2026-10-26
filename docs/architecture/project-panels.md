# 项目面板与共享外观

改 Panel、共享控件或主题/布局配置前阅读本文及相关实现。具体参数以规范指定的配置源为准，文档不复制全部 CSS 数值。

## 结构与职责

`apps/web/src/pages/project/ProjectLayout.tsx` 组合 Transport、受控 Dock 工作区与状态栏。`useProjectShell.ts` 持有一个 `WorkspaceController`。工程 runtime 仍归 ProjectPage，不由面板创建或释放。

`workspace/panels.ts` 注册 Browser、Arrangement、Clip、Devices 四个 singleton。`WorkspaceController` 持有唯一的 `DockLayoutJSON`；纯模型负责移动、分组、隐藏、关闭和序列化，DOM 视图只投影该布局与临时拖动预览。行为依据参考 Dock 源码，不使用 Dockview 默认交互替代。

Browser 的 `renderBody` 插槽接收 navigation/results。双栏继承同一底色，不额外包 PanelShell；分隔线保留拖动命中区。分类文字连续裁切，图标位置不变，资源栏保留最小宽度。

Arrangement 的视觉调整限于 `.project-arrangement`，Transport 排列限于 `.project-transport`。除当次明确要求，不改侧栏、全局主题、标题栏与 Footer。

默认 Browser 位于左侧 border，Clip 与 Devices 位于底部 border，Arrangement 位于主布局，右侧保留空 rail。left、right、bottom 均允许停靠，每条 rail 分为起始和末端两组；所有方向使用方形纯图标，不在底部另建文字 Tab。点击当前选中图标收起面板，点击其他图标选择并展开，标题栏区域开关另行控制整侧可见性。

窗口标题栏通过通用 `#app-titlebar-workspace-actions` 插槽接收工作区操作。区域开关、菜单、设置和原生窗口按钮统一使用 Transport 度量派生的 28px 方形尺寸、16px 居中图标，交互区域排除原生拖窗。状态栏只保留控件帮助与警告，不重复显示 Clip/Devices 或底部开关。采样率、缓冲及 CPU 图示仍是 Transport Header 中标明的原型预览值。

## Dock 交互与分隔条

`workspace/dock/model.ts`、`geometry.ts`、`border-geometry.ts` 和 `border-rails.ts` 移植参考 Dock 的纯状态与几何。主布局使用 group/split 树，border 保存 type、visible、tabs、end、selected 和 size。一个 panel 只能归属一个位置。主组支持 Tab 重排、中心合并、四边拆分及最大化；border 也允许最大化当前面板。

rail 末端的模式菜单与右键图标菜单提供 split/overlay 切换及 hover reveal。split 挤占主区，可同时展开多个，不因外部点击或 Escape 收起；overlay 不挤占主区，只允许一个展开，外部点击或 Escape 关闭。菜单打开和分割线拖动不能被当成外部点击。展开的 border 不绘制第二条标题条：rail 上激活的图标 Tab 已承担标题与关闭，border 组只渲染内容，最大化收进 rail 的模式菜单。主组仍保留自己的 Tab 条。

Tab 或组拖动超过输入阈值后才显示预览，release 提交，Escape、blur 和窗口失活取消。rail 插入依据起始/末端组和实际槽位，放入后保持收起，由用户点击图标打开；主组四角取最近的归一化边缘。Tab wrapper 的中点决定重排，插入线对齐完整 wrapper 边界。方向键只移动 Tab 焦点，Enter 激活，Space 保留工程播放职责。

内容以 panel ID 为稳定 key，移动、切换、隐藏和最大化不重建子树；close 才移除，View 菜单可恢复已关闭或隐藏的注册面板。隐藏内容不可交互，不响应编辑快捷键，不抢焦点。布局视图不另建工程 backend。

Dock group 不套 PanelShell，不绘制卡片圆角或外沿 ring。主内容使用 background，drawer 和 rail 使用 card。rail 收起时只在主区一侧画单条 border，展开时 rail 与自身面板贴合，仅面板与主区之间画分隔线。Browser 内双栏继续复用 `Group`、`Panel` 与 `PanelDivider`，不改变 Arrangement 内部缩放和轨道几何。

## 共享控件与度量来源

- 通用控件从共享 UI 包公共入口导入。先查现有 Button、DragPad、Dropdown、Popup、列表和拖拽预览，不复制同一交互实现。
- `packages/ui/src/controls/metrics/control-metrics.json` 是共享控件与项目布局度量的配置源；生成 CSS 不是第二份手写真相。通过 UI 包的 metrics 命令生成、检查一致性。
- `CONTROL_METRICS`、`PROJECT_METRICS` 与 `controlMetricStyle` 提供默认/Transport 变体及 CSS 映射。保留区域的有意差异，统一不是让所有控件相同尺寸。
- `pages/project/layout` 拥有轨道展示几何；DOM、Canvas、resize、行容量和命中测试使用同一度量。工程时间范围等领域选择器仍归 model。
- 未来设置先定义类型、默认值、持久化范围和应用入口，再由同一配置驱动 CSS 与 JS。仅覆写 CSS 不代表已更新 Canvas 几何；不是所有 token 都必须暴露为用户设置。
- 数值控件的稳定宽度按实际格式化样本文字测量，不按字符数猜测。激活、预编辑和输入状态不能改变字号、尺寸或隐藏必要图标。

## 主题与语义 token

应用基础主题由 `apps/web/src/index.css` 和既有预设 Provider 提供；共享控件状态样式归 UI `controls`，通用 CSS 桥接归 UI `styles/globals.css`。

`packages/ui/src/theme/builtin-presets.ts` 提供 VS Code Modern 与 Dark+/Light+ 语义色预设，公开注册表保留已有生成预设。仅缺少已保存选择时默认 Modern；显式 Default 和旧预设保持不变。这是应用颜色映射，不是任意 VS Code theme JSON 导入器。设置继续使用既有明暗、系统模式、语言与预设网格。

根 `:root` 与 `.dark` fallback token 同样使用 VS Code Modern；显式 Default 清除预设 inline 覆盖后仍是该配色，不回退旧灰阶。Group header 选中时，按 group ID 同步其后代行上的围栏；嵌套 Group 的独立围栏不随祖先误高亮。

业务 CSS 只消费语义 token 或 scoped 派生变量。UI 色不使用散落的原生色阶或内联调色板；主题定义、生成数据和用户轨道/Clip 内容色是有明确 owner 的例外。主题调整不能改写工程配色。

| 用途                        | 来源                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| 窗口/Transport/间隙底色     | 对应公共外壳使用的 card/background token                          |
| Dock 工作区与 Tab           | `workspace.css` 消费 background、card、border、primary 与共享度量 |
| 侧栏                        | sidebar 系列 token                                                |
| 控件 idle/hover/drag/active | UI controls 的共享状态样式                                        |
| Arrangement 语义色          | scoped `--arrangement-*`，从根主题/可配置语义变量派生             |
| Clip 用户内容色             | document 中的 Clip/Track 配色，不作为全局 UI 主题覆盖             |

新增 text/spacing token 时同步 UI `cn.ts` 的合并配置。配置变化应刷新 DOM 测量、Canvas 颜色缓存与绘制；验收浅深主题、中英文、不同控件变体和缩放/拖动。

Arrangement 使用 `--background` 作为编辑区，交替区域混入 4% foreground，结构线和网格颜色派生自 `--border`。主次网格保持 1 CSS px，以不透明度区分层级；Minimap 摘要线保持 1 物理像素。轨道横缝与 Header 左边界都是覆盖层，不占用行高或列宽：Canvas 在每个行接缝画一条 2px 线，Header 每行用绝对定位的 2px 底边线，viewport 用 2px 左覆盖线。分区与 Group rail 的分隔同样以 `box-shadow: inset` 或伪元素绘制，因此 Header 各列宽度不受分隔线影响，相邻行也不会叠成 2px。2px Tab 激活和轨道拖放提示属于交互强调，不与普通分隔线统一。Loop 与 Locator 的竖向引导线从各自标尺带内起画并贯穿到底部时间标尺；循环边界从 brace 边框起画，视觉上是一条连续线。StatusStrip 独立负责全宽 1px 上边框，不重复叠加停靠区域 sash。

## 交互一致性

激活通过 aria-selected、aria-pressed、aria-current 或 data-active 表达，共享 hover 规则不覆盖激活态。列表激活色优先于菜单 focus 色。

Footer Info 的 hover 通道只接收 ControlEnvironment 定义的组件类型，由语言包提供固定说明，不发布资源名、输入值或即时参数。没有 hover 时，可操作的插件故障先于普通 warning 和文件反馈显示，并复用 Device 面板的恢复动作；没有故障时保留原 warning、文件操作状态、错误与外部媒体依赖提示。工程 Header 不另建反馈行。控件环境由应用作用域提供；组件画廊使用独立作用域。

设置各页使用应用级 `.settings-row`，左侧标题、右侧控件共用列宽，保留原主题、语言和即时应用行为。设备清单在进入页面和打开设备选择器时发现，不提供独立刷新按钮；异步发现不得覆盖新选择或新错误。去掉重复的已选设备、请求值和说明，仅保留设备状态、实际值差异、延迟与可操作错误。

编排内 Ghost 与 Browser 音频预览调用同一 `paintClip` variant：轨道色 Header 半透明，正文仅绘制半透明真实波形/音符，不填背景或绘制选中高亮。Browser drop 后保留 source/placement，直到正式 Clip 进入 scene、可用波形完成交接且主画布已绘制，再移除预览。拖动取消、导入失败和卸载各自清理本轮 owner；未知时长不伪造音乐宽度。

`/library` 按 `pages/library/catalog.ts` 注册表提供左侧组件 Tab，每页展示同一组件族的真实变体和状态操作。默认只显示组件与短标签，完整适用状态和 N/A 原因收在折叠清单。基础组件切页保留挂载、测量宽度与本地值；电平计时、加载和 DAW 预览等 transient 页离开即卸载。

`Knob` 是共享 DragPad 家族的径向外观，复用拖动、原生光标、滚轮、文本编辑与取消，不建立第二套手势。仅 Knob 默认启用聚焦方向键与 Home/End 调整，键盘发布后同步滚轮累计值。`VolumeMeter` 提供 compact 与校准 track 外观、单/双声道及横/纵向；Gallery 的信号与峰值包络属于本地演示，不宣称接通音频引擎。

真实 track、Group、Clip、Audio、钢琴卷帘、Automation、设备链与所选片段编辑器由 `/library/preview/:kind` 组合生产组件。该路由位于 MainLayout 外，通过当前页的 iframe 提供独立 JS realm，隔离单例工程 store、命令、Canvas scene、meter ring 与时钟。它只注册 mock backend，不设置工程存储 ID；Toolbar 与键盘的 snapshot capability 关闭。切页释放 runtime、backend、输入监听与未完成编辑。主题和语言变化重建预览，读取同源已保存的设置。

ClipDetail 按当前 clip ID 重新读取所属 track 和 clip，标题栏颜色优先采用 clip 覆盖色，否则继承 track；编辑器按 clip ID 重建，按实际类型只显示 Audio、MIDI 或 Pattern 之一。嵌入页的原生光标恢复通过 frame 边框与缩放逐级转换到顶层窗口坐标。

亮色 Clip/Track 内容配色使用根内容调色板的固定深色 `--arrangement-clip-ink`，不从随主题变化的 foreground/card 推导。Clip 编辑器标题的文字、电源启用开关与重命名态共用该 ink；重命名聚焦底色使用 clip paper，保持深字对比度。

普通轨道末尾的时间网格与右侧控制列空白区共用 `Timeline/InsertTrackMenu`，只提供插入音频、MIDI、返送轨道三项。控制列入口从共享 `dropZoneTop` 到固定 Return/Main 区之前，随普通轨道滚动并被裁切，不覆盖轨道行或固定区域。

工程、预览、撤销、模拟时钟与快照契约见 [stores](../../apps/web/src/pages/project/stores/README.md)、[adapters](../../apps/web/src/pages/project/adapters/README.md)。Timeline controller 统一时间范围、缩放与滚动，标尺和轨道共用视口。

MiniMap 依据 Live Arrangement 的 `AScrollerView → LScrollBarXView → AXBackgroundView → LArrangerScrollable` 事件链实现，不能复用 Clip Detail 的 `AZoomScrollBar`。`MiniMap/zoom.ts` 统一绘制与命中几何：内部最小宽度 12px，左右各 2px，整个框最小 16px；位置按剩余平移距离映射。框内横拖按时间线像素移动，竖拖逐事件按主轴缩放，下拖放大、上拖缩小；修饰键切换为框直接平移或框外翻页。两端缩放锚定对侧时间边界。结束、失焦和捕获丢失保留实时视口；Escape 结束当前手势，不回滚视口。双击适配，Command 滚轮缩放（其他平台为 Ctrl），滚轮小数累计后再按原生整数增量处理。中心与框外使用普通放大镜光标，边缘复用共享 bracket 光标。

MiniMap 按下后立即隐藏鼠标并取得单 owner 的鼠标锁。Tauri 通过原生 cursor grab/hide，浏览器使用 Pointer Lock；位移采用相对 movement 累积虚拟坐标，屏幕边缘不截断手势。owner 明确经过 acquiring、locked、releasing、released，早于 ACK 的释放也等待并撤销同一 token。按下时保存点击点在视口方框内部的左右比例，释放按当前方框的 left/width 重算恢复位置，不使用整条 MiniMap 的比例；纵向保留在总览行中的按下高度。释放先解锁、恢复计算位置再显示；Escape、失焦、窗口销毁和卸载都释放资源。窗口销毁或没有可用几何时回退原按下位置。当前 viewport 数学和实时值不回滚；锁定与位置恢复失败不得被称为已完成原生交互验证。

总览与 Canvas 共用 `useTimelineViewport` 的时间范围。song length 以 quarter-note beats 保存会话滞回：候选为事件末端、播放位置、循环和选择范围的最大末端加 32，夹到 232–15768000；候选在旧值减 32 与加 16 的开区间内时保留旧值。总览末端取 song length 与当前可见末端的较大值，不再增加一次尾部余量，不固定为 128 小节。重建工程会话时重置，拍号改变只转换显示单位。单位定义见 [Live API](https://docs.cycling74.com/userguide/m4l/live_api_overview/)。

内容像素宽度 `C` 包含首尾像素，mapper 按 `C−1` 换算时间。适配缩放为 `(viewportWidth−1)/bars`；框几何使用整数宽度和 float32 比例，锚点重新投影时按像素取整。边缘拖出总览继续捕获，但按原生左右分支限位，允许整数宽度换算产生的单像素误差。

Clip Edit 主波形和源总览直接使用像素 viewBox；音乐标尺、淡化与选择标记在嵌套 SVG 中使用小节坐标。禁止先用 `view.span/width` 的极小 scale 压缩波形再由外层放大，WebKit 在最大缩放时会跳过该形状，即使数据和 path 完整。

## react-resizable-panels v4 使用约定

- 数值 defaultSize 是像素，百分比使用字符串。
- 组件句柄使用 panelRef/groupRef，不使用普通 ref。
- 折叠判定使用 onResize 与句柄 isCollapsed；没有 onCollapse/onExpand。
- Group 的方向属性为 orientation，分隔条为 Separator，由项目 PanelDivider 包装。
- 不覆盖 Group/Panel 内置 overflow、display、flex-direction 或 flex-wrap。

既有故障原因见 [LESSONS](../../LESSONS.md)。修改结构或外观契约时，先更新配置与公共外壳/布局，再迁移 section；不要在业务组件补另一套数值。
