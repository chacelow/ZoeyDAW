# 项目面板与共享外观

改 Panel、共享控件或主题/布局配置前阅读本文及相关实现。具体参数以规范指定的配置源为准，文档不复制全部 CSS 数值。

## 结构与职责

`apps/web/src/pages/project/ProjectLayout.tsx` 组合 section 与 `Group`/`Panel`，`useProjectShell.ts` 管面板焦点、折叠与句柄。公共外壳和分隔条位于 `apps/web/src/components/panels/`。

新增 section 使用 `sections/XxxPanel/index.tsx`，在项目 section 类型与 `ProjectLayout` 中接入。页面整体和 Browser 双栏的 Panel 结构由布局层组装，section 不各自建立竞争的顶层布局。

Browser 的 `renderBody` 插槽接收 navigation/results。双栏继承同一底色，不额外包 PanelShell；分隔线保留拖动命中区。分类文字连续裁切，图标位置不变，资源栏保留最小宽度。

Arrangement 的视觉调整限于 `.project-arrangement`，Transport 排列限于 `.project-transport`。除当次明确要求，不改侧栏、全局主题、标题栏与 Footer。

底部是**一个共享面板**，Footer 的两个标签 Affect Chain 与 Clip Edit 互斥切换，各有不同属性（2026-10-14 产品决定，取代「允许同时显示」的旧契约）：Affect Chain 高度固定，垂直拖动只折叠或展开，不自由改变高度；Clip Edit 按 Clip 内容只选一个编辑器（音频→Audio Edit，MIDI→钢琴卷帘）。`useProjectShell` 持有显隐组合、收起前组合及 Clip 高度，布局度量归 `pages/project/detail-view`。可调高的 Clip 与主区域共用 resizable Group；固定高度 Device 在该 Group 外由 `ProjectLayout` 组装，避免展开 Clip 时库优先挤掉相邻 Device。`DeviceDivider` 只在拖动越过半高阈值时切换显隐，支持反向拖回、Esc、失焦取消与方向键。关闭的内容卸载以取消未完成编辑；所有卡片仍使用 PanelShell。

Footer 保留组件类型帮助和视图开关。采样率、缓冲及 CPU 图示位于 Transport Header；当前为标明的原型预览值，不是实时硬件性能测量。

## PanelShell 与分隔条

每张 panel 卡片包 `PanelShell`。它统一背景、固定宽度边框、圆角和 pointer-capture 激活分发，active 只换边框颜色，不改变尺寸或增加外沿高亮。

当前实现保留 `bg-muted` 卡片、`bg-card` gap、2px panel 边框和 7px 分隔命中区。数值由共享 `PROJECT_METRICS` 与生成的 `--project-*` 变量提供；修改配置时同步验证布局，不在消费者复制数字。

不要用 ring、外沿 box-shadow 或 outline 表达 Panel active。Resizable Panel/Group 的 overflow 会裁切外沿。section 不重复添加卡片外壳、圆角或相邻边框，避免双线。

竖向分隔条配水平 Group；横向分隔条配垂直 Group。Browser 的内部细线是视觉边界，命中区仍保持可拖动宽度。轨道内部的 Routing/Mixer 分割不属于 Panel 卡片外壳，应由复合轨道统一布局。

## 共享控件与度量来源

- 通用控件从共享 UI 包公共入口导入。先查现有 Button、DragPad、Dropdown、Popup、列表和拖拽预览，不复制同一交互实现。
- `packages/ui/src/controls/metrics/control-metrics.json` 是共享控件与项目布局度量的配置源；生成 CSS 不是第二份手写真相。通过 UI 包的 metrics 命令生成、检查一致性。
- `CONTROL_METRICS`、`PROJECT_METRICS` 与 `controlMetricStyle` 提供默认/Transport 变体及 CSS 映射。保留区域的有意差异，统一不是让所有控件相同尺寸。
- `pages/project/layout` 拥有轨道展示几何；DOM、Canvas、resize、行容量和命中测试使用同一度量。工程时间范围等领域选择器仍归 model。
- 未来设置先定义类型、默认值、持久化范围和应用入口，再由同一配置驱动 CSS 与 JS。仅覆写 CSS 不代表已更新 Canvas 几何；不是所有 token 都必须暴露为用户设置。
- 数值控件的稳定宽度按实际格式化样本文字测量，不按字符数猜测。激活、预编辑和输入状态不能改变字号、尺寸或隐藏必要图标。

## 主题与语义 token

应用基础主题由 `apps/web/src/index.css` 和既有预设 Provider 提供；共享控件状态样式归 UI `controls`，通用 CSS 桥接归 UI `styles/globals.css`。

业务 CSS 只消费语义 token 或 scoped 派生变量。UI 色不使用散落的原生色阶或内联调色板；主题定义、生成数据和用户轨道/Clip 内容色是有明确 owner 的例外。主题调整不能改写工程配色。

| 用途                        | 来源                                                  |
| --------------------------- | ----------------------------------------------------- |
| 窗口/Transport/间隙底色     | 对应公共外壳使用的 card/background token              |
| Panel 卡片与激活边          | PanelShell 的 muted、border、ring token               |
| 侧栏                        | sidebar 系列 token                                    |
| 控件 idle/hover/drag/active | UI controls 的共享状态样式                            |
| Arrangement 语义色          | scoped `--arrangement-*`，从根主题/可配置语义变量派生 |
| Clip 用户内容色             | document 中的 Clip/Track 配色，不作为全局 UI 主题覆盖 |

新增 text/spacing token 时同步 UI `cn.ts` 的合并配置。配置变化应刷新 DOM 测量、Canvas 颜色缓存与绘制；验收浅深主题、中英文、不同控件变体和缩放/拖动。

## 交互一致性

激活通过 aria-selected、aria-pressed、aria-current 或 data-active 表达，共享 hover 规则不覆盖激活态。列表激活色优先于菜单 focus 色。

Footer Info 只接收 ControlEnvironment 定义的组件类型，由语言包提供固定说明，不发布资源名、输入值或即时参数。控件环境由应用作用域提供；组件画廊使用独立作用域。

拖拽 Ghost 复用 DragPreviewArea 与现有 Motion，保留 Esc、失焦、取消和 reduced-motion；资源放置仍按原型范围禁用。

工程、预览、撤销、模拟时钟与快照契约见 [stores](../../apps/web/src/pages/project/stores/README.md)、[adapters](../../apps/web/src/pages/project/adapters/README.md)。Timeline controller 统一时间范围、缩放与滚动，标尺和轨道共用视口。

## react-resizable-panels v4 使用约定

- 数值 defaultSize 是像素，百分比使用字符串。
- 组件句柄使用 panelRef/groupRef，不使用普通 ref。
- 折叠判定使用 onResize 与句柄 isCollapsed；没有 onCollapse/onExpand。
- Group 的方向属性为 orientation，分隔条为 Separator，由项目 PanelDivider 包装。
- 不覆盖 Group/Panel 内置 overflow、display、flex-direction 或 flex-wrap。

既有故障原因见 [LESSONS](../../LESSONS.md)。修改结构或外观契约时，先更新配置与公共外壳/布局，再迁移 section；不要在业务组件补另一套数值。
