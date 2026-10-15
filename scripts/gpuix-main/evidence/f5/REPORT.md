# F5 renderer-applied focus events

2026-10-15。切片基线 `7cf721586491f0e8959711f88125bb127d5a1bd6`。所有 vendor 构建与修改只在 `/Volumes/PSSD/code/_vendor/f5-gpuix/6a5c7c142ac32f9eb0caefe0121be995cfc18631`，`CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/f5-gpuix/target`；固定 gpuix 与 zed SHA 不变。没有改 F3、共享 vendor、应用源码、依赖或 Live 工程。按协调者明确要求，仅同步 `496a17d` 已评审的 F4b quad 补丁和 `d57b07b` 的生成图片忽略规则，不二次修改 F4b。

## 问题与根因

协调者在 offscreen real-renderer 中观察到 input 的 `getFocusedElementId()` 正确，`focus` listener 已注册，但 JS `events=[]`；已有 input 的显式 focusElement 能收到事件。F5 的原生回归使用同一个 `GpuixView`、retained tree、输入控件和 `EventCallback`，不是第二套焦点模型。

GPUI 源码证据（固定 zed SHA）：

- `crates/gpui/src/app/context.rs:547-567,596-616`：`on_focus/on_blur` 插入订阅，再用 `self.defer` 激活。注册返回不代表监听已经激活。
- `crates/gpui/src/window.rs:2063-2083`：focus 修改窗口 focus id 并 refresh，不直接发送 focus 通知。
- `crates/gpui/src/window.rs:2994-3033`：draw 完成后比较前后 focus path，发送给当时已激活的监听；无事件重放。
- `crates/gpui/src/app/context.rs:305-317`：`defer_in` 在 effect cycle 末尾更新原 view/window，因此可排在监听激活之后。

原 renderer 在 render 内应用 autofocus 和 deferred focusElement，当前 draw 就完成 focus-path 转换；此时 listener activation 尚未执行。下一帧 focus path 已相同，不再产生通知。只把 listener 注册移到 focus 前面、仍在同一 render 内调用 focus，也无法消除 deferred activation 的时序差。

## 产品与范围对照

| 产品规则 | Live 观察 | 实现 | 差异 / 未验证 |
| --- | --- | --- | --- |
| 原生输入获得焦点时交付一次 focus，离开时交付一次 blur | 不适用：修复 renderer 事件交付，不改变 Live 产品规则；未操作 Live | 使用 GPUI 既有 on_focus/on_blur → EventCallback 路径 | 无桌面视觉声明 |
| autoFocus 仅在 handle 创建时执行，之后不抢用户焦点 | 不适用 | 创建时选定；不逐帧重试 | 原生回归与真实 offscreen 消费方验证 |
| pending focusElement 优先于同批 autoFocus，后来的 Tab/click 取消旧请求 | 不适用 | 保留 PendingFocus 仲裁语义 | 不改变应用级焦点 owner |

## UI 规范第 13 节

专项 Acceptance 明确「No desktop window needed」，本切片只改 native 焦点事件时序，不修改可见布局或样式。

| 检查 | 证据 / 边界 |
| --- | --- |
| Gallery 与业务整体布局 | 不适用：专项 Acceptance 不要求桌面窗口；不作视觉完成声明 |
| 跨区域对齐与居中 | 未改可见布局 |
| 间距与内边距 | 未改 token 或样式 |
| 统一设计入口 | 未改共享 UI / theme |
| 尺寸与紧凑感 | 未改；未操作 Live |
| 深浅主题与中英文 | 未改；无视觉声明 |
| 状态与键盘 | 原生 focus/blur、Tab 与真实 DragPad Enter / click→digit 回归；不声称焦点环视觉验收 |
| 拖动、滚轮、弹层与性能 | 未改；不作性能声明 |

## 错题

- 错：把 focus handle 的状态正确、订阅已创建当成 focus 事件已送达；或仅在同一 render 内把订阅移到 focus 之前。
- 因：GPUI 订阅延迟激活，而 draw 当帧结尾已经消费 focus-path 转换；没有补发机制。
- 对：等待 GPUI 原生订阅激活，再应用一次 renderer-owned focus；断言消费者可见事件序列，不只断言 focused id。

- 错：延迟聚焦时只捕获旧焦点 id；旧 owner 退出 focusable 集合后，`Window::focused` 因 handle 最后引用消失而返回 None，合法 autoFocus 被 guard 取消。
- 对：在 deferred 操作期间强持有旧 `FocusHandle`，既保护身份判断，又不恢复旧 owner 的 focusability；用真实 numeric-pad→input 生命周期回归守住它。
- 错：已有目标立即 focus 后清空请求，或只取消旧请求而不仲裁同批 autoFocus，会违背“用户后续导航 → 显式请求 → autoFocus”的优先级。
- 对：已有目标仍同步 focus，但请求保留到下一 sync；同批真实用户移动焦点后，不让剩余 renderer-owned focus 覆盖它。
- 错：把发原生 Tab 当成 JS 默认导航已执行；或在数值控件 idle 态直接发数字，误以为进入了 preEdit。
- 对：分别验证 native 导航端口与完整 JS Tab 默认路径；数字入口先真实点击进入 preEdit，随后观察 input 的 onFocus 消费效果。
- 错：pending intent 只保存可回收 id，或把 renderer 自己的中间 autoFocus 当成用户导航，会丢失跨批显式请求。
- 对：既有基线字段保存稳定 `FocusHandle`；renderer-owned focus 只更新基线，真正用户导航才取消 intent。
- 错：只检查 target 新 listener，忽略本次 source 新 onBlur；或用 Input 的寿命代替真实数值控件的 focusable div 退休。
- 对：就绪条件覆盖整次转换的 target focus/blur 与 source blur。跨退休失败前用真实 div owner 生命周期证明；最初 Input 版本旧实现也通过，未把它冒充有效负例。

## 已验证做法

- 将回归放在补丁的独立 `focus_tests.rs`，直接使用真实 retained tree、GpuixView 和 EventCallback，不扩展公共 API，不修改上游 GPUI。
- 隔离 vendor/target 保留共享九补丁前缀，后续新补丁通过同一个 source-series gate 进行校验。

## 实现与生命周期

- `request_focus` 仅在 target focus/blur 与 source blur 的已声明订阅均就绪时同步聚焦；任一首次声明的订阅未就绪，就等待 sync 激活后完成整个转换。已有、尚未创建两类目标均使用同一个 `PendingFocus`。
- 同一次 sync 的优先级为：请求之后发生的用户焦点移动 → 显式请求 → 新建 autoFocus。被用户覆盖的旧请求会清除，该次 sync 的 autoFocus 也不能覆盖用户焦点。没有新的持久字段或公共 API。
- 只为本次创建的 handle 选择 autoFocus；所有 renderer-owned focus 合并成一个候选，排在 `on_focus/on_blur` 激活 defer 后执行。
- pending intent 的基线字段与 deferred focus 都强持有稳定 `FocusHandle`，不按可回收 id 跟踪 owner；等待跨越旧 owner 退休也不会误判为用户导航。已退出 focusable 集合的旧请求目标不再参与仲裁。
- renderer-owned autoFocus 执行后，更新仍等待创建目标的 pending 基线；这不是用户导航，不能取消显式 intent。真实 Tab/click 仍由原基线比较取消旧请求。
- 不直接发 focus/blur，全部仍由 GPUI focus-path 转换经原 `EventCallback` 交付。跨两个独立 handle 的 blur/focus 顺序不作承诺，单个 handle 的事件顺序和次数严格断言。

### 状态转换表

| source / target | 已声明订阅 | 焦点来源 / 变化 | 动作 | 回归 |
| --- | --- | --- | --- | --- |
| existing target | target focus/blur、source blur 均已激活 | 显式请求 | 同步 focus，保留 pending 至 sync 压过同批 autoFocus | existing exactly-once、existing priority |
| existing target | target listener 本批首次声明 | 显式请求 | 不提前同步 focus；激活后完成转换一次 | existing new listeners |
| existing source → existing target | source blur 本批首次声明 | 显式请求 | 整次转换等待，source blur 与 target focus 都走原订阅 | source new blur |
| missing target | 尚无 handle | 显式请求 | 用稳定 handle 身份保留 intent，等 target 与订阅存在 | deferred focusElement |
| missing 且仍等待 | 中间 autoFocus 目标已注册 | renderer-owned focus | 更新等待中的 intent 基线，下一批目标出现后仍聚焦 | pending survives earlier autoFocus |
| existing 或 missing 的 pending | 任意 | 请求后真实用户 Tab/click | 取消 intent；同次 sync 不再用 autoFocus 覆盖用户焦点 | later navigation 两类回归 |
| new autoFocus | new | 没有更高优先级来源 | 创建时选择一次，激活后聚焦；后续帧不重试 | initial/later batch、no-refocus |
| new autoFocus 加可用显式目标 | old 或 new | 显式请求 | 选择显式目标，不发中间 autoFocus 的 JS focus | explicit priority 两类回归 |
| new input 的旧 owner 退休 | new | renderer-owned focus | 强持有原 handle 到 defer，防止身份 guard 误取消 | owner retirement |
| missing target 等待跨越旧 source 退休 | source 已卸载 | 没有用户导航 | pending 基线持有稳定身份，不以回收后的 None 取消 intent | pending survives owner retirement |
| window 关闭 | 任意 | 终止生命周期 | GpuixView owner 释放其 intent、handles、subscriptions；不产生迟到 target focus | closing window releases pending owner |

## 回归与变异实测

| 变体 / 缺陷 | 失败结果 | 证明的不变量 | 原始日志 |
| --- | --- | --- | --- |
| 恢复旧 `sync_focus_handles` 顺序 | 原生 3 pass / 6 fail | 首批、后续批、deferred、旧 owner、显式优先及同批用户导航 | `native-old-ordering.txt` |
| 同一旧顺序重建真实 `.node` | app 0 pass / 3 fail；两个数值输入 focused id 正确，但 `setInfo("number")` 完全未调用 | Enter / click→digit 的 input onFocus 真正交付，而不是只改变 native 焦点 | `app-old-ordering.txt` |
| defer guard 仅捕获 id，旧焦点 owner 退出 focusable 集合 | 0 pass / 1 fail | 原 handle 生命周期必须覆盖 deferred focus | `native-owner-retirement-before.txt` |
| 已有目标聚焦后不保留显式请求 | 1 pass / 1 fail | 显式已有目标必须压过同批新建 autoFocus | `native-existing-priority-before.txt` |
| 删除用户焦点变化后的 pending 取消分支 | 7 pass / 2 fail | pending 新目标、已有目标都不得抢回后续导航焦点 | `native-user-navigation-mutation.txt` |
| 仅取消 pending，却仍执行同批 autoFocus | 0 pass / 1 fail | 同批 Tab 之后，autoFocus 也不能覆盖用户选择 | `native-same-update-tab-before.txt` |
| renderer 中间 autoFocus 取消等待 intent、target 新 listener 尚未激活 | 9 pass / 2 fail | renderer-owned 基线更新与 target 订阅就绪 | `native-composition-before.txt` |
| 可回收 id 基线、source 新 blur 未就绪 | 12 pass / 2 fail | pending 跨 div owner 退休与整次转换订阅就绪 | `native-stable-identity-before.txt` |

所有变体已恢复。原生十四项回归覆盖前九项，以及 renderer 中间 autoFocus 后跨批等待、existing target 新 listeners、pending 等待跨旧 div owner 退休、source 本批新 onBlur、window 关闭释放 intent owner。十四项已实际通过，不把静态审查或 source gate 当 passing-after。

Rust 单元测试中，Tab 键本身不会执行 JS owner 的默认行为：测试发 Tab 后调用同一个 `Window::focus_next` 原生端口。`drag-pad-focus.test.tsx` 的第三项则运行完整 JS Tab 默认路径；前两项使用真实 `DragPadNumber` 的 `ControlEnvironment.setInfo` 观察 input `onFocus`，数字输入先真实点击进入 preEdit，不伪造事件。

## 实跑门禁

下表中的 vendor 为 `/Volumes/PSSD/code/_vendor/f5-gpuix/6a5c7c142ac32f9eb0caefe0121be995cfc18631`。vendor 命令均显式设置 `CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/f5-gpuix/target`、`CARGO_BUILD_JOBS=6`、`RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin`；根 workspace Rust 使用独立 `workspace-target`。

| 位置 | 命令 | 结果 / 证据 |
| --- | --- | --- |
| 根目录 | `GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f5-gpuix bash scripts/gpuix-main/build.sh` | 最终补丁先全部逆向移除，`check.mjs --pending <vendor>` 列出完整十项，再由脚本从干净源码应用九加一；native release、native JS、React 全通过；`build-and-vendor-gates.txt` |
| vendor `packages/native` | `cargo check --features test-support,gpui_platform/runtime_shaders` | exit 0；同上日志 |
| vendor `packages/native` | `cargo test --features test-support,gpui_platform/runtime_shaders` | 301 pass / 0 fail；包含 focus 回归十四项与已同步 F4b 回归；同上日志 |
| 根目录 | `pnpm install --frozen-lockfile`、`pnpm native:build` | 成功安装本 worktree 消费方依赖并构建真实 `@zoeydaw/native`；不新增或修改依赖 |
| 根目录 | `cargo check`、`cargo test` | exit 0，49 pass；`workspace-rust-gates.txt` |
| `apps/gpuix` | `pnpm exec tsc --noEmit` | exit 0 |
| `apps/gpuix` | `pnpm exec tsc --noEmit -p ../../scripts/gpuix-main/evidence/f5/tsconfig.json` | exit 0 |
| `apps/gpuix` | `bun test ../../scripts/gpuix-main/evidence/f5/drag-pad-focus.test.tsx` | 3 pass / 0 fail；`app-gates.txt` |
| `apps/gpuix` | `bun test` | 1051 pass / 1 inherited todo / 0 fail，169 files；`app-gates.txt` |
| 根目录 | `node scripts/gpuix-main/check.mjs --resolution` | app、renderer、reconciler、Zustand 的 React 与 native runtime 均解析至隔离 f5 vendor；`resolution.txt` |
| 根目录 | `node scripts/gpuix-review-scan.mjs` | 0 hard / 0 warn；`review-scan.txt`。扫描器仅覆盖 app/source 文件，本切片 0 source / 0 test files 被扫描；vendor patch 由独立 reviewer 与 cargo 测试覆盖，不能把扫描器零结果当作 patch 的完整审查 |

最终干净源码重建复用 Cargo 缓存，native napi 阶段实测 40.95s；不称为冷编译。第一轮独立空 release target 的候选构建为 489.40s，但其 id-only guard 后被回归否定，不作为最终正确性证据。最终 `.node` 为 23,850,480 bytes；完整十项 clean prefix 见 `clean-patch-prefix.txt`，已评审 F4b / ignore 原文的 SHA-256 同步证明见 `sync-provenance.json`。构建没有写入共享 vendor。

重新运行消费方证据前，在根目录建立 gitignored 依赖链接：

```sh
ln -sfn ../../../../apps/gpuix/node_modules scripts/gpuix-main/evidence/f5/node_modules
```

## 自审结果

审查基线 `7cf721586491f0e8959711f88125bb127d5a1bd6`；实现提交 `d30034a`、`064a8e2`，已评审基线同步提交 `a0feb8f`；证据提交与完整列表由下面的 git log 给出。完整审查命令：

```sh
git diff 7cf721586491f0e8959711f88125bb127d5a1bd6 -- .gitignore scripts/gpuix-main/config.json scripts/gpuix-main/patches scripts/gpuix-main/evidence/f5 docs/research/gpuix-main-build.md
git log 7cf721586491f0e8959711f88125bb127d5a1bd6..HEAD --oneline
```

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| Scanner 无 HARD / WARN，但不扫描 patch | 记录 | 明确覆盖范围，另派 Standards / Spec 两名只读 pstack-reviewer | `review-scan.txt`、独立审查记录 |
| id-only guard 将旧 owner 退休误判为用户移动焦点 | 必修 | 实测失败后强持有旧 handle，新增生命周期回归 | `native-owner-retirement-before.txt`、最终原生十四项 |
| 已有 handle 的显式请求被同批 autoFocus 覆盖 | 汇报仲裁 | 协调者明确要求本轮统一优先级；已保留已就绪转换的同步聚焦并统一 PendingFocus 仲裁，无新 API | `native-existing-priority-before.txt`、最终原生十四项 |
| 同批用户 Tab 后，新 autoFocus 仍可能覆盖用户选择 | 必修 | 用户覆盖请求时，该 sync 不再选择 autoFocus；新增失败前回归 | `native-same-update-tab-before.txt` |
| 初审时 vendor 源码与补丁存在在途快照差异 | 记录 | 根修复全部重新生成补丁，干净十补丁构建与 source gate 通过 | `build-and-vendor-gates.txt` |
| lint-staged 无法备份未暂存的 intent-to-add 证据文件 | 记录 | 只移除本切片证据的 review-only index 标记，再原样提交；没有操作共享 stash | 实现提交 `d30034a` 的正常 hook 成功 |
| renderer-owned 中间 autoFocus 误取消尚未创建目标的 intent | 必修 | 仅更新既有 pending 基线，真实用户导航仍取消 | `native-composition-before.txt`、十四项回归 |
| existing target 本批新增 focus/blur listeners 时提前聚焦 | 汇报仲裁 | 协调者批准同轮修复，未就绪走原 deferred 路径；静态 event key 无分配查询 | `native-composition-before.txt` |
| pending 等待跨越旧 owner 退休，id 回收导致误取消 | 必修 | 基线字段改 `Option<FocusHandle>`，移除 Copy/Clone，不叠加退休特例 guard | `native-stable-identity-before.txt` |
| source 本批新增 onBlur 在离开时丢失 | 汇报仲裁 | 协调者整体授权统一模型；整次转换检查 target focus/blur 与 source blur | `native-stable-identity-before.txt` |
| window 关闭时稳定 handle 是否保留 owner | 记录 | weak Entity 实测释放，未交付迟到 target focus；无新增 Entity 引用环 | 十四项回归中的关闭测试 |
| Standards / Spec 最终静态复审 | 记录 | 两名 pstack-reviewer 均确认统一模型闭合，无新增成文规范或可执行 Spec 缺陷；运行门禁另列 | `F5StandardsReview`、`F5SpecReview` 最终复审 |
| F4b / ignore 文件超出初始 Ownership | 汇报仲裁 | 仅按协调者明确指令同步已评审 `496a17d` / `d57b07b` 原文；不改共享 vendor，不生成或提交 PNG | 导入来源提交及最终 patch-series gate |

## 提交门禁与进程清理

实现提交均使用本切片已有本地授权与 `USER_CONFIRM_HASH=$(git write-tree)`，正常通过 hook，未用 `--no-verify`。`064a8e2` 的 `ultracite fix` 正常通过，见 `commit-hooks.txt`；导入提交仅包含已评审 patch 与 ignore 规则，不匹配 lint-staged 的代码扩展名。

交付前实跑：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空，退出码 1 表示 grep 无匹配，见 `process-cleanup.txt`。本 worker 没有启动桌面窗口或长期 service，全部有限构建与测试进程已结束；没有停止用户服务。生成 PNG 数量为零，本地已有图片未删除。

## 未实现项与验证边界

- 本切片 Acceptance 范围内没有未实现项。
- 未运行 Windows、Linux、wasm；没有跨平台运行声明。
- 未打开桌面窗口，没有视觉或 Live 行为对照声明；专项验收明确使用 offscreen real renderer。
- 保留应用原有的 1 个 todo；没有新增 skipped / todo 测试，没有修改 app 产品代码。
