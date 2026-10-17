# 项目面板与共享外观

适用于 gpuix 项目面板、共享控件和主题布局。外观验收见 [gpuix UI 规范](gpuix-ui-standards.md)，原生面板 API 与求解规则见 [ui/panels](../../apps/gpuix/src/ui/panels/README.md)。具体参数以配置源为准，本文不复制全部数值。

## 结构与职责

`apps/gpuix/src/app/project/ProjectLayout.tsx` 固定 Transport/Status，注册 Browser、Arrangement、Clip Edit 和 Affect Chain 到共享 DockLayout。`useProjectShell.ts` 从 project workspace 的版本化 dockLayout JSON 派生激活/可见状态并提供命令，不另存固定面板几何或 Footer view 状态。公共 Dock、Group、Panel 与分隔条位于 `apps/gpuix/src/ui/panels`。

新增 section 在 `apps/gpuix/src/project/sections` 按业务职责组织，由应用组合根接入插槽。页面整体的 Panel 结构归布局层，section 不各自建立竞争的顶层布局。Browser 内部 navigation/results 的双栏布局归 Browser；两栏继承同一底色，不重复包 PanelShell，分类文字连续裁切，图标位置不变，资源栏保留最小宽度。

Arrangement 的外观调整限于对应 section，Transport 排列限于 Transport。除当次明确要求，不改侧栏、全局主题、标题栏与 Status。

Clip Edit 与 Affect Chain 是独立 Dock panel，默认处于 Arrangement 下方同一 Tab 组，可拆分、移组、连续调整尺寸、最大化、隐藏和关闭。Clip Edit 根据 Clip 内容选择音频或 MIDI 编辑器。业务视图内部布局归 `project/sections/footer` 与 `project/sections/clip-edit`。

显式 Clip 编辑请求激活 Clip Edit，选择 Clip 本身不自动切换 Tab。Dock 移动、Tab 切换、隐藏和最大化保留内容身份，关闭才卸载；共享 `CollapseDivider` 仍服务其他二值折叠区域，但不再拥有工程工作区编辑器布局。

底部状态栏保留组件类型帮助、warning 和编辑面板整体显隐，不重复渲染视图切换 Tab。采样率、缓冲与 CPU 的展示必须区分设置元数据、原型预览和真实测量，不把静态值称为实时硬件性能。

## PanelShell 与分隔条

普通 panel 卡片包 `PanelShell`；Dock group 由 DockFrame 统一拥有组头部、背景与外框，内容不再嵌套另一层 PanelShell，避免双边框。两者都在共享 ui/panels 中提供激活外观；active 只改变颜色，不改变尺寸或增加外沿高亮，子控件不会屏蔽组激活。

边框与分隔命中区取 `useTheme().project`，圆角取 `Theme.design.shape.panelRadius`。修改配置时同步验证布局，不在消费者复制数字。Panel active 不用外沿 ring、box-shadow 或 outline；section 不重复添加卡片外壳、圆角或相邻边框，避免裁切与双线。

竖向分隔条配水平 Group，横向分隔条配垂直 Group。Browser 内部细线是视觉边界，命中区仍保持可拖动宽度。Routing/Mixer 分割属于复合轨道布局，不是 Panel 卡片外壳。

原生 Group/Panel 仅实现 [面板 README](../../apps/gpuix/src/ui/panels/README.md) 声明的 API，不依赖 react-resizable-panels。尺寸数值为像素，百分比用字符串；句柄使用 `panelRef`，通过 `onResize` 与 `isCollapsed()` 同步折叠状态。容器尺寸由原生 `onLayout` 单一拥有，不增加 DOM 测量或定时轮询。

## 共享控件与度量来源

- 通用控件从 `apps/gpuix/src/ui/controls` 公共入口导入。先查已有 Button、DragPad、Dropdown、Popup、列表和拖拽预览，不复制交互实现。
- `apps/gpuix/src/shared/theme/metrics/control-metrics.json` 是共享控件与项目布局度量的配置源，同目录 `config.ts` 直接导入 JSON 并导出类型化度量。不保留旧 Web 的 CSS 生成路径，也不维护第二份手写配置。
- 消费者通过 `useTheme()` 读取 `control`、`transportControl` 与 `project`。保留区域的有意差异，统一不是让所有控件同尺寸。原生形状、边框与语义间距另由完整 `Theme.design` 持有，详见 [shared/theme](../../apps/gpuix/src/shared/theme/README.md)。
- `apps/gpuix/src/project/layout` 拥有轨道展示几何；绘制、resize、行容量与命中测试使用同一度量。工程时间范围等领域选择器仍归 model。
- 未来设置先定义类型、默认值、持久化范围与应用入口，再由同一配置驱动布局与绘制；不是所有 token 都必须暴露为用户设置。
- 数值控件的稳定宽度按实际格式化样本文字测量，不按字符数猜测。激活、预编辑与输入状态不能改变字号、尺寸或隐藏必要图标。

## 主题与语义 token

`apps/gpuix/src/shared/theme` 是颜色、配色预设、共享几何与原生设计 token 的唯一 owner。组合根受控传入主题，组件通过 `useTheme()` 读取；不维护 CSS Provider、DOM 颜色探针或共享包路径。

UI 色使用语义 token，不散落原生色阶或内联调色板。主题定义、生成数据与用户轨道/Clip 内容色各有明确 owner，主题调整不能改写工程配色。

| 用途                        | 来源                                                         |
| --------------------------- | ------------------------------------------------------------ |
| 窗口、Transport 与间隙底色  | 公共外壳消费的 card/background/muted token                   |
| Panel 卡片与激活边          | PanelShell 的背景与 border/ring token                        |
| 控件 idle/hover/drag/active | ui/controls 的共享状态样式                                   |
| Arrangement 语义色          | Theme.colors 中的 arrangement 派生角色                       |
| Clip 用户内容色             | 工程中的 Clip/Track 配色，经 shared/theme 的内容色解析后绘制 |

配置变化应更新布局、颜色与绘制缓存；验收浅深主题、中英文、不同控件变体和缩放/拖动。

## 交互与工程边界

激活状态通过原生 role 与相应 aria 属性表达，共享 hover 规则不覆盖激活态。列表激活色优先于菜单 focus 色。

Footer Info 只接收 `ControlEnvironment` 定义的组件类型，应用组合根从 `app/locales/sections/status` 注入 `StatusStrip` 的固定说明，不发布资源名、输入值或即时参数。控件环境由应用作用域提供；组件画廊使用独立作用域。

拖拽 Ghost 复用 `DragPreviewArea` 与已有原生交互，保留阈值、释放、Esc 与取消，不恢复 DOM portal 或 Motion 依赖。资源放置仍按原型范围禁用。

工程、预览、撤销、播放与快照契约见 [stores](../../apps/gpuix/src/project/stores/README.md)、[adapters](../../apps/gpuix/src/project/adapters/README.md)。Timeline controller 统一时间范围、缩放与滚动，标尺与轨道共用视口；接口及键盘 owner 见 [Arrangement 组合契约](gpuix-arrangement-composition.md)。

既有故障原因见 [LESSONS](../../LESSONS.md)。修改结构或外观契约时，先更新配置与公共外壳/布局，再迁移 section，不在业务组件补另一套数值。
