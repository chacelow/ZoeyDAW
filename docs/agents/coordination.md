# gpuix 重构的协调方式

适用于协调者会话(maintainer)与它派发的切片 worker。切片规格只写各切片的目标与验收;协调规则以本文为准。

## 决策权(用户授权:2026-10-14 12:40、14:47、15:35;2026-10-15 02:31,均为 UTC)

协调者是 maintainer:自己 review、自己批准合入、自己做技术决策,不把决定推回给用户。`gpuix-migration` 及其切片分支的本地提交(含合并提交)已授权,不再向用户索取"我确认",细节见 [setup](setup.md)「提交授权」。

**协调者直接决定,不问用户**:

- 接口、契约、共享度量、目录与 owner 的划分;切片之间的仲裁。
- 性能优化,包括替换或重写一个大模块:只要方向不变、收益明确,花的时间再多也要做。
- 新增或调整切片;拆分、合并、重派;退回不合格的交付。
- 共享 UI 公共 API 的修改、vendor 补丁的新增(经评审)、临时 vendor 根的使用。
- 只读观察 Live,以及在 Live 里做不改工程内容的操作(选中、悬停、滚动)。
- 测试、lint、扫描规则的收紧。

**仍然先问用户**:

- 偏离产品方向:改变产品规则、交互语义,或放弃已定的方向(例如回到 web/Tauri、不再对齐 Live)。
- 大改:推翻已定的架构决策(渲染器方案 B、Firewheel 引擎、单窗口单工程)。
- 不可逆或影响用户机器与数据的操作:改 Live 的工程内容、改系统设置、删除用户文件、远程写入(push、发 PR、发布)。
- 新增 npm/Rust 依赖(根 `AGENTS.md` 的 Ask first 仍然有效)。worker 先 ask 协调者,协调者核实必要性后再问用户。

**协调者的职责边界**:

- **只统筹,不包办实现**。业务实现与返工交给对应切片的 worker;协调者写的只有合并、冲突解决、共享契约/规范/脚本和复核用的临时探针。
- **能并行的先派出去**。不要让一条调查或验证链拖住其它切片;先派,再在等待期间复核。
- **卡点由协调者主动解阻**:worker 遇到能力缺口或方案分歧时,协调者自己(或让 worker)用 Context7、GitHub、已登录的 Ego Browser(X 上的作者与项目)找最新方案,社交帖子只作线索,结论以源码、文档和实测为准。
- **向用户汇报**:每次汇报写合入了什么、批准/否决了什么及理由、仍未验证什么;方向性取舍(上面「仍然先问用户」)带比较表与建议。
- **LESSONS 只由协调者改**:worker 在报告里写「错题」和「已验证做法」两节,协调者整理进 LESSONS,避免并行改同一文件。
- **用户后来的指令取代旧条款**:直接改写旧条款,写明日期与原话,不在旁边叠加例外;发现两份文件冲突,当场统一,再通知所有 worker。

拿不准时,按「这件事能不能在不打扰用户的前提下撤回」判断:能撤回就自己决定,并在汇报里说明理由。

## 加载路径(为什么要有本文)

omp 从会话的工作目录向上找 `AGENTS.md` 注入系统提示。worker 起在 gpuix-migration 的子 worktree,读到的是 gpuix-migration 分支的规则;协调者如果起在仓库根(`main`),读到的就是旧规则。所以:

- 协调者会话的工作目录必须是 `gpuix-migration` worktree,启动命令 `omp --model cursor-claude/cc/claude-opus-5-5`。起在别处时,开工先读本文与该分支的 `AGENTS.md`、`LESSONS.md`。
- `AGENTS.md` 只在会话启动时注入,压缩后不会重读。入口文件改了,正在运行的会话要么手动读改后的文件,要么重启(见下面「交接」)。
- 所有长期规则写进 gpuix-migration 分支的文件,不只留在会话里。用户在会话里给的规则,当轮就写进对应文件。
- 协调用的脚本与切片规格放在 `scripts/orchestration/`,纳入版本管理(见下)。

## 流程

**派发**:`scripts/orchestration/start-worker.sh <worktree> <标题> <规格文件...>`。它把新 worktree 的 Orca 父级固定为 gpuix-migration,保证所有切片挂在同一棵树下。规格 = `common.md` +(B2 切片再加 `b2-common.md`)+ 本切片规格。

**模型按角色固定(2026-10-15 03:19 UTC 用户要求固定模型;同日 08:20 前后用户明确协调者用 Opus 5.5)**:协调者用 `cursor-claude/cc/claude-opus-5-5`;worker、临时起的 Orca 工作区 agent 用 `cursor-claude/cx/gpt-6.1-sol`。启动时手动指定,不依赖全局 omp 默认模型(其他会话可能改它)。Orca 拒绝 `worker-start --agent omp --model`,所以脚本先建 worktree,再开一个运行 `omp --model …` 的终端,最后用 `worker-start --terminal` 交付规格。不要直接调用 `worker-start --agent omp`。实现派工一律走 Orca worker,不用 omp `task` 子代理代替;`task` 只用于 worker 交付前的只读自审。

**回答问题**:worker 的 `question` 一律用 `orca orchestration reply --id`;`send` 用于通知。

**合并前复核**:不信报告,自己在临时 worktree 里与主干合并后跑 tsc、bun test、eslint、`gpuix-review-scan`,做关键变异,比对失败名单与主干基线。改动了补丁序列的,先重建共享 vendor 再看结果。

**释放(2026-10-14 15:26、2026-10-15 01:44 用户要求)**:切片合入并核对后当场做完三件事,不为"可能复用上下文"保留:

1. `orca orchestration worker-release` 释放 worker 终端;用户接管(`user_takeover`)的终端请用户在 Orca 里关,Agent 不 kill。
2. `orca worktree rm --worktree path:<dir>`(不加 `--force`)删除已合入的 worktree 与分支,步骤见 LESSONS「切片合入后立即删 worktree」;复核用的 `/tmp` worktree 用完就 `git worktree remove`。
3. `ps` 确认该切片启动的 demo、gallery、service 已结束。

后续复验或返工另开新 worktree 加新 Dispatch。确实要保留的 worktree,必须用 `orca worktree set --worktree path:<dir> --comment "保留:<原因>;删除条件:<条件>"` 写明,并列进每次汇报。没有这条 comment 的已合入 worktree 视为漏删。

**共享资源只有一个 owner**:

- 共享度量(`control-metrics.json`)由协调者统一加入主干,每个值都要有来源(web 文件行号或 Live 实测),不接受估算。
- 共享组件发现两份实现时,由协调者抽到 `shared/` 或拥有它的切片,另一份删除。
- vendor 补丁序列的变更合入后,由协调者重建共享 vendor 并通知各 worker。

**桌面时段**:真实窗口输入一次只给一个 worker,用 reply 给出 UTC 起止时间,同时通知其余 worker 暂停输入;到点就停,发「桌面释放」。

**巡检(2026-10-15 01:45、01:49 UTC 用户要求)**:launchd 每 10 分钟运行 `scripts/orchestration/coordinator-tick.sh`,检查所有派发未关闭的 worker(包括终端状态为 retained 的空闲 worker)。判断依据是该 worker 会话最后一条消息距现在的时间。同一个 worker 每 10 分钟最多唤醒一次:

- ASKING:该 worker 发出的 `question` 还没有回复。不唤醒 worker,把消息 id 交给协调者,协调者用 `reply --id` 回答。worker 停下时,先查这一项。
- IDLE:回合已结束(TUI 空闲)超过 3 分钟,但派发没关,也没有待回复的 question。唤醒提示要求它继续做,或者用 `ask` 发出等待原因。
- STALE:会话 10 分钟没有新消息。
- ERROR:最后一条消息是模型报错,比如流超时。

协调者空闲时也会收到一次巡检提示。worker 端的规则是不允许静默停下,写在 `specs/common.md`。

**协调者的 loop(2026-10-15 02:58 UTC 用户要求)**:`/loop` 只发一句短提示,规则全在文件里,不每轮重读:

```
/loop 继续:处理 listen.sh 的积压消息并推进未完成切片;无事可做就继续 listen。
```

**交接协调者(2026-10-15 07:12 UTC 用户要求)**:

1. 旧协调者停止派发和收消息,写交接目录:HANDOFF.md(用户当前要求、Run、活跃 Dispatch、未处理消息、未提交现场、保留的 worktree 及原因)、完整 TODO(completed/abandoned/open 分开,不把未完成标完成)。
2. 在 `gpuix-migration` worktree 用 `omp --model cursor-claude/cc/claude-opus-5-5` 起新终端;新协调者在自己的终端执行 `orca orchestration run-use --id <run>`,导入 TODO,把 `coordinator-tick.sh` 的 `COORD` 改成自己的终端,写回执 `ACCEPTED.json`(实际终端、Run、TODO 计数、主干 HEAD)。规则文件改动后不需要交接,在协调者终端 `/restart` 即可重新注入 `AGENTS.md`,上下文、TODO 与 Run 绑定保留。
3. 旧协调者核对 `run-show` 与回执,把自己的 TODO 标为已移交(不是完成),告诉用户可以关闭。
4. HANDOFF 只写现场和指针,不复述或改写本文规则;规则有冲突就先改本文,再交接。

## 文件

| 文件 | 作用 |
| --- | --- |
| 本文 | 决策权、加载路径、流程 |
| `LESSONS.md` 的「gpuix 迁移」各节 | 已经踩过的坑及对应做法 |
| `scripts/orchestration/specs/` | `common.md`、`b2-common.md` 与各切片规格 |
| `scripts/orchestration/*.sh` | 派发、健康检查、定时巡检；`listen.sh [ack] [timeout]` 是协调者唯一的消息监听入口，启动前先清掉残留的等待进程（Orca 每个 run 只允许一个等待者，残留会让之后的监听报 `waiter_exists`） |
