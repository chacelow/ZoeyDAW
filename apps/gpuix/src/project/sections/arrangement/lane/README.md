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

原生元素只为相交 Clip 挂载；B1 像素取整之后再裁剪一次，避免亚像素交集最终落到屏外仍挂载。标题实心，下半部透明；网格位于下半部填色之上，淡化曲线只在展开音频片段的下方内容悬停时出现。

## 验证状态

当前已验证：B1 投影性质测试、原生 TestRoot 的裁剪与节点身份、Clip 预览/提交/撤销、停止与播放引导层、聚焦 Clip 的 Space 传播、channel-major 立体声几何。

真实窗口、200×50 满量滚动/缩放统计及全部输入状态截图尚未验收。原生帧回调与聚焦自动全选等待协调者的 F1；真实 musical PeakReader 等待源采样率适配能力，不添加 JS 计时器或假峰值后备路径。

## 已验证做法与错题

- 错：将“每像素每声道 min/max”理解为交错声道。对：核对 C1 实际 channel-major 布局，按声道连续区间索引。因：交错会把左右声道的像素位置打散；原生立体声 bounds 回归覆盖此差异。
- 错：只按浮点 ClipRect 相交判断挂载。对：复用 B1 `clipVisualGeometry` 后再判断取整几何。因：小于半像素的交集可能取整为零可见宽度；固定种子性质测试捕获该边界。
- 对：悬停仅在 Clip ID 或 title/body 区域变化时更新 scene；不为同一区域的每次 mouseMove 重建展示投影。
