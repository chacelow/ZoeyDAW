# gpuix 重构的协调方式

适用于协调者会话(maintainer)与它派发的切片 worker。切片规格只写各切片的目标与验收;协调规则以本文为准。

## 决策权(用户授权:2026-10-14 12:40、14:47、15:35;2026-10-15 02:31、08:35 前后,均为 UTC)

协调者是 maintainer,做决策性的 review 与 approve,不是转发者。问用户的范围只有根 `AGENTS.md`「决策默认归 Agent」那张封闭清单;清单外的一切,包括规则没写到的新情况,都自己判断并执行,汇报里写理由。`gpuix-migration` 及其切片分支的本地提交(含合并提交)已授权,细节见 [setup](setup.md)「提交授权」。

下面是已经发生过、容易被误判成要问用户的例子,只是举例,不是边界:接口与 owner 仲裁;大模块替换或重写(方向不变、收益明确,花再多时间也做);新增、拆分、重派、退回切片;共享 UI 公共 API 与 vendor 补丁;只读观察 Live 及选中、悬停、滚动;收紧测试与扫描;本分支合并提交;桌面时段分配;worker 的工具与权限卡点;关闭已完成终端、删除已合入 worktree。

属于清单的事(例如新增依赖)由 worker 先 ask 协调者,协调者核实必要性、准备比较表与建议后再问用户。

**协调者的职责边界**:

- **用户只和协调者对话**(2026-10-15 用户原话:"我主要和你对话,其他都是你来调")。协调者用 Opus 5.5,它调起的所有 Agent 用 gpt-6.1-sol。汇报里不出现"新协调者/临时 agent"之类需要用户分辨的角色。
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

1. `orca orchestration worker-release` 释放 worker 终端。返回 `user_takeover` 是因为 `start-worker.sh` 先建终端再交给 Orca,不代表用户接管;确认终端 TUI 空闲、派发已 completed 后,协调者直接 `orca terminal close --terminal <handle> --tab`,不留给用户。只有用户亲自开的终端才不碰。
2. `orca worktree rm --worktree path:<dir>`(不加 `--force`)删除已合入的 worktree 与分支,步骤见 LESSONS「切片合入后立即删 worktree」;复核用的 `/tmp` worktree 用完就 `git worktree remove`。
3. `ps` 确认该切片启动的 demo、gallery、service 已结束。

后续复验或返工另开新 worktree 加新 Dispatch。确实要保留的 worktree,必须用 `orca worktree set --worktree path:<dir> --comment "保留:<原因>;删除条件:<条件>"` 写明,并列进每次汇报。没有这条 comment 的已合入 worktree 视为漏删。

**共享资源只有一个 owner**:

- 共享度量(`control-metrics.json`)由协调者统一加入主干,每个值都要有来源(web 文件行号或 Live 实测),不接受估算。
- 共享组件发现两份实现时,由协调者抽到 `shared/` 或拥有它的切片,另一份删除。
- vendor 补丁序列的变更合入后,由协调者重建共享 vendor 并通知各 worker。

**桌面时段**:真实窗口输入一次只给一个 worker,用 reply 给出 UTC 起止时间,同时通知其余 worker 暂停输入;到点就停,发「桌面释放」。worker 只操作自己启动的窗口,用 `computer.window(...)` 加 AX `el.press()`、`win.observe()`/`screenshot()` 与窗口级输入,**不调用 `computer.control.acquire`**(它要人类实时批准,本项目不用;app-shell 阶段 1、clip-lane、a3b 都是这样完成的)。worker 被工具或权限卡住时,协调者先查以前切片的做法给出可行路线,不转问用户。

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
2. 在 `gpuix-migration` worktree 用 `omp --model cursor-claude/cc/claude-opus-5-5` 起新终端;新协调者在自己的终端执行 `orca orchestration run-use --id <run>`,导入 TODO,把 `coordinator-tick.sh` 的 `COORD` 改成自己的终端,写回执 `ACCEPTED.json`(实际终端、Run、TODO 计数、主干 HEAD)。规则文件改动后不需要交接,在协调者终端 `/restart` 即可重新注入 `AGENTS.md`,上下文、TODO 与 Run 绑定保留。`/restart` 沿用进程启动时的 `--model`:当前协调者终端(term_abc5c16c)是以 `--model cursor-claude/cx/gpt-6.1-sol` 启动的,每次重启后都要再执行 `/model:cursor-claude/cc/claude-opus-5-5`。
3. 旧协调者核对 `run-show` 与回执,把自己的 TODO 标为已移交(不是完成),告诉用户可以关闭。
4. HANDOFF 只写现场和指针,不复述或改写本文规则;规则有冲突就先改本文,再交接。

## 文件

| 文件 | 作用 |
| --- | --- |
| 本文 | 决策权、加载路径、流程 |
| `LESSONS.md` 的「gpuix 迁移」各节 | 已经踩过的坑及对应做法 |
| `scripts/orchestration/specs/` | `common.md`、`b2-common.md` 与各切片规格 |
| `scripts/orchestration/*.sh` | 派发、健康检查、定时巡检；`listen.sh [ack] [timeout]` 是协调者唯一的消息监听入口，启动前先清掉残留的等待进程（Orca 每个 run 只允许一个等待者，残留会让之后的监听报 `waiter_exists`） |
