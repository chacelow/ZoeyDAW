# R2-rust 交付报告

## 结果与范围

RUST-01 至 RUST-05 已实现，五项均有修前失败、修后通过的行为回归；六个还原缺陷的变异全部被杀死。仅修改 `crates/engine/**`、`crates/native/**`；没有修改 `platform/engine.ts`，默认 JS API 不变，没有新增依赖。未实现项：无。

实现提交：

- `602aee79` — `fix(engine): compile audible mixer routes`
- `06ec6cea` — `fix(native): preserve concurrent atomic saves`
- `5aa8e04d` — `fix(native): bound session resource ownership`
- `b362b312` — 合入协调者要求的 `gpuix-migration` 工具前置，修正共享 renderer 清单格式不兼容；没有自行改写共享 vendor 或清单。

完整实现 diff：`git diff ea11b3f1...HEAD -- crates/engine crates/native apps/gpuix/src/platform/engine.ts`。本报告单独提交，不含额外功能。

## 行为、红绿与变异

| 项目 | 根因修复 | 修前红灯 | 修后行为与变异 |
| --- | --- | --- | --- |
| RUST-01 | 控制线程分析 Solo Return 的上游供给和下游输出路径；先验证完整图，再裁去不可闻路由 | `return_solo_keeps_only_selected_wet_route_and_respects_source_solo` 输出 `[2.4142137,2.4142137]`，期望仅选中 Return 的左路湿声 | 两个 Return、干声隔离、Group 上游、pre/post、普通轨同时 Solo、Return mute 通过；禁用 Return Solo 路径选择时失败 |
| RUST-02 | Mixer volume/Send 独立使用 `mixer_gain`，最低端点精确归零；Clip 保留普通 dB 增益 | volume 与 send 两项均输出 `[0.00049999997,0.00049999997]` 而不是零 | Audio/Main 最小音量、Send「缺省→调高→到底」和 Clip `-60 dB` 非零值通过；分别还原 volume/send 转换时失败 |
| RUST-03 | 删除跨进程目录扫描；失败只清理当前写入创建的临时文件 | 双进程屏障：A 已建临时文件，B 保存同目录另一目标，A rename 报 `NotFound` | 两个进程均完整保存，目录最终只有两个目标；重新删除其他 PID 临时文件时失败 |
| RUST-04 | 序列化前取得共享 one-in-flight reservation；RAII 完成释放，失败停止当前订阅，不重置替换订阅的 reservation | 真实 `.node`、JS 阻塞 500 ms 后 retained telemetry payload 为 13 | 三轮阻塞均至多一份，throwing listener 后恢复交付，dispose 后归零；禁用 reservation 排他性时失败 |
| RUST-05 | 每 Env 仅一个 cleanup owner，集合只含活跃 Session；dispose 删除 ID，Env teardown 释放剩余 Session | 真实 `.node` 重复 open/dispose 后 cleanup owners 从 1 增至 2 | 24 轮显式重复 dispose 保持一个 owner，三个 Worker Env teardown 恢复资源基线；每 Session 重建 owner 时失败 |

修前原始输出：`artifact://6`（volume）、`artifact://8`（send）、`artifact://12`（Return Solo）、`artifact://18`（双进程保存）、`resources.mjs` 首次运行（遥测 13、cleanup 2）。最终 `CARGO_TARGET_DIR=… node crates/native/verification/mutations.mjs` 输出六行 `RUST-01`／`RUST-02 volume`／`RUST-02 send`／`RUST-03`／`RUST-04`／`RUST-05` 的 `killed by`，全部通过。

## 产品规则 → Live 观察 → 实现 → 差异／未验证

只读观察用户已打开的 Live，没有按键、修改控制、播放、改动工程或切换前台。

| 产品规则 | Live 观察 | 实现 | 差异／未验证 |
| --- | --- | --- | --- |
| 单独 Solo Return 只听它的湿声，保留上游 Send | Live「无标题」窗口 ID `104465` 的 AX：`A-apply` 包含「独奏/选听」`e443=0`、`Post e444`、轨道音量 `e445=1`；普通轨有对应 Send `e411/e426`；[Live 12 官方 Mixing 文档](https://www.ableton.com/en/manual/mixing/) 明确 Solo Return 会静音其他轨主输出但保留 sends | 编译上游供给与下游输出掩码，render 不增加分配 | AX 证明控件及路由存在，不证明用户 Live 工程的可闻结果；没有改动该工程做听音实验 |
| 普通轨 Solo 与 Return Solo 同时激活 | 未修改用户 Live 的 Solo 状态 | 按协调者裁定：Return Solo 优先；普通 Solo 仍限制上游来源，但来源干声不输出 | 这是本轮明确批准的产品规则；真实 Live 同时 Solo 的听音未验证 |
| Mixer 最低端点显示 `−∞` 时 DSP 精确静音 | AX 只读观察现有音量和 Send，没有把用户控制拉到底；本轮审查报告已定位生产 UI 的 `-60` 最低值和 `−∞` 显示 | volume/Send 最低端点映射零，Clip gain 保持数学语义 | Live 最低端点未操作；本项目零样本与 Clip 非零样本由解析行为回归证明 |

## 实际验证

Rust 及独立原生回归的 target 均为 `/Volumes/PSSD/code/_vendor/target-r2-rust`，没有使用共享 Rust target。命令中的环境变量必须显式设置；提交脚本不写死机器绝对路径。

| 命令／场景 | 实际结果 |
| --- | --- |
| `CARGO_TARGET_DIR=… cargo check --workspace` | 通过 |
| `CARGO_TARGET_DIR=… cargo test --workspace` | 54 passed：engine 35、native 19；0 failed |
| `CARGO_TARGET_DIR=… cargo clippy --workspace --all-targets -- -D warnings` | 通过 |
| `CARGO_TARGET_DIR=… cargo clippy --workspace --all-targets --features verification -- -D warnings` | 通过 |
| `CARGO_TARGET_DIR=… node crates/native/verification/resources.mjs` | 真实 N-API 两项通过，0 failed；测试包含阻塞 JS、listener throw、显式 dispose 和 Worker Env teardown |
| `CARGO_TARGET_DIR=… node crates/native/verification/mutations.mjs` | 六项全部 killed；不是编译失败或源码断言 |
| `CARGO_TARGET_DIR=… pnpm native:build` | 默认 release 构建通过；Bun 直接加载后验证 `nativeVersion()`，`engineVerificationResources` 不存在 |
| `CARGO_TARGET_DIR=… pnpm verify:gpuix` | 最终 `verify:gpuix passed`；tsc 0 errors、eslint 0 warnings、architecture 80 passed、Bun 1224 pass/0 fail/1 既有 todo、UI map current |
| 完整门禁中的真实后端离屏应用 smoke | Home→工程→恢复首帧通过；`nativePlaying=true`、`nativeBar=20.066618854333335`、workspace 恢复 `904.5389679893333`、frames 21；末尾 `released idle` |
| 命名后台窗口 `r2-rust-background-smoke` | `GPUIX_BACKGROUND=1 bun --hot src/main.tsx` 启动，PID 40049，窗口 ID `147992`、标题 `zoeydaw`、未聚焦；只读 AX 确认原生窗口；17.7 秒后关闭 service |
| `node scripts/gpuix-review-scan.mjs` | 0 HARD、0 WARN；本切片 0 TS 源码／0 TS 测试，该扫描不替代 Rust 审查 |
| 绝对路径专项检查 | 对拥有路径的源码／脚本检查禁止的字面量前缀，无匹配 |

独立 verification 构建命令由 `resources.mjs` 执行：`cargo build -p zoeydaw-native --features verification`，再复制本 target 的 debug 动态库为 `verification/zoeydaw-native.node`；从未覆盖 `crates/native` 的正式 `.node`。计数器及导出在非 verification 构建完全编译掉。

第一次完整门禁遇到共享 vendor 清单格式变化而停在 identity。协调者确认 TD-03 已升级格式，要求合入 `gpuix-migration`；同步后 `build.sh` 输出 `Linked verified gpuix build without rebuilding or acquiring the build lock`，完整门禁通过。未运行 `--record`。

## 自审结果

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| Return Solo 与普通 Solo 的组合语义需裁定 | 汇报仲裁 | 按协调者 A 方案：Return 优先；已写入 engine README 和回归 | Orca ask 的明确回复；`return_solo_keeps_only_selected_wet_route_and_respects_source_solo` |
| 真实 N-API 资源不可从默认 API 观测 | 汇报仲裁 | 批准 default-off `verification` feature／导出，产物留私有 target，产品不含计数器 | Orca 明确批准；默认 binary 导出边界检查 |
| 预提交发现 Cargo PATH 调用、Rust format 字串被 JS 插值规则命中、动态 replace 值 | 必修 | Cargo 从 home／`CARGO` 推导绝对可执行路径，修正 mutation 模板，replacement 使用函数 | `ultracite fix` 与最后预提交均通过，没有 `--no-verify` |
| 用户新增禁止固定绝对路径规则 | 必修 | runner 强制外部传入 `CARGO_TARGET_DIR`，不硬编码 `/Volumes` 等机器目录 | grep 无匹配；最新 scan 0 HARD |
| 首次 renderer identity 因共享清单升级失败 | 汇报仲裁 | 按协调者同步工具前置，只重新建链接 | `b362b312`、最终完整门禁通过 |
| review scan 未覆盖 Rust 文件 | 记录 | 明确扫描边界，另用 cargo check/test/clippy 与独立 Rust 审查补足 | scan 0 source、0 test；Rust 54 passed |
| Standards 独立审查 | 记录 | 无硬性违规、无有维护后果的 heuristic findings；无需修复 | `RustStandardsReview`，只读 `pstack-reviewer` |
| Spec 独立审查 | 记录 | RUST-01..05、回归、变异、测试构建隔离均符合；无确认的遗漏或越界 | `RustSpecReview`，只读 `pstack-reviewer` |

两个 reviewer 均按 `git diff ea11b3f1...HEAD -- crates/engine crates/native apps/gpuix/src/platform/engine.ts` 和上述三个实现提交审查，Standards 轴包括架构「代码质量底线」；没有把 reviewer 的静态审阅当成独立运行测试。

## 错题

- 错：bounded TSFN queue 等于 bounded native allocation。对：先取得 one-in-flight 所有权再准备 payload，用真实 JS 回压和 Drop 计数验证。因：锁定 napi 版本在 QueueFull 时不回收内部 opaque payload；容量一不能阻止重复失败分配。
- 错：不同 PID 的临时文件可以当成崩溃残留删除。对：保存只清理自己事务的失败文件，不凭文件名推断存活状态。因：另一进程可能已经持有该文件句柄但尚未 rename。
- 错：显式 Session dispose 释放线程就等于所有原生注册都释放。对：Env 只注册一个 cleanup owner，其集合只跟踪活跃 Session。因：每 Session hook 会累积到 Env 结束；[napi Env 文档](https://napi.rs/docs/concepts/env) 的 hook 生命周期与 Session 不同，锁定版本 remove hook 也不回收其包装分配。

## 已验证做法

- 同步屏障置于真实原子保存创建临时文件之后，让另一进程完成同目录保存后再继续；确定性复现删除竞态，不靠碰运气压力测试。
- 原生资源回归使用默认关闭的 Cargo feature 观测 RAII 活资源，真实 `.node` 和 Worker Env 测状态；产品构建完全移除探针，避免 RSS 阈值或 mock 回声。
- Solo 路由掩码在控制线程构建，原始图完整验证后再剪枝；音频 render 不增加遍历图、分配或第二份 PCM。
- mutation runner 检查目标行为测试确实失败，拒绝把编译错误当作 killed，并在 `finally` 恢复源文件。

## 进程清理与验证边界

验证后立即关闭自己启动的后台窗口；所有 Node/Rust 回归子进程正常退出。交付前实际运行 `ps -axo pid,etime,command`，再用工具按 `bun .*--hot|cargo run|gallery|demo|40049|zoeydaw_native|resources\.test` 筛选；输出为 **No matches found**（`artifact://61`）。没有停止用户服务。

没有更改可见 UI，UI 规范第 13 节的外观、尺寸、间距、排版、动效、焦点等视觉验收不适用；后台窗口 AX 只证明启动和释放，不作为视觉截图证据。前台真实组合视觉、硬件听音、用户 Live 的实际 Solo 音频对照未验证，由协调者收尾验收；已验证的是解析混音样本、真实 N-API 生命周期、真实后端离屏应用主路径。
