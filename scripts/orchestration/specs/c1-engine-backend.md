# C1 engine-backend:Rust 引擎实现 ProjectBackend 端口并接 napi

## Target

Worktree `/Users/caishilong/orca/workspaces/zoeydaw/gpuix-c1-engine-backend`(分支 `gpuix-c1-engine-backend`,基于 `gpuix-migration`,已含 A1/A2/A4/A5/A6)。

## 背景

A5 已选定 Firewheel 0.14.0 作为音频图与 CPAL 输出底座,并在 `crates/engine` 里实现了协议状态 `SessionFence`、走带 `Transport`(样本精确 loop 分段)、峰值金字塔 `PeakPyramid`。**还没有:真实混音节点、解码、设备输出、napi 暴露、TS 端的真实 `ProjectBackend` 实现。** 架构规则第 5 条:接真实,不再造 Mock——`createMockProjectBackend` 只保留给不依赖原生的纯逻辑测试。

TS 端口定义见 `apps/gpuix/src/project/model/backend.ts`(`ProjectBackend.apply/subscribe/dispose`,`BackendRequest/Result/Telemetry`)。Rust 侧协议类型在 `crates/engine/src/protocol.rs`,必须与 TS 端口字段一一对应。**能在 Rust 里直接做的都在 Rust 里做**:状态围栏、走带时钟、混音、电平遥测、峰值计算全部在 Rust;TS 只发命令、订阅遥测,不搬 PCM,不在 JS 里算电平或波形。

## Change

1. **混音节点**(`crates/engine/src/mix/`):按 A5 报告"推荐的采用边界"第 2 点,实现读 `transport::segments` 输出的 source ranges 的 PCM 节点:音频 clip(含 sourceOffset、gain、fade in/out 曲线)、静音/独奏、音量/声像(等功率)、发送到 return、main。样本精确:第一帧与 transport 一致,暂停不消耗一块,seek 精确。`#![forbid(unsafe_code)]` 保持;实时线程不分配、不加锁(无界 `Mutex` 禁止,用无锁队列或 triple buffer)。
2. **解码与素材**:Symphonia 0.6.1 解码到 f32 PCM,Rubato 5.0.1 采样率转换(依赖已在 A5 研究里点名,**批准**);`BackendSource.uri` 读本地文件。生成 `PeakPyramid`,经 napi 以 `Float32Array` 或紧凑二进制按范围+像素宽度返回峰值(UI 的波形只取可见范围,不传整段 PCM)。
3. **设备输出**:CPAL(经 Firewheel)。设备不可用或采样率变化时有明确错误结果(`BackendResult::rejected`)而不是静默;暴露 `outputLatencyFrames` 到遥测,若平台拿不到就返回 `null` 并在文档写明。
4. **MIDI/Pattern 轨**:本切片不做合成器与插件。MIDI/Pattern clip 只保留在状态里并参与走带与遥测(无声),**不得把它描述成已能发声**;报告里单列"未实现:MIDI 合成、插件宿主、录音"。
5. **napi 暴露**(`crates/native/src/engine.rs`):`openSession/apply/subscribeTelemetry/dispose/readPeaks`;遥测通过 napi `ThreadsafeFunction` 推送,频率约 30Hz,节流在 Rust 侧。**`crates/native` 公共导出变更属于契约变更——先 `orca orchestration ask` 给出导出清单与类型,批准后再写。**
6. **TS 实现**:`apps/gpuix/src/project/adapters/backend/native.ts` 实现 `ProjectBackend`,与 `mock.ts` 同一端口,经 `runtime/backend-registration` 注册;应用默认使用 native,mock 只在纯逻辑测试里显式注入。
7. **接入既有电平**:`adapters/mockMeters.ts` 的模拟电平改为读遥测 `levels`;`BackendTelemetry.levels` 为有限 dBFS,静音用有限地板值。不再保留模拟电平路径(清洁切换,不留双路径)。

## 产品规则

- 播放位置/光标:Space 控制播放;seek 以 `seekGeneration` 围栏,旧 seek 的遥测不得回写新位置。
- 电平表:0 dB 以上红、以下黄绿渐变、峰值保持条跟随后缓慢下落——**峰值保持逻辑属于 UI 绘制**,引擎只给瞬时峰值/RMS,不要把保持逻辑做进引擎。
- 不得把模拟/占位能力称为已接通。

## Constraints

- 拥有路径:`crates/engine/src/**`(`spikes/` 保留不动,是证据)、`crates/native/src/engine.rs`(新增)与 `lib.rs` 仅 mod 登记、`apps/gpuix/src/project/adapters/backend/native.ts` 及其测试、`adapters/mockMeters.ts` 的移除。
- 不动 `cursor.rs`、`ui/**`、`project/model/**`(A1 的类型契约;发现必须改先 ask)、`docs/architecture/gpuix.md`。
- 新增 Rust 依赖仅限:`firewheel`(0.14.0)、`audioadapter-buffers =5.2.0`、`symphonia`(0.6.1,按需 feature)、`rubato`(5.0.1)、`cpal`(Firewheel 解析的同版本)、无锁队列用已在依赖树里的 crate 优先。其它先 ask。
- `Cargo.lock`/`pnpm-lock.yaml` 冲突由协调者合并时统一重生成。

## 测试

- Rust:**性质测试**(固定种子 LCG)断言:① 离线渲染结果与"逐样本参考实现"逐样本一致(静音/独奏/增益/声像/fade 随机组合);② 任意 seek/loop/暂停序列后,位置帧数与 `Transport` 推演一致;③ 旧 `seekGeneration` 的遥测被围栏;④ 峰值金字塔任意范围的 min/max 与暴力计算一致。
- **变异检查**(强制):对混音与围栏至少 3 个变异(声像律、fade 方向、围栏比较符),确认测试失败后恢复,把"变异→失败数"表写进报告。
- 集成:`bun test` 里直接调真实 napi(`createNativeBackend` 对临时生成的 WAV),断言 `apply` 后遥测 `appliedSequence`/clock/levels;只对"改变宿主状态"的调用才允许 mock。
- 真实发声验证:**用一个很小的总增益(≤0.05)** 播放生成的正弦 WAV 约 2 秒,用 `levels` 遥测证明有电平、停止后归零;**不要修改系统音量**。

## Observable acceptance

- `cargo test --workspace`、`cargo clippy --workspace --all-targets -- -D warnings`、`pnpm native:build`、`apps/gpuix` 的 `tsc --noEmit` 与 `bun test`、`pnpm exec eslint apps/gpuix/src/project/adapters` 全部通过(贴命令与计数)。
- 报告列出:导出清单、设备/延迟实测、变异表、未实现项(MIDI 合成、插件、录音)、关键 CPU 占用(离线渲染 N 轨 M 秒的墙钟与回调预算比)。
- **进程清理(强制)**:一切 `cargo run`/`bun` 测试进程、发声测试验证后立刻结束,`worker_done` 前贴 `ps` 零残留输出。
