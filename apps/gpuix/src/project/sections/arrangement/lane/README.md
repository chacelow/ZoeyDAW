# Arrangement Lane

消费 gpuix Arrangement 组合契约。工程写入只走 `project/adapters`，纯几何消费 B1 `arrangement/core` 与 `project/model`；这里不拥有工程、视口或轨道外边框。

## 公共接口

`index.ts` 是唯一组合入口。

| 导出 | 职责 |
| --- | --- |
| `LaneRow`、`LaneRowProps` | 一条轨道的 Clip/Pattern/Automation、行内网格与输入副作用；`row` 使用 B1 `TrackRow`。行放置、可见行卸载、边框及分组围栏由 `tracks` 持有 |
| `LaneOverlay`、`LaneOverlayProps` | 全画布播放头、Ghost 左起点对齐线、停止时行内插入点及标尺三角；由 timeline 的 overlay slot 单次挂载 |
| `createLaneController`、`LaneControllerDeps`、`LaneController` | 跨行手势、阈值、预览事务、Clip/Automation 键盘与系统剪贴板路由；由组合根创建并 dispose |
| `LaneInteractionState` | `getSnapshot` / `subscribe` 的稳定交互快照；`dragActive` 标记需要帧驱动的拖动 |
| `LaneKey`、`LanePointer` | 归一化输入；指针使用共享画布坐标，不是行内坐标 |
| `PeakReader` | 黑盒只读音乐范围峰值查询，不传 PCM，不在 lane 假设采样率 |
| `LaneLabels`、`LaneMessageKey` | 组合根注入的严格双语标签；demo 标签不作为应用默认翻译 |

`LaneRow` 接收同一份 `scene` / `viewport`、controller、PeakReader 与标签。剪贴板仅通过 `LaneControllerDeps.clipboard` 注入，权威类型来自 `platform/clipboard`；行不接受第二个 clipboard 端口。`LaneOverlay.transportBar` 是读取函数，由内部 F1 `useAnimationFrame` 在播放期间采样，不要求父组件逐帧重渲染。

`LaneControllerDeps.setScroll(x, y)` 由 timeline 提供：返回前共享 SceneStore 的 viewport 投影必须已更新，并返回接受后的 ArrangementViewport。`step(timestampMs)` 只调用该命令并重算当前手势，不创建计时器、不拥有另一份 viewport。`interrupt()` 回滚未完成的手势；`dispose()` 释放订阅并拒绝之后的编辑输入。

工程到共享 SceneStore 的投影只有 timeline controller 一个产品 owner。lane 的 preview、选择与播放命令只改工程 store；lane 仅写自身的拖动、缩放、悬停、targetSelection 与手势进行中的 timeSelection。独立 demo 无 timeline 时，由 demo/runtime 的一个订阅投影并在 dispose 时退订。

卡片展示几何使用行内坐标，轨道行自身承担垂直滚动位移。每个 LaneContents 只缓存当前可见 Clip，source 与 Ghost 分开按 clipId 索引；Clip 引用、矩形输入、折叠/fade 可见输入与选择/hover 标记未变化时复用原 card/geometry。网格只在横向位置、比例、宽度、网格单元或工程范围改变时重算。默认 React memo 不设深比较器；Automation 的跨行画布坐标保持不变。

窗口键盘 owner 在 timeline。lane 只消费选择、Ctrl/Cmd+E 裁剪、创建副本、重命名、删除、复制/剪切/粘贴与拖动 Escape；Space 不激活 Clip，并继续传播给窗口播放 owner。Clip 标题设插入点到左起点；内容点击设到点击位置；普通激活不打开 Clip View。

右键目标只由 F2 归一化后的 `onContextMenu` payload 设置，不再从 `onMouseDown` 的 button/ctrl 猜测右键。Shift+F10 保留独立的原生焦点 bounds 定位。回归只发送 context 事件，再通过真实菜单动作验证删除的是目标 Clip，而不是之前的选择；Ctrl+左键按平台归一化后的右键 payload 注入。

`evidence/context-*` 保存实际窗口证据：先选中 Pattern，再右键 Audio，菜单标题与 Rename 字段均为该 Audio Clip。物理 Ctrl+左键的后台修饰输入被 computer 拒绝，foreground 控制申请超时且没有确认批准，未发送前台点击；该物理路径未验证，归一化事件行为以回归与 F2 平台证据为准。

## 迁入清单

源路径相对于 `apps/web/src/pages/project/sections/ArrangementPanel/`，目标相对于本目录。

| Web 源 | 原生目标与职责 |
| --- | --- |
| `canvas/painters/clip.ts` | `ClipCard.tsx`、`LaneRow/Contents.tsx`：标题、选中、hover、网格与可见卡片 |
| `canvas/painters/clip-fades.ts` | `ClipFades/index.tsx`：遮罩、外侧压暗与三类锚点；几何消费 B1 |
| `canvas/painters/clip-previews.ts` | `render-projection.ts`、`WaveformPreview.tsx`：MIDI/Pattern 可见预览与真实峰值；波形复用共享 `PeakColumns` |
| `canvas/painters/group.ts` | `LaneRow/Contents.tsx`：按叶子轨道顺序投影分段色带，仅占第一行；Clip 几何复用 B1 |
| `canvas/painters/automation.ts` | `AutomationLayer.tsx`：曲线、选区、断点与命中反馈 |
| `canvas/painters/playhead.ts` | `LaneOverlay/index.tsx`：播放长线、停止插入点、标尺三角与 Ghost 左起点线 |
| `canvas/interactions/controller.ts` | `interactions/controller.ts`：跨行输入、阈值、捕获中断、自动滚动和剪贴板路由 |
| `canvas/interactions/clip/{index,move,resize,NameEditor}` | `interactions/clip/`：选择、移动、裁剪、fade、时间选区和原生名称输入 |
| `canvas/interactions/automation/{commands,ValueEditor,preview}` | `interactions/automation/`：编辑命令、预览事务与原生数值输入 |
| `canvas/interactions/project-preview` | `interactions/project-preview.ts`：仅管理 store preview token；工程投影移交 timeline |
| `canvas/ContextMenu/**` | `ContextMenu/`：复用共享菜单、颜色菜单与控制器端口 |
| `Timeline/{TimelineCanvas,useCanvasPainters,TrackHeaderViewport}` | 按协调者修订拆为 `LaneRow` / `LaneOverlay` 插槽；画布、窗口键盘、轨道放置分别由 timeline / tracks 持有，不复制这些 owner |
| 早期 `features/{clip-render,waveform-automation}` | 已删除两套副本；拖动、裁剪、波形与卸载行为由本目录原生回归覆盖 |

与 Web 的明确差异：不保留 Canvas 2D 兼容层；使用可见范围的原生元素与共享向量 Shape。fade 锚点按已批准的 Live 观察改为 5px 空心方点/菱形，不回退 Web 旧实心圆形。真实峰值来自当前工程会话，不保留早期合成峰值后备路径。

## 峰值与坐标

工程时间从 bar 1 开始。`PeakReader(sourceId, startBar, endBar, pixels, contentOffsetBars)` 中 start/end 是 one-based Clip 局部可见范围，contentOffsetBars 是保留素材偏移；原生适配层将 `(bar - 1 + contentOffsetBars)` 换成源 frame。

返回值是 channel-major → pixel-major → `[min,max]` 的 Float32Array：先一个声道的全部像素，再下一个声道；声道数为 `length / (2 * pixels)`。渲染器直接索引，不转置或复制。空音频片段不生成假波形。

原生元素只为相交 Clip 挂载；B1 像素取整之后再裁剪一次，避免亚像素交集最终落到屏外仍挂载。标题实心，下半部透明；网格位于下半部填色之上。fadeMask 常驻：折叠时在标题、展开时在 body；显式曲线与锚点只在展开音频片段的下半内容悬停时出现。锚点按 Live 仲裁采用 5px 空心方点与菱形，1px 描边，内部使用 Clip 体填充色。

## 验证状态

已验证 B1 投影性质、原生 TestRoot 的裁剪与节点身份、Clip 预览/提交/撤销、跨轨 Automation 区间移动、播放期间在静止插入点裁剪、剪贴板端口当前文本优先（测试注入内存实现）、名称输入提交/取消、fade 极端释放持久与裁剪两锚点同移、停止与播放引导层、Clip 节点 Space 传播、channel-major 立体声几何。

引用稳定增量已在真实 normal 窗口验证：Pattern 点击不请求编辑器、Space 播放/停止与长播放线、原生横向滚轮、body 悬停 fade 锚点、Automation 行对齐、折叠标题遮罩、右键菜单和原生 Rename 输入后 Enter 提交。`evidence/identity-*` 保存 AX/截图；native frames 14→3042，状态变化确有新帧。所有自启窗口取证后均已关闭。OS 拖动仍受此前 computer 前台焦点限制，未通过；不以 TestRoot 通过替代该验收。满量 200×50 的原始窗口 p90 139.14ms、最大 152.89ms 未达性能门槛，QuadBatch 尚待 F4。

外部 owner 的未实现项：Automation 映射拖动时的全局目标高亮，归 `ui/controls/ControlEnvironment` 与 app-shell 注入，协调者已登记，lane 不实现第二套遮罩；B 键手势后释放不锁定偏好的跨切片证明归 app-shell 集成测试。lane 已在手势起点调用注入的 `markDrawModeGesture`，不添加 callback 计数假测。

命令在 `apps/gpuix` 执行：

| 命令 | 结果 |
| --- | --- |
| `bun test src/project/sections/arrangement/lane/interactions/controller.test.tsx -t 'fade mask between'` | 1 pass，0 fail，10 assertions；折叠→展开→再折叠 |
| `bun test src/project/sections/arrangement/lane` | 25 pass，0 fail，102347 assertions |
| `bun src/project/sections/arrangement/lane/verification/mutations.mjs` | baseline 25 pass，0 fail；6 个变异命中预期失败；源目标 SHA-256 前后相同 |
| `bun test` | 995 pass，1 todo，0 fail，1048318 assertions；996 tests / 156 files |

变异通过 Bun runtime preload 在内存替换模块，不写源文件；脚本验证预期用例确实失败，不能以语法错误代替变异被捕获。

| 变异                                     | 失败用例数 |
| ---------------------------------------- | ---------: |
| 移除屏外 Clip 裁剪                       |          1 |
| 忽略 MIDI 保留源偏移                     |          1 |
| 将 channel-major 峰值错读成交错声道      |          1 |
| 移除 collapsed 标题遮罩分支              |          1 |
| 不再复用未变 ClipCard 引用               |          1 |
| 将原生 context 目标退回 mouseDown 旧路径 |          2 |

## 2026-10-15 引用稳定增量

新增原生回归 `scrolls an already-visible unchanged Clip without rerendering its content`：修复前，垂直滚动后 Clip 内容执行 2 次，预期 0；修复后，原节点随行移动且内容不重渲染。`card-identity` 变异把复用改为新对象，回归变红。

探针使用真实 `createTimelineController`、同一工程 runtime 与 `readProjectPeaks`，不以离屏成本代替真实窗口帧验收。命令：

```sh
bun --preload ./src/project/sections/arrangement/lane/verification/react-profile-preload.ts src/project/sections/arrangement/lane/verification/render-cost.tsx
```

近邻 A/B 在同一十步滚动/缩放输入下运行，关闭复用使用内存变异，不改磁盘源文件。完整数据：`evidence/render-profile-identity-disabled.json`、`evidence/render-profile-identity-stable.json`。

| 观测                                      | 关闭复用 | 启用复用 |
| ----------------------------------------- | -------: | -------: |
| 垂直滚动一：可见 279 个 Clip，执行 render |      279 |      155 |
| 垂直滚动二：可见 216 个 Clip，执行 render |      216 |      144 |
| 垂直滚动三：可见 180 个 Clip，执行 render |      180 |      126 |
| 垂直滚动四：可见 279 个 Clip，执行 render |      279 |      124 |
| React 行子树 p90（ms）                    |    36.32 |    37.12 |
| CPU render/flush p90（ms）                |   265.05 |   260.56 |

未变化且仍挂载的卡片执行 render 为 0；剩余为新进入视口或横向位置/比例确实改变的卡片。耗时没有可确认收益，不宣称提速；14,716 个原生节点的满量瓶颈仍待 F4 QuadBatch，不能据此通过性能门槛。

## 已验证做法与错题

- 错：将“每像素每声道 min/max”理解为交错声道。对：核对 C1 实际 channel-major 布局，按声道连续区间索引。因：交错会把左右声道的像素位置打散；原生立体声 bounds 回归覆盖此差异。
- 错：只按浮点 ClipRect 相交判断挂载。对：复用 B1 `clipVisualGeometry` 后再判断取整几何。因：小于半像素的交集可能取整为零可见宽度；固定种子性质测试捕获该边界。
- 对：悬停仅在 Clip ID 或 title/body 区域变化时更新 scene；不为同一区域的每次 mouseMove 重建展示投影。
- 错：让有填色或 absolute 的展示容器使用默认命中规则。对：纯展示层明确 `pointerEvents: "none"`，鼠标输入由唯一车道 host 捕获。因：固定主干的 `should_occlude` 默认阻断这些容器后面的鼠标事件；完整 LaneRow 回归与 native hitbox 探针先确认 host 未收到 down/move，修复后手势通过。
- 错：照搬 Web 输入框的 Enter keydown 提交。对：原生 Input 使用 `onSubmit`，Escape 留在 keydown，并在文本编辑期间阻止窗口快捷键传播。因：GPUI 输入动作会消费 Enter，不保证额外发出元素 keydown；名称提交回归覆盖真实 keystroke 路径。
- 对：语言服务器抽取类型后先确认实际生成的扩展名与导入；只含类型也可能生成 `.tsx`，不能假设不存在 `.ts` 就没有新文件。
- 错：用全局行 y 坐标与每次新建的 card/geometry 作为 memo 入参。对：行内几何按 clipId 缓存、只保留可见项，行容器负责垂直位移。因：不变的内容曾在每次垂直滚动时重渲染；native 标签渲染回归和 `card-identity` 变异锁定此行为。
- 错：看到 SVG 减少节点就认为性能改善。对：同时记录 React/原生耗时、节点数与完整内容。因：两次网格 SVG 实验降低节点数，却使总 render/flush p90 回退，实验代码已撤回，仅保留测量数据。
