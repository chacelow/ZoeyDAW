# 错题与门禁候选

开工先扫本文；只记录可核实的故障、原因与对应实现，不把一次性偏好写成永久规则。2026-10-14 从既有项目规范整理，日期不是原故障发生时间。

## Panel active 外沿被裁切

- 错：用外沿 ring、box-shadow 或 outline 做 active。
- 对：保持外壳尺寸，只换现有边框颜色。具体宽度由共享度量配置决定，不在错题本固定另一份数字。
- 因：Resizable Panel/Group 内置 overflow 会裁掉外沿，产生部分边框残影。
- 见：`apps/web/src/components/panels/PanelShell/index.tsx`、[Panel 契约](docs/architecture/project-panels.md)。

## defaultSize 的单位

- 错：把 `defaultSize={18}` 当作百分比。
- 对：数值表达像素，百分比使用字符串。
- 因：react-resizable-panels v4 的尺寸 API 与早期写法不同。
- 见：`apps/web/src/pages/project/ProjectLayout.tsx`。

## 只改 CSS 不等于修改 Canvas 几何

- 错：覆写控件 CSS 高度后，认定轨道 resize、标题与命中范围也已同步。
- 对：从同一度量配置派生 CSS 和 JS 布局，检查两端的实际结果。
- 因：轨道几何过去来自 JS 常量，独立 CSS 覆写不能更新它；2026-10-14 页面探针确认共享控件与 scoped 轨道变体会分别响应。
- 见：`packages/ui/src/controls/metrics/`、`apps/web/src/pages/project/layout/`。

## 导入接口不应启动工程后端

- 错：在模块末尾 openBackend，导致首页导入 facade 就创建会话。
- 对：构造/配置只建立数据与 owner，运行视图显式取得 lease，最后释放时清理资源。
- 因：隐藏副作用把页面是否显示与后端生命周期分离，妨碍实例隔离和原生接入。
- 见：`apps/web/src/pages/project/adapters/runtime/`。

## 2026-10-14 底部视图的布局与输入回归

- 三个相邻 resizable Panel 中展开 Clip 会优先挤掉 Device。固定 Device 已移到 Group 外，连续 resize 只管理主区域与 Clip；二值 DeviceDivider 不争抢相邻 Panel。契约见 [底部布局](docs/architecture/project-panels.md)。
- MIDI fit 若在旧行高 DOM 上写 scrollTop，下一次 commit 会把音符移出可见区域。`useMidiViewport` 等新行高提交后再定位，并关闭浏览器滚动锚定；可见范围与源窗口切换由同目录测试覆盖。
- Clip 祖先无条件停止 keydown 会吞掉共享数值控件的预编辑输入；力度和琴键还曾吞掉项目 Undo。现在只拦截已消费的命令，输入框保留原生撤销。Clip Detail 与 MIDI 交互测试覆盖预编辑、控制焦点撤销、全局音符松键和拖动中撤销不消耗前一条历史。
- Audio Start/End 最初按 Live 的 Source 裁剪字段实现，实测却是独立播放标记：拖动不改变编排 Clip 的 startBar/lengthBars/sourceOffsetBars。已改为 audioSettings 内的 startMarkerBars/endMarkerBars，与 Loop Position/Length 和源边界三者互不影响。
- 音乐位置格式化对极小的十六分音符分量直接插值 Number，JS 对小于 1e-6 的数会转成科学计数法（如 `2e-8`），生成的字符串跳出 `\d+(?:\.\d+)?` 解析正则，往返直接变 NaN。改为用 `toFixed` 字符串裁剪尾随 0，不经过 Number→String 再转换。

## gpuix 迁移：工作方式（所有并行 worker 必读）

- 错：在共享 worktree 里用 `git stash` / `git checkout <旧提交>` 做"改动前后对照"。
- 对：对照一律用 `git worktree add ../tmp-xxx <提交>` 的临时副本，用完 `git worktree remove`。
- 因：stash 引用存放在所有 worktree 共用的 common git dir（实测：在主 worktree `git stash`，链接 worktree 里 `git stash list` 同样可见）。并行切片的 lint-staged 备份 stash、别人的 WIP 会和你的混在一起，`stash pop` 可能把别的分支的文件落进当前工作区，产生 `DU` 未合并条目。2026-10-14 协调者在合并 A5 时踩过：`.orca-specs/` 一度被收走，A2 的两个文件落进了协调者工作区，靠 stash 的第三个父提交（untracked 快照）恢复，未丢数据。
- 同一天再犯一次：为了"验证上面这条"，协调者在共享仓库里 `git stash push` 做探针再 `git stash drop`，探针把**当时未提交的 LESSONS.md 一起收走并丢弃**。教训：验证 stash 共享性应在 `mktemp -d` 的一次性仓库里做（上面的实测就是这样），绝不在真实仓库里做；未提交的重要改动先 `git add` + 提交，哪怕是 WIP。
- 恢复：被 drop 的 stash 提交仍是悬空对象。`git fsck --no-reflogs --unreachable` 列出悬空提交，按 stash 信息（`git log -1 --format='%H %s' <sha>`）找到，再 `git checkout <sha> -- <路径>`，不要 `stash pop`。
- 见：`git rev-parse --git-common-dir`；已进入 stash 的未跟踪文件在它的第三个父提交里：`git checkout "stash@{0}^3" -- <路径>`。

## gpuix 迁移：验证用的 demo 必须验证完就关

- 错：`bun --hot <demo>` 启动原生窗口做截图/AX 验证后不关，继续做别的事。
- 对：用带 `name` 的 bash service 启动（`proc://<name>`），拿到证据立刻 `write proc://<name>/kill`；交付前 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"` 确认零残留。
- 因：每个 gpuix 窗口是一个常驻 GPU 进程（约 70–130MB RSS）。2026-10-14 并行 worker 同时开着多个 gallery，其中一个跑了 29 分钟无人交互，协调者清理时 `bun` 合计 346MB → 54MB。窗口占用户本机性能，且 `--hot` 会持续监视文件。
- 见：`.orca-specs/common.md`“进程清理”、[gpuix 架构](docs/architecture/gpuix.md)“测试”。

## gpuix 迁移：已验证的好做法（可直接复用）

- **platform 层用自己声明的结构类型，不 import 渲染器包**。`platform/window` 声明最小的 `WindowRenderer`（可选方法）与 `PathPromptOptions`，由应用组合根传入真实 renderer。换渲染器只需满足同一形状。**用测试文件里的类型断言守住一致性**：`type Assert<NativeRenderer extends WindowRenderer ? true : false>`——测试文件不受 `gpuix-layers` 规则约束，上游改签名时 `tsc` 在此报错，而 platform 源码保持零渲染器依赖。见 `apps/gpuix/src/platform/window/renderer-conformance.test.ts`。
- **napi 导出在 `cargo test` 里的 dead_code 告警，在 crate 根一处声明**：`#![cfg_attr(test, allow(dead_code))]` 放 `crates/native/src/lib.rs`，新增模块无需各自重复；非测试构建仍用 `clippy -D warnings` 把关（已实测两种构建都过）。
- **合并并行分支的 `Cargo.lock`**：`git checkout --ours Cargo.lock` 后 `cargo update --workspace`，让 cargo 针对两边合并后的 `Cargo.toml` 重新求解；再跑一次确认 "Locking 0 packages"（已稳定）。不要手工解锁文件冲突。
- **atomic_file 迁移要对照原实现**：`write_atomically` 的顺序（create_dir_all → 清理陈旧 tmp → create_new 临时文件 → write_all → sync_all → 长度校验 → rename/MoveFileExW(WRITE_THROUGH) → 目录 fsync）与"清理失败只记日志不中断保存"均已与 `src-tauri` 原版逐项核对一致。迁移耐久性代码时照这个清单核。
- **一个 `.node` 的体积**：A2 加入 `dyn-symbols` 与全部模块后为 1.14MB（仅光标时 496KB）；光标往返仍精确、`cursorPosition` 0.92µs/次，说明该特性不影响已验证路径。

## gpuix 迁移：Bun 的 fake timers 比 Vitest 粗

- 错：以为 `vi.useFakeTimers({ toFake: [...] })` 能原样换成 `jest.useFakeTimers({ toFake: [...] })`。
- 对：Bun 的 `jest.useFakeTimers()` **忽略 `toFake`**，一律伪造全部定时器。实测：传 `toFake: ["performance","setInterval","clearInterval"]` 后 `setTimeout` 也被伪造了（`jest.advanceTimersByTime` 触发了它）。把选项去掉并在注释里写明，不要假装选择性伪造仍然生效。
- 因：原 `simulation.test.ts` 伪造 6 种、`clip-sources.test.ts` 只伪造 3 种，迁移后两处语义变宽。A1 的汇报只写了“不支持 `toFake` 类型选项”，没有说明对测试含义的影响。
- 验证方法（可复用）：**变异检查**。把被改写的测试里的期望值改成错的（例如 `pitch: 72`→`99`），确认它会失败；若仍通过，说明测试已空转。2026-10-14 对 `clip-sources.test.ts` 做过，失败如预期，所以变宽没有让它失效。
- 另：判断“断言一个不丢”不能只信 worker 汇报，用脚本比对：先把原文件的 `from "vitest"` 规范化成 `bun:test`，再 `diff`，统计只在原文件出现的 `expect(` 行；本次 29 个文件里只有 9 行不同（7 行 `vi.getTimerCount`→`jest.getTimerCount`，2 行是批准的 `structuredClone` 与类型参数）。
- 另：测试稳定性要三种方式都跑——默认顺序、`--randomize --seed N` 至少两个种子、每个文件单独运行（后者专门抓 preload 全局注册带来的跨文件泄漏）。A1 的 225 个用例三种方式均通过。

## gpuix 迁移：纯函数用性质测试 + 变异检查，别只靠手写用例

- 错 1：只用几个手写用例验证布局求解器 `computeLayout`。边界（折叠吸附、最小值放不下、相邻面板）的 bug 在每个面板上都会放大。
- 对：写**性质测试**——固定种子的线性同余发生器生成随机约束，断言不变量（总尺寸守恒、每个面板在 `[min,max]` 或恰为折叠值、拖动方向与位移符号一致）。3000 组约束 × 6 次拖动 = 18000 次检查只要 0.17 秒。见 `apps/gpuix/src/ui/panels/layout/invariants.test.ts`。
- 错 2：把不变量写得太严，然后误以为发现了 bug。我第一次 fuzz 报 361 处违规，其实是**断言本身的前提不对**：(a) "实际位移 ≤ 请求位移"在折叠/展开吸附时本来就不成立（吸附会越过中点后整体跳变，且 `computeLayout` 的注释写明了这一点）；(b) 视口放不下所有最小值时，`fitLayout` 文档约定放宽最小值，此时不应断言下界。把前提改对后违规 106→0，且逐个分类确认 106 处全是吸附（PLAIN=0）。**先分类违规再判断是 bug 还是断言错，不要看到红就改实现。**
- 对：用**变异检查**证明测试不是空转——改坏实现，测试必须变红。本次 5 个变异：去掉下界夹取、翻转传递方向、去掉折叠目标、折叠目标偏移 10，全部被抓住。
- 错 3：第一个变异（让 `size === collapsed` 的早返回失效）测试仍然全绿。继续排查（对同一组输入逐行 diff 输出）发现输出**完全相同**——这个早返回分支对该输入是冗余的，不是测试漏了。教训：变异不红不等于测试弱，先确认变异是否真的改变了行为（比对输出），再决定是否补用例，别为一个等价变异硬加测试。
- 对：求解器的语义要与被替换的库对齐再验收。`react-resizable-panels` 4.12.3 的折叠行为是“越过折叠区中点才折叠/弹出”，A4 的求解器实测一致：A 在 delta=-200 到达 min，-260 折叠（中点 -250）；从折叠态展开，delta=40 仍为 0，60 弹到 100。

## gpuix 迁移：渲染器版本用实测与上游活跃度定，不等发布

- 决策（2026-10-14）：采纳固定主干自建，不继续停在 npm 0.10.0，也不等上游发布。
- 因：0.10.0 缺关键 API（`onLayout`），主干已有；上游发布节奏不可预测；同类替代品成熟度低。
- 判据可复用：① 缺口是否已在主干；② 近 30 天提交数与作者分布（单人维护是风险，靠固定 SHA 与可复现脚本抵消）；③ 干净构建与单行重建的实测耗时；④ 现有 demo 与测试在自建版本上的兼容结果。
- 见：`docs/research/gpuix-main-build.md`、`docs/architecture/gpuix.md` 的「渲染器版本决策」。

## gpuix 迁移：切片 worktree 派发为 `gpuix-migration` 的子 worktree

- 错：`orca orchestration worker-start --worktree new-top-level` 派发切片，客户端侧栏里每个切片都是平级的顶层 workspace，和无关项目混在一起，看不出归属。
- 对：用 `--worktree new-child`（父为当前协调者所在 worktree `gpuix-migration`），切片在客户端里嵌套在它下面，合并和清理时一目了然。已派出的顶层切片用 `orca worktree set --worktree path:<dir> --parent-worktree path:<父目录>` 补挂，只改 Orca 元数据，不动 git 分支与文件。
- 注意：`new-child` 默认以协调者当前分支为基线；协调者 HEAD 之后又有合并时，新切片自动带上，不必再指定 `--base-branch`。
- 2026-10-14：A3 起即为子 worktree，B1、C1 初始为顶层，已补挂。

## gpuix 迁移：切片合入后立即删 worktree，不复用上下文

- 决策（2026-10-14，用户关注本机性能）：切片**合入并核对无残留后立即**删除其 worktree、分支与对应 OMP 终端；不为"可能复用上下文"保留。
- 因：每个存活的 OMP/agent 进程常驻内存（实测单个约 0.6–2.7% 内存），旧切片上下文已被合并提交和 LESSONS 取代；复用只省一次创建时间，却拖累整机。新切片用新 worktree + 自包含任务描述更干净、边界更清楚。
- 例外：有未提交改动、或任务未完成的切片保留并说明原因（本次 A3/A6/A7）。
- 做法：① `git rev-list --count gpuix-migration..<branch>` 为 0 且 `git merge-base --is-ancestor` 为真；② `git status --short` 干净；③ `orca worktree rm --worktree path:<dir>`，**不加 `--force`**，让 git 拒绝脏树；④ `git branch -d`（不用 `-D`），未合入会被拒。
- 终端：agent 终端由用户在 Orca 界面关闭，Agent 不自行 kill 进程。

## gpuix 迁移：commit 报 `pre-commit failed` 不等于没提交，先查再判断

- 现象：`git add A B && git commit` 后输出 `husky - pre-commit script failed (code 1)`，随后 `git log` 却显示提交存在，`git status` 干净，`git stash list` 多出一条 `lint-staged automatic backup`。
- 因：lint-staged 先把工作区改动备份进 stash，再运行格式化（prettier 会重排代码）。同一条命令里先后有两次提交，第二次因"没有暂存文件"让 lint-staged 报错、hook 返回非零，但**第一次提交已经成功**，且 prettier 重排后的内容已进入提交；备份 stash 因第二次提交异常而没被清理。
- 对：看到 hook 失败**不要重试盲目重复提交**。依次确认：① `git log --oneline -3` 提交是否在；② `git show HEAD:<文件> | grep` 内容是否在 HEAD；③ `git diff --stat stash@{0} HEAD` 备份里有没有 HEAD 之外的东西；④ 若测试文件被 prettier 重排过，用**行为验证**而不是文本比对确认等价（重跑测试 + 重跑变异检查 + 对关键表达式做数值等价比对）；⑤ 确认无误再 `git stash drop` 自己的备份。
- 注意：这条 stash 在所有 worktree 间共用（见"工作方式"一节），丢弃前必须确认它是自己的、内容已在 HEAD。2026-10-14 实测：备份里的 `LESSONS.md` 与 HEAD 逐字节相同，测试文件仅被 prettier 重排；`(s = ...)/2**32` 与 `(s = ...) / 2**32` 的两种 rng 写法在 160000 个值上完全一致；3 个用例与 4 个变异在重排后的版本上结果不变。
- 另：同一个 commit 里不要连续跑两次 `git commit`。分开执行，每次检查退出码与 `git log`。

## gpuix 迁移：Shell 引号会吞掉长回复

- 错：把含 `$(`、反引号的中文长文本直接放进 `--body "..."` 双引号。
- 对：先写进文件，再 `--body "$(cat file)"`；heredoc 用带引号的 `<<'EOF'`。
- 因：`$(` 与反引号会被 shell 当作命令替换执行（表现为 `command not found: 的`），worker 收到的是被截断的残缺指令。2026-10-14 发给 A2 的关闭拦截回复因此残缺，靠文件重发。

## gpuix 迁移：不要把"阻塞等待"和"回执确认"并发

- 错：同一批命令里先后台 `check --wait`，又同时 `check --ack`。
- 对：用一条命令 `check --ack <旧 delivery> --wait ...`，先确认再等待。
- 因：等待先于回执执行时，同一条消息会被整批重放，表现为重复处理同一个问题。

## gpuix 迁移：验收用语义检查，不用字面 grep

- 错：用 `grep "document\."` 判断"有没有 DOM 耦合"。
- 对：用 ESLint 作用域分析判断"解析不到任何声明的全局引用"；规则在 `tooling/eslint/gpuix-layers.js`，由 `LAYERS` 声明表驱动，`state.document.tracks`、局部变量 `document` 不会误报（规则测试含此回归用例）。
- 因：工程领域字段就叫 `document`，字面匹配会命中数百处合法代码，逼 worker 改公共契约来过门禁。
- 见：`tooling/eslint/gpuix-layers.test.js`、[gpuix 架构](docs/architecture/gpuix.md)。

## gpuix 迁移：Bun 测试运行器的已知缺陷

- 错：`expect(live).toMatchObject({ notes: expect.arrayContaining([...]) })` 之后继续使用 `live`。
- 对：对会被后续逻辑再读的活状态，先 `structuredClone` 再交给断言；在每处包裹旁注明原因，上游修复后整批移除。
- 因：Bun 1.3.14 与最新 1.4.3 都会把 `received` 里的数组替换成 `ExpectArrayContaining`（上游 oven-sh/bun#3521、#35452，均 open），污染活的 Zustand state，下一条用例在 `clip.notes.map` 崩溃。Vitest 无此问题。
- 另：`vi.setSystemTime` 在 bun 里叫 `setSystemTime`（从 `bun:test` 导入）；`jest.getTimerCount()` 可用。

## gpuix 迁移：光标锁定（拖动数值）

- 错 1：用 `CGAssociateMouseAndMouseCursorPosition` 做 FPS 式 pointer lock。GPUI 的 `mouseMove` 全部取自 `NSEvent.locationInWindow`（绝对位置，源码 `crates/gpui_macos/src/events.rs`），断开关联会冻结位置，`mouseMove` 停发。
- 错 2：在越过点击阈值的 `mouseMove` 里才读取光标锚点。此时光标已走过一段，恢复位置落在拖动中途（实测读回 542 而非 568）。锚点必须在 `mouseDown`（位置静止）读取。
- 错 3：`bun:ffi` 读 `CGEventGetLocation`。`CGPoint` 按值返回，`FFIType` 没有 struct，读到垃圾。
- 错 4：`osascript` 子进程当原生桥，约 54ms/次。
- 对：Rust（`crates/native/src/cursor.rs`）经 napi 暴露 `cursorPosition/cursorHide/cursorRestore`，进程内约 2µs/次；mouseDown 抓锚点 → 确认拖动后才隐藏 → 松手先 warp 回锚点再显示。`CGWarpMouseCursorPosition` 只落整数点，所以与小数锚点最多差 0.5pt，已四舍五入。
- 测试：真实模块会改宿主光标，单元测试必须 mock（`mock.module`），否则每次 `bun test` 都在动开发者的鼠标；整套测试前后光标坐标须一致。

## gpuix 迁移：gpuix 0.10.0 的原生缺口（临时代码清单，升级后整体删除）

npm 最新就是 0.10.0，主干已领先 88 个提交。以下是 0.10.0 缺失、主干已有或仍缺的能力，所有绕行代码必须集中在单一函数/hook 里并注明对应上游项：

- `onLayout`：主干有（`.changeset/on-layout.md`），0.10.0 没有。绕行：`getElementBounds` 采样，收敛在唯一的测量 hook。
- `getElementBounds` 含 padding 的修复：主干有（`bounds-include-padding`）。绕行：`readOuterBounds`，唯一入口。
- `onFocus/onBlur` 在 `focusElement`/窗口失活时不触发：绕行为应用作用域单一采样器；窗口失活信号走 Rust `isApplicationActive`。
- 关闭拦截、`hideWindow`、托盘：主干也没有；GPUI fork 里 `on_window_should_close` 已存在，只缺 gpuix 注册与 JS 暴露。当前 `WindowCloseGuard.supported=false`，不得用 `process.exit()` 冒充。
- `measureText`：没有。绕行：挂载不可见样本节点读取实测宽度。
- 自建主干默认构建需要 Xcode 的 Metal 工具链（`xcrun metal`）；本机只有 CLT 时用 `runtime_shaders` 特性。

## gpuix 迁移：依赖与版本核实

- 对：引入任何 crate/npm 包前先用 registry 核实版本与活跃度，不凭记忆。本轮核实结果：`dirs 7.0.0`（不是 6）、`windows-sys 0.61.2`（不是 0.59）、`url 2.5.8`、`cpu-time 1.0.0`。
- 对：安全边界（外链校验）用 WHATWG 兼容的 `url` crate，不手写 scheme/host 解析；Windows 打开外链不经 shell（`ShellExecuteW`），各平台以数组参数传 URL，拒绝以 `-` 开头的 href。
- 对：并行 worker 共同修改的 `package.json` / `pnpm-lock.yaml` / `Cargo.lock` 一律在合并时由协调者重新生成，不手工解冲突。

## gpuix 迁移：引擎选型结论（A5 实测）

- 单核 CPU 中位数（8/64/256 clips）：Firewheel 0.020/0.224/1.07%，Kira 0.300/1.93/8.42%，Rodio 0.916/6.40/26.0%（测于用户有 Orca/Ableton 重负载时，墙钟已披露）。
- 没有任何候选的内置 sampler 满足 DAW 的样本精确语义：Firewheel 非零起点吞一帧、暂停消耗一块；Kira seek 先吐 2 帧旧数据并重复目标；Rodio 回调取锁且按 5ms 量化。结论：Firewheel 图运行时 + 自有 PCM 走带节点。证据见 `docs/research/engine-playback-graph.md`。

重复出现的机械问题优先升级为 lint、类型或行为测试；升级后让本文链接权威规则，不复制第二套实现参数。当前具体门禁和运行命令见 [setup](docs/agents/setup.md)。
