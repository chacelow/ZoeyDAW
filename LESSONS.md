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
- 见：`scripts/orchestration/specs/common.md`“进程清理”、[gpuix 架构](docs/architecture/gpuix.md)“测试”。

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

## gpuix 迁移：review 退回要重新派发，worker 交付后就不再收信

- 现象：C2 发完 `worker_done` 后，协调者的退回意见发到它的 dispatch，报错「Dispatch is completed; its worker will never read that mailbox」。`--retry-of` 只能接已失败的 task，不能用于返工。
- 对：在**同一个 worktree** 上用新的 `worker-start --spec ... --worktree path:<dir>` 派一个返工任务，规格写明已有提交、review 结论与必修项；旧 dispatch 用 `worker-release` 释放终端。
- 预防：common 规格要求先自审（扫描 + 独立审查子代理）再 `worker_done`；越界改动必须先 ask。C2 这次越界改了 `crates/engine`、在 TS 里重写了 bar→frame 公式、并让每个素材多存一份 PCM——这三点自审都应该发现。
- 回答 worker 的 `question` 用 `orca orchestration reply --id <msg_id>`，不要另发 `send --type status`。`question` 是阻塞调用，worker 只等这条消息的回复；23:40 批准 lane 桌面时段的 status 消息没有被读到，15 分钟时段白白过去。限时授权（桌面时段）以回复送达时刻起算，过期就重发。
- 主干把测试从 `timeline/` 移到 `core/rulers/` 后，timeline 分支 merge 主干时，Git 的目录重命名推断把整个 `timeline/` 判成已移到 `core/rulers/`，产生 25 个文件的 location 冲突。切片 worktree 共用同一个仓库配置，已设置 `git config merge.directoryRenames false`。协调者在主干之间移动文件后，通知受影响切片：冲突要按 HEAD 和 MERGE_HEAD 逐个核对，不 abort，也不丢代码。
- 错：`worker-start --worktree new-child` 把新 worktree 的 Orca 父级设成协调者终端所在的 worktree，也就是仓库根 `/Volumes/PSSD/code/zoeydaw`，不是 `gpuix-migration`。结果 Orca 侧边栏里出现两棵树：早期切片挂在 gpuix-migration 下，后期切片挂在 zoeydaw 下。分支其实都基于 `gpuix-migration`，只是显示挂错了地方。
- 对：一律用 `scripts/orchestration/start-worker.sh` 派发。它在创建 worktree 时显式传 `--parent-worktree path:…/gpuix-migration`，不依赖 CLI 所在目录，所有切片都挂在 gpuix-migration 这一个父 workspace 下。

## gpuix 迁移：对照 Live 量尺寸要量完整组件，并注明单位与显示器

- 错：量 Live 轨道表头时只量了「路由/Mixer」组（193），漏掉左边的颜色标题列，据此说我们的 304 偏宽很多。tracks 切片复核指出并更正：完整表头是标题列 99 + 路由/Mixer 193 = 292，我们只宽约 4%。
- 对：用 AX 树找到组件的**全部**组成部分再求外包框；报告里写原始 AX 单位、当时的显示器分辨率与窗口尺寸，比较比例而不是绝对值；`computer.displays()` 的 scale 可能为 0（未知），不要自行换算点和像素。
- 因：显示器和窗口尺寸在会话中变过（2560 → 1920），绝对数值不可比；组件拆成多个 AX 节点时只量一个节点会系统性偏小。

## gpuix 迁移：review 要有独立视角和统一仲裁，不靠协调者读 diff

- 错：协调者一个人读 diff 与测试结果就合并，手写 SVG 与 121 处深层导入、重复的 Space 处理这类问题都漏过；各切片发现共享控件缺陷后各自绕过，同一个问题在多个分支里出现不同实现。
- 对：交付前三步：扫描脚本（确定性检查）→ 独立只读审查子代理（Standards 与 Spec 两条轴）→ 分类（必修 / 汇报仲裁 / 记录）。必修自己改；涉及别的切片或共享契约的先汇报，协调者统一决定谁修并通知所有受影响分支；同一问题只修一次，修在拥有它的切片。协调者合并前独立复跑扫描。
- 因：规范类缺陷靠扫描发现；独立子代理没有写代码时的盲区；共享缺陷必须由一个人统筹，否则各分支分叉。
- 见：`docs/architecture/gpuix.md`「交付前自审与协调者仲裁」、`scripts/gpuix-review-scan.mjs`。

## gpuix 迁移：图标和曲线不手写 SVG，跨目录导入用 `@/` 别名

- 错：为了「不新增 npm 依赖」在 `DragPad/icon.tsx`、画廊、`AutomationCurveView` 里手写 `<svg>`/`<path d="…">` 字符串，并写了 121 处 `../../../` 深层相对导入；review 时没有逐文件扫描，让这些东西进了主干。
- 对：图标用 `lucide`（web 同一套）经 `ui/controls/Icon`；曲线路径用 `d3-shape`，标记只经 `shared/svg/serialise.ts` 生成；跨目录用 `@/`。两条都由 `architecture/gpuix-imports` lint 强制（含 `--fix`），并有 81 个规则测试与 5 个变异检查。
- 因：手写路径数据无法复核（拼错一个字符就是另一个图标），也无法和 web 的图标保持一致；「别名做不了」不成立：`paths` 在 `tsc`、`bun test`、`bun run`、`eslint` 里实测都能解析，且 `gpuix-layers` 补了别名解析，不会绕过分层。
- 等价性：d3-shape 生成的 automation 路径与原手写路径在 2000 组随机曲线上逐坐标一致（最大差 0）。
- review 教训：规范类问题（手写 SVG、深层相对导入、重复依赖）要用**扫描**发现，不是靠读 diff。以后每个切片合并前先跑 `pnpm exec eslint apps/gpuix/src`，并 `grep -rnE "<svg|<path" apps/gpuix/src` 看一眼。
- 加依赖的坑：`pnpm add` 会重算 lockfile，把 `react: link:.gpuix-main/node_modules/react` 改回 19.2.8，导致 `Multiple React runtimes` 与 96 个测试失败。做法：只编辑 `package.json`，再 `pnpm install --no-frozen-lockfile`，然后 `git diff pnpm-lock.yaml` 确认只有新增行，并跑 `node scripts/gpuix-main/check.mjs --resolution`。`@types/d3-shape` 要 3.2.0 才有 `digits`。
- lucide 没有的图标（如节拍器）：用 Phosphor 的包内资源 `@phosphor-icons/core/assets/regular/<name>.svg`（`with { type: "text" }` 导入，`shared/svg/assets.d.ts` 声明类型），登记在 `Icon` 的 `PHOSPHOR_ICONS`。我曾告诉 footer 切片「用 lucide 的 Metronome」，那是错的，核实后才纠正：发规范前先在代码里查名称是否存在。
- 见：`docs/architecture/gpuix-ui-standards.md` 第 14 节、`tooling/eslint/gpuix-imports.js`。

## gpuix 迁移：并行提交会争用 lint-staged 的共享 stash，失败后先查再重试

- 现象：多个 worktree 同时 `git commit`，lint-staged 备份阶段报 `could not write index`，提示的分支还是别的 worktree（`On main`）。
- 因：lint-staged 的自动备份用 `git stash`，而 stash 与 `.git/refs/stash` 在所有 worktree 之间共享；并发提交互相覆盖备份。与 A7 那次『hook 报失败但提交已落地』是同一类问题。
- 做法：失败后先 `git log -1`、`git status`、`git stash list`、找 `.git` 下的 `*.lock`，确认没有半成品；再**原样重试**同一条提交，间隔 30 秒，最多 3 次；不用 `--no-verify`，不手动 `git stash drop` 别人的备份。
- 协调者侧：合并和提交尽量错开；若仍频繁冲突，再给 worker 分时段（与桌面输入串行同理）。

## gpuix 迁移：多个 worker 并发操作桌面会互相抢占，输入验证要串行

- 现象：并发的 worker 同时用 `computer` 做点击/拖动/按键，报 `InputBusy: another desktop operation owns input/focus control`，或 `BackgroundUnavailable`，截图验证中途失败。
- 对：由协调者给**一个 worker 在固定时间窗内独占桌面输入**（只读的 screenshot/zoom/ax 不受影响，可并行）；其他 worker 在窗内只做代码与测试；窗结束由该 worker 回复『桌面释放』，协调者再点名下一个。窗内未做完的项如实列『未验证』交付，不无限占用。
- 因：桌面只有一个真实指针与一个键盘焦点；`computer.window()` 的后台输入路径也依赖焦点恢复，会与别的输入冲突。
- 同时别碰用户的 Live：独占窗口只限自己启动的窗口。
- 派发时就按窗口数控制并发：同时需要真实窗口输入验证的切片最多 2 个，其余先排队。

## gpuix 迁移：AX `find({title})` 是子串匹配，改 Live 状态要用精确 ref

- 错：`live.find({ role: "checkbox", title: "播放" })` 想点『播放』，却命中了『跟随播放』（子串匹配，且排在前面），把『跟随播放』关掉。
- 对：改 Live 状态前，先从 `win.ax()` 里按**完整标签与 ref** 定位；用 `win.ref("eN")` 精确操作；操作后读回该控件的值确认，并核对相关开关（跟随播放、循环、录制、编辑菜单首项 Undo 标签）没有被连带改变。
- 恢复：已用精确 ref 把『跟随播放』恢复为 1；播放位置回到 1.1.1（原为 4.3.1，AX 位置滑块不可写，无法还原）。
- 因：Live 的 AX 标签有大量前缀相同的控件（播放/跟随播放、预备录制/预备录制自动化）。
- 授权边界不变：只覆盖观察与视图类操作，不覆盖修改工程内容。

## gpuix 迁移：窗口键盘事件在元素之后触发，Space 不播放靠控件自己不吞键

- 错：以为窗口根键盘事件 `onKeyDown` 在元素事件之前以 Capture 先触发，可以在窗口层拦住 Space 不让按钮响应。
- 对：读主干 `packages/native/js/renderer-state.ts`（约 186–225 行）与 `renderer.rs`（3670–3740）：`windowKeyDown/Up` 是同一次按键里**所有元素 keyDown 之后**才触发；同一次按键的事件共享 `keystrokeId`；元素 handler 调 `stopPropagation()` 会让窗口 handler 收不到；窗口 handler 不能阻止元素。`Tab`/`Escape` 的默认行为在窗口 handler 之后执行，`preventDefault` 可阻止。
- 做法：工具栏/Transport/表头的按钮与切换控件**自己不响应 Space、也不 stopPropagation**，Space 才会冒到窗口 handler 触发播放；输入框聚焦时对可打印键 stopPropagation，避免空格触发播放。用 `createTestRoot` 的 `nativeSimulateKeystrokes` 写端到端测试证明两种情形。
- 因：我先前凭印象给多个切片下了错误的顺序描述，靠读源码才纠正。
- 见：`docs/architecture/gpuix-ui-standards.md` 第 9 节。

## gpuix 迁移：在用户的 Live 里操作要先确认手势区，且优先用 AX 语义动作

- 错：为采集标尺缩放读数，在 Live 标尺数字行起点做垂直拖动。该区域是播放头/定位区，拖动触发了播放，播放位置被改。
- 对：先用只读 AX 与菜单（`win.menu.items`）取信息；必须动 Live 时，优先用 AX 的语义动作（`el.press()`，如『停止』），不用坐标拖动；每一步前记录基线，动完核对：播放状态、录制状态、编辑菜单首项（Undo 标签）是否变化。
- 恢复：AX 的位置滑块不可写（`AXValue is not settable`），播放位置改了无法用 AX 还原；因此**在不需要时不要触发播放**。不用 Undo 当视图还原（会撤销真实编辑）。
- 因：Live 是用户的真实工程，视图状态（缩放、位置）和内容状态（Clip、自动化）必须分开对待；拖动手势区由 Live 自己定义，不能凭窗口坐标猜。
- 授权：用户已明确授权协调者直接操作 Live、不必逐次询问（2026-10-14）；该授权只覆盖观察与视图类操作，不覆盖修改工程内容。

## gpuix 迁移：快捷键以 Live 菜单实测为准，不凭规格文字

- 错：规格把 `Ctrl+E` 写成「最大缩放下细分网格到 1/256」，worker 照写就会实现一个 Live 里根本不存在的行为。
- 对：用 `computer` 的 `win.menu.items(["编辑"])`、`["选项"]` 只读读取 Live 菜单与快捷键。实测：`Cmd+E` 是「裁剪」（Split，需选区）；`Cmd+1` 缩窄网格、`Cmd+2` 加宽网格、`Cmd+3` 三连音网格、`Cmd+4` 吸附到网格、`Cmd+5` 固定网格；`Cmd+B` 渲染到新轨道、`Cmd+J` 合并、`Cmd+U` 量化、`Cmd+L` 停用 Loop。
- 因：产品决策里的文字是转述，菜单是 Live 自己的真相；菜单读取只读、不改工程，成本为零。
- 做法：任何涉及快捷键或命令名的切片先读菜单，把对照写进报告；发现规格与菜单不一致，立刻更正规格并通知所有相关切片。

## gpuix 迁移：写了规范还要保证 Agent 读得到

- 错：把规范写进 `docs/`，只在派发消息里口头告知；没有入口文件指向它，新开的 Agent 与后续会话读不到，规范等于没写。
- 对：入口文件分层指路。根 `AGENTS.md` 的路由表按「修改范围」指到文档；`apps/gpuix/AGENTS.md` 与各目录就近的 `AGENTS.md`（如 `src/ui`、`src/project/sections`）在 Agent 改到该目录时再指一次；worker 规格 `common.md` 的先读清单同步更新。入口只放指针与触发条件，细则留在被指向的文档，避免入口膨胀。
- 校验：`node scripts/check-doc-routes.mjs` 检查必读文档都被入口文件链接；新增必读文档时同步加进它的 `required` 列表。该脚本做过变异检查：去掉入口链接会失败。
- 见：`AGENTS.md`、`apps/gpuix/AGENTS.md`、`scripts/check-doc-routes.mjs`。

## gpuix 迁移：界面必须逐个元素放大看，不能凭一张全屏图或 AX 树

- 错：只用类型检查、测试和一张全屏截图就声称界面完成；间距、居中、尺寸、紧凑感没有逐项核对。
- 对：在真实组合 Gallery 与业务界面中整体核对跨区域对齐、展开/收起按钮居中、卡片与按钮 gap、padding 和共享 token；局部放大只定位缺陷，生成截图默认 Git 忽略，协调者亲自评审（2026-10-15 用户纠正）。
- 因：DAW 是高密度工作站，1px 的间距差和一点松散就会让整体不像专业软件；AX 树只证明语义存在，不证明视觉正确。
- 见：`docs/architecture/gpuix.md` 的「UI 视觉验收」。

## gpuix 迁移：渲染器版本用实测与上游活跃度定，不等发布

- 决策（2026-10-14）：采纳固定主干自建，不继续停在 npm 0.10.0，也不等上游发布。
- 因：0.10.0 缺关键 API（`onLayout`），主干已有；上游发布节奏不可预测；同类替代品成熟度低。
- 判据可复用：① 缺口是否已在主干；② 近 30 天提交数与作者分布（单人维护是风险，靠固定 SHA 与可复现脚本抵消）；③ 干净构建与单行重建的实测耗时；④ 现有 demo 与测试在自建版本上的兼容结果。
- 见：`docs/research/gpuix-main-build.md`、`docs/architecture/gpuix.md` 的「渲染器版本决策」。

## gpuix 迁移：切片 worktree 是 `gpuix-migration` 的子 worktree

- 2026-10-14 16:02、2026-10-15 02:22 用户要求：所有切片在 Orca 里挂在 gpuix-migration 一个父级下。派发方式见上面「review 退回要重新派发」一节末两条与 `start-worker.sh`。

## gpuix 迁移：切片合入后立即删 worktree，不复用上下文

- 决策（2026-10-14 15:26 UTC，用户关注本机性能）：切片**合入并核对无残留后立即**删除其 worktree、分支与对应 OMP 终端；不为"可能复用上下文"或"留着最终复验"保留，复验另开新 worktree。
- 因：每个存活的 OMP/agent 进程常驻内存（实测单个约 0.6–2.7% 内存），还会带着 LSP、rust-analyzer 等子进程；旧切片上下文已被合并提交和 LESSONS 取代。
- 例外：有未提交改动或任务未完成的保留，并用 `orca worktree set --comment "保留:<原因>;删除条件:<条件>"` 写明。2026-10-15 审计时 tracks、timeline 两个已合入 worktree 以"最终复验"为由保留且无说明，被用户指出不知道是有意保留还是漏删。
- 做法：① `git rev-list --count gpuix-migration..<branch>` 为 0 且 `git merge-base --is-ancestor` 为真；② `git status --short` 干净；③ `lsof +D <dir>` 确认没有 agent 进程还在用；④ `orca worktree rm --worktree path:<dir>`，**不加 `--force`**，它会顺带删除已合入的分支。
- 终端：`worker-release` 对派发脚本建的终端返回 `user_takeover`，这只是创建方式的标记。错：2026-10-15 据此把 4 个已完成终端留给用户手动关，用户指出不要把可自行处理的清理留给他。对：确认 TUI 空闲、派发 completed 后，协调者用 `orca terminal close --terminal <handle> --tab` 关闭，再 `lsof +D` 确认进程已退出、删除 worktree。

## gpuix 迁移：协调者把能自己决定的事转问用户

- 错：2026-10-15 协调者两次用 `ask` 问用户：07:27 问是否授权本分支合并提交（已授权），08:27 问能否批准 worker 的 `computer.control.acquire`（本项目根本不用这个接口）。前一次另外 4 个已完成终端也留给用户手动关。
- 对：先按 `AGENTS.md`「Ask first」判断是否真属于要问用户的事；不属于就自己决定。worker 卡在工具或权限上，先查以前切片怎么做成的（session 记录、LESSONS、规格），把可行路线直接回给 worker。
- 因：用户的定位是“协调者做决策性 approve 和 review，不做转发”；规则只写在 coordination.md 时，协调者遇到新情况仍会退回问用户，所以边界写进了会注入系统提示的 `AGENTS.md`。

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
- 错 2：在越过点击阈值的 `mouseMove` 里才读取光标锚点。此时光标已走过一段，恢复位置落在拖动中途（实测读回 542 而非 568）。
- 错 2b：在 JS 处理 `mouseDown` 时读 OS 当前光标位置当锚点。事件经 ThreadsafeFunction 异步投递，JS 处理前 OS 可能已处理后续 move；合成“按下即移动”实测偏一个 move 步长（`(805,364)` 读成 `(805,354)`）。锚点必须取按下事件自身的 `x/y`（GPUI 由 `locationInWindow` 在事件时刻算出），再经 `windowPointToScreen` 换算成屏幕点。
- 错 3：`bun:ffi` 读 `CGEventGetLocation`。`CGPoint` 按值返回，`FFIType` 没有 struct，读到垃圾。
- 错 4：`osascript` 子进程当原生桥，约 54ms/次。
- 对：Rust 经 napi 暴露 `windowPointToScreen`（`crates/native/src/window_geometry.rs`）与 `cursorHide/cursorRestore`；按下事件坐标换算出锚点 → 确认拖动后才隐藏 → 松手先 warp 回锚点再显示。换算全程用点，不乘 Retina 缩放；以内容区高度翻转（与 GPUI 一致），以主屏高度从 AppKit 翻到 CG 坐标。读 `NSApp` 全局指针而非 `sharedApplication`，避免在 gpuix 启动前造出普通 NSApplication。`cursorPosition` 只用于读回验证。`CGWarpMouseCursorPosition` 只落整数点，所以与小数锚点最多差 0.5pt，已四舍五入。
- 测试：真实模块会改宿主光标，单元测试必须 mock（`mock.module`），否则每次 `bun test` 都在动开发者的鼠标；整套测试前后光标坐标须一致。

## gpuix 迁移：gpuix 0.10.0 的原生缺口（临时代码清单，升级后整体删除）

以下记录 0.10.0 与固定主干的能力差异及切换状态。已删除的路径不得重新引入；剩余原生能力不以 TS 轮询或占位行为冒充。

- `onLayout`：主干有（`.changeset/on-layout.md`）。A3b 已把文本样本测量改为原生事件；旧 `getElementBounds` 定时采样已删除，缓存仍按字体与样本集持有。
- `getElementBounds`：主干直接返回 border box。A3b 已删除旧 border/padding 修正、`readOuterBounds` 转发层及所有生产/测试调用，直接消费原生 API，几何断言未放宽。
- `onFocus/onBlur`：A3b 已删除元素焦点采样器与 register/ref 兼容路径，由原生事件发布控件种类，原生 `focusVisible` 绘制焦点环。窗口激活由 F1 `window-active-change.patch` 经 `createWindowPlatform(renderer).subscribeApplicationActive` 共享订阅；旧 50ms 激活采样已删除，不得重新轮询。
- 关闭拦截：D1 补丁 `setWindowShouldClose` 加 H1 补丁 `closeWindow()`，由 `platform/window/close-guard.ts` 的 `createWindowCloseGuard` 统一持有(macOS 下 `supported=true`)，用法见 `apps/gpuix/src/platform/window/README.md`。`hideWindow` 和托盘仍然没有。不得用 `process.exit()` 冒充关闭。
- `measureText`：仍没有独立字符串测量 API。挂载不可见样本文本，由 `onLayout` 读取实测宽度，不保留定时测量作为第二 owner。
- 自建主干默认构建需要 Xcode 的 Metal 工具链（`xcrun metal`）；本机只有 CLT 时用 `runtime_shaders` 特性。
- 浮层 center：F1 `anchored-center.patch` 用零尺寸点锚消除重复减半。A3b 已删除 `useFloatingCenterOffset`、调用和采样；不再添加 TS offset 抵消原生定位。
- 错：合入改动 `scripts/gpuix-main/config.json` 补丁序列的分支后，直接在主干跑 tsc 和 `bun test`。共享 vendor 仍是旧补丁的产物，主干一度显示 tsc 8 个错误、25 个测试失败，全部是假失败。
- 对：先跑 `node scripts/gpuix-main/check.mjs`；它报 “Vendor must contain exactly the checked-in ordered patch series” 时，先通知各 worker 暂停渲染器相关构建与整套测试，再跑 `bash scripts/gpuix-main/build.sh`，check 通过后才把门禁结果当真，最后通知各 worker merge 主干。

## gpuix 迁移：依赖与版本核实

- 对：引入任何 crate/npm 包前先用 registry 核实版本与活跃度，不凭记忆。本轮核实结果：`dirs 7.0.0`（不是 6）、`windows-sys 0.61.2`（不是 0.59）、`url 2.5.8`、`cpu-time 1.0.0`。
- 对：安全边界（外链校验）用 WHATWG 兼容的 `url` crate，不手写 scheme/host 解析；Windows 打开外链不经 shell（`ShellExecuteW`），各平台以数组参数传 URL，拒绝以 `-` 开头的 href。
- 对：并行 worker 共同修改的 `package.json` / `pnpm-lock.yaml` / `Cargo.lock` 一律在合并时由协调者重新生成，不手工解冲突。

## gpuix 迁移：引擎选型结论（A5 实测）

- 单核 CPU 中位数（8/64/256 clips）：Firewheel 0.020/0.224/1.07%，Kira 0.300/1.93/8.42%，Rodio 0.916/6.40/26.0%（测于用户有 Orca/Ableton 重负载时，墙钟已披露）。
- 没有任何候选的内置 sampler 满足 DAW 的样本精确语义：Firewheel 非零起点吞一帧、暂停消耗一块；Kira seek 先吐 2 帧旧数据并重复目标；Rodio 回调取锁且按 5ms 量化。结论：Firewheel 图运行时 + 自有 PCM 走带节点。证据见 `docs/research/engine-playback-graph.md`。

## gpuix 迁移：跟随系统读的是窗口外观，不能再覆盖应用外观

- 错：为了让原生标题栏跟随所选的明/暗模式，调用 GPUI 的 `set_window_appearance` / `NSApp.appearance`，同时继续用 `subscribeSystemAppearance` 实现「跟随系统」。
- 对：「跟随系统」只在没有设置应用级外观覆盖时成立。确需让标题栏跟随模式，先换成直接读系统外观的来源(例如 `NSDistributedNotificationCenter` 的 `AppleInterfaceThemeChangedNotification`),再加覆盖。
- 因：`onWindowAppearanceChange` 回报的是窗口的 `effectiveAppearance`,它继承 `NSApp.appearance`;一旦覆盖,读到的就是自己设的值,系统切换不再触发变化。
- 见：`scripts/gpuix-main/patches/window-appearance-close.patch`、`apps/gpuix/src/platform/window/index.ts`。

## gpuix 迁移：computer 截不到按住期间的 pressed 帧

- 错：把激活态截图或松开后的截图当成 pressed 证据；或在一个 `computer.run` 里按住再截图，就以为截到的是按住那一刻。
- 对：pressed 用测试直接断言：按下后的样式值与尺寸正确，松开后恢复，并做变异。真实窗口的 pressed 帧在报告里标为工具限制下的未验证。拿到截图后，用控件状态读回（例如切换控件在 onClick 才变化）核对截图时刻，不凭截图里的样子判断。
- 因：2026-10-15 clip-editors 实测，display 截图报 `InvalidCoordinateFrame`，并行调用报 `Computer worker busy`，同一个 run 里的拖动会阻塞截图，图实际是松开之后才截的。

## gpuix 迁移：Apple Git 的 `git apply --intent-to-add` 会丢 index 条目

- 错：在 vendor 构建脚本里用 `git apply --intent-to-add`，想顺带把补丁新建的文件登记进 index。
- 对：先用普通 `git apply` 打完全部补丁，再用 `git ls-files --others --exclude-standard` 找出新建的文件，交给 `git add --intent-to-add --pathspec-from-file=-` 登记。
- 因：Apple Git 2.50.1（Apple Git-155）执行 `apply -N` 时，会删掉这个补丁没涉及的所有 index 条目，剩下的文件看起来全部被删除。2026-10-15 F4 在新 checkout 上构建时发现：`git diff --binary HEAD` 超过 1MB，`check.mjs` 报 ENOBUFS。之前没暴露，是因为只在已有的 vendor 上增量打过补丁。
- 见：`scripts/gpuix-main/build.sh`。

## gpuix 迁移：批量绘制等价性必须覆盖小数几何

- 错：整数合成矩形的 PNG 相同，就认定 `quad-batch` 与原生 div 像素等价。
- 对：复用 GPUI `Window::pixel_snap_bounds` 处理本地位置和尺寸，再交给 `paint_quad` 处理绝对边缘；用原生 div 作独立 oracle，覆盖小数位置、尺寸、host origin 和 scale 1/1.25/1.5/2。
- 因：layout 的 authored metric 舍入与 paint-time edge 舍入是两步。lane 的 `y=5.5,height=4.5,top=10` 曾多画一个像素，整数压力探针未捕获。
- 见：`scripts/gpuix-main/quad-batch/PIXEL-SNAP-REPORT.md`、`pixel-parity.tsx` 与 `quad-batch.patch` 中的四类回归。F4b 独立复核与共享 vendor 重建后的新 GPU 图均与原 div、lane 参考图解码后零差异。

重复出现的机械问题优先升级为 lint、类型或行为测试；升级后让本文链接权威规则，不复制第二套实现参数。当前具体门禁和运行命令见 [setup](docs/agents/setup.md)。
