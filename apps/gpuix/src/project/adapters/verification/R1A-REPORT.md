# R1a 交付证据

2026-10-16。范围为 `project/adapters`、`project/model`、`project/stores`，没有修改其它切片、Rust、依赖或共享契约。

## 实现

- `getCommittedWorkspace()` 投影事务开始时的 workspace 偏好，并合并当前 `pxPerBar`、`scrollX`、`scrollY`。序列化和保存使用同一投影。
- connection 派发队列项使用 `Math.max(controlSequence, request.sequence)`，不降低最新 requested telemetry fence。
- backend open、last release、registration replacement、active unregister 在取消活动 edit/preview 前禁止向旧 backend 提交。取消后显式归并 orphan recording journal，再清理 connection；journal 先清空后应用，hydrate/resetProject 丢弃旧工程 journal。
- 删除 `withWaveformPreview`、生产 `waveformPeaks` 字段及创建、resize、split、preview、hydrate 的生成路径。`mockWaveformPeaks` 只由测试调用，原生 session peak reader 保持唯一产品波形来源。
- adapters README 删除旧 Web/Tauri viewport、Canvas、CSS、ResizeObserver 和键盘说明，链接当前 gpuix 契约。

## 红绿证据

| 回归 | 修前 | 修后 |
| --- | --- | --- |
| `snapshots.test.ts`，事务内 Follow 改动后 serialize/save/cancel/restore | 期望 `true`，实际 `false` | committed Follow 恢复，实时视口保持 `80/240/70` |
| `backend/connection.test.ts`，commit 后排队两次 seek | 最新请求为 3，却发布 appliedSequence=2、bar=2 的旧帧 | 不发布旧帧，只发布 bar=3 |
| `runtime.test.ts`，edit/preview 及 recover 双拒绝后 release | 两例均期望 recorded marker，实际 `[]` | release、replacement、undo/redo 保留单条录制，project switch 不串写 |
| `runtime/recording-lifecycle.test.ts`，取消活动事务时旧 backend 同步拒绝 commit/recover | edit/preview × release/replace/unregister 六例全部丢 marker | 六例通过，旧 backend 只收到 open/preview，无 teardown 提交 |

同步拒绝回归来自独立审查发现，先复现后修复。真实 native backend 的 apply 是同步返回，不能只覆盖 deferred Promise 的拒绝。

## 变异

在 `apps/gpuix` 执行 `bun src/project/adapters/verification/mutations.mjs`。runner 先跑正常基线，再逐个改坏实现，结束或异常均还原源码；不能与其它读源码的测试并发运行。

| 变异                            | 失败测试数 |
| ------------------------------- | ---------: |
| serialize-uncommitted-workspace |          1 |
| save-uncommitted-workspace      |          1 |
| queued-control-fence-regression |          1 |
| drop-recording-before-teardown  |          4 |
| replay-recording-journal        |          3 |
| release-before-quiescing        |          2 |
| registration-before-quiescing   |          2 |
| unregister-before-quiescing     |          2 |

## 已执行验证

- `pnpm exec tsc --noEmit`，0 errors。
- `bun test src/project/adapters/runtime/recording-lifecycle.test.ts src/project/adapters/runtime.test.ts src/project/adapters/runtime/backend-registration.test.ts`，42 pass，0 fail。
- `bun test src/project/adapters src/project/model`，232 pass，1 existing todo，0 fail。此轮在新增同步 teardown 用例前执行，最终完整门禁包含这些新增用例。
- `bun src/project/adapters/verification/mutations.mjs`，8/8 捕获目标回归。
- 根目录 `pnpm verify:gpuix`，最后一轮所有阶段通过：renderer identity、native build、tsc 0 errors、eslint 0 warning、1184 pass / 1 existing todo / 0 fail、review scan 0 HARD / 1 WARN、UI map current、真实后端离屏应用 smoke。
- 最后一次离屏 smoke 输出 `nativePlaying=true`、`nativeBar=20.073118458`、`retainedBeforePresent=905.2087079999999`、`workspace=905.2087079999999`、`frames=21`，结束为 `released idle`。
- 额外直接运行无测试 preload 的 Bun 脚本，使用默认真实 native backend 和内存 snapshot storage，执行 beginEdit → setFollow → setViewport → serialize → save → cancel → restore。输出 `{"nativeSnapshot":"passed","follow":true,"scrollX":240,"backend":"ready"}`，finally 释放 runtime。
- 所有本地提交的 ultracite 预提交门禁通过，没有使用 `--no-verify`。
- 没有 Rust 源码改动，因此没有另跑 cargo check/test。

## 原生窗口与视觉适用范围

自己启动 `GPUIX_BACKGROUND=1 ZOEYDAW_ROUTE=/project/r1a-smoke bun --hot src/main.tsx`，service 名称 `r1a-native-smoke`，PID 69266，窗口 ID 124733。

AX 读到工程 `r1a-smoke`、BPM=120、Follow(on)、Play(off)、Engine。窗口截图保存在仓库外 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/omp-computer-15a797223611e245.png`。后台遮挡导致截图全黑，没有把它当视觉证据。取得证据后立刻 kill，service 存活 11.2 秒。

本切片没有可见 UI 改动。协调者已确认 UI standards 第 13 节视觉检查为“不适用”，不要求前台或 Gallery。实际行为验收由上述红绿回归、真实 backend 脚本和完整离屏 smoke 负责。

进程清理命令 `ps -axo pid,etime,command | grep -E 'bun .*--hot|cargo run|gallery|demo'` 输出为空，退出码 1，表示没有匹配残留。没有操作或停止用户服务。

## 产品规则与 Live 观察

只读 AX 观察现有 Live 窗口，没有输入、保存、录制或修改 Live 工程。

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| Follow 与 viewport 为工程 workspace，暂态编辑不进入保存 | AX 有走带、Arrangement 和录制分组 | 保存使用 committed 偏好，保留非事务 viewport | Live 内部事务、保存数据不可由只读 AX 证明；本轮不更改既定产品规则 |
| 最新控制 generation 拒绝旧 telemetry | AX 有回放与 Arrangement 时间线 | requested fence 单调 | Live 内部 command/telemetry 协议不公开，无直接对照 |
| 独立 authored recording 不因临时手势取消而丢失 | AX 有录制和捕捉分组 | teardown 先禁止旧 backend 提交，再归并 journal | 未在 Live 执行录制或制造后端错误，避免改用户工程 |
| 原生 session 为波形唯一来源 | AX 有垂直波形缩放控件 | 删除无消费者的旧 TS 峰值缓存 | 本轮未改变波形渲染，无视觉差异声明 |

## 自审结果

独立只读审查由 `pstack-reviewer` 完成，Standards 与 Spec 两条轴均审查。完整命令为 `git diff a04be5a..HEAD -- apps/gpuix/src/project/adapters apps/gpuix/src/project/model apps/gpuix/src/project/stores`。审查提交包括 ab2afc7、d0d2cc9、3d382c5、4293ce5，随后复核 ed334b3 的同步 teardown 修复。reviewer 不执行测试或改文件。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| teardown 禁止提交晚于 cancel，旧 backend 同步拒绝会丢录制 | 必修 | 四个入口在 cancel 前禁止提交，六条回归先红后绿，三项 guard 变异捕获 | `runtime/recording-lifecycle.test.ts`；reviewer 复核关闭 P1 |
| runtime 超过 600 行 | 记录 | 946 → 945 行，不跨 1000；规格明确排除本轮大文件拆分，不新建多状态 owner | 最终 scan 0 HARD、1 WARN；reviewer Standards 无新增违规 |
| `shared/model/types.ts` 的旧 waveformPeaks 字段 | 汇报仲裁 | 不越界修改；协调者通过 LSP 确认为未消费废弃副本，并负责主干删除 | Orca question 回复确认 |
| 首轮 verify 输出 tsc 错误却继续并打印 passed | 汇报仲裁 | 本轮 fixture 的 name 改为 Marker.label，独立 tsc 通过；共享脚本退出码问题已发送 escalation，由协调者处理 | 后续两轮完整门禁均明确 tsc 0 errors |

独立复核最终结论为 Standards 0 项新增缺陷，Spec 0 项未解决缺陷；仅保留 runtime 文件体量记录。

## 错题

- 错：只在 cancel 之后禁止旧 backend 提交。取消内部也会 flush recording，native 同步拒绝可在后续清理前吃掉 journal。对：所有 teardown/replacement 入口在取消之前关闭提交门禁，并覆盖 active unregister 的提前取消路径。
- 错：只覆盖 owner 已被 rejection 清空的异步失败路径。对：补活动 edit/preview 的同步拒绝组合回归，断言录制数据与旧 backend 请求序列。
- 错：把 verify 最后一行 passed 当作所有阶段成功。对：检查各阶段输出，类型错误必须独立修正并复跑；共享门禁退出码缺陷上报协调者。

## 已验证做法

- committed 偏好与实时 viewport 在 runtime 单一投影中分离，serialize/save 共用该投影。
- journal 先清空再应用，release/reopen、backend replacement、undo/redo 和 project switch 有行为回归。
- 变异入口验证指定回归确实失败，并拒绝 SyntaxError/ParseError 充当有效变异。
- 自建后台窗口只用自己的 PID 定位，取得 AX 与截图后立即关闭。

## 边界

R1a 指定实现项均已完成。runtime 大文件拆分明确不在本切片。共享门禁退出码与废弃 shared model 由协调者处理，不作为本切片完成能力。
