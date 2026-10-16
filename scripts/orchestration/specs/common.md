# 通用要求（所有切片）

你是 zoeydaw gpuix 全量重构的一个并行 worker。先读 `AGENTS.md` 与 `apps/gpuix/AGENTS.md` 的路由表，再读 `docs/architecture/gpuix.md`（目标架构、硬规则、测试约定、完成定义）；**涉及可见界面时必读 `docs/architecture/gpuix-ui-standards.md`**，交付按其第 13 节逐条给证据。再动手。本切片的 Target/Ownership 在下方；不属于你的路径不要改。

- 基线是本次派发明确给出的固定提交与当前分支，不沿用历史规格的迁移起点。旧 Web/Tauri 与共享 packages 已删除，不再把它们当可读参考。只在确需追溯时用 Git 历史读取。
- 原生能力放 `crates/native`、引擎放 `crates/engine`，能用 Rust 直接做的不要在 TS 里绕路。
- 需要 `pnpm native:build`（根目录）后才有 `@zoeydaw/native` 二进制。
- 验证本轮实际改动路径。界面用真实 gpuix，后端用真实引擎；工具规则运行真实 CLI。复用已取得且仍适用的证据，不每个里程碑重复完整验收。离屏用 `createTestRoot`，窗口用自己启动的命名 service，验完立即关闭。后台窗口不保证帧推进；操作真实窗口必须满足 computer 工具实时批准边界，不绕过前台锁或改用另一种注入机制。
- 提交：自己的分支内多次小提交，每次一件事；标题避免 `+ & 和 与` 与多个 Conventional Commit 类型；`ultracite` 预提交门禁必须通过，不用 `--no-verify`。非交互提交带 `USER_CONFIRM_HASH=$(git write-tree)`——用户已授权本次重构任务内 `gpuix-migration` 及切片分支的全部本地提交（见 `docs/agents/setup.md`「提交授权」），不向用户或协调者索取“我确认”。
- 不 push，不碰 `main`，不碰其他 worktree，不启动或停止用户已有服务。
- 决策：自己路径内、可撤回、不改方向的事自己决定并在报告里写理由，规则没写到的也一样。需要改共享契约（`shared/theme`、`crates/native` 公共导出、`docs/architecture/gpuix.md`）、新增 npm/Rust 依赖、跨切片、与契约冲突，或属于根 `AGENTS.md`「决策默认归 Agent」清单的事：用 `orca orchestration ask` 问协调者，带上候选与建议。worker 不直接问用户。
- **不允许静默停下**：同一模块内按里程碑继续实现、运行、观察并反馈。遇到阻塞用 `orca orchestration ask`，同一问题沿原 messageId 续等，不重复发问。协调者答复前先做模块内不依赖该项的工作，全部阻塞才等待。发 `merge_ready` 后主编排将它放入复核队列，不需要再发一个“是否收到”的 ask；`worker_done` 只表示本轮实现已交付，不等于已合入，不复用已结算的生命周期 ID。
- **长期 lane 与原会话复用**：新模块优先交给熟悉该模块的空闲 lane，保留 worktree、终端和上下文，不为几行改动另起 Agent。派发必须给出当前分支与固定基线；重新 resume 只核对现场、变化的契约和当前范围，不全文重读未变化文档。旧 brief 重放以当前 Task/Dispatch 为准。交付后不删除分支或终端；派发接口与平台操作以 `docs/agents/coordination.md` 为准。
- 本地只跑 `docs/agents/setup.md` 规定的轻量检查、改动范围的回归与必要单窗口 smoke，完整门禁留给 main Actions。测试只写核心与主流程，范围见 `docs/architecture/gpuix.md`「测试范围」；改文案、配置、样式或接线不加测试，不为扫描新增测试，不为每次改动写变异入口。报告记录命令、结果、未验证项，放在仓库外或 Git 忽略的证据目录；仓库只保存稳定契约，不提交本轮会话记录或每切片 REPORT.md。错题交主编排整理，不直接改 LESSONS。
- 涉及 Live 已有行为的切片，实现前先观察 Ableton Live，报告附「产品规则 → Live 观察 → 实现 → 差异/未验证」对照表。
- UI 以真实 Gallery 和业务组合视图作整体评审，按 `gpuix-ui-standards.md` 第 13 节执行；生成截图默认放仓库外或 Git 忽略目录，不批量提交逐按钮/逐状态 PNG。圆角、边框、gap、padding 通过共享组件与 token 统一调整。
- 卡在能力缺口或方案选择时，先用 Context7、GitHub 查最新方案（必要时请协调者用 Ego Browser 搜 X），把候选与实测证据随 `ask` 一起发。
- **进程清理**：只管理自己启动的命名 service、测试窗口和子进程，拿到证据立即关闭。交付前按当前平台列出这些进程的 PID 和状态，Windows 不使用 macOS 的 `ps -axo`。不得批量 kill 同名用户进程，不能把全部 Bun 窗口为空当作自己的唯一清理证明。

## 模块与里程碑

每个派发覆盖一个内聚模块的功能实现、相关缺陷修复与集成验收，不能把几行文案、几个测试或一篇 README 单独作为一个 lane 的全部工作。每个里程碑形成可运行行为，顺序为实现、真实运行、观察结果、反馈修正；保留有效证据后立即用正式 hook 提交。原生 vendor 的实质改动要导出到有序补丁并跟踪提交，不把唯一实现留在仓库外或未跟踪文件中。里程碑之间持续推进，不等整块模块全部完成才提交，也不为每个小改动重开审查和报告链。

## 交付前自审(强制,见 docs/architecture/gpuix.md「交付前自审与协调者仲裁」)

发 `worker_done` 之前依次做:① 在你的 worktree 根跑 `node scripts/gpuix-review-scan.mjs`,`HARD` 清零、`WARN` 逐条给结论;② 改动涉及工程模型、引擎、native 补丁、共享 UI 或组合契约时，用 `task` 起一个 `pstack-reviewer` 只读子代理按 Standards 与 Spec 两条轴审你自己的 diff 并读完结论，其它改动不派;③ 把发现分类为**必修 / 汇报仲裁 / 记录**:必修(违反成文规范、在你的路径内、修法唯一)你立刻修并重跑;汇报仲裁(涉及别的切片或共享契约、有多种方案、会改产品行为、你不确定)**先别动**,用 `orca orchestration ask` 汇报证据、方案与你的建议,由协调者统一决定并通知所有受影响的分支。报告里放『自审结果』表(发现/类别/处置/证据)。同一问题在多个切片出现时只修一次,修在拥有它的切片。协调者合并前会独立复跑扫描并抽查,表缺失或与扫描结果不符一律退回。
