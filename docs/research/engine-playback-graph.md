# 播放图选型：Firewheel / Kira / Rodio

2026-10-14，A5。**推荐 Firewheel 0.14.0 作为音频图与 CPAL 输出底座，不把内建 SamplerNode 当成 DAW 时间线。** 三者都不是开箱即用的严格样本精确走带：Firewheel 非零起点强制淡入一帧，Kira seek 保留旧重采样历史，Rodio 的 Player 控制在回调内取锁。Firewheel 的完整图渲染成本最低，图时钟是整数样本计数，允许以自有 PCM 节点承接 `transport.rs` 的分段结果；这比修补游戏音效播放器的 seek/position 语义更直接。

本次交付是**实测 spike 与纯 Rust 协议/走带/峰值库**，不是已经接通产品的音频引擎。没有改 `crates/native`、应用 adapter 或共享契约；没有实现 NAPI 音频桥、工程混音节点、生产解码/重采样管线、录音、MIDI 设备或插件。

## 重跑与证据

三个 bin 在 `crates/engine/spikes` 的独立 workspace 内，根 workspace 默认构建不包含它们。候选版本精确锁定；公共 WAV 由 Hound 生成，10 秒、48kHz、双声道、16-bit，**1,920,044 字节**。左声道 100Hz 正弦，右声道带周期归零包络的 chirp，用于识别源偏移并使指定 loop 接缝连续。

```sh
cargo build --release --manifest-path crates/engine/spikes/Cargo.toml --workspace
cargo run --release --manifest-path crates/engine/spikes/Cargo.toml -p spike-common --bin gen-asset
cargo run --release --manifest-path crates/engine/spikes/Cargo.toml -p spike-firewheel
cargo run --release --manifest-path crates/engine/spikes/Cargo.toml -p spike-kira
cargo run --release --manifest-path crates/engine/spikes/Cargo.toml -p spike-rodio
# 以下串行执行，真实发声；每个 bin 内总增益 0.05，不修改系统音量。
cargo run --release --manifest-path crates/engine/spikes/Cargo.toml -p spike-firewheel -- --device
cargo run --release --manifest-path crates/engine/spikes/Cargo.toml -p spike-kira -- --device
cargo run --release --manifest-path crates/engine/spikes/Cargo.toml -p spike-rodio -- --device
```

已运行上述编译、资产生成，以及编译后 bin 的离线/设备模式。完整命令与输出：

- [Firewheel offline](../../crates/engine/spikes/results/firewheel-offline.txt)、[device](../../crates/engine/spikes/results/firewheel-device.txt)
- [Kira offline](../../crates/engine/spikes/results/kira-offline.txt)、[device](../../crates/engine/spikes/results/kira-device.txt)
- [Rodio offline](../../crates/engine/spikes/results/rodio-offline.txt)、[device](../../crates/engine/spikes/results/rodio-device.txt)
- [宿主、电源、背景负载、原生窗口 smoke](../../crates/engine/spikes/results/host.txt)

### 比较边界

离线三者都走**实际完整渲染路径**，不是手写混音器：Firewheel `FirewheelProcessor::process`（图 → sampler → 输出）；Kira 自定义 CaptureBackend 持有官方 `Renderer`，调用 `on_start_processing` / `process`（主轨 → sound）；Rodio `MixerSource`（规范化 → Player queue → source）。这些也是各自 CPAL 输出驱动的路径。统一 48kHz、双声道、256 帧块、speed=1、同一份预解码 PCM，声部共享数据；不把文件 I/O 或解码计入渲染基准。

Firewheel 将 declick 设为 0，但库会钳制为最少一帧；关闭 seek crossfade。Kira pause/resume 使用零时长 Tween，但仍测得内部块插值。Rodio 保留常见 `connect_new` 后 `append` 的 bootstrap 缺陷探针；其余比较使用 **先 append 再将 queue 加入 mixer**，避免初始空 queue 的声道/采样率元数据造成首次重采样错误。没有通过移动预期起点掩盖上述失真。

## 功能实测

误差是实际输出与同一 PCM 参考的最大绝对样本差。起点分别为源帧 `0 / 12345 / 144001`。loop 为半开区间 `[4800,9600)`。seek 延迟是命令等待处理后、**离线渲染输出**中的帧数，不是控制线程墙钟响应或扬声器/DAC 延迟；没有环回录音，不能证明硬件端逐样本时序。

| 项目 | Firewheel 0.14.0 | Kira 0.12.5 | Rodio 0.23.0 |
| --- | --- | --- | --- |
| 三个起点，首 64 帧误差 | `0 / 0.392303467 / 0.005249023`；非零起点第 0 帧消费目标样本但 gain=0，第 1 帧起原样输出，后续误差 0 | 三个起点均误差 **0**，检测出的源起点与请求相同 | append-before-connect：三个起点均误差 **0**；常见 connect-before-append 在起点 0 的误差 `0.293640137` |
| 指定区间 loop | **原生无 start/end 参数**；零拷贝 `SampleResource` region view 适配后送真实 sampler whole-resource repeat，3 次接缝误差均 **0**，无 gap/duplicate；首帧 declick 单独报告 | 原生 region loop，跨接缝 256 帧误差 **0**，无 gap/duplicate | `skip_duration` + `take_duration` + `repeat_infinite`，跨 3 个周期误差 **0** |
| 接缝前后双声道样本 | view 接缝：`[-0.0052490234,0] → [0,0]`，与源 `9599 → 4800` 一致 | 同左，与源一致 | 同左，与源一致 |
| 暂停 | 首个暂停块输出已静音，但源 playhead **256 → 512**，仍消费一块；下一块稳定为 512 | 暂停后连续两块源 playhead 均 **512**，静音峰值 **0** | 发命令时已渲染 1000 帧，遥测为 960；再输出 **200 帧**才静音，settled clock=1200，稳定静音峰值 **0** |
| 恢复 | 第 0 帧被淡入修改；首 64 帧误差 `0.162689209`，第 1 帧起误差 0 | 首恢复块有淡入，首 64 帧误差 `0.376623780`；下一块从源 768 起误差 **0** | 恢复输出峰值 `0.399994`；控制仍按 5ms 轮询，非样本级立即生效 |
| seek 到 12345 后首输出 | 命令在本块起点生效（0 帧）；目标帧被 gain=0 修改，首个未修改样本是 output 1 的源 12346；不能称为精确播放目标第一帧 | output 0/1 为旧数据；output 2 首次出现目标，output 3 **重复目标**；连续正确片段从 output **3** 起，随后 64 帧误差 0 | 本次 output **88 帧**后出现目标（48kHz 下约 1.833ms）；随后 64 帧误差 **0**。相位依赖 240 帧控制轮询；`try_seek` 阻塞直到回调确认 |
| 当前帧读取与精度 | `audio_clock().samples` 整数渲染计数；测得每块与实际 rendered 完全相同；source playhead 另读 SamplerState，region view 的源位置需加 view offset。图计数暂停时仍增长，不能直接当工程走带位置 | `StaticSoundHandle::position()` 是 f64 秒乘采样率；普通播放两次均滞后 **256 帧**（块开始位置）；seek 所在块仍报旧源 1024，不能当即时 sample clock | `Player::get_pos()` Duration；普通播放渲染 1000 帧时报告 960（滞后 **40 帧**），5ms/240 帧更新。seek 确认线程还会写回目标位置，本次拉完 1024 帧再 join 时读值仍为 12345，非可靠的连续音频时钟 |
| 真实 CPAL 输出 | 48kHz / 最大块 256；2.005817s 后 graph/source=96256，`Playing`，`output_stream_ok=true` | 2.011342s 后源位置=96256；无 stream_error 输出；内部块 256，backend 不暴露设备回调帧数或 DAC 时间戳 | 默认设备 48kHz / **6 声道 / Fixed(2048)**；约 2s 读源帧 96240，pause 后 96480，seek/resume 后 16185 |
| callback 分配/锁 | 手审：steady speed=1 sampler 路径未见分配/Mutex；调度事件超容量会 `reserve`，不能声称所有 callback 路径无分配 | 手审：steady Renderer/static sound 路径未见分配/Mutex；预分配资源、原子命令、控制端回收；不是对第三方 effect 的保证 | 手审：Player 每 5ms 取多把 Mutex；mixer 新源进入 Vec 可分配，repeat 的 Buffered 首次遍历也会分配/加锁；**不适合作硬实时核心** |

Firewheel region view 仅改变不可变资源的坐标与长度；真正的 repeat、混音与时钟仍由其图执行。它不是原生 loop 参数支持，也不是已实现的工程 timeline。接缝无额外跳样只对该夹具及测试参数成立，不能替代任意不连续素材的 declick/crossfade 策略。

## CPU 与墙钟成本

宿主：`Mac16,10`、Apple M4、10 核、macOS 25.1、arm64、接 AC 电源。三个候选串行运行；测量时没有本 worker 的窗口或 cargo 编译。**用户已有重负载未停止**：测量前 `ps` 快照 Orca Renderer 108.1%、Ableton Live 65.4%、WindowServer 47.1%，还有 Edge/coreaudiod 等。因此墙钟有明显调度噪声，不能拿它承诺 xrun 上限。

每档先 warm-up 16 块，再连续 5 次、每次 200 块，每块 256 帧，即每次 1.066667 秒音频；总共 260096 帧，小于夹具长度，非 looping 声部不会在测量中结束。`cpu-time =1.0.0` 的 `ProcessTime` 统计**整个候选进程的所有线程**，但该模式没有 CPAL 输出线程；资产读取、初始化、报告日志均在计时区间外。CPU 百分比为 `进程 CPU 秒 / 音频秒 × 100`，**单核 100%**，不是除以 10 核后的活动监视器整机比例。Wall 用同一音频时间归一化，含被其他进程抢占的等待。

| 候选      | 同时 clips | CPU 中位数 % | CPU 最大值 % | Wall 中位数 % | Wall 最大值 % |
| --------- | ---------: | -----------: | -----------: | ------------: | ------------: |
| Firewheel |          8 |       0.0200 |       0.0202 |        0.0198 |        0.0200 |
| Firewheel |         64 |       0.2238 |       0.2543 |        0.2727 |        0.5810 |
| Firewheel |        256 |       1.0699 |       1.4276 |        2.4043 |       15.8070 |
| Kira      |          8 |       0.3000 |       0.3331 |        0.4217 |        0.5468 |
| Kira      |         64 |       1.9349 |       2.3675 |        3.4591 |       35.9610 |
| Kira      |        256 |       8.4244 |       8.5509 |       55.0978 |       68.7162 |
| Rodio     |          8 |       0.9159 |       0.9633 |        1.2236 |        1.6767 |
| Rodio     |         64 |       6.3985 |       6.5946 |       13.7114 |       14.4966 |
| Rodio     |        256 |      26.0178 |      27.3622 |       69.9160 |      260.4462 |

这些是缓存 PCM、同速、无效果器、声部同步起播的图成本，不包含解码、重采样、磁盘流、不同 clip 读区间造成的缓存失效或效果链。五次是同一次进程内的五段，不是跨进程统计。资源/节点插入的首次成本被 warm-up 排除。可用于该场景的候选排序，不能外推为生产工程容量。

## 回调源码审计

使用 lockfile 固定版本的本机 Cargo registry 源码核对实际 render 调用链；**未安装运行时 allocation counter**。下列“未见”是限定路径手工审查，不是动态证明或对设备驱动的承诺。我们的 Rust 代码无 `unsafe`，主 crate 以 `forbid(unsafe_code)` 强制。

- Firewheel：`firewheel-cpal-0.14.0/src/lib.rs:1259–1275` 调用相同 `FirewheelProcessor::process`。`firewheel-nodes-0.14.0/src/sampler.rs:779–800,837–912,1281–1322` 同速路径复制已有资源、写 triple buffer；`:703–708` 的锁在初始化，`:364–377` 的状态读取锁在控制端。`firewheel-graph-0.14.0/src/processor/event_scheduler.rs:65–81,220–227` 预分配但超容量可 reserve；本 probe 显式提高 event capacity。`firewheel-core-0.14.0/src/collector.rs:79–94` 的 register/collect 有锁，context update 在控制端收集。暂停推进/强制淡入分别见 sampler `:915–920,1250–1253,1303–1309` 与 `:1236–1240`、`dsp/declick.rs:510–511`。
- Kira：`kira-0.12.5/src/backend/renderer.rs:39–50,63–125`、`track/main.rs:38–67`、`sound/static_sound/sound.rs:186–241`；buffer 预分配，重采样历史为 `sound/static_sound/sound/resampler.rs:12–40` 的固定四帧。`command.rs:22–60` 使用 triple buffer；资源增删为 `backend/resources.rs:35–64` 的预分配 arena/ring，`:207–222` 将对象交控制端销毁。零 Tween 的块插值见 `parameter.rs:66–67,96–105`；seek 历史见 `sound/static_sound/sound.rs:130–156`。设备 `backend/cpal/desktop/stream_manager.rs:217–225,277–284` 使用同一 Renderer。
- Rodio：`rodio-0.23.0/src/player.rs:130–156` 的 5ms periodic callback 锁 `to_clear/position/volume/speed/seek`；`:238–255` 发送 seek 后等待回调，并再次写 position。`mixer.rs:142–145` 在 callback 扩展 current_sources Vec。`queue.rs:150–205` 为当前/下一源读取元数据，初始空队列会影响 `source/uniform.rs:36–38` 的 bootstrap；实测 source-first 顺序消除错误。`source/repeat.rs:14–17` 包装 Buffered；`source/buffered.rs` 的 lazy span 缓存含 Mutex 与 Vec 分配，因此 region loop 适配也不是无锁/无分配路径。

版本来源与 API： [Firewheel 0.14.0](https://docs.rs/firewheel/0.14.0/firewheel/)、[Kira 0.12.5](https://docs.rs/kira/0.12.5/kira/)、[Rodio 0.23.0](https://docs.rs/rodio/0.23.0/rodio/)。`cargo tree` 实测三者输出依赖统一为 **cpal 0.18.2**，没有强行换底层版本。该独立 workspace 的解码依赖由候选解析（Firewheel 包含 symphonia 0.6.1），本比较公共文件读取用 Hound，不冒充已验证生产 Symphonia/Rubato 管线。

## 推荐的采用边界

选择 Firewheel 的是**图运行时**，不是它的内建走带策略：

1. `transport.rs` 持有工程 sample clock，输出跨 loop 的无分配 source ranges；暂停不推进、seek 精确保留请求目标。`BackendClock::Sample.frame` 应来自该工程时钟，不能直接抄持续增长的 graph clock 或块开始 source position。设备/DAC latency 是另一条遥测信息，本次未实现。
2. 后续生产音频节点需要直接按这些 ranges 读取缓存 PCM，让混音实际第一帧与 transport 一致；必须覆盖当前 builtin sampler 的一帧淡入、暂停消耗一块的问题。**本切片没有实现该节点，不能宣称 sample-exact engine 已完成。** region view 已证明不可变素材可以零拷贝分区，但不能代替可变工程循环/多 clip 调度。
3. Firewheel 接口的 `audioadapter` trait 没有从顶层 re-export。本 spike 经协调者批准显式依赖 **`audioadapter-buffers =5.2.0`**，与 Firewheel 解析的版本一致；将来主 crate 使用图回调也要显式声明该依赖，这是采用成本。当前主 crate 仅依赖 serde/serde_json，不引入任何候选播放库。
4. 完整 render graph 与容器 event capacity 必须在控制线程预分配；超容量 reserve 不能进入实时路径。设备采样率变化与 decoder/resampler 资源生命周期须另行接通。本 spike speed=1；Firewheel 采样率重配会重建 buffer/清除资源，未把它当成自动素材重采样。
5. CPAL + Symphonia 0.6.1 + Rubato 5.0.1 的生产路径、NAPI 消息队列、UI 波形消费是后续集成边界，不在本次纯库骨架中假接通。不为录音/MIDI/插件引入额外能力。

Kira 是只需游戏音效式 region loop 时更短的实现，但本次 seek 旧帧/重复目标、resume 块插值、position 块延迟不符合 DAW 样本时钟。Rodio 简单播放器的 API 不值得用回调锁、5ms 控制量化及 queue bootstrap 风险换取；即使纯 PCM 起播/loop 可做到零误差，也不推荐作为本产品核心。

## 纯 Rust 库契约与核对

`crates/engine/src/protocol.rs` 镜像 TS `BackendRequest/Result/State/Telemetry/Clock` JSON，保留 camelCase、`kind` union、null 字段、所有 stage。`SessionFence` **镜像 mock 而非重新发明事务**：open 只能首次且 sequence/baseRevision/revision 均 0；之后 sequence 可跳号但须严格递增，session/baseRevision 匹配；commit/recover 接受指定 revision；preview/cancel 都应用调用方给出的完整状态，cancel 恢复 committed project 是调用方的职责。拒绝不改变 state，dispose 后永久拒绝。没有第二份可写工程快照。

`transport.rs` 使用整数 source frame，musical bar 是一基；纯 iterator 分段跨 loop，块长超过 loop 也不分配。seek 先精确保留目标，下一非空播放块才 wrap。`peaks.rs` 每声道独立 min/max，父级合并相邻两 bin，保留不完整尾 bin；NaN 按 0；提供按像素密度选级及半开可见范围裁剪。

实际消费公开 API 的命令：

```sh
cargo run -p zoeydaw-engine --example inspect
cargo test -p zoeydaw-engine -- --nocapture
cargo test --workspace -- --nocapture
cargo check --workspace
cargo clippy -p zoeydaw-engine --all-targets -- -D warnings
```

[inspect 完整输出](../../crates/engine/spikes/results/engine-inspect.txt)：open accepted、duplicate rejected；在 bar 2.999 起跑 256 帧，分成 `[191904..192000,96000..96160]`，next=96160，BackendClock 为 sample/frame=96160/sampleRate=48000。

已知波形：48kHz、1kHz、幅度 0.5、4800 帧（100 周期），base bin=480 帧（10 周期），5 级。单元测试还核对 level 0 每个 bin 的 min/max 和对称性、父子 extrema、部分尾 bin、非二幂长度、立体声独立性。

| Level | Frames/bin | Bin 数 | 首 bin min | 首 bin max |     min+max |
| ----- | ---------: | -----: | ---------: | ---------: | ----------: |
| 0     |        480 |     10 |  -0.500000 |   0.500000 | 0.000000000 |
| 1     |        960 |      5 |  -0.500000 |   0.500000 | 0.000000000 |
| 2     |       1920 |      3 |  -0.500000 |   0.500000 | 0.000000000 |
| 3     |       3840 |      2 |  -0.500000 |   0.500000 | 0.000000000 |
| 4     |       7680 |      1 |  -0.500000 |   0.500000 | 0.000000000 |

## 验证范围

- Rust 主 workspace：**21 tests passed**；`cargo check --workspace`、engine clippy `-D warnings` 通过。spike 独立 workspace 的 release build、cargo check、cargo test 通过（其 bin 本身无永久测试，证据是上述实际 render 输出）。
- 安装现有 lockfile 后 `pnpm native:build` 通过；生成物不提交、不修改 native 源码。
- `pnpm --filter @zoeydaw/gpuix-prototype exec tsc --noEmit`、`bun test apps/gpuix` 通过（31 tests）。根目录 `bun test` 扫进只读旧 Web/packages 的 Vitest 测试，`vi.mocked` 等不兼容；经协调者确认只以 GPUix 范围验收，不越界修旧用例。
- `bun --hot apps/gpuix/src/features/waveform-automation/demo.tsx`（实际在 apps/gpuix 目录运行对应相对入口）创建原生窗口；AX 与[截图](../../crates/engine/spikes/results/native-window.png)确认既有 waveform/automation 表面。它仍是 synthesized peaks，**不是 Rust peak pyramid 已接 UI 的证据**。Rust 数据源已由 inspect 与纯函数测试直接核对。
- 历史操作说明：当时 Rust/Cargo 改动应用到旧 Tauri 壳时需要由用户重启 tauri:dev；该壳现已删除，此说明不再是运行入口。本 worker 未启动、重启或停止用户已有服务。
