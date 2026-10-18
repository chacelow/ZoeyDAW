# vs-live：与 Ableton Live 同口径性能对比（Windows）

两边注入同一个 Frida 探针（`probe.js`），在目标进程自己的 QPC 时钟上记录输入消息分发与 `IDXGISwapChain::Present`；输入用 `SendInput` 发真实 OS 事件，窗口须在前台。

```sh
python -m pip install frida==17.*
# ZoeyDAW 测量窗口（生产模式），输出 pid、分割线/编排区坐标与 statsPort
bun scripts/perf/vs-live/launch-zoey.ts --production
python scripts/perf/vs-live/client-origin.py <pid>          # 客户区屏幕原点与 DPI
python scripts/perf/vs-live/run.py --pid <pid> --name zoey --scenario hover \
  --x0 <屏幕x> --y0 <屏幕y> --span 160 --stats-port <statsPort>
python scripts/perf/vs-live/run.py --compare scripts/perf/vs-live/out/*.json
```

- 场景：`idle`、`drag`（按住 ±span 往返）、`zoom`（Ctrl+滚轮）、`scroll`（滚轮）、`hscroll`（横向滚轮）、`hover`（无按键移动）、`play`（点击聚焦后 Space 播放 seconds 秒再停）。
- `latency` 是输入消息分发到下一次 Present 的时间，不含扫描输出。`--stats-port` 额外读取 GPUI draw 时长（自动化命令 `getFrameStats`）。
- `thread-cpu.py <pid> <秒>` 按线程采样 CPU；`monitor-rate.py <pid...>` 查窗口所在显示器刷新率。
- 每次修改 `vendor/gpuix/packages/native/js` 后先 `bun run build:js`，应用加载的是 `dist/`。

## 2026-10-18 基线（同一台 144Hz 显示器；Live 为 6 轨用户工程，ZoeyDAW 为生产模式空工程，只有 Main）

| 场景 | 应用 | Present/s | 间隔 p50 ms | 延迟 p50 ms | 延迟 p99 ms | draw p90 ms | CPU % | 内存 MB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| idle | Live | 43.4 | 27.3 | — | — | — | 7 | 587 |
| idle | ZoeyDAW | 0.2 | — | — | — | — | 5 | 265 |
| drag | Live | 70.0 | 13.9 | 9.4 | 15.4 | — | 72 | 538 |
| drag | ZoeyDAW | 52.0 | 17.3 | 17.5 | 25.9 | 17.7 | 118 | 303 |
| zoom | Live | 48.5 | 15.5 | 8.3 | 15.3 | — | 11 | 538 |
| zoom | ZoeyDAW | 31.3 | 27.5 | 21.5 | 28.7 | 17.3 | 74 | 304 |
| hover | Live | 45.1 | 27.1 | 11.4 | 27.8 | — | 13 | 539 |
| hover | ZoeyDAW | 59.0 | 16.6 | 15.8 | 19.5 | 17.1 | 101 | 291 |
| scroll | Live | 43.1 | 27.3 | 10.8 | 27.9 | — | 8 | 539 |
| scroll | ZoeyDAW | 0.2 | — | — | — | — | 14 | 288 |
| hscroll | Live | 43.3 | 27.5 | 12.9 | 27.9 | — | 7 | 587 |
| hscroll | ZoeyDAW | 40.4 | 22.0 | 21.7 | 28.9 | 17.2 | 92 | 277 |
| play | Live | 52.4 | 14.6 | — | — | — | 9 | 592 |
| play | ZoeyDAW | 50.6 | 18.7 | — | — | 17.3 | 94 | 276 |

- ZoeyDAW 帧率上限来自 draw 时长：每帧 draw ≈ 16–17ms，显示器与 DWM 是 144Hz。一次临时插桩测得 hover 帧中位数 request_layout 5.7ms、prepaint 5.0ms、paint 3.8ms；1661 个节点每帧整树重建，没有子树缓存。
- scroll 场景在默认工程无可滚动内容（轨道总高小于视口），不是可比结果。两边工程内容不同，帧率与 CPU 只能看量级；draw 时长与输入延迟是 ZoeyDAW 自身的上限。
- Live 空闲时也以约 43Hz 持续 Present；ZoeyDAW 空闲不出帧。

## 2026-10-18 第一项优化：悬停不再整窗重绘

原因：编排区、轨道、标尺的 `onMouseMove` 每次都调 `getElementBounds` 换算局部坐标，Windows 端的 bounds 查询会先 `cx.notify()` + `window.refresh()` 再等下一帧，于是每次无按键移动都整窗重建 1661 个节点。修复后窗口干净时直接返回上一帧 paint 记录的 bounds，只有已有待绘制时才等下一帧，旧行为里"立即读到旧值"的情况不变。

| 测量                         | 修复前 | 修复后 |
| ---------------------------- | ------ | ------ |
| 编排区 40 次移动的 draw 次数 | 40     | 1      |
| 轨道区 40 次移动的 draw 次数 | 40     | 0      |
| hover 场景 Present/s         | 59.0   | 0.2    |
| hover 场景 CPU %             | 101    | 19     |

走带控件之间横移仍逐次重绘：每个控件进出都会切换 hover 样式与状态栏说明，这是有效重绘，降低它要靠子树缓存而不是删重绘。

## 2026-10-18 分割线拖动的上屏延迟

`photon.py --pid <pid> --x <屏幕x> --y <屏幕y> [--steps 40]` 按住分割线，每步移动 4px，用 DXGI Desktop Duplication 轮询屏幕，直到分割线出现在新列。计时从 `SendInput` 到第一次合成出新位置的画面，包含输入处理、布局、绘制、Present 与 DWM 合成。上表的 `latency` 只算到下一次 Present，不管这一帧里有没有这次移动，不能拿来和本节比。坐标取 ZoeyDAW 的 Browser|Arrangement 分割线；Live 的坐标从新截图重新定位，必须按在分割线上（空白处只会产生十几个样本）。

| 上屏延迟（同一 144Hz 显示器，各 3×40 步） | p50    | p90    | max    |
| ----------------------------------------- | ------ | ------ | ------ |
| ZoeyDAW 修复前                            | 32.1ms | 33.3ms | 39ms   |
| ZoeyDAW 移动直接提交（`15165d9`）         | 18.6ms | 25.6ms | 32ms   |
| ZoeyDAW 加 Windows frame waker            | 18.3ms | 19.0ms | 25.8ms |
| Live                                      | 11.3ms | 11.9ms | 17ms   |

1. 移动直接提交：`useResizeCommit` 以前把每次移动排到下一个动画帧，那个回调在本帧 draw 之后才运行，于是移动晚一帧提交、再晚一帧上屏。原生指针移动本来每帧最多一次，现在在事件处理里直接提交。
2. Windows frame waker：Windows 平台没有实现 `frame_waker`，窗口变脏后要等 VSyncProvider 线程下一次 `RedrawWindow` 才画，平均半个刷新周期。现在变脏立即 invalidate；绘制中的唤醒仍交给 vsync 线程，持续动画每个刷新最多画一次。临时分阶段计时里 batch→draw 开始从 5.6ms 降到 0.15ms；上屏 p90 从 25.6ms 降到 19.0ms，p50 只降 0.3ms，因为 draw 本身比一个 144Hz 周期长，合成器仍要等下一次 vblank。

剩余差距在 draw 本身（临时计时，p50）：JS 处理到 batch 2.7ms，元素树构建 1.6ms，request_layout 1.2ms，taffy 布局与 prepaint 4.1ms，paint 2.2ms，收尾 0.8ms。拖动时每帧重建、布局、绘制全部 1049 个节点（708 div、203 text、128 svg）。挂起式栈采样里 draw 约 30% 是堆分配与内存拷贝，但换 mimalloc 后上屏延迟和各阶段时间都没有变化，瓶颈不在分配器。下一步是上面的子树缓存方案：Browser（475 节点）和轨道区在拖动时宽度不变或只需重排，缓存后每帧只处理变化的边界。

## 子树缓存方案（下一项优化）

现状：`GpuixView` 是唯一的 GPUI view，`render()` 每帧从 retained tree 重建全部元素（renderer.rs `impl gpui::Render for GpuixView`），任何 `cx.notify` 或 hover 切换都让 1661 个节点重新 request_layout、prepaint、paint，单帧约 16–17ms。

GPUI 已有现成机制：`AnyView::cached(style)`（zed `crates/gpui/src/view.rs:39`）。缓存 view 在 bounds、content_mask、text_style 不变且实体不在 `dirty_views` 时，直接 `reuse_prepaint` / `reuse_paint` 上一帧的命中框和绘制图元，跳过子树的 render 与布局。hover 样式的 `cx.notify(current_view)` 只会弄脏所在的缓存 view。

做法：

1. 渲染器新增缓存边界：retained tree 中带 `cacheBoundary` 的元素由独立的 GPUI view 实体渲染，外层以 `.cached(style)` 嵌入，style 取该元素自己的尺寸与定位样式。
2. 脏标记按边界归并：`apply_batch_to_tree` 记录被改动的元素，向上找最近的边界，只 `cx.notify` 这些边界实体；没有边界的改动仍弄脏根 view。
3. 应用侧在大块、低频变化的区域加边界：Browser 列表、轨道头（每轨一个）、走带、Clip 编辑器、每条 lane 行。播放头、电平表这类每帧变化的元素保持在边界外或自成小边界。
4. 验收：vs-live 的 drag、zoom、hscroll、play 四个场景 draw p90 与输入延迟 p50 低于 Live 基线；默认工程 hover 跨走带控件时单帧 draw 只覆盖被悬停的边界。
