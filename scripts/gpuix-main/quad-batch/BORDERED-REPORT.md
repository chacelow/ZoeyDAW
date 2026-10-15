# F4c 原生批量描边验证

2026-10-15。代码 HEAD 为 `509ea5cf66026f93d5f00c8885fed17df203f168`，包含能力提交 `61d04a6267686638e2b2ca05c4a5bd6484fd63ba` 与独立审查后的边界修复；基线为 `b4a55a8`。本报告只记录本 worktree 实跑结果；包含报告的最终交付 HEAD 由 Orca merge_ready 消息给出。

## 接口与绘制

`QuadBatchProps` 增加每 batch 标量 `strokeWidth?: number`、`strokeColor?: string`。填充仍取 `style.color`。几何仍为不可变 `Float32Array`，每记录四个数 `x/y/width/height`，只经现有 imperative `setQuads` 与 ref 上传，不进入 React props 或 state。

- width 默认 0，color 默认 transparent。native batch preflight 先在 f64 上校验有限、非负，再缩窄并校验 f32 有限性；color 使用已有 color parser。错误类型或格式在树修改前报错。
- JSON null 表示移除 prop。缺失或 null width 是 0，缺失或 null color 是 transparent。`JSON.stringify` 将 JS NaN/Infinity 编码为 null，因此该输入按协议移除 prop。真实 native 截图回归覆盖该行为，TS 不另做清洗或校验。
- width=0 保留 F4b 单 fill 路径。width>0 统一先 paint background，再以完全相同 bounds paint border-only quad，与 GPUI `Style::paint` 顺序相同。
- 每 note 一条 geometry record，每 material 一个 retained host。不拆五片，不恢复 TS rounding，不改 zed，不增加依赖或 scale-read API。
- 按实现推导，描边将 GPUI `paint_quad` 调用数从 N 增至 2N。GPUI 会把 border-only quad 切成带 mask 的条带，这是 GPUI 的内部优化；2N 不是 instrumentation 实测值，也不是 GPU draw-call 数。
- host geometry、ancestor mask、buffer copy/ref/remount、pointer/focus/AX 规则不变。未来逐记录颜色可用并列索引 buffer 扩展，不改变四浮点几何 ABI；本轮未实现该能力。

原始“单 filled-and-bordered quad”与 exact alpha 契约冲突。真实 Metal 结果表明，div 的两次 render-target blending 与单 quad 在 shader 内合成存在 8-bit 量化差异。协调者通过 Orca ask 批准统一双 paint，不按 opaque/alpha 分支，也不放宽像素阈值。

## 原生 div oracle 与像素

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| 无描边能力的基线 | opaque 193 个不同像素，比较命令 exit 1 | `/tmp/f4c-before/opaque-{quad,div}.png` |
| 单 filled-and-bordered quad 候选 | alpha 169 个不同像素，比较命令 exit 1 | `/tmp/f4c-after-first/alpha-{quad,div}.png` |
| 最终 opaque、alpha fill+alpha stroke、整体 opacity、zero stroke | 四例 decoded RGBA 全部 0diff | `/tmp/f4c-acceptance/paint/` |
| zero stroke 与改动前 F4b output | decoded RGBA 0diff | `/tmp/f4c-before/zero-stroke-quad.png` 对最终同名 fixture |
| scale 1、1.25、1.5、2 | GPUI div scene oracle 全通过，比较 painted bounds、border widths、颜色 alpha 与 paint 顺序 | patch 中 `quad_batch_paint_tests.rs::bordered_quad_matches_div_metrics_at_all_scales` |
| 移除 stroke 的源码变异 | native targeted suite 7 pass、1 fail，exit 101；错误为实际 0px 与 div 1px border width | service `f4c-omit-stroke-mutation` |
| 恢复变异后完整 native suite | 309 pass、0 fail | service `f4c-restored-native-tests` |

默认 scale 像素 fixture 同时覆盖 fractional position/size、fractional host origin、重叠顺序与 ancestor mask。非默认 scale 是原生 scene 几何 oracle，不是像素截图。协调者明确批准沿用 F4b 的这一验收组合，并否决扩展截图 scale API。

源码变异只改独立 vendor 中 border paint 的 `Edges::all(px(stroke_width))` 为 `Edges::all(px(0.0))`。变异未写入 canonical patch，已恢复原文件；`check.mjs --sources` 再次验证完整十一补丁字节一致。

## 真实 MIDI 几何

只读 instrumentation 从 clip-editors 当前 `notePaint` 调用中导出初始画面实际 no-text note 几何、fill、border、overlap plane 与 viewport。它只在内存中修改 loader 内容，不改消费者源码；输出改到仓库外，并在初始 screenshot 后立即结束 probe 的交互循环。引擎和 TestRoot 经原 probe finally 释放。

- authored notes 与可见 no-text records 均为 10,000。
- viewport 为 `x=54,y=73,width=1046,height=306`；外层画面为 `1100×420`。
- 112 个 material batches，共 40,000 floats；没有输入诱发的滚动或缩放。
- 消费者快照 SHA-256：`6691966b34c5f3d1de5656bd908eeed161e767fc9f219e72e6112e4cd7c49029`。最终 preload 再导出的快照哈希相同。
- DEV 与 production 的 native div/描边 batch 比较均为 decoded RGBA 0diff，RGBA SHA-256 均为 `3360036c116540d77c4425135b89ebe1e7b85198378f91bb0937533ad95a6e57`。
- 将相同 workload 改为 fill-only 后，比较出现 140,000 个不同像素。该负例不改变 viewport。

证据目录为 `/tmp/f4c-consumer-dense/`、`/tmp/f4c-consumer-final/` 与审查修复后的 `/tmp/f4c-reviewed-acceptance/{paint,development,production}/`。生成 PNG 与完整 measurement JSON 未提交。

业务消费代码没有修改。这里验证的是当前消费者实际导出的完整 note 几何与材质，不宣称 clip-edit 产品路径已经切换新描边 API；调用切换归 clip-edit owner。

## 同负载 render/upload smoke

每模式使用同一份消费者快照。fill/stroke 的每次 sample 都在计时外创建新的不可变 buffer，再上传全部 batches 并执行一次 native flush，共 20 samples。统计为 CPU wall time 与 renderer frame-overlay CPU 时间，不是 GPU completion 或桌面 frame latency。模式顺序会影响 warm-up，mount 数据只作 smoke，不作统计性能结论。

| React 模式 | 原生路径 | retained nodes | mount ms | 平均 upload ms | 平均 upload+flush ms | 平均 native currentMs |
| --- | --- | --: | --: | --: | --: | --: |
| DEV | div | 10002 | 119.082 | 不适用 | 不适用 | 不适用 |
| DEV | fill batch | 114 | 5.838 | 0.109 | 0.666 | 0.547 |
| DEV | stroke batch | 114 | 2.962 | 0.168 | 1.197 | 1.015 |
| production | div | 10002 | 82.187 | 不适用 | 不适用 | 不适用 |
| production | fill batch | 114 | 3.125 | 0.094 | 0.634 | 0.532 |
| production | stroke batch | 114 | 1.940 | 0.142 | 1.070 | 0.915 |

两种 batch 都只有 112 hosts 与 2 个组合 div。描边的额外原生 paint 工作可在同负载数据中看到，上传记录数和 retained node 数没有增加。

## 可复跑命令

以下命令从本 worktree 根运行。消费者 worktree 只读，所有生成证据在仓库外。

```sh
F4C_CONSUMER_OUTPUT=/tmp/f4c-consumer-dense bun \
  --preload "$PWD/scripts/gpuix-main/quad-batch/consumer-geometry-preload.mjs" \
  /Users/caishilong/orca/workspaces/zoeydaw/gpuix-b2-clip-editors/apps/gpuix/src/project/sections/clip-edit/verification/consumer-probe.tsx \
  f4c dense midi

bash scripts/gpuix-main/quad-batch/verify-bordered.sh \
  /tmp/f4c-acceptance /tmp/f4c-consumer-dense/geometry.json
```

`verify-bordered.sh` 对每对 PNG 调用现有 decoded RGBA comparator；任一不同像素使脚本非零退出。消费者 instrumentation 对源码锚点变更报错，不静默导出替代数据。孤立的 fill-only 控制组不要求与 bordered div 相同。

## 构建与门禁

独立 vendor：`/Volumes/PSSD/code/_vendor/f4c-gpuix/6a5c7c142ac32f9eb0caefe0121be995cfc18631`。vendor target：`/Volumes/PSSD/code/_vendor/target-f4c`。workspace target：`/Volumes/PSSD/code/_vendor/f4c-workspace-target`。共享 vendor 未重建、未修改。

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | 通过，安装已有锁定依赖 |
| 独立 vendor `git restore --source=HEAD --staged --worktree .` 后，`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f4c-gpuix CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f4c CARGO_BUILD_JOBS=4 bash scripts/gpuix-main/build.sh` | 从 pristine revision 重新应用完整十一补丁，release native 与 JS/React build 通过 |
| vendor：`CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f4c CARGO_BUILD_JOBS=2 cargo check --release --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders` | 独立审查修复后通过 |
| vendor：同环境 `cargo test --release --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders --lib` | 独立审查修复后 309 pass、0 fail |
| 根：`CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/f4c-workspace-target CARGO_BUILD_JOBS=2 pnpm native:build` | 通过 |
| 根：同 workspace target 与 jobs 的 `cargo check`、`cargo test` | 全部通过；native 19 项通过 |
| `pnpm --dir apps/gpuix exec tsc --noEmit` | 通过 |
| `pnpm --dir apps/gpuix exec tsc --noEmit -p ../../scripts/gpuix-main/quad-batch/tsconfig.json` | 通过 |
| `cd apps/gpuix && bun test src/shared/quads` | 独立审查修复后 4 pass、0 fail，29 assertions |
| `cd apps/gpuix && bun test` | 1068 pass、1 既有 todo、0 fail，170 files；todo 为 `project/model/grid.test.ts:66` |
| `node scripts/gpuix-main/check.mjs --sources <独立vendor>`、`--resolution` | 通过；app/native/renderer/React/Zustand 使用独立 F4c renderer 对应 React |
| `node scripts/gpuix-review-scan.mjs` 与 `node scripts/gpuix-review-scan.mjs b4a55a8` | 各 1 source、1 test，0 HARD、0 WARN |
| `pnpm exec eslint --no-warn-ignored --max-warnings 0`，覆盖 shared/quads 两文件和本轮三个 JS/TS oracle 文件 | 通过 |
| 本地 commit hook `ultracite fix` | 通过，未使用 `--no-verify` |

第一次冷构建在创建未纳入 patch 的新 test 文件后被 untracked-source guard 拒绝记录，未绕过门禁。生成 patch 时曾把非本切片 intent-to-add 文件的删除带入 diff，随后改为按原 quad patch 的明确文件列表生成；最终 clean eleven-patch build 和 source verification 均通过。上述失败没有改共享 vendor。

独立审查修复后 clean build binary SHA-256：`930a353d48d670d9e1c50f0e0a23f276bcc0434a8394cd9dc42e677a1f8e5972`。上游已有 objc cfg、dead-code、future-incompat、workspace profile 警告没有新增修复；本轮门禁无错误。

## 补丁顺序与 canonical 同步

协调者在最终同步 ask 中确认主干仍为 `b4a55a8`，F3/F5 canonical 未变化；本轮只替换第 9 个 quad patch。

| 顺序 | patch | SHA-256 |
| --- | --- | --- |
| 1 | close-guard.patch | `4ea0d7d85148b369e7ba39716f53876c9730d66c5af4bdcb86746cf80fb9966d` |
| 2 | frame-callback.patch | `b4c7556c855b5069e04b0bd6409ab25ac0d6796f26f596e36071519655814d03` |
| 3 | input-select-all-on-focus.patch | `f3e94f831cd6e99dfee1870549d0a2c4c86ad5f630cb357f00170143a465862c` |
| 4 | anchored-center.patch | `97f8929769c5ec29e7458877e7b7ada5ccd11df1d6bcc41f43f11c728cc5f5c4` |
| 5 | select-trigger-space.patch | `d8396aa81ea76a69022616a985b5a91132e70c836fb9b5bcf0eb584abfb8f5fc` |
| 6 | window-active-change.patch | `09b4267e192cad6a96a2bf807e1fa2ecb97226e63265086d407bef446d9fe707` |
| 7 | window-appearance-close.patch | `ae02a3fdc988911b195744966ab84dea56a8e3f320e67fc8cd17bea9a4a988b6` |
| 8 | context-menu.patch | `0ccd768609d0627b4dc82a07e16e0aabb9c337ea4565511c6f8fd7b15f428f8d` |
| 9 | quad-batch.patch | `89895d324c09479ac14e0fd34a3ccadd5f040396130707817be74c83e3d1acd9` |
| 10 | autofocus-focus-event.patch | `61466c01374135b441724545ad708aa7c8e8a9147584710f176e4595e5c99f53` |
| 11 | resume-frame.patch | `d9340e770ed1b4887142aab2c59b0572db3a76f89a966db73f0d0482cacf995b` |

## UI 规范第 13 节

本切片是 renderer paint 能力，规格明确 no desktop，不新增控件或改变业务交互。未打开 Gallery、Live 或任何可见窗口，不将离屏截图称为 desktop QA。

| 检查 | 本轮证据或边界 |
| --- | --- |
| Gallery 与业务整体布局 | 未改变布局；实际消费者初始 viewport 的完整 10,000-note 几何组合有 GPU pixel oracle，不是整页新版消费者截图 |
| 跨区域对齐与居中 | 无标题、文字或图标修改；fractional host origin 与单 note bounds 以 native div 对比 |
| 间距与内边距 | 无 token、gap 或 padding 修改；实际 note geometry 无 TS rounding |
| 统一设计入口 | stroke metadata 在单一 native quad-batch 路径拥有；theme 未修改 |
| 尺寸与紧凑感 | 同消费者实际宽高；四种 scale 的 border metric 与 div 一致 |
| 深浅主题与中英文 | 无 copy/font/theme 改动；未宣称这四种业务组合验证，本轮测试颜色来自实际消费者和针对性 alpha fixture |
| 状态与键盘 | shared/quads 原生 input pass-through、imperative/ref/remount 回归通过；没有新增可交互或 AX 节点 |
| 拖动、滚轮、弹层与性能 | 无交互修改；DEV/production 同几何 upload/render CPU smoke 已记录，未测桌面 GPU completion |

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| 保留现有 note div 的几何、边框与 alpha | 本任务无桌面，不新增 Live 观察 | 使用本项目真实 GPUI div oracle 保留既有行为 | 无新的 Live 交互规则；Live 与整页消费者接入由业务 owner 验收 |

## 独立 Standards/Spec 审查

`pstack-reviewer` 只读审查完整 `git diff b4a55a8..61d04a6267686638e2b2ca05c4a5bd6484fd63ba -- .`，随后复查所属路径的修正与本报告，没有运行 build、test、lint 或 formatter。最终代码提交列表可由 `git log --oneline b4a55a8..509ea5cf66026f93d5f00c8885fed17df203f168` 查看。两项必修与一项记录均已关闭，没有新增必修或汇报仲裁项。

负宽度下溢已先实跑 failing-before：`bun test src/shared/quads/QuadBatch.test.tsx --test-name-pattern "invalid native stroke updates"` 在 `-1e-100` 上显示 `Received function did not throw`，exit 1。修复先验证 f64 符号，再缩窄为 f32；重建后 shared/quads 4 pass、29 assertions，vendor 309 pass、完整 app 1068 pass、0 fail。原生 atomic test 与真实 renderer screenshot regression 都保留该输入。

exported-interface 修改前实际执行的 LSP references：

- 独立 vendor `packages/native/js/host.ts:598`，symbol `QuadBatchProps`，返回 1 reference，随后才添加两个 optional metadata 字段。
- `apps/gpuix/src/shared/quads/QuadBatch.tsx:6`，symbol `QuadBatch`，返回 11 references，包含共享测试与 F4 verification 调用点。

## 自审结果

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| 单 quad 与 div alpha 有 169px 差异 | 汇报仲裁 | 协调者批准统一 background/border 双 paint，全部 targeted RGBA 0diff | 首轮 alpha PNG、Orca ask reply、最终 oracle |
| 现有 screenshot API 无测试 scale 参数 | 汇报仲裁 | 协调者否决扩展 API，批准四 scale scene 加默认 scale pixel 组合 | 原生 div oracle、Orca ask reply |
| JSON 非有限数变为 null | 汇报仲裁 | 协调者要求 native 统一校验，明确 null 默认语义并加 native screenshot regression；移除 TS 第二套验证 | `QuadBatch.test.tsx` metadata regression、F4 契约 |
| scanner | 记录 | 两种 baseline 均 0 HARD、0 WARN | committed slice scan 输出 |
| inherited `std::sync::Mutex` | 记录 | 沿用 renderer 已批准锁契约，不新增依赖或做无关锁迁移 | F4 契约锁例外；本轮只新增 paint metadata |
| 既有 app todo | 记录 | 不改非所属的 grid keyboard 测试 | `project/model/grid.test.ts:66` |
| 有限负 f64 宽度下溢成 f32 负零，绕过原校验 | 必修 | f64 先检查有限与符号，再缩窄；两层 atomic regression 加入 -1e-100 | failing-before exit 1；修复后 shared/quads 4 pass/29 assertions、native 309 pass、app 1068 pass |
| F4 文档链接的交付报告在初次审查提交中缺失 | 必修 | 补齐本报告、命令、hash、边界与自审记录，独立复查关闭 | `BORDERED-REPORT.md`，reviewer 回执 |
| `nativePaintCalls` 为实现推导值 | 记录 | 报告区分 paint API 调用模型、renderer CPU 时间与未测 GPU draw-call | 本报告接口与 smoke 口径，reviewer 复查关闭 |

## 错题

- 错：把单 quad 的 shader 内 alpha 合成当作 div 两次 render-target blending 的逐字节等价。
- 因：中间 8-bit 量化不同，真实像素出现 1 通道差异。
- 对：相同 bounds 按 div 顺序双 paint，以 decoded RGBA 比较证明，不用肉眼或容差替代。
- 错：从存在 intent-to-add 的完整 vendor 生成无路径限制的 quad diff。
- 对：按原 quad patch 的明确文件列表生成，并从 pristine revision 重放完整 canonical series。
- 错：先把负 f64 宽度转成 f32，再检查非负，极小负数可下溢为 -0。
- 对：先验证原数值的有限性和符号，再检查缩窄结果；保留 -1e-100 的 native atomic 与 pixel regression。

## 已验证做法

- 原生 `pixel_snap_bounds` 处理 authored local metrics，`paint_quad` 处理绝对 bounds 与 border device pixels，不在 TS 补偿。
- border 与 fill 共享一条几何记录；显式 native metadata 在 mutation apply 前验证，错误 batch 保持既有树与像素不变。
- 消费者 loader 只读导出实际初始几何，立即停止后续输入，再对同一 viewport 作 div/batch 比较，避免不同交互造成假差异。
- 真实 Metal 像素、四 scale GPUI scene、源码变异和 DEV/production 同负载分别证明各自边界，不混用为未运行的 desktop QA。

本切片无占位实现。Windows/Linux、非默认 scale RGBA、Live/Gallery desktop、逐记录颜色与消费者产品代码切换均未执行；这些不是本轮获批交付范围。

## 进程清理

所有本切片 named build/test services 已自然退出。没有启动 `bun --hot`、可见 demo/Gallery 或 `cargo run`；离屏 GPU fixture 的 Bun 进程在 finally unmount 后退出。

交付前实跑：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

stdout 为空，grep exit 1 表示没有匹配进程。零残留，没有停止用户或协调者进程。
