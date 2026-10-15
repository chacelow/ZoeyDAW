# gpuix 重构的协调方式

适用于协调者会话(maintainer)与它派发的切片 worker。切片规格只写各切片的目标与验收;协调规则以本文为准。

## 决策权(2026-10-15 用户授权)

协调者是 maintainer:自己 review、自己批准合入、自己做技术决策,不把决定推回给用户。

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
- 新增 npm/Rust 依赖(根 `AGENTS.md` 的 Ask first 仍然有效)。

拿不准时,按「这件事能不能在不打扰用户的前提下撤回」判断:能撤回就自己决定,并在汇报里说明理由。

## 加载路径(为什么要有本文)

omp 从会话的工作目录向上找 `AGENTS.md` 注入系统提示。worker 起在 gpuix-migration 的子 worktree,读到的是 gpuix-migration 分支的规则;协调者如果起在仓库根(`main`),读到的就是旧规则。所以:

- 协调者会话的工作目录应当是 `gpuix-migration` worktree。起在别处时,开工先读本文与该分支的 `AGENTS.md`、`LESSONS.md`。
- 所有长期规则写进 gpuix-migration 分支的文件,不只留在会话里。
- 协调用的脚本与切片规格放在 `scripts/orchestration/`,纳入版本管理(见下)。

## 流程

**派发**:`scripts/orchestration/start-worker.sh <worktree> <标题> <规格文件...>`。它把新 worktree 的 Orca 父级固定为 gpuix-migration,保证所有切片挂在同一棵树下。规格 = `common.md` +(B2 切片再加 `b2-common.md`)+ 本切片规格。

**worker 模型固定为 `cursor-claude/cx/gpt-6.1-sol`(2026-10-15 用户要求)**:派发时手动指定,不依赖全局 omp 默认模型(其他会话可能改它)。Orca 拒绝 `worker-start --agent omp --model`,所以脚本先建 worktree,再开一个运行 `omp --model …` 的终端,最后用 `worker-start --terminal` 交付规格。不要直接调用 `worker-start --agent omp`;临时起的 Orca 工作区 agent 同样用 `omp --model cursor-claude/cx/gpt-6.1-sol` 启动。

**回答问题**:worker 的 `question` 一律用 `orca orchestration reply --id`;`send` 用于通知。

**合并前复核**:不信报告,自己在临时 worktree 里与主干合并后跑 tsc、bun test、eslint、`gpuix-review-scan`,做关键变异,比对失败名单与主干基线。改动了补丁序列的,先重建共享 vendor 再看结果。合入后释放 worker 终端、删除已合入的 worktree、确认没有残留进程。

**共享资源只有一个 owner**:

- 共享度量(`control-metrics.json`)由协调者统一加入主干,每个值都要有来源(web 文件行号或 Live 实测),不接受估算。
- 共享组件发现两份实现时,由协调者抽到 `shared/` 或拥有它的切片,另一份删除。
- vendor 补丁序列的变更合入后,由协调者重建共享 vendor 并通知各 worker。

**桌面时段**:真实窗口输入一次只给一个 worker,用 reply 给出 UTC 起止时间,同时通知其余 worker 暂停输入;到点就停,发「桌面释放」。

**巡检**:launchd 每 5 分钟运行 `scripts/orchestration/coordinator-tick.sh`,检查所有派发未关闭的 worker(包括终端状态为 retained 的空闲 worker)。三种情况会被自动唤醒,同一个 worker 每 10 分钟最多唤醒一次:

- IDLE:回合已结束(TUI 空闲)超过 3 分钟,但派发没关。worker 在这个状态下无法主动上报,唤醒提示会要求它继续做,或者用 `ask` 发出等待原因。
- STALE:会话 10 分钟没有新消息。
- ERROR:最后一条消息是模型报错,比如流超时。

协调者空闲时也会收到一次巡检提示。worker 端的规则是不允许静默停下,写在 `specs/common.md`。

## 文件

| 文件 | 作用 |
| --- | --- |
| 本文 | 决策权、加载路径、流程 |
| `LESSONS.md` 的「gpuix 迁移」各节 | 已经踩过的坑及对应做法 |
| `scripts/orchestration/specs/` | `common.md`、`b2-common.md` 与各切片规格 |
| `scripts/orchestration/*.sh` | 派发、健康检查、定时巡检；`listen.sh [ack] [timeout]` 是协调者唯一的消息监听入口，启动前先清掉残留的等待进程（Orca 每个 run 只允许一个等待者，残留会让之后的监听报 `waiter_exists`） |
