# F3：窗口在后台时播放中的界面继续更新

## 问题（tracks 实测，2026-10-15）

窗口不在前台时，引擎遥测还在更新：sequence 从 9538 到 9680、从 10529 到 10678，clock 和 levels 一直在变。但 renderer 的 frames 几乎不动：832→833、834→835，只有按按钮时才 +1。截图上的电平表停在旧值。DAW 在后台播放时，电平、播放头和时钟都必须继续走。

现有日志分不清原因是“失活但可见”还是“被遮挡”：没有记录 key/main 窗口状态、遮挡状态和帧回调次数。

F1 的帧回调补丁（`scripts/gpuix-main/patches/frame-callback.patch`）用的是 GPUI `on_next_frame`。macOS 下 GPUI 的帧由 CVDisplayLink/CADisplayLink 驱动，窗口失活或被遮挡时可能不再请求重绘。这一点是推断，要用测量证实。

## 第一步：测量（停点）

写一个独立的 probe：窗口内有一个按帧更新的计数，并且在播放中订阅 `useAnimationFrame`。用同一个时钟每 250ms 记录一行： `时间 | NSWindow isKeyWindow/isMainWindow | occlusionState 是否可见 | renderer frames/samples | 帧回调累计次数 | 遥测 sequence`

场景依次是：前台 → 切到另一个应用但窗口仍可见 → 被另一个窗口完全遮挡 → 最小化 → 恢复。每个场景至少 5 秒。读窗口状态用 `crates/native` 现有的 objc2-app-kit（G1 已加入 NSWindow feature），不新增依赖。

结果表与原始数据交给协调者，并用 `orca orchestration ask` 给出：根因、修复方案（是否改 vendor 补丁）、对 CPU 的影响估计。等 reply 再实现。

## 产品约束（方案必须满足）

- 播放中、窗口可见但失活时：帧回调与重绘照常，电平、播放头和时钟持续更新。
- 被完全遮挡或最小化时：可以停帧以省电，恢复可见后的第一帧必须马上是最新状态，不能先显示旧画面。
- 停止播放且无动画时：不额外请求帧（保持 F1 的“inactive 不请求下一帧”语义）。
- 不用 JS 定时器补帧。

## 实现与验收

- 修复位置由测量决定：优先在 vendor 补丁里让失活但可见的窗口继续驱动 `on_next_frame`。用独立 vendor 根构建（`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f3-gpuix`），共享 vendor 由协调者在合入时重建。
- 测试：GPUI 层 `gpui::test` 覆盖失活但可见时帧回调继续；TS 层覆盖恢复可见后的首帧读到最新遥测。每项做变异。
- 真实窗口：用上面的 probe 重测同一张表，修复前后对比；测前台与后台各 10 秒的 CPU，报告差异。
- 桌面时段先 ask，由协调者 reply 起止时间；不碰 Live。
- 按 `common.md` 自审，发 merge_ready。
