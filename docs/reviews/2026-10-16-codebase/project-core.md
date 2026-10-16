# Project core 只读审查

范围：`apps/gpuix/src/project/{model,stores,adapters}/**`、`project/layout/**`，重点为 S1 后的单一 `RuntimeOwner`、编辑/录制恢复、连接协议、快照边界、原生 handle 生命周期。审查当前代码，不以历史问题清单代替现状。已读根 `AGENTS.md`、`LESSONS.md`、gpuix 架构/UI/modules 契约、stores/adapters README、引擎研究契约及上轮 project 审查；没有修改仓库、构建 vendor/native、安装依赖或启动窗口/音频设备。

## Findings

| id | sev | location | problem | evidence | suggested fix |
| --- | --- | --- | --- | --- | --- |
| PC-01 | P1 | `apps/gpuix/src/project/adapters/runtime/runtime-backend.ts:121-125,156-167` | **已送出的独立录制提交与 recovery 都被拒绝时，录制内容永久丢失。** 首次失败将 `recordingPending` 重放到恢复文档，却立即清空对应 journal；第二次 recovery 失败又回到旧 `accepted.document`，此时已经没有可重放记录。最后 release/reopen 也无法恢复。这是上轮 recording 保留修复的未覆盖分支：丢失的是已进入 `recordingPending` 的内容，不是仍留在 `recordingJournal` 的事务内内容。 | `const unreconciledRecording = owner.recordingPending; owner.recordingPending = []`，随后 `document: owner.accepted.document`；只在本次局部变量非空时重放。隔离内存 runtime：open 接受；`recordDocument(doc => append recorded marker)`；commit、recover 均拒绝；release/reopen。实际输出 `RECORDING-LOSS {"requests":["open","commit","recover","open"],"markers":[]}`。真实键盘 MIDI 录制也经 `adapters/midi.ts:38-73` 调用同一 `recordDocument`。已有 `recording-lifecycle.test.ts` 验证的是 teardown 前尚未 flush 的 journal，不涵盖本例。 | 未确认的独立录制操作必须保留到包含它们的 commit/recover 真正接受，或在 unrecovered 状态仍保留为可 drain 的 authored journal；不得仅因发出 recovery 就消费它们。补正常录制 commit→reject→recover reject→release/reopen 的行为回归，断言录制内容恰好保留一次。 |
| PC-02 | P1 | `apps/gpuix/src/project/model/persistence.ts:12-15,30-35,195-201` | **快照把 `(0,1)` 的一基 bar 坐标判为有效，允许不可打开的工程替换当前工程并返回 restore 成功。** 例如启用 loop 且 startBar=0.5 能通过完整 parse，native engine 明确拒绝；当前工程、history 已经被 hydrate 清掉，restore 却返回 true 且没有 snapshotError。Audio clip 的 startBar 也有同一个验证缺口。 | `positive(v)` 只要求 `v > 0`，`range()` 和 `isClip()` 将其用于 bar 起点；README 规定 musical coordinates one-based。消费端 `crates/engine/src/session.rs:145-152` 拒绝 enabled loop `start_bar < 1.0`，`crates/engine/src/mix/mod.rs:124-128` 拒绝 audio clip `start_bar < 1.0`。内存 storage + 复制该 native loop 判据的注入 backend 探针实际得到 `RESTORE-BOUNDARY {"restored":true,"name":"Invalid restored project","backendError":"rejected","snapshotError":null}`；单独 parse 探针也确认 startBar=0.5 被原样保留。未打开真实设备。 | 在解析边界区分 `bar >= 1` 和 `duration > 0`，对 loop/clip/marker/automation 的一基坐标使用前者；在任何 hydrate 前拒绝 payload。补 0、0.5、1 的边界回归，断言无效 restore 返回 false、原 document/undo 不变。 |
| PC-03 | P1 | `apps/gpuix/src/project/adapters/tracks.ts:74-90` | **复制 Group 会把原组与副本的整棵轨道树交错排列。** `duplicateTracks` 虽重映射 parent/child ID，却对每个原轨道立即插入副本；因此原组标题后先出现副本组标题，再穿插两组的子轨道，表头/车道/分组 rail 的视觉层级被打散。不是仅排序偏好：实际消费者按 document 顺序逐行布局，不能将这些行自动重组回子树。 | `source.flatMap(track => ... [updated, {...match.copy}])`。从 fixture 复制 `drums-group` 的实际顺序为 `["Drums","Drums Copy","trager","trager Copy","sidechain","sidechain Copy"]`，输出同时确认 trager/sidechain 仍属于 Drums，两个 Copy 属于 Drums Copy。消费链：`tracks/TrackMenu/index.tsx:50` 调用 `duplicateTracks`；`model/types.ts:224-245` 的 `visibleTracks` 只过滤隐藏项；`tracks/TrackRows/index.tsx:46-49` 与 `core/layout.ts:83-100` 按该顺序绘制。现有 `model/project.test.ts:93-110` 只检查 child IDs/routing，不检查子树顺序。 | 以完整选中分支为复制单元，先保持原 subtree 连续，再插入完整副本 subtree；同时维护父组的有序 membership。补展开/折叠组及嵌套组复制后的 document 顺序、可见行顺序和 routing 回归。 |
| PC-04 | P2 | `apps/gpuix/src/project/adapters/backend/native.ts:5-10` | **原生 backend 构造中 telemetry 注册失败会泄漏已打开的 session。** `openSession()` 已返回 handle，但 `subscribeTelemetry()` 抛错时还没有可返回的 backend/dispose 方法；connection 将 factory 异常转为 connection failure，却拿不到 handle 来清理。重试会继续创建新 session，直到进程退出的 env cleanup 才能释放旧 handle。 | Rust `crates/native/src/engine.rs:154-171` 已创建并登记 thread/handle；`:190-198` 的 telemetry 注册有 fallible TSFN build / sender.send 路径。TS 构造没有失败清理；connection `connection.ts:315-318` 捕获 factory 异常后只设 `backend = null`。安全的故障注入探针 mock 了三个 platform engine 函数（没有真实开设备）：open 返回 handle，subscribe 抛错；实际 `NATIVE-SETUP-LEAK {"opened":1,"disposed":0}`。 | 让构造具有异常安全性：handle 创建后注册 callback 的步骤用 try/catch 包住，失败时 dispose(handle) 后传播原始错误；补构造失败恰好释放一次的测试。 |

## Checked, no issue

以下为实际阅读到的路径中未发现额外可确认缺陷，并不替代完整 native/桌面验收：

- **S1 单 owner**：`runtime-state.ts` 是 runtime 可变状态的共同 owner；backend/editing/saving 模块未各自复制 history、editing 或 connection manager。`project-runtime.ts` 仅装配和 hydrate；history/effective-document 是值投影。
- **编辑 token/epoch**：initial session、hydrate、open、last release 轮转 editEpoch；edit/preview token 同时验证 owner ID 与 epoch；`useProjectEditGesture` 所依赖的 current-token API 可拒绝旧手势。嵌套 edit 的计数、owner 切换、preview/edit 互斥和 undo/redo 活动事务门禁有明确代码路径。
- **History**：`RuntimeOwner.pushHistory` 保持 100 条 cap、清空 redo；redo 只将此前 undo 弹出的条目放回 past。取消事务保留 pxPerBar/scrollX/scrollY；undo/redo 保留仍存在的 Clip editor。
- **已修的 committed workspace 保存**：`runtime-saving.ts` 同时投影 committed document/workspace，viewport 从当前 workspace 合并；`serializeProject` 与 `saveSnapshot` 都消费该投影，没有再次发现上轮未提交 workspace 泄漏。
- **Save fences**：保存捕获 storage 实例、key、epoch、revision 与 document/workspace 引用；后续 authored edit 不会被旧 save 标 clean；epoch 改变会退订旧 save；存储读取/写入失败分支保持 dirty/authored state。底层原子写由 storage port/native 提供，本切片没有第二条文件写路径。
- **Connection**：串行 dispatch、同 edit 的 queued preview 合并、cancel 清除 queued preview；ack session/sequence/revision 校验；Promise reject/throw 转为 connection failure；open/dispose 清空队列并 resolve idle waiters；老 epoch 的 ack/telemetry 回调被丢弃。
- **已修 telemetry fence**：旧 queued command 的 dispatch 使用 `Math.max(controlSequence, request.sequence)`，不再降低最新 requested control fence；telemetry 先 ack 缓冲、样本序列检查、appliedSequence 检查、无 lease/旧 session 丢弃、250ms interpolation cap 均存在。
- **原生正常生命周期**：构造/import default registration 不调用 openSession；first lease 创建 session；last release dispose；native adapter 的正常 dispose 幂等、清 listeners，已排队 callback 检查 disposed；PeakReader 转发当前 connection，不泄露 engine handle。
- **其他快照边界**：先 parse 再 hydrate；schema 白名单构造；v1 gridBars→v2 grid 转换；缺 metronome 默认 true、显式无效值拒绝；单 Main、全局 clip ID、局部 automation/note ID、routing/parent cycle、clip-track kind、source-window overflow/fade interval 检查均在边界。PC-02 是发现的明确一基坐标漏检，不是重新报告已修 graph/identity 问题。
- **Fixture/cutover**：生产 context 默认注册 native；fixture/mock 仅由测试入口显式配置；已删除 waveformPeaks 的生产状态管线没有重新出现。backend projection 不传 names/colors/view/PCM。
- **相关 domain 路径**：检查了 reducers/clone、clip move/resize/window、clipboard parse/placement、track routing/group projection、grid meter reconciliation、audio settings/device schema、layout track height 共用度量；除 PC-03 外未确认额外缺陷。未将设备 DSP/warp/pitch/MIDI synthesis/Browser placement 等已声明产品限制当作问题。

## 实际验证与证据文件

仅运行仓库外 scratch Bun tests，未改测试或实现。测试故意断言当前错误结果以确认 repro，不表示功能正确：

1. `bun test <session-local>/review-project-core-probes.test.ts`：2 pass；确认录制丢失及 parse 接受 startBar=0.5。
2. `bun test <session-local>/review-project-core-group.test.ts`：1 pass；确认分组复制后的交错行顺序。
3. `bun test <session-local>/review-project-core-native.test.ts`：1 pass；仅 platform engine 方法故障注入，确认构造失败未 dispose handle。
4. `bun test <session-local>/review-project-core-snapshot.test.ts`：1 pass；注入与 Rust 相同 loop 校验的 backend，确认 restore=true、当前工程被替换、backend rejected。

可复查脚本：`local://review-project-core-probes.test.ts`、`local://review-project-core-group.test.ts`、`local://review-project-core-native.test.ts`、`local://review-project-core-snapshot.test.ts`。未运行完整 test suite/tsc、Rust 编译、真实设备/桌面验证。所有 findings 均为代码/探针确认；没有把未确认推测列入表中。
