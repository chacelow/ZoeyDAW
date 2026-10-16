# Rust / native review

## 范围与结论

只读审查 `crates/engine/src/**`、`crates/native/src/**`、Cargo 依赖选择，以及 `apps/gpuix/src/platform/engine.ts`、`project/adapters/backend/native.ts` 的实际消费链。以当前代码及当前契约为准，不以历史实现为基线。未修改仓库、启动窗口、打开音频设备或碰共享 vendor / Cargo target。

结论：**3 项 P1、2 项 P2**。以下是代码可直接证明的缺陷；没有把已记录的产品限制或未实测的性能猜测列为问题。

## Findings

| id | sev | location | problem | evidence | suggested fix |
| --- | --- | --- | --- | --- | --- |
| RUST-01 | P1 | `crates/engine/src/mix/mod.rs:69-72`；`:166-179` | **Return 的 Solo 是被正常接受但完全不生效的控制。** 用户只 Solo 一个 Return 时，其他干声及 Return 的可闻状态完全不变。 | 生产控件 `apps/gpuix/src/project/sections/arrangement/tracks/TrackMixer/index.tsx:125-131` 对 Return 同样提供 Solo，并调用 `updateTrack(..., { solo })`；`adapters/backend/projection.ts:19` 将其发送至 Rust。实际消费点计算全局 Solo 时显式排除 Return：`.any( | t | t.solo && !matches!(t.kind, TrackKind::Main | TrackKind::Return))`，而 `solo_allowed` 又无条件允许所有 Return。因而只有 Return.solo 从 false 变为 true 时，每个编译后的 Track 及渲染输出都不改变。这不是已声明的 MIDI/设备 DSP 限制；引擎契约声明支持 Solo。 | 实现 Return Solo 的路由语义：保留其上游发送，抑制不应听到的干声及其他 Return 输出，而不是简单把上游轨静音造成 Solo Return 自身也无声。补一个有干声和两个 Return 的独立行为测试，断言 Solo 前后输出改变且目标 Return 仍有输入。现有随机混音测试只随机 Audio 的 Solo，参考实现也只以 Audio Solo 判断，覆盖不到此缺陷。 |
| RUST-02 | P1 | `crates/engine/src/mix/mod.rs:45-46`，调用点 `:97-110,164-165` | **Mixer 显示为 `−∞` 的最小音量/Send 仍然发声。** 特别是把一个原本缺省、静音的 Send 调整后拉到底，不会回到原来的静音状态。 | 实际消费者 `TrackMixer/index.tsx:34,41` 将最小值设为 `-60`，并显示 `db <= -60 ? "−∞" : ...`；轨道音量和 Send 共用该控件。投影原样发送数字，Rust 的 `db_gain(-60)` 则是 `10^(-60/20) = 0.001`，没有任何最小值静音分支。一个 `[1,1]` 素材、Audio=-60dB、Main=0dB、两级居中 pan 的输出仍约为 `[0.0005,0.0005]`，不是零。Send 缺省项不进入 `sends`，但显式 `-60` 项会被编译并混入 Return。 | 为 Mixer 音量/Send 的静音端点建立一致语义，在对应增益转换处将该端点映射为零；不要顺带改变普通 Clip gain 的 dB 数学语义。补音量最低值和 Send「缺省 → 调高 → 拉到底」的零输出测试，并核对 UI 的 `−∞` 文本与 DSP 一致。 |
| RUST-03 | P1 | `crates/native/src/atomic_file.rs:137-141`，入口 `:102-104` | **“stale tmp” 清理会删除其他仍存活进程正在写的临时文件，导致正常原子保存失败。** 不要求两个进程保存同一目标，只要目标在同一目录即可。 | `write_atomically` 每次先清理整个 parent；判定仅为包含 marker、不是当前 PID、后缀 `.tmp`，没有存活/年龄/所有权检查。确定性顺序：A 为目标创建 `.name.zoeymind-write-<A>-<n>.tmp` 并开始写；B 保存同目录的另一个文件，清理时删除 A 的临时路径；A 的已打开句柄仍能 `write_all/sync_all/metadata`，但最终 `rename(temp,target)` 返回 NotFound。settings、snapshots、log-config 和公开的 `writeBytesAtomically` 都走此实现。现有 cleanup 单测只使用一个固定的“其他 PID”文件，不能区别崩溃残留与活跃写入。 | 不把“其他 PID”当作陈旧的证明。移除每次写入时的跨进程无差别清理，或在可证明该文件不被活跃 writer 持有的情况下清理；失败/崩溃恢复也不能删除活跃事务。补带同步屏障的双进程测试，在 A 临时文件创建后让 B 开始保存，要求两次保存均成功且文件完整。 |
| RUST-04 | P2 | `crates/native/src/engine.rs:138-143` | **遥测队列满时，当前 napi 调用会泄漏每次被丢弃的 payload；队列容量为 1 并未使内存占用有界。** JS 线程超过两个约 33ms 周期没有消费，后续样本就会进入该路径。 | `TelemetryCallback` / `subscribe_telemetry` 将 TSFN 队列限为 1；控制循环仍每 33333µs 无条件序列化并调用 `call_with_return_value(NonBlocking)`，忽略返回 Status。`Cargo.lock:1158-1159` 固定的 napi 3.14.2 实现（本机 registry `napi-3.14.2/src/threadsafe_function.rs:664-688`）先 `Box::into_raw(Box::new(ThreadsafeFunctionCallJsBackData { data: value, callback: Box::new(cb), ... }))`，再 `napi_call_threadsafe_function`，最后只把 status 转换返回；失败时没有 `Box::from_raw` 回收。N-API 在 QueueFull 时未接纳这个 opaque data，也不会调用其消费回调，因此每个失败调用的 String 与 callback allocation 丢失。这里的缺陷不同于已知 F7 同步绘制问题：任何造成 TSFN 回压的 JS 工作都能触发。 | 在桥接层实现真正的 one-in-flight 所有权：只有上一帧的完成回调已释放 pending 标志才准备/投递下一帧，订阅替换和 disposal 同样处理 pending 生命周期；或者使用已修复失败回收的依赖实现。仅检查/记录 QueueFull 无法回收已经在依赖内部遗失的指针。补 JS 消费暂停/延迟的压力测试，检查 dropped sample 期间内存不随失败投递次数增长。此项为依赖源码和调用链确认，未运行内存压力测试。 |
| RUST-05 | P2 | `crates/native/src/engine.rs:168-170`，释放点 `:202-210` | **每次 Session 的环境清理 hook 都保留到整个 Env 退出，显式 dispose 不释放它；反复进入/离开工程累积失效的原生注册。** 设备与 thread 已释放，但 cleanup registration 的数量仍按历史创建次数增长。 | `open_session` 每次 `env.add_env_cleanup_hook(id, ...)`，丢弃返回的 hook token；`dispose` 仅从 HANDLES 移除、发送 Dispose 并 join，没有处理对应 hook。napi 3.14.2 的 `src/env.rs:1121-1156` 使用 `Box::leak` 保存每条 CleanupEnvHookData；`cleanup_env.rs:6-9` 的 token 是 Copy 的裸指针封装，没有 Drop 自动移除。因此同一 Env 中 N 次 `openSession → dispose` 后，HANDLES 可以为空，N 条清理注册却仍保留，并在 Env 退出时逐个再次调用 dispose。应用契约的 first lease open / last lease dispose 会真实产生这种反复生命周期。 | 按 Env 注册一个 cleanup owner，由它仅跟踪尚未释放的 Session；正常 dispose 从该 owner 移除 Session，Env teardown 只清理活跃 Session。或者完整持有并释放单 Session 的 hook 与其 payload（需核对当前 napi 移除 hook API 的 payload 回收行为，不能只丢 token）。补重复 acquire/release 的注册数量不变量测试及 Worker Env teardown 测试。 |

## Checked, no issue

- **Realtime 热路径与计划交换**：阅读 `TimelineProcessor::process`、`synchronize_transport`、`Mixer::render/sample`，以及 triple_buffer 9.0.0 的 `Input::write/publish`、`Output::update/output_buffer_mut`。控制线程编译/分配计划；消费者交换 buffer 索引，不在 callback 中销毁旧 Plan。未在仓库自有 callback 热路径发现 heap allocation、Mutex、文件/网络 I/O 或日志调用。此结论是静态路径审查，不是动态 allocation counter，也不是所有 CPAL/第三方路径的硬实时证明。
- **Transport / frame math**：半开 loop 分段、seek 后下一非空播放块才 wrap、暂停不推进、跨多个周期、不带 loop 的 u64 上界截断；未发现额外 off-by-one 或溢出。对应既有测试通过。
- **采样率与 buffer size**：实际设备率驱动 off-thread resampling；`new_stream` 率变化设置 terminal fault，回调清零、后续 apply 拒绝；混音 scratch 不按 callback frame 数索引，因此不依赖固定 256 帧大小。没有实际改变宿主设备或率，也未做硬件切换验证。
- **协议接受/拒绝**：SessionFence 在资源变更之前验证，解码/路由准备失败不替换旧 sources/plan/fence；sequence、session、revision、seek generation 及 dispose 的正常契约有现有测试覆盖。检查过所有 native `Command` variant 的控制线程 match，未发现静默丢弃分支。
- **Assets / peaks**：解码仅接纳 mono/stereo 和有限 PCM；空 source 的取模被 Option 短路保护。源率元数据、signed source offsets、looped peak seam 合并和 channel-major 输出路径一致。注意 C2 文档已明确批准不同采样率时 partial-bin 边缘近似，不能将它重报为新缺陷；原 README 的“Exact”用语不用于推翻这一明确决定。
- **napi 错误/线程边界**：实际 producer → run-loop → engine consumer 链已追踪。没有在生产 Rust 代码中发现对用户/OS 输入直接 unwrap/expect 的路径；serde/解码/文件错误正常返回。Engine 使用 `call_with_return_value` 的完成闭包吸收 JS callback 错误，不会因普通 listener throw 直接走 fatal exception。dispose 后 TS 忽略已排队遥测。
- **原子写基本顺序**：create_new 临时文件、write_all、file sync_all、长度校验、同目录 rename（Windows MoveFileExW WRITE_THROUGH）、parent sync 及失败时自有 tmp 清理均已检查；确认的跨进程清理缺陷单列 RUST-03。没有运行崩溃/断电耐久性测试。
- **Settings / snapshot paths**：缺失 settings 默认值、旧 themeMode 缺省、未知字段/模式拒绝、snapshot key URL 编码防止目录穿越；未发现额外问题。
- **Cocoa / unsafe / cursor / clipboard**：window geometry 和 diagnostics 在读取 NSApp/NSWindow 之前检查 MainThreadMarker，不提前 sharedApplication；常量 NSString 使用及 clipboard 自有 autoreleasepool 已检查；cursor restore 即使 warp 失败仍尝试 show。没有修改真实剪贴板、光标或窗口状态，未声称完成桌面验收。
- **其他 native 模块**：`external.rs` 的 http/https scheme 限制及非 shell 参数调用、`log.rs` 的 live-file 锁与清理后重开、reduced-motion observer 的正常替换/移除已检查；未确认其他必须修的问题。`isApplicationActive` 虽已无产品调用，但 F1 文档及仲裁记录明确要求保留查询，未把它作为 dead-code 报告。
- **已记录限制**：未将 MIDI/Pattern 不发声、automation/device DSP 元数据、多路硬件配置未实现、全量 PCM、首次 apply 同步解码、F7 同步整窗绘制等当作新问题。

## 实际验证

运行：`CARGO_TARGET_DIR=/tmp/zoeydaw-review-target cargo test --manifest-path crates/engine/Cargo.toml`。

结果：engine **32 passed，0 failed**；benchmark test target 0 tests，doc tests 0 tests。原始输出：`artifact://1574`。target 使用独立 `/tmp` 目录，不碰共享构建锁。

未运行 native build/cargo check、native/JS 集成播放、窗口、宿主设置修改、文件竞态压力测试或 TSFN 内存压力测试。上述发现依据实际代码及已定位消费者/依赖行为；既有测试全绿不构成对未覆盖场景的否定。
