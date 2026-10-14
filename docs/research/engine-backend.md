# C1 Rust ProjectBackend 验收

2026-10-15。分支 `gpuix-c1-engine-backend`。Rust PCM 引擎已接通 `ProjectBackend`、真实 napi 和默认 CPAL 输出。TS 只发送工程命令、订阅遥测和读取可见范围峰值，不接收 PCM，不计算波形或电平。

## 实现边界

- `crates/engine/src/mix` 编译无环路由，处理音频 clip、clip gain、fade、mute、solo、group、等功率 pan、pre/post return sends 和 Main。每次回调使用 `Transport::advance().segments`，首样本、暂停和 seek 不走 Firewheel 内建 sampler 的淡入或预消费路径。
- `assets.rs` 用 Symphonia 0.6.1 解码 mono/stereo f32 PCM，Rubato 5.0.1 转到实际设备采样率。素材在控制线程缓存，URI 支持本地路径和 `file:///` 百分号转义。
- `sourceOffsetBars` 保留符号，量化为样本后对素材长度取模。负偏移、恰为正负周期倍数、clip 超出素材长度均循环读取；空 PCM 静音，不除零。
- `PeakPyramid` 基础 bin 为 64 帧。完整区间复用金字塔，首尾不足一 bin 的部分直接读 Rust 缓存 PCM，因此任意像素范围仍返回精确 min/max。没有为波形重复存储逐样本 min/max。
- `realtime.rs` 的自定义 Firewheel 节点通过 triple buffer 接收完整计划。回调只读 PCM、写预分配 scratch 和原子快照，不分配、不取 Mutex。旧计划由控制线程替换和回收。`#![forbid(unsafe_code)]` 保持。
- Rust 控制线程以 33333µs 周期投递遥测。napi `ThreadsafeFunction` 队列最多保留一个待交付样本，调用和 JS callback 失败不 panic。dispose 移除句柄、关闭输出并 join 控制线程；TS 丢弃 dispose 后已排队的帧。
- `SessionFence` 在修改资源前校验 session、sequence、revision 和旧 seek generation。新 seek 驱动 Rust transport，遥测仍只用已有 `appliedSequence` 围栏，不引入第二个 TS seek-generation 字段。
- `context.ts` 只注册 native factory。第一个 runtime lease 才打开设备，最后一个释放时 dispose。真实导入边界测试确认仅 import 不调用 `openSession`。纯逻辑测试显式注入 mock；旧 `mockMeters.ts` 和对应模拟发声测试已删除。

回调无锁、无分配的结论来自本切片 render 路径的代码约束与审查，未安装动态 allocation counter，也不对 CPAL 驱动内部作此保证。

## 已批准的导出

| 导出 | 类型和行为 |
| --- | --- |
| `openSession` | `(): number`，返回 Rust 会话句柄。 |
| `apply` | `(session: number, requestJson: string): string`，返回 `BackendResult` JSON。设备、解码或路由失败返回 `rejected`。 |
| `subscribeTelemetry` | `(session: number, callback: (json: string) => void): void`，约 30Hz，由 Rust 节流。 |
| `dispose` | `(session: number): void`，幂等释放。 |
| `readPeaks` | `(session: number, sourceId: string, startFrame: number, endFrame: number, pixels: number): Float32Array`。 |

峰值是 channel-major、pixel-major `[min, max]`，即 `[Lmin0, Lmax0, …, Rmin0, Rmax0, …]`。mono 复制为 stereo，长度为 `pixels * 4`。帧坐标属于设备采样率下的缓存素材；半开范围按素材边界裁剪，空像素返回零。像素数为 1–16384。

`BackendTelemetry` 只新增必填 `outputLatencyFrames: number | null`。TS 校验拒绝缺失字段和非有限电平，接受有限静音地板 -120 dBFS。`levels` 是每轨瞬时左右峰值；RMS 在 Rust 内部计算，不新增没有消费者的 `rmsLevels`。峰值保持和回落仍归 UI。

## 设备与低增益播放

宿主为 macOS arm64。CPAL 默认输出实测为 **E2x2**，默认配置 48kHz、6 声道、F32，支持 buffer range 15–4096。本引擎图为 stereo，配置 256 帧块。未更改系统设备或系统音量。

集成测试临时生成 44.1kHz、mono、幅度 0.2 的 1kHz 正弦 WAV，实际走 Symphonia、Rubato、napi 和 CPAL。Main 为 -30dB，线性增益约 0.031623，低于 0.05。播放达到约 2 秒后停止并精确 seek；临时 WAV 在 finally 删除。

| 观测                    | 实测值                  |
| ----------------------- | ----------------------- |
| 实际 sample rate        | 48000Hz                 |
| 最新集成播放位置        | 97024 帧，约 2.021 秒   |
| Main 左右峰值           | -50.01525067926419 dBFS |
| 停止后的左右电平        | -120 / -120 dBFS        |
| 停止并 seek 到 bar 1.25 | 精确 24000 帧           |
| `outputLatencyFrames`   | 284 帧，约 5.917ms      |
| 该次集成收到遥测        | 61 帧                   |

延迟来自 Firewheel CPAL `process_to_playback_delay`，不是根据 block size 猜测。其他平台或缺少 playback timestamp 的回调返回 `null`。本次没有环回录音，不能证明扬声器/DAC 的逐样本时序。没有通过更改系统设备制造掉线或采样率切换；对应故障检测和后续 apply 拒绝路径已实现，但没有做宿主设备切换实测。

真实窗口用带 name 的 service 运行 `bun --hot src/project/adapters/backend/native.smoke.tsx`。AX 和截图共同确认窗口 `C1 native engine verification`，内容为 `Verified 2s PCM playback`、`Peak -43.98 dBFS`、`stopped -120 / -120 dBFS`、`Latency 284 frames | session disposed`。这次窗口使用既有 stereo probe WAV，因此峰值与上述 mono 正弦不同。截图临时文件为 `omp-computer-15a61ff09ba54aeb.png`。取证后立即 kill `c1-native-engine-smoke`，service 共存活约 17.8 秒；临时 smoke 入口已删除。

## 性质测试与变异检查

所有随机检查使用固定种子 LCG。

| 性质 | 覆盖 |
| --- | --- |
| 混音与逐样本参考一致 | 2000 组工程，随机 mute/solo/gain/pan/fade/return，逐帧 `assert_eq!` 比较 f32 输出。 |
| 带符号素材窗口 | 2000 组长度与偏移，含空 PCM、正负周期倍数和超过素材的 clip 长度，每组渲染 640 帧。 |
| seek/loop/pause | 10000 次随机操作，对照逐样本位置推演和每帧参考音频。 |
| seek generation 围栏 | 999 组新 seek 接受、旧 seek 拒绝且状态不变；真实 napi 测试还确认拒绝后 `appliedSequence` 不变。 |
| 回调控制更新 | 3000 次更新，只有新 seek generation 才重定位，暂停和同 generation 编辑不重置位置。 |
| 峰值范围 | 5000 组随机范围和像素宽度，对照暴力 min/max，含 partial bins、尾 bin 和空像素。 |

变异命令均为 `cargo test -p zoeydaw-engine mix::tests`，每次先恢复前一个变异。三个变异均以 exit 101 失败，恢复后 `cargo test --workspace` 为 34 passed。

| 变异 | 失败测试数 | 捕获测试 |
| --- | --: | --- |
| 等功率 pan 左增益乘 0.5 | 3 | 混音参考、走带首样本、带符号素材窗口 |
| 翻转 fade in/out 方向 | 1 | `randomized_render_matches_sample_reference`，一个性质测试包含 2000 组工程，失败数不是只测一个输入。 |
| seek-generation 比较 `<` 改为 `>` | 1 | `generation_fence_rejects_old_seek_without_changing_state`，包含 999 组代际转换。 |

## 离线渲染预算

可重跑命令为 `cargo run --release -p zoeydaw-engine --bin render-benchmark`。每次使用 64 个 audio track、10 秒、48kHz、256 帧块和共享缓存 PCM。计时只覆盖 `Mixer::render`；不包含素材生成、解码、重采样、Firewheel 图调度、CPAL 或 napi。墙钟比不是整个进程的 CPU 采样。

| 运行               |      墙钟 | 占 10 秒音频预算 |  最慢块 | 占 5.333ms 块预算 |
| ------------------ | --------: | ---------------: | ------: | ----------------: |
| 首次，其他检查并行 | 0.383689s |          3.8369% | 5.184ms |          97.2070% |
| 后次，检查结束后   | 0.236878s |          2.3688% | 0.829ms |          15.5430% |

未停止用户已有应用。两次墙钟包含调度噪声，不能据此承诺 xrun 上限。benchmark 也用具名 service，有限运行结束后立即释放 service handle，没有常驻输出进程。

## 实跑命令

工具版本为 rustc 1.97.1、Bun 1.3.14、pnpm 10.11.0。

| 命令 | 结果 |
| --- | --- |
| `cargo check --workspace` | 通过 |
| `cargo test --workspace` | 34 passed，0 failed |
| `cargo clippy --workspace --all-targets -- -D warnings` | 通过 |
| `pnpm native:build` | release napi 二进制构建通过 |
| `pnpm exec tsc --noEmit`，cwd `apps/gpuix` | 通过 |
| `bun test`，cwd `apps/gpuix` | 292 passed、1 existing todo、0 failed，42 files，5654 assertions |
| `pnpm exec eslint apps/gpuix/src/project/adapters` | 通过，0 diagnostics |
| `pnpm exec ultracite fix <本切片 TS 与 README 路径>` | 通过；提交仍运行 pre-commit 门禁，不用 `--no-verify` |

既有 todo 是 `project/model/grid.test.ts` 的 Ctrl/Cmd+1/2 Arrangement keyboard hook，未修改或隐藏。Cargo 仍提示 native 子 crate 的 profile 配置由 workspace 根决定，这是既有配置提示，不是 Rust 编译或 clippy 失败。

## 未实现与限制

- 未实现：MIDI 合成、插件宿主、原生录音。MIDI/Pattern clip 只保留状态与走带遥测，不发声。
- Automation lane 只保留协议状态，不处理 automation DSP。没有效果器链、硬件输入监听或多路硬件输出配置。
- 只解码 mono/stereo。其他声道布局明确拒绝，不冒充已完成 downmix。
- PCM 全量缓存，不做磁盘流。初次 `apply` 同步等待 Rust 解码和重采样，大素材占用内存并可能阻塞调用方。
- 原型 Main 输出与文件型素材已接真实引擎，不把上述未实现项称为可用音频能力。

未启动、重启或停止用户已有应用。旧 Tauri 壳若消费这些 Rust 变更，需要重启 tauri:dev，由用户操作。

## 进程清理

取证后关闭本切片所有窗口、音频会话与 benchmark service。交付前实跑的检查为：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo" | grep -v "grep -E" | grep -v "Orca.*orchestration ask"
```

输出为空，零实际窗口或音频进程匹配。过滤只移除检查命令自身，以及另一 worker 的 Orca CLI 问题正文含 `gallery` 造成的文本误命中，不排除真正的 `bun --hot` 或 `cargo run`。所有 `bun test`、Cargo 检查和有限 benchmark 均已结束，未停止其他 worktree 或用户的进程。

## C2 peak-metadata: sourceInfo 与 musicalPeakReader 契约

2026-10-15。分支 `gpuix-c2-peak-metadata`。暴露源解码采样率与总帧数，并在 `platform/engine.ts` 提供满足 Arrangement 组合契约的 `musicalPeakReader`。

### 1. sourceInfo 契约

```typescript
export declare function sourceInfo(session: number, sourceId: string): SourceInfo | null

export interface SourceInfo {
  sampleRate: number
  frames: number
  channels: number
}
```

- 返回素材解码后的实际采样率（如 44100Hz）、总帧数与声道数。
- 与设备采样率（如 48000Hz）严格区分：保持源文件解码后的原始参数，不返回重采样后的设备采样率。
- 会话无效或素材未加载时返回 `null`，不抛出异常。
- `crates/native` 公共导出仅新增此一个导出；`readPeaks` 签名与 channel-major 布局严格保持。

### 2. musicalPeakReader 契约

```typescript
export type PeakReader = (
  sourceId: string,
  startBar: number,
  endBar: number,
  pixels: number,
  contentOffsetBars?: number
) => Float32Array

export function musicalPeakReader(session: number, project: MusicalProjectContext): PeakReader
```

- **小节换算**：复用 `crates/engine` 的 `TransportClock` 语义，以 `barsPerSecond = (bpm * denominator) / (240 * numerator)` 进行小节到秒的换算，并结合 `sourceInfo.sampleRate` 转换为源素材帧坐标。
- **最小换算实现选型理由**：在 TS 侧直接以 2 行纯算术复用 `bar_to_frame` 语义，不额外增加 napi 导出（遵守 `crates/native` 仅批准 `sourceInfo` 单一新导出的契约门禁），同时消除高频波形渲染中的重复 FFI 调用开销。
- **循环取模与平移一致性**：对 `(bar - 1 + contentOffsetBars)` 的帧位置采用 `rem_euclid(rawStartFrame, totalFrames)` 循环取模，与 C1 `mix/mod.rs` 的循环读取语义保持完全一致。Clip 在时间线上平移（如移至第 100 小节）时返回完全相同的波形；带符号负 `contentOffsetBars` 正确循环回绕。
- **跨素材边界分段拼接**：当可见跨度 `frameSpan` 超出素材剩余长度或跨越多轮循环时，按像素比例分段调用 `readPeaks` 并按 channel-major 拼装，确保多小节循环波形连贯无缺。
- **安全保证**：素材未加载、帧范围越界、无效像素数或参数包含 NaN 时返回零长度或全静音 `Float32Array`，绝不抛出错误，绝不返回 NaN。API 依据：[Firewheel node contract](https://github.com/billydm/firewheel/blob/main/_autodocs/api-reference/core-node.md)、[Firewheel 0.14.0](https://docs.rs/firewheel/0.14.0/firewheel/)、[Symphonia 0.6.1](https://docs.rs/symphonia/0.6.1/symphonia/)、[Rubato 5.0.1](https://docs.rs/rubato/5.0.1/rubato/)。具体签名以本机 Cargo.lock 对应源码和实际构建结果为准。
