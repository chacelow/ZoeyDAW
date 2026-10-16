# Arrangement Lane

消费 gpuix Arrangement 组合契约。工程写入只走 `project/adapters`，纯几何消费 B1 `arrangement/core` 与 `project/model`；这里不拥有工程、视口或轨道外边框。

## 公共接口

`index.ts` 是唯一组合入口。

| 导出 | 职责 |
| --- | --- |
| `LaneRow`、`LaneRowProps` | 一条轨道的 Clip/Pattern/Automation 与行内网格绘制；仅 AX 描述，不持有输入。行放置、可见行卸载、边框及分组围栏由 `tracks` 持有 |
| `LaneOverlay`、`LaneOverlayProps` | 全画布播放头、Ghost 左起点对齐线、停止时行内插入点及标尺三角；由 timeline 的 overlay slot 单次挂载 |
| `createLaneController`、`LaneControllerDeps`、`LaneController` | 跨行手势、阈值、预览事务、Clip/Automation 键盘与系统剪贴板路由；由组合根创建并 dispose |
| `useLaneSurface(controller, labels, originY?)` | 必须位于 `ThemeProvider` 内；返回中立的 `TimelineEditSurface`，拥有唯一稳定输入层、菜单与 inline editors；默认原点读取 `scene.geometry.arrangement.barRulerHeight`，独立 demo 可传 0 |
| `LaneInteractionState` | `getSnapshot` / `subscribe` 的稳定交互快照；`dragActive` 标记需要帧驱动的拖动 |
| `LaneKey`、`LanePointer` | 归一化输入；指针使用共享画布坐标，不是行内坐标 |
| `PeakReader` | 黑盒只读音乐范围峰值查询，不传 PCM，不在 lane 假设采样率 |
| `LaneLabels`、`LaneMessageKey` | 组合根注入的严格双语标签；demo 标签不作为应用默认翻译 |

`LaneRow` 只接收同一份 `scene` / `viewport`、`row` 与 `PeakReader`。controller 与标签在组合根注入 `useLaneSurface`，行不接受另一份输入 owner。剪贴板通过 `LaneControllerDeps.clipboard` 注入，权威类型来自 `platform/clipboard`。`LaneOverlay.transportBar` 由内部 `useAnimationFrame` 在播放期间采样；恢复边界经 `useResumeFrame` 同步读取最新位置；停止或卸载释放两种订阅。

`LaneControllerDeps.setScroll(x, y)` 由 timeline 提供：返回前共享 SceneStore 的 viewport 投影必须已更新，并返回接受后的 ArrangementViewport。`step(timestampMs)` 只调用该命令并重算当前手势，不创建计时器、不拥有另一份 viewport。`interrupt()` 回滚未完成的手势；`dispose()` 释放订阅并拒绝之后的编辑输入。

工程到共享 SceneStore 的投影只有 timeline controller 一个产品 owner。lane 的 preview、选择与播放命令只改工程 store；lane 仅写自身的拖动、缩放、悬停、targetSelection 与手势进行中的 timeSelection。独立 demo 无 timeline 时，由 demo/runtime 的一个订阅投影并在 dispose 时退订。

卡片展示几何使用行内坐标，轨道行承担垂直滚动位移。`ClipCardView` 只拥有位置、透明度与 AX 描述，不持有键盘入口；`ClipContentsView` 默认 memo 只消费局部内容。原有 source/Ghost 可见 Clip 缓存派生局部几何、网格与裁剪范围，横向纯位置变化复用内容引用；缩放、裁剪、编辑、选择、悬停和折叠仍使内容失效。loop tick 使用局部序号 key，不随全局 x 变动。网格继续调用 B1 范围接口，没有第二个工程 owner、新缓存层或 React 深比较器。

### 配置来源（C3）

controller 的 `LaneCursor` 只表达 `default`、`grab`、`grabbing`、`disabled`、`horizontalResize`、`fadeCurve`、`automationDraw`、`verticalResize`，不输出 CSS 光标。唯一输入 host 经 `useLaneSurface` 读取 `theme.design.cursors`；默认 automationDraw 为 crosshair、fadeCurve 为 move，主题可分别覆盖。

`scene.geometry.arrangement` 拥有标尺、Clip inset/minimum/body threshold、fade hit size/margin 与自动化选中点半径；`TrackRow` 同时携带 `trackGeometry` 和 `arrangementGeometry` 原引用。局部行投影保留两者，卡片缓存遇到任一引用切换必须重新计算几何。fade 曲线手柄显示阈值与纯命中共用 `ClipVisualGeometry.fadeHitSize`。

`theme.design.editor` 拥有 Clip body/grid/automation preview/ghost/hover shade、选区与分组预览透明度、loop/播放头/插入/对齐线宽、inline radius、fade stroke 与 minor grid stroke；`theme.project.gridMinorOpacity` 拥有车道 minor 网格透明度。diamond 的半描边 inset 是 SVG 边缘补偿，不是独立视觉来源。100% 拉伸、坐标原点、完整 opacity 1、空几何 0、quad 的四元组 stride 与二等分中心计算是结构或数学常量。

`interactions/controller.test.tsx` 通过真实输入 host 覆盖默认/重映射光标和两种 inline editor 圆角。

窗口键盘 owner 在 timeline。lane 选择、Split、副本、重命名、删除、复制/剪切/粘贴与拖动 Escape 经稳定编辑面分派；Space 继续传播给窗口播放 owner。Clip 标题点击设插入点到左起点；内容点击设到点击位置；点击不打开 Clip View。`timeline-viewport` 失焦取消手势，虚拟 source row 卸载不结束稳定捕获。

时间选区拖动通过 `SceneStore.setTimeSelectionPreview` 呈现，未提交前不写 session；timeline 全量同步、Snap 切换不会覆盖它。释放后先提交选区再清除预览，取消只清除预览。边缘滚动纯计算复用 `core/viewport/edge-scroll`，网格 quad 打包与普通细线材质复用 `core/rulers/grid-quads`。

唯一稳定 `LaneContextMenu` 从 F2 归一化后的 `onContextMenu` payload 解析鼠标右键，不从 mouseDown button/ctrl 猜测。Shift+F10 直接读取当前有效 Clip 或 Automation point 身份，不将键盘选择变成伪指针重命中；没有有效目标时不打开菜单。原生键盘及真实菜单动作回归覆盖裁剪 Clip 删除、菜单打开后恢复可见区域再重命名，以及第二轨自动化点编辑和删除。

物理 Ctrl+左键的后台修饰输入被 computer 拒绝，该物理路径未验证，归一化事件行为以回归与 F2 平台证据为准。

## 峰值与坐标

工程时间从 bar 1 开始。`PeakReader(sourceId, startBar, endBar, pixels, contentOffsetBars)` 中 start/end 是 one-based Clip 局部可见范围，contentOffsetBars 是保留素材偏移；原生适配层将 `(bar - 1 + contentOffsetBars)` 换成源 frame。

返回值是 channel-major → pixel-major → `[min,max]` 的 Float32Array：先一个声道的全部像素，再下一个声道；声道数为 `length / (2 * pixels)`。渲染器直接索引，不转置或复制。空音频片段不生成假波形。

原生元素只为相交 Clip 挂载；B1 像素取整之后再裁剪一次，避免亚像素交集最终落到屏外仍挂载。标题实心，下半部透明；网格位于下半部填色之上。fadeMask 常驻：折叠时在标题、展开时在 body；显式曲线与锚点只在展开音频片段的下半内容悬停时出现。锚点大小与描边分别读取 `theme.project.arrangementFadeHandleSize`、`theme.design.editor.fadeStrokeWidth`（默认 5px、1px），内部使用 Clip 体填充色。

## 错题

- 错：将“每像素每声道 min/max”理解为交错声道。对：核对 C1 实际 channel-major 布局，按声道连续区间索引。因：交错会把左右声道的像素位置打散；原生立体声 PNG 回归覆盖此差异。
- 错：只按浮点 ClipRect 相交判断挂载。对：复用 B1 `clipVisualGeometry` 后再判断取整几何。因：小于半像素的交集可能取整为零可见宽度；固定种子性质测试捕获该边界。
- 错：让有填色或 absolute 的展示容器使用默认命中规则。对：纯展示层明确 `pointerEvents: "none"`，鼠标输入由唯一车道 host 捕获。因：固定主干的 `should_occlude` 默认阻断这些容器后面的鼠标事件；完整 LaneRow 回归与 native hitbox 探针先确认 host 未收到 down/move，修复后手势通过。
- 错：照搬 Web 输入框的 Enter keydown 提交。对：原生 Input 使用 `onSubmit`，Escape 留在 keydown，并在文本编辑期间阻止窗口快捷键传播。因：GPUI 输入动作会消费 Enter；真实名称输入提交与原生回归覆盖此路径。
- 错：用全局行 y 坐标与每次新建的 card/geometry 作为 memo 入参。对：行内几何按 clipId 缓存、只保留可见项，行容器负责垂直位移。因：不变的内容曾在每次垂直滚动时重渲染；native 标签渲染回归和 `card-identity` 变异锁定此行为。
- 错：看到 SVG 减少节点就认为性能改善。对：同时记录 React/原生耗时、节点数与完整内容。因：两次网格 SVG 实验降低节点数，却使总 render/flush p90 回退，实验代码已撤回，仅保留测量数据。
- 错：把浮点 quad 原样绘制当作 div 像素等价。对：由 F4b 在原生层复用 GPUI 设备像素吸附，不在 TS 复刻舍入。因：分数高度曾多画一个像素；原生 PNG oracle 捕获并验证修复。
- 错：把约 488 条整视口网格逐 Clip 传过两层 React props。对：先用保持 DEV tracing 的小规模 A/B 定位，再由投影 owner 缓存局部网格或合成行级批绘制。因：React DEV changed-props 会递归格式化变化数组，单车道产生约 58 万条属性记录；Native 上传亚毫秒不代表 JS 没有遍历成本。
- 错：只订阅普通帧，认为恢复时自然会赶上播放头。对：恢复边界经 `useResumeFrame` 同步读当前时钟并 `flushSync` 提交。因：首 present 在下一普通帧之前，旧位置会闪现；缺恢复、缺同步、停止后不退订三种变异均被原生回归捕获。
