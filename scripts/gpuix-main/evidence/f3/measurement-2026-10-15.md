# F3 measurement checkpoint

Baseline: repository 4b447b6, vendor 6a5c7c142ac32f9eb0caefe0121be995cfc18631 with the existing six patches. No frame scheduling changes. The probe uses the real native engine with an empty Main project playing (silence), the production AnimationFrameProvider/useAnimationFrame, a frame-driven React counter, and a read-only 250ms sampler. CPU includes engine, renderer, Bun, hot reload, and sampling; percentages are one-core process CPU deltas, not GPU usage.

Raw records: `baseline-2026-10-15.jsonl`. Selected state-verified intervals: `baseline-summary-2026-10-15.json`. Every row excludes its first second; actual window flags, not phase labels alone, determine the interval. The small cover process leaves the probe partly visible; the large cover fully occludes it. Only self-started windows were activated/minimized/restored. All three service instances were closed immediately after sampling.

| Scene | Seconds | key/main | occlusion visible | minimized / visible / app active | renderer frames | samples | callbacks | telemetry sequence | callback Hz | CPU % |
| --- | --: | --- | --- | --- | --- | --- | --- | --- | --: | --: |
| Foreground | 10.017 | true/true | true | false/true/true | 74→675 | 74→675 | 66→667 | 376→648 | 59.998 | 13.621 |
| Inactive visible | 10.017 | false/false | true | false/true/false | 3110→3332 | 1000→1000 | 3102→3324 | 1862→2135 | 22.163 | 7.341 |
| Fully occluded | 10.016 | false/false | false | false/true/false | 4348→4348 | 1000→1000 | 4338→4338 | 2911→3180 | 0 | 3.022 |
| Minimized | 10.015 | false/false | false | true/false/false | 4348→4348 | 1000→1000 | 4338→4338 | 3440→3711 | 0 | 2.689 |
| Restored | 10.013 | true/true | true | false/true/true | 4411→5011 | 1000→1000 | 4400→5000 | 3931→4201 | 59.921 | 11.994 |
| Stopped | 10.019 | true/true | true | false/true/true | 5489→5489 | 1000→1000 | 5477→5477 | 4445→4719 | 0 | 3.241 |

## Findings and remaining uncertainty

Inactive-but-visible playback does not freeze in this probe. Full occlusion reproduces the reported symptom: renderer and callback counters stop while telemetry continues; AX retains the old frame-driven telemetry number. This is consistent with GPUI macOS `window_did_change_occlusion_state` stopping CVDisplayLink when the Visible bit clears. The inactive GPUI throttle has a 33333µs minimum interval; refresh quantization/dispatch timing can produce less than 30 callbacks/s (22.163 measured here).

The tracks observation alone cannot prove that its window was inactive-visible rather than occluded. Its original record lacks these flags. It must not be retroactively relabeled as measured occlusion.

The 250ms sampler and restored AX prove convergence to current telemetry, not that the first presented frame is fresh. Production frame source defers listener delivery via queueMicrotask because GPUI disallows reentrant mutation; GPUI can draw before that microtask runs. A first-callback freshness test alone would not prove first-present freshness. Additional instrumented visibility-transition/presentation evidence is required before claiming that acceptance criterion.

## Proposed coordinator decisions

Prefer retaining existing occlusion power saving and not changing display-link scheduling merely to make occluded screenshots animate. If full refresh-rate inactive playback is required, set `WindowOptions.inactive_frame_interval = None` in the vendor renderer window construction, retaining occlusion stop. Estimated CPU then approaches this counter's foreground cost: +6.28 percentage points of one core versus measured inactive baseline; actual DAW cost remains unmeasured.

Investigate first-presentation freshness separately before selecting a resume fix. Do not introduce JS replacement-frame timers or allow native synchronous callbacks to mutate GPUI reentrantly.

## Checks so far

- `cargo test -p zoeydaw-native window_diagnostics`: 2 passed.
- `pnpm native:build`: passed.
- `pnpm exec tsc --noEmit` in apps/gpuix: passed (temporary root-level probes are outside the configured source include).
- `bun test` in apps/gpuix: 808 pass, 1 fail, 810 tests/116 files. The tracks nested-context-menu failure is a coordinator-confirmed baseline exception.
- `windowDiagnostics("F3 nonexistent")` returned null in the real Bun main-thread runtime (raw log header). Worker-thread access is rejected by the Rust regression test.

## Coordinator arbitration and first-presentation measurement

The coordinator accepted the measured inactive frame rate and rejected removing the throttle. No replacement-frame scheduling or permanent zed modification is authorized. Only the first-presentation freshness issue requires a functional fix.

Temporary instrumentation in the isolated F3 vendor records each actual GPUI `present` submission after `platform_window.draw`, with monotonic nanoseconds, wall-clock milliseconds, the scene's retained text identity, and the latest engine sample already delivered to JavaScript. It does not measure GPU completion or samples still on the audio thread. The retained scene identity is captured in native `GpuixView::render`, so presenting a cached scene preserves its old identity. Latest delivered telemetry is published synchronously on the project store's accepted telemetry update, not sampled on a timer. Context is a measurement-only file because Bun's runtime `process.env` assignments were not visible through Rust's environment reads in the initial trial.

Five independently minimized/restored transitions yielded:

| Restore | First present monotonic ns | Scene sequence | Latest delivered sequence | Fresh |
| ------- | -------------------------: | -------------: | ------------------------: | ----- |
| 1       |                15684374000 |            272 |                       421 | No    |
| 2       |                22694197000 |            463 |                       612 | No    |
| 3       |                29703749792 |            654 |                       802 | No    |
| 4       |                36715373125 |            844 |                       986 | No    |
| 5       |                43716667625 |           1025 |                      1162 | No    |

Each minimized period lasted at least 5.5 seconds. Raw records are `present-before-2026-10-15.txt`; the exact temporary GPUI instrumentation is `present-instrumentation.diff`. The zed source was restored clean after this measurement. The original first-present data is copied verbatim: timestamp-prefixed records must not pass through tools that interpret numeric pipe prefixes as source anchors.

Recompute these results with:

```sh
node scripts/gpuix-main/background-frames/analyse.mjs frames scripts/gpuix-main/evidence/f3/baseline-2026-10-15.jsonl
node scripts/gpuix-main/background-frames/analyse.mjs present scripts/gpuix-main/evidence/f3/present-before-2026-10-15.txt
```

The approved fix is a dedicated synchronous native resume callback, separate from ordinary deferred frame delivery. Native allows only retained-tree batch submission during this callback and rejects GPUI borrowing; outer native code applies invalidation without reentering App. Platform stays renderer-agnostic. Dedicated resume consumers explicitly use `flushSync`; tracks wiring is limited to its existing shared meter driver. Other consumers belong to their respective integration owners, not platform.

## 最终实测：干净构建的五场景

以下运行未启用 present 插桩，使用独立 F3 vendor 的恢复状态机版本。前台/失活可见各取 12 秒以上 CPU 窗口；原始数据为 `after-2026-10-15.jsonl`，可复算汇总为 `after-summary-2026-10-15.json`。

| 场景 | 采样秒数 | 修复前 Hz | 修复后 Hz | 修复前 CPU | 修复后 CPU | 最终 frames | 最终 callbacks | 最终 telemetry sequence |
| --- | --: | --: | --: | --: | --: | --- | --- | --- |
| 前台 | 12.016 | 59.998 | 60.003 | 13.621% | 15.526% | 75→796 | 68→789 | 33→360 |
| 失活但可见 | 12.023 | 22.163 | 21.792 | 7.341% | 8.989% | 1804→2066 | 1795→2057 | 841→1167 |
| 完全遮挡 | 8.265 | 0 | 0 | 3.022% | 4.136% | 3459→3459 | 3448→3448 | 1826→2052 |
| 最小化 | 7.760 | 0 | 0 | 2.689% | 3.450% | 3459→3459 | 3448→3448 | 2056→2283 |
| 恢复 | 8.263 | 59.921 | 60.023 | 11.994% | 13.951% | 3461→3958 | 3450→3946 | 2288→2528 |
| 停止且无动画 | 8.264 | 0 | 0 | 3.241% | 3.927% | 3960→3960 | 3947→3947 | 2536→2758 |

最小化动画使主序列的稳定最小化状态不足 8 秒，已用同一干净版本补测：丢弃最初 1 秒的在途帧后，稳定 8.764 秒内 frames=64、callbacks=57 均不增长，sequence 68→308。见 `minimized-supplement-2026-10-15.jsonl` 与对应 summary；该例同时显示 appIsActive=true 但窗口无 key、不可见且已最小化，不能用应用激活代替窗口可见性。

CPU 为单核进程百分比；最终前台比基线高 1.905 个百分点，后台高 1.648 个百分点。不同桌面时段与系统负载未控制，只有单次短样本，不能把差值归因到某一分支或宣称性能优化。没有解除后台节流，没有把隐藏窗口的停帧改为忙绘制。Probe 使用真实静音 Main 引擎，不将其成本外推到完整 DAW。

```sh
node scripts/gpuix-main/background-frames/analyse.mjs frames scripts/gpuix-main/evidence/f3/after-2026-10-15.jsonl 0 12000
```

## 最终首 presentation：两条恢复路径各五次

| 次数 | 最小化主动恢复 scene/latest-delivered | 保持失活的纯遮挡恢复 scene/latest-delivered |
| ---- | ------------------------------------- | ------------------------------------------- |
| 1    | 193 / 193                             | 206 / 206                                   |
| 2    | 385 / 385                             | 426 / 426                                   |
| 3    | 578 / 578                             | 646 / 646                                   |
| 4    | 770 / 770                             | 870 / 870                                   |
| 5    | 962 / 962                             | 1090 / 1090                                 |

最小化记录：`present-after-2026-10-15.txt`。纯遮挡记录：`present-uncover-2026-10-15.txt`；每次先以大窗口遮挡，再让另一个小窗口应用保持前台，标记阶段后关闭大窗口，不激活 probe。`uncover-state-2026-10-15.jsonl` 中五次均核对 isKeyWindow=false、occlusionVisible=true、appIsActive=false。该路径不依赖 key 信号。

第一版同步通道仍在 5/5 真实首帧失败，未被隐藏：`present-first-attempt-2026-10-15.txt`。它将 active 与 occlusionVisible 耦合，错过 key 先到的同步 prepaint。最终用 `Occluded → BecomingVisible → Visible` 处理并合并两种通知；要求等待 Visible 位的变异会令两个 GPUI 回归失败。

```sh
node scripts/gpuix-main/background-frames/analyse.mjs present scripts/gpuix-main/evidence/f3/present-after-2026-10-15.txt
node scripts/gpuix-main/background-frames/analyse.mjs present scripts/gpuix-main/evidence/f3/present-uncover-2026-10-15.txt
```

证明边界是 GPUI 实际 presentation submission，不是 GPU 扫出完成；latest 是同步回调时 JS 已收到的最新引擎样本，不包含音频线程尚未交付的样本。用于取证的 zed 插桩已还原，生产补丁不修改 zed。

## invalidations 分支为什么必须保留

真正调用 `Window::draw` 会重新构造 root，所以最初强制 draw 的 fixture 无法杀死遗漏失效的变异。但 GPUI 的 `on_request_frame` 在 dirty/force_render 为 false 时不会调用 draw，可直接 presentation 已有 scene。恢复期 retained 写入必须在回调退出后向当前 window/cx 应用失效，否则只改树不保证被重绘。

新增 `resumed_commit_is_visible_through_dirty_gated_gpui_redraws` 不再强制 draw：使用不改变 modality 的 KeyUp 走 GPUI 自己的 dirty-gated draw 路径，检查连续两次机会的已提交内容。正常 1 pass；禁用 invalidations 分支后 1 fail，第二次仍为 `[["stale"], ["stale"]]`。因此保留该分支，不靠额外桌面时段或源码字符串测试证明。全部变异均已还原，详细结果见 `mutations-2026-10-15.json`。

## 停止播放但动画未耗尽

恢复需求为 `playing || active`，继续先 `driver.wake()` 再 `driver.advance()`，不改 driver 实现。真实 provider + native headless meter 回归覆盖停止后仍持有峰值、隐藏时间推进到 5000ms、恢复同步衰减到 floor，以及耗尽后两种帧订阅均为 0。将需求退回仅 playing 的变异会保留旧峰值并失败。没有为静止窗口增加帧。

## 可重跑工具与执行边界

独立 probe 与 cover 保存在 `apps/gpuix/verification/`，类型入口是该目录的 tsconfig；分析工具保存在 `scripts/gpuix-main/background-frames/analyse.mjs`。窗口工具必须提供 `F3_DESKTOP_DEADLINE`，值为协调者批准的绝对 UTC 截止时间（以 Z 结尾）。未提供、格式错误、已到期均在创建窗口前退出；每次输入再次检查，并以到期 timer 关闭自有进程。相对 TTL 不能替代授权截止时间。

正常 probe 默认在私有随机临时目录写采样文件，打印 F3_LOG/F3_CONTEXT 路径；也可显式提供这两个路径。历史 present 插桩读取了当时固定的 context 文件，复用其 diff 做新取证时须将读取路径改为本次 F3_CONTEXT，不要复用公开临时文件名。250ms timer 只采样；到期 timer 只关闭进程，两者都不请求或替代渲染帧。

截止时间解析 3 个边界用例通过；两个窗口入口以过期值运行均退出 1，输出没有创建窗口日志；无 GUI 的 keepalive 子进程也在绝对到期 timer 后自行退出 0。原始拒绝启动输出见 `deadline-fail-closed-2026-10-15.txt`。

## 错题

- **失活不等于遮挡**：原 tracks 缺少同步窗口状态，不能追认其现场；完全遮挡可复现冻结，但失活可见一直有帧。
- **250ms 截图收敛不是首帧证明**：最小化恢复的第一实际提交曾落后约 150 个 sequence，最终收敛截图会漏掉它。
- **key 与 occlusion 有先后**：第一版只等 Visible 位，真实验证失败；显式恢复状态机与 key-first 变异捕获了根因。
- **强制 draw 会掩盖脏门控**：旧 fixture 中遗漏失效的变异存活；新真实 GPUI dirty-gated 路径让第二次旧 scene 红灯。
- **相对 TTL 没有守住授权结束**：06:30 截止后仍完成了纯遮挡取证；收到停止要求后立即关闭并发桌面释放。这是执行边界错误，不以数据正确掩盖。绝对截止时间 fail-closed 已编码进工具；作为 LESSONS 候选交协调者整理。

## 已验证做法

- 同一单调时钟采集窗口 flags、renderer stats、普通 callback count、真实 telemetry sequence，区分无帧与旧数据。
- 独立 vendor、精确补丁前缀、产物 manifest 与单一 React/native 实例检查，避免共享构建污染。
- 普通帧保留 deferred，恢复另开同步 retained-only 通道；GPUI 借用由原生边界强制拒绝。
- 消费侧 flushSync 复用唯一 driver；以 idle→signal、stopped→decayed 等消费者可见状态做回归与变异。
- 历史失败数据、插桩 diff 和成功数据同时保留；文本证据按原始 bytes 复制，避免工具将数字 pipe 前缀当成行锚并剥掉时间戳。
- 所有自启窗口取证后关闭，后续只用 headless 验证，不启动或停止用户已有应用。

## F4 `setQuads` 接合核对

同步 F4 主干后，补丁顺序为 `context-menu → quad-batch → resume-frame`。恢复回调的安全写入包括 `applyBatch` 与 `setQuads`；不人为禁止 F4 的 retained geometry 上传。`setQuads` 只校验并替换 retained buffer，释放 tree 锁后调用 `request_invalidate`；恢复期仅记录待失效，回调退出后由当前 window/cx 应用，不借用 GPUI。

新增 `resume_quad_upload_is_retained_only_and_paints_new_geometry` 在同步恢复内调用真实 setter，经 GPUI dirty gate 验证首绘几何从 `(0,0,8,12)` 变为 `(4,6,32,20)`。正常 1 pass；删除该 setter 的失效调用后 1 fail，仍绘制旧 x=0 而不是新 x=4。变异已还原。第一次编译超时，保留源码后以较长编译期限重试通过，没有重启切片或 Dispatch。

上述 F3 桌面测量发生在 F4 接合之前；接合后的 geometry 契约使用 headless GPUI 回归验证，没有重新宣称做过 F4 后的桌面 CPU 或 GPU 扫出测量。footer 的受控测试帧源仅做必选 resume 接口迁移，普通 subscriberCount/emit 含义保持不变。
