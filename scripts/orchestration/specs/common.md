# 通用要求（所有切片）

你是 zoeydaw gpuix 全量重构的一个并行 worker。先读 `AGENTS.md` 与 `apps/gpuix/AGENTS.md` 的路由表，再读 `docs/architecture/gpuix.md`（目标架构、硬规则、测试约定、完成定义）；**涉及可见界面时必读 `docs/architecture/gpuix-ui-standards.md`**，交付按其第 13 节逐条给证据。再动手。本切片的 Target/Ownership 在下方；不属于你的路径不要改。

- 基线：分支 `gpuix-migration`，提交 `d0db74c`。参考源码在 `apps/web/src/**`、`packages/**`、`src-tauri/**`（只读，迁移完成后统一删除，你不要删）。
- 原生能力放 `crates/native`、引擎放 `crates/engine`，能用 Rust 直接做的不要在 TS 里绕路。
- 需要 `pnpm native:build`（根目录）后才有 `@zoeydaw/native` 二进制。
- 每个切片都要真实运行：`bun --hot <入口>` 打开原生窗口，用 `computer` 的 AX/截图验证；不能只靠类型检查。只操作自己启动的窗口：`computer.window(...)` 加 AX `el.press()`、`observe()`/`screenshot()` 与窗口级输入。**不调用 `computer.control.acquire`**，它需要用户实时批准，本项目不用。
- 提交：自己的分支内多次小提交，每次一件事；标题避免 `+ & 和 与` 与多个 Conventional Commit 类型；`ultracite` 预提交门禁必须通过，不用 `--no-verify`。非交互提交带 `USER_CONFIRM_HASH=$(git write-tree)`——用户已授权本次重构任务内 `gpuix-migration` 及切片分支的全部本地提交（见 `docs/agents/setup.md`「提交授权」），不向用户或协调者索取“我确认”。
- 不 push，不碰 `main`，不碰其他 worktree，不启动或停止用户已有服务。
- 决策：自己路径内、可撤回、不改方向的事自己决定并在报告里写理由，规则没写到的也一样。需要改共享契约（`shared/theme`、`crates/native` 公共导出、`docs/architecture/gpuix.md`）、新增 npm/Rust 依赖、跨切片、与契约冲突，或属于根 `AGENTS.md`「决策默认归 Agent」清单的事：用 `orca orchestration ask` 问协调者，带上候选与建议。worker 不直接问用户。
- **不允许静默停下**:你一旦结束回合,协调者就收不到你的任何状态,只有发出的 Orca 消息才算上报。每次结束回合前必须已经发出其中一种:还有工作就继续做,不结束回合;等待协调者、其它切片或桌面时段,发 `orca orchestration ask`(它会阻塞到协调者 reply,把你直接唤醒);阶段完成,发 `merge_ready`;全部完成,发 `worker_done`。只在终端里写"等待中"不算上报。巡检会自动唤醒停在空闲状态、却没有关闭派发的 worker。
- 交付 `worker_done` 前：`tsc --noEmit`、`bun test`、（涉及 Rust）`cargo check` 与 `cargo test` 全部在你的 worktree 实跑通过；报告里写清命令、结果、未实现项及原因。不得把未实现的部分描述成完成。报告单列「错题」与「已验证做法」两节（LESSONS 格式）；不要直接改 `LESSONS.md`，由协调者整理。
- 涉及 Live 已有行为的切片，实现前先观察 Ableton Live，报告附「产品规则 → Live 观察 → 实现 → 差异/未验证」对照表。
- UI 以真实 Gallery 和业务组合视图作整体评审，按 `gpuix-ui-standards.md` 第 13 节执行；生成截图默认放仓库外或 Git 忽略目录，不批量提交逐按钮/逐状态 PNG。圆角、边框、gap、padding 通过共享组件与 token 统一调整。
- 卡在能力缺口或方案选择时，先用 Context7、GitHub 查最新方案（必要时请协调者用 Ego Browser 搜 X），把候选与实测证据随 `ask` 一起发。
- **进程清理(强制,用户明确要求)**:你启动的一切东西——`bun --hot` demo/gallery、测试用窗口、`cargo run` 的 spike、任何后台 service——**验证完立刻关闭,不要留到下一步**。窗口和进程会占用户本机的内存与 GPU。具体做法:启动时一律用带 `name` 的 bash service(`proc://<name>` 可见、可 `kill`),不要裸启动;每次截图/AX 验证拿到结果后马上 `write proc://<name>/kill`;`worker_done` 之前自己跑一遍 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"` 确认**零残留**,报告里附这条命令的输出。长时间存活的 demo(超过 5 分钟没有交互)视为泄漏。

## 交付前自审(强制,见 docs/architecture/gpuix.md「交付前自审与协调者仲裁」)

发 `worker_done` 之前依次做:① 在你的 worktree 根跑 `node scripts/gpuix-review-scan.mjs`,`HARD` 清零、`WARN` 逐条给结论;② 用 `task` 起一个 `pstack-reviewer` 只读子代理,按 Standards 与 Spec 两条轴审你自己的 diff(附完整 diff 命令与提交列表,Standards 轴要带上该文档的「代码质量底线」);③ 把发现分类为**必修 / 汇报仲裁 / 记录**:必修(违反成文规范、在你的路径内、修法唯一)你立刻修并重跑;汇报仲裁(涉及别的切片或共享契约、有多种方案、会改产品行为、你不确定)**先别动**,用 `orca orchestration ask` 汇报证据、方案与你的建议,由协调者统一决定并通知所有受影响的分支。报告里放『自审结果』表(发现/类别/处置/证据)。同一问题在多个切片出现时只修一次,修在拥有它的切片。协调者合并前会独立复跑扫描并抽查,表缺失或与扫描结果不符一律退回。
