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

`LaneRow` 接收同一份 `scene` / `viewport`、controller、PeakReader、NativeClipboard 与标签。`NativeClipboard` 的权威类型来自 `platform/clipboard`；键盘与菜单命令经 controller 绑定的端口执行。

`LaneControllerDeps.setScroll(x, y)` 由 timeline 提供：返回前共享 SceneStore 的 viewport 投影必须已更新，并返回接受后的 ArrangementViewport。`step(timestampMs)` 只调用该命令并重算当前手势，不创建计时器、不拥有另一份 viewport。`interrupt()` 回滚未完成的手势；`dispose()` 释放订阅并拒绝之后的编辑输入。

窗口键盘 owner 在 timeline。lane 只消费选择、Ctrl/Cmd+E 裁剪、创建副本、重命名、删除、复制/剪切/粘贴与拖动 Escape；Space 不激活 Clip，并继续传播给窗口播放 owner。Clip 标题设插入点到左起点；内容点击设到点击位置；普通激活不打开 Clip View。

## 峰值与坐标

工程时间从 bar 1 开始。`PeakReader(sourceId, startBar, endBar, pixels, contentOffsetBars)` 中 start/end 是 one-based Clip 局部可见范围，contentOffsetBars 是保留素材偏移；原生适配层将 `(bar - 1 + contentOffsetBars)` 换成源 frame。

返回值是 channel-major → pixel-major → `[min,max]` 的 Float32Array：先一个声道的全部像素，再下一个声道；声道数为 `length / (2 * pixels)`。渲染器直接索引，不转置或复制。空音频片段不生成假波形。

原生元素只为相交 Clip 挂载；B1 像素取整之后再裁剪一次，避免亚像素交集最终落到屏外仍挂载。标题实心，下半部透明；网格位于下半部填色之上。fadeMask 常驻：折叠时在标题、展开时在 body；显式曲线与锚点只在展开音频片段的下半内容悬停时出现。锚点按 Live 仲裁采用 5px 空心方点与菱形，1px 描边，内部使用 Clip 体填充色。

## 验证状态

已验证 B1 投影性质、原生 TestRoot 的裁剪与节点身份、Clip 预览/提交/撤销、跨轨 Automation 区间移动、播放期间在静止插入点裁剪、剪贴板端口当前文本优先（测试注入内存实现）、名称输入提交/取消、fade 极端释放持久与裁剪两锚点同移、停止与播放引导层、Clip 节点 Space 传播、channel-major 立体声几何。

真实窗口、200×50 满量滚动/缩放统计及全部输入状态截图尚未验收。真实峰值已统一为同一 runtime lease 的 `readProjectPeaks`；F1 帧回调与非指针聚焦全选正在同步接入，不添加 JS 计时器或假峰值后备路径。B 键手势后释放不锁定偏好的跨切片证明归 app-shell 集成测试，协调者确认待派发；lane 已在手势起点调用注入的 `markDrawModeGesture`，不添加 callback 计数假测。

命令在 `apps/gpuix` 执行：

| 命令 | 结果 |
| --- | --- |
| `bun test src/project/sections/arrangement/lane/interactions/controller.test.tsx -t 'fade mask between'` | 1 pass，0 fail，10 assertions；折叠→展开→再折叠 |
| `bun src/project/sections/arrangement/lane/verification/mutations.mjs` | baseline 18 pass，0 fail；4 个变异均命中预期行为；源目标 SHA-256 前后相同 |

变异通过 Bun runtime preload 在内存替换模块，不写源文件；脚本验证预期用例确实失败，不能以语法错误代替变异被捕获。

| 变异                                | 失败用例数 |
| ----------------------------------- | ---------: |
| 移除屏外 Clip 裁剪                  |          1 |
| 忽略 MIDI 保留源偏移                |          1 |
| 将 channel-major 峰值错读成交错声道 |          1 |
| 移除 collapsed 标题遮罩分支         |          1 |

## 已验证做法与错题

- 错：将“每像素每声道 min/max”理解为交错声道。对：核对 C1 实际 channel-major 布局，按声道连续区间索引。因：交错会把左右声道的像素位置打散；原生立体声 bounds 回归覆盖此差异。
- 错：只按浮点 ClipRect 相交判断挂载。对：复用 B1 `clipVisualGeometry` 后再判断取整几何。因：小于半像素的交集可能取整为零可见宽度；固定种子性质测试捕获该边界。
- 对：悬停仅在 Clip ID 或 title/body 区域变化时更新 scene；不为同一区域的每次 mouseMove 重建展示投影。
- 错：让有填色或 absolute 的展示容器使用默认命中规则。对：纯展示层明确 `pointerEvents: "none"`，鼠标输入由唯一车道 host 捕获。因：固定主干的 `should_occlude` 默认阻断这些容器后面的鼠标事件；完整 LaneRow 回归与 native hitbox 探针先确认 host 未收到 down/move，修复后手势通过。
- 错：照搬 Web 输入框的 Enter keydown 提交。对：原生 Input 使用 `onSubmit`，Escape 留在 keydown，并在文本编辑期间阻止窗口快捷键传播。因：GPUI 输入动作会消费 Enter，不保证额外发出元素 keydown；名称提交回归覆盖真实 keystroke 路径。
- 对：语言服务器抽取类型后先确认实际生成的扩展名与导入；只含类型也可能生成 `.tsx`，不能假设不存在 `.ts` 就没有新文件。
