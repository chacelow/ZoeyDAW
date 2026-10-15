# A5 engine-spike:播放图库对比与引擎骨架

## Target

Worktree `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-a5-engine-spike`(分支 `gpuix-a5-engine-spike`)。`crates/engine` 目前是空骨架(`version()`)。用户决策:**真实音频引擎本轮做到“播放 + 时间线 + 波形”**(cpal 输出 + symphonia 解码 + rubato 重采样 + 峰值预计算),**播放图库先 spike 对比 firewheel / kira / rodio 再定**。录音、MIDI 设备、插件不在本轮。

## Change

1. **Spike(1 天内的量)**:`crates/engine/spikes/` 下为三个候选各写最小可运行程序(独立 bin,不进主 crate):
   - 载入同一个 WAV(自己用 `hound` 或 `symphonia` 生成一个 10 秒立体声测试文件放到 `crates/engine/spikes/assets/`,< 2MB)
   - 以**样本精确**的起点播放(从第 N 帧开始,N 取 3 个不同值,验证起点误差)
   - 循环区间播放(跨边界无爆音无空隙,比较首尾样本)
   - 暂停/继续/seek,seek 后的第一帧延迟
   - 读出"当前播放帧"的方式与精度(这是 `BackendClock { kind: "sample", frame, sampleRate }` 的来源)
   - 回调线程内是否分配/加锁(用 `assert_no_alloc` 或手工审查)
   - 同时播放 8 / 64 / 256 个 clip 的 CPU 占用(用同一个文件的多个实例) 候选与观测版本(crates.io,2026-10 实测):`firewheel 0.14.0`(周下载 1.9 万)、`kira 0.12.5`、`rodio 0.23.0`;底层输出 `cpal 0.18.2`,解码 `symphonia 0.6.1`,重采样 `rubato 5.0.1`。新增这些 crate 属于 spike 范围内的依赖,允许,但只放在 `spikes/` 的 `Cargo.toml` 里。
2. **结论文档** `docs/research/engine-playback-graph.md`:表格列出每个候选在上述每项的**实测数值**与结论,明确推荐一个并说明理由与风险;不得只复述 README。
3. **引擎骨架**(基于你推荐的库):`crates/engine/src/` 实现纯 Rust、不依赖 napi 的:
   - `protocol.rs`:镜像 TS 侧 `ProjectBackend` 端口的请求/结果类型(见 `apps/web/src/pages/project/model/backend.ts`:`BackendRequest/Result/State/Telemetry/Clock`、stage 语义 `open|commit|preview|cancel|transport|recover`、sessionId/sequence/revision 栅栏)。用 `serde` 派生以便跨 napi 传 JSON(新增 `serde`/`serde_json` 允许)。
   - `transport.rs`:走带时钟——样本时钟(frame、sampleRate、barsPerSecond、loop 区间),纯函数可测。
   - `peaks.rs`:峰值预计算(给定 PCM → 每 N 帧一对 min/max,多级金字塔),纯函数可测。**这是 UI 波形的数据源**。
   - 不接 napi,不写 `crates/native`(那是后续 Wave C 的事,你只出可被 native 依赖的纯 Rust 库 + 测试)。
4. 骨架全部带 `cargo test`;不用 `unsafe`,除非 spike 证明必要并在结论里说明。

## Constraints

- 不改 `crates/native/**`、`apps/**`、`packages/**`。
- spike 的 bin 不进 workspace 默认构建(放 `exclude` 或独立 workspace),避免拖慢他人的 `cargo build`。
- 音频设备:spike 运行时会真实发声,请把输出音量压到很低(乘 0.05),并在运行前后不要改用户的系统音量。无法使用真实设备时用 cpal 的 `null`/离线渲染路径,报告里说明。
- 不得把“编译通过”或“README 声称”当结论;每个结论配一条实际命令的输出。

## Ownership

`crates/engine/**`、`docs/research/engine-playback-graph.md`。

## Observable acceptance

- `cargo test -p zoeydaw-engine` 通过;`cargo check --workspace` 通过。
- `docs/research/engine-playback-graph.md` 含三候选的实测对比表与明确推荐。
- 报告里附 `peaks.rs` 对一个已知波形(如正弦)的金字塔输出核对(峰值、min/max 对称性)。
