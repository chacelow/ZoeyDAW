# gpuix 重构的协调方式

适用于协调者会话(maintainer)与它派发的切片 worker。切片规格只写各切片的目标与验收;协调规则以本文为准。

## 决策权(用户授权:2026-10-14 12:40、14:47、15:35;2026-10-15 02:31、08:35 前后,均为 UTC)

协调者是 maintainer,做决策性的 review 与 approve,不是转发者。问用户的范围只有根 `AGENTS.md`「决策默认归 Agent」那张封闭清单;清单外的一切,包括规则没写到的新情况,都自己判断并执行,汇报里写理由。`gpuix-migration` 及其切片分支的本地提交(含合并提交)已授权,细节见 [setup](setup.md)「提交授权」。

下面是已经发生过、容易被误判成要问用户的例子,只是举例,不是边界:接口与 owner 仲裁;大模块替换或重写(方向不变、收益明确,花再多时间也做);新增、拆分、重派、退回切片;共享 UI 公共 API 与 vendor 补丁;只读观察 Live 及选中、悬停、滚动;收紧测试与扫描;本分支合并提交;桌面时段分配;worker 的工具与权限卡点;关闭已完成终端、删除已合入 worktree。

属于清单的事(例如新增依赖)由 worker 先 ask 协调者,协调者核实必要性、准备比较表与建议后再问用户。

**协调者的职责边界**:

- **用户只和协调者对话**(2026-10-15 用户原话:"我主要和你对话,其他都是你来调")。2026-10-17 PC 接管沿用原主编排会话与四个 lane 会话；本轮启动模型均固定为 `cursor-claude/cx/gpt-6.1-sol`。用户不需要分辨临时角色。
- **主动排查与审查,不把收尾留给用户**:每轮主动核对所有 Workspace、终端、进程与派发状态,发现漏清理、停滞、规则冲突当场处理。
- **只统筹,不包办实现**。业务实现与返工交给对应切片的 worker;协调者写的只有合并、冲突解决、共享契约/规范/脚本和复核用的临时探针。
- **能并行的先派出去**。不要让一条调查或验证链拖住其它切片;先派,再在等待期间复核。
- **卡点由协调者主动解阻**:worker 遇到能力缺口或方案分歧时,协调者自己(或让 worker)用 Context7、GitHub、已登录的 Ego Browser(X 上的作者与项目)找最新方案,社交帖子只作线索,结论以源码、文档和实测为准。
- **向用户汇报**:只在阶段性成果或清单内事项时汇报。写合入了什么、批准/否决了什么及理由、仍未验证什么、每个 Workspace 一行的状态;清单内事项带比较表与建议。
- **LESSONS 只由协调者改**:worker 在报告里写「错题」和「已验证做法」两节,协调者整理进 LESSONS,避免并行改同一文件。
- **用户后来的指令取代旧条款**:直接改写旧条款,写明日期与原话,不在旁边叠加例外;发现两份文件冲突,当场统一,再通知所有 worker。

拿不准时按根 `AGENTS.md` 的三问自己判;规则冲突或没覆盖到,选更保守、可撤回的做法,事后补进规则。

## 加载路径(为什么要有本文)

omp 从会话的工作目录向上找 `AGENTS.md` 注入系统提示。worker 起在 gpuix-migration 的子 worktree,读到的是 gpuix-migration 分支的规则;协调者如果起在仓库根(`main`),读到的就是旧规则。所以:

- 协调者会话的工作目录必须是 `gpuix-migration` worktree。PC 接管使用原会话的显式 `--resume`，启动时固定 `--model cursor-claude/cx/gpt-6.1-sol`。起在别处时，开工先读本文与该分支规则、`LESSONS.md`。
- `AGENTS.md` 只在会话启动时注入,压缩后不会重读。入口文件改了,正在运行的会话要么手动读改后的文件,要么重启(见下面「交接」)。
- 所有长期规则写进 gpuix-migration 分支的文件,不只留在会话里。用户在会话里给的规则,当轮就写进对应文件。
- 协调用的脚本与切片规格放在 `scripts/orchestration/`,纳入版本管理(见下)。

## 流程

**模块派发（2026-10-17 用户要求）**：一个 Agent 负责一个内聚的大模块，包含功能实现、相关修复与集成验收，不把几行文案、测试文件或 README 拆成独立 lane。模块内分可运行里程碑，按实现、运行、观察、反馈修正推进，每个有效阶段立即提交。优先复用熟悉该模块的原 lane 与会话，只补充当前基线、变更契约和未完项；启动前由协调者检查 CLI、Git 路径、依赖身份与实际平台，不让所有 worker 各自探索同一个环境问题。macOS 使用 `lane.sh assign`；PC 显式在已结算、已合入且干净的 lane 建任务分支，用同一终端 `worker-start --terminal`，中断恢复用原会话 resume。返工在原分支继续，不混入历史撤回或已结束派发。

**模型按角色固定**：2026-10-17 PC 接管的协调者与四个原 lane 均以 `cursor-claude/cx/gpt-6.1-sol` resume，显式指定模型，不依赖全局默认值。Orca 拒绝 `worker-start --agent omp --model`，所以先起固定模型的 omp 终端，再用 `worker-start --terminal` 绑定派发。原 lane 保留会话和 worktree，不以新 agent 替代；实现派工一律走 Orca worker，`task` 只用于只读自审。

**回答问题**:worker 的 `question` 一律用 `orca orchestration reply --id`;`send` 用于通知。

**合并前复核**：固定 SHA 与明确基线，协调者阅读实际生产 diff、native 补丁、关键测试和接口调用链，独立审查只能补充，不能替代这一判断。检查重复设计、无效测试、注释式改动、目录和报告污染，再在临时合入树复跑受影响检查并观察真实行为。发现问题以具体文件、原因和验收退回原 lane；不因测试数量多或报告声称通过就接受。历史合并提交的文件总量不算本轮产出，源码变更与证据变更分开评价。

**消息与复核分离**：收到 `merge_ready` 立即登记固定 SHA、owner、复核状态，并回复阻塞中的问题；登记后即可 ack，该 Delivery 的确认不表示批准合入。然后继续消费后续批次，不让一条待 review 消息堵住整个 FIFO。每轮优先回答 question，再处理升级和交付；之后才做深审。`worker_done` 的终端要明确保留或复用，已结束派发不再发送生命周期消息。只保留一个 listener，由 OMP loop 驱动，不定时向用户刷进度。


**合入后（2026-10-16 用户要求，取代 2026-10-14/15“合入即删”的旧规则）**：切片合入并核对后，lane 保留，供下一个任务复用：

1. 不关终端，不删 worktree。确认派发已 completed、`git status` 干净、分支已包含在主干里，它就是空闲 lane。
2. `ps` 确认该任务启动的 demo、gallery、service 已经结束。
3. lane 数量按需要的并行度保持，空闲太久或上下文已经太长的 lane，按旧流程释放：`worker-release`，`orca terminal close --terminal <handle> --tab`，`orca worktree rm --worktree path:<dir>`（不加 `--force`）。复核用的 `/tmp` worktree 用完就 `git worktree remove`。

返工或复验派给原 lane（它对这块代码最熟），不另开新 worktree。

**共享资源只有一个 owner**:

- 共享度量(`apps/gpuix/src/shared/theme/metrics/control-metrics.json`)由协调者统一加入主干,每个值都要有来源(迁移时的历史文件记录或 Live 实测),不接受估算。
- 共享组件发现两份实现时,由协调者抽到 `shared/` 或拥有它的切片,另一份删除。
- vendor 补丁序列的变更合入后,由协调者重建共享 vendor 并通知各 worker。

**桌面时段**：真实窗口输入一次只给一个 worker，给出绝对 UTC 起止并通知其它 lane 暂停输入。只操作自己启动的窗口，遵守 computer 工具实时批准边界；工具拒绝或时段过期即停止，不用另一种输入机制绕过。可用离屏或程序自身的验证入口补充不依赖真实输入的证据，但必须分别标明已验证行为与未验证物理输入，不能等同。

**巡检（2026-10-17 用户要求）**：主编排用 OMP 内置 `/loop` 驱动，不用计划任务、launchd 或脚本定时向终端发提示。每轮先处理 listener 交付的消息，再用 `worker-list` 判断以下状态。`unverifiable` 不是死亡，不重启、不重复派发；同一 worker 的提醒需节流：

- ASKING:该 worker 发出的 `question` 还没有回复。不唤醒 worker,把消息 id 交给协调者,协调者用 `reply --id` 回答。worker 停下时,先查这一项。
- IDLE:回合已结束(TUI 空闲)超过 3 分钟,但派发没关,也没有待回复的 question。唤醒提示要求它继续做,或者用 `ask` 发出等待原因。
- STALE:会话 10 分钟没有新消息。
- ERROR:最后一条消息是模型报错,比如流超时。

worker 端的规则是不允许静默停下，写在 `specs/common.md`。

**协调者的 loop(2026-10-15 02:58 UTC 用户要求)**:`/loop` 只发一句短提示,规则全在文件里,不每轮重读:

```
/loop 继续:处理当前平台 listener 的积压消息并推进未完成切片;无事可做就继续 listen。
```

### PC 消息运行时

`scripts/orchestration/runtime.mjs` 读取仓库外的 binding JSON，字段为 `runId`、`coordinator`、`executable` 和 `intervalMs`。`executable` 是实际用于读取 Orca 指南的 CLI 路径，`intervalMs` 为 `300000`。不在源文件里写机器目录、Run ID 或终端 handle。

- `node scripts/orchestration/runtime.mjs listen <binding.json> [processed-delivery-id]` 调用新 Run 的 `check --wait`，等待一次 Delivery 或五分钟超时。只把已处理完成的 Delivery ID 作为可选参数；没有参数时不 ack。
- 一个 Run 只启动一个 listener。Delivery 到达后先逐条处理，question 用 `reply --id`，然后用上述可选参数 ack 并继续等待。超时后重新 listen；监听错误不得自行清除其它会话的进程。
- PC Orca 不持有 Mac Run 的生命周期。跨机器接管创建一个新 Run，四个原会话用 `worker-start --terminal` 接入，只接受新派发的生命周期 ID；分支内容以 PC 为准。


**交接协调者(2026-10-15 07:12 UTC 用户要求)**:

1. 旧协调者停止派发和收消息,写交接目录:HANDOFF.md(用户当前要求、Run、活跃 Dispatch、未处理消息、未提交现场、保留的 worktree 及原因)、完整 TODO(completed/abandoned/open 分开,不把未完成标完成)。
2. 在 `gpuix-migration` worktree 显式固定模型并 resume 原会话。同一 Orca runtime 用 `run-use --id <run>` 绑定；跨机器 runtime 创建新 Run，再用 `worker-start --terminal` 接回原 lane。保留完整 TODO，更新 listener binding 的 `coordinator`，写回执 `ACCEPTED.json`，记录实际终端、Run、TODO 计数与主干 HEAD。规则更新后需要重新注入时使用 `/restart`，它沿用启动时的显式模型；不通过历史终端 handle 切换模型。
3. 旧协调者核对 `run-show` 与回执,把自己的 TODO 标为已移交(不是完成),告诉用户可以关闭。
4. HANDOFF 只写现场和指针,不复述或改写本文规则;规则有冲突就先改本文,再交接。

## 文件

| 文件 | 作用 |
| --- | --- |
| 本文 | 决策权、加载路径、流程 |
| `LESSONS.md` 的「gpuix 迁移」各节 | 已经踩过的坑及对应做法 |
| `scripts/orchestration/specs/` | `common.md`、`b2-common.md` 与各切片规格 |
| `scripts/orchestration/runtime.mjs` 与旧 `*.sh` | PC 用可移植的 `runtime.mjs listen` 收消息，巡检由 OMP `/loop` 驱动；旧 shell 脚本保留给原 macOS 运行时，不在 PC 执行。一个 Run 只保留一个等待者，先处理消息再 ack。 |
