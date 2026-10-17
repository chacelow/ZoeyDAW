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
