# 播放图：Firewheel

## 决策

Firewheel 0.14.0 作为音频图与 CPAL 输出底座。采用的是图运行时，不是它内建 SamplerNode 的走带语义。

三个候选在同一份 48kHz 双声道 PCM、256 帧块上实测：

| 项目 | Firewheel 0.14.0 | Kira 0.12.5 | Rodio 0.23.0 |
| --- | --- | --- | --- |
| 非零起点 | 第 0 帧 gain=0，之后无误差 | 无误差 | append 先于 connect 时无误差 |
| 暂停 | 静音但仍消费一块 | 不推进 | 5ms 控制量化后静音 |
| seek | 命令在块起点生效，目标帧被淡入修改 | 先输出 2 帧旧数据并重复目标 | 依赖 240 帧轮询 |
| 时钟 | 整数图样本计数，暂停仍增长 | 块开始位置，滞后一块 | 5ms 更新，滞后约 40 帧 |
| 回调 | 稳态路径无分配、无锁；事件超容量会 reserve | 稳态无分配、无锁 | 每 5ms 取多把 Mutex，可分配 |
| 256 clips CPU（单核 %） | 1.07 | 8.42 | 26.02 |

没有候选的内建 sampler 满足 DAW 的样本精确语义，Firewheel 的图成本最低且时钟是整数样本，因此由工程自己的 PCM 节点承接走带分段。

## 采用边界

1. `crates/engine/src/transport.rs` 持有工程 sample clock，输出跨 loop 的无分配 source ranges；暂停不推进，seek 精确保留目标。`BackendClock::Sample.frame` 来自工程时钟，不用持续增长的图时钟。
2. 音频节点直接按这些 ranges 读取缓存 PCM，绕开内建 sampler 的首帧淡入与暂停消耗一块。
3. 渲染图与事件容量在控制线程预分配，超容量 reserve 不能进入实时路径。
4. Firewheel 未从顶层 re-export `audioadapter`，使用图回调需显式依赖与其解析一致的 `audioadapter-buffers`。

## 纯 Rust 契约

- `protocol.rs` 镜像 TS `BackendRequest/Result/State/Telemetry/Clock` JSON：camelCase、`kind` union、null 字段。`SessionFence` 规则：open 只能首次且 sequence/baseRevision/revision 为 0；之后 sequence 严格递增，session 与 baseRevision 匹配；拒绝不改变状态，dispose 后永久拒绝。
- `transport.rs` 使用整数 source frame，musical bar 一基；分段跨 loop，块长超过 loop 也不分配。
- `peaks.rs` 每声道独立 min/max，父级合并相邻两 bin，保留不完整尾 bin，NaN 视为 0；按像素密度选级并裁剪半开可见范围。

## 测试素材

`crates/engine/spikes/assets/probe.wav`：10 秒、48kHz、双声道、16-bit；左声道 100Hz 正弦，右声道带周期归零包络的 chirp，用于识别源偏移并检验 loop 接缝。由 `cargo run --release --manifest-path crates/engine/spikes/Cargo.toml -p spike-common --bin gen-asset` 生成，三个候选 bin 仍可在该独立 workspace 重跑。
