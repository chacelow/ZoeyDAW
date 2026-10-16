# R2：2026-10-16 全仓审查修复

审查报告在 `docs/reviews/2026-10-16-codebase/`（README 是总表，同目录六份分片报告有每条的位置、复现路径和建议）。本规格把问题按拥有路径分成七个互不重叠的切片。你只做分给你的那一节；必须跨路径时先用 `orca orchestration ask` 说明要改的确切文件和行，等协调者批准。

公共要求：

- 每一项先按报告里的复现路径写一条能失败的行为回归（修前红、修后绿），再修根因。复现不出来就带着证据 ask，不要硬改。
- 每项至少一个变异（还原修复时回归失败），沿用你所在目录已有的 `verification/mutations*` 入口；没有就新建一个同风格入口。
- 删除旧路径，不留兼容层，不用 catch/clamp 掩盖。
- 回归测的是使用者能观察到的行为（状态、输出、事件是否被消费），不测源码文本或内部调用次数。
- 交付前跑 `pnpm verify:gpuix`，先发 merge_ready，复核合入后再发 worker_done。需要真实前台窗口的验收写进报告，由协调者统一做，不申请桌面。

## R2-app：工程打开与离开（P0）

拥有路径：`apps/gpuix/src/app/**`、`apps/gpuix/src/platform/{i18n,log}/**`；`project/adapters/snapshots.ts` 仅限新增“打开已有工程”所需的入口（不改校验，校验归 R2-project）。

1. UPA-01：打开已有工程（首页 recent、启动路由）时读取并校验保存的快照再 hydrate；新建工程不读。没有快照时保持空工程且不报错；快照损坏时进入现有的 snapshotError 显示，不能用默认工程覆盖原 key。回归：保存 → 重新挂载同 id → 内容一致；损坏快照 → 原 key 内容不变。
2. UPA-02：离开或替换 dirty 工程（Back、打开/新建另一个工程、路由替换）复用窗口关闭的 save/discard/cancel 决策；Cancel 留在原工程，保存失败不离开。
3. UPA-03：语言设置读写加失败边界：读取失败用默认语言并记诊断，写失败保留内存语言，不产生未处理 rejection。
4. UPA-08：console 与 native sink 分叉前统一脱敏，sink 不再拿原始参数。

## R2-project：工程核心

拥有路径：`apps/gpuix/src/project/{model,stores,adapters}/**`（`snapshots.ts` 的打开入口除外）。

1. PC-01：已进入 `recordingPending` 的录制在 commit 与 recover 连续被拒绝时不能丢；release/reopen 后仍在。
2. PC-02：快照边界按一基 bar 坐标校验（loop、clip startBar 等），非法快照 restore 返回失败且不替换当前工程。
3. PC-03：复制 Group 保持原子树连续，副本子树整体插在原子树之后。
4. PC-04：`createNativeBackend` 构造中 telemetry 注册失败时 dispose 已打开的 handle 再抛出。

## R2-arrangement

拥有路径：`apps/gpuix/src/project/sections/arrangement/**`、`docs/architecture/gpuix-arrangement-composition.md`。

ARR-01 到 ARR-07 全部（epoch 改变后清 clipDrag/clipResize；freehand 覆盖经过区间；无效位置释放不提交；Clip 编辑区 Cmd/Ctrl+S 保存；编辑面单一 Tab owner；lane 失焦取消；minimap 静态内容与播放头分离）。ARR-04 若需要 `app/project/composition.ts` 改动，先 ask。

## R2-sections

拥有路径：`apps/gpuix/src/project/sections/{clip-edit,footer,browser,transport}/**`。

SEC-01 到 SEC-05 全部（大选区剪贴板往返；MIDI 选区按稳定身份；拖动中滚动的时间差；Browser 搜索 Escape 焦点；性能弹层 phase 本地化）。SEC-02 若需要给音符加稳定 ID 而改 model，先 ask。

## R2-ui：共享控件与面板

拥有路径：`apps/gpuix/src/ui/**`。

UPA-04 到 UPA-07（DragPad 接窗口失活取消；Menu、CollapseDivider、DragPad 处理过的键 preventDefault/stopPropagation，Space 保持冒泡）。回归在真实 window keyboard 组合里断言 timeline 没有收到该键（例如 rewind/关闭 Clip Edit 没发生）。UPA-04 需要从 app 注入 activation 时，改 `app/NativeRoot.tsx` 的注入点前先 ask。

## R2-rust

拥有路径：`crates/engine/**`、`crates/native/**`、`apps/gpuix/src/platform/engine.ts`。

RUST-01 到 RUST-05（Return Solo 语义；Mixer 音量/Send 最小端点静音，不改 Clip gain；原子写不删别的活跃进程的临时文件；遥测 one-in-flight 不泄漏；session dispose 释放 cleanup hook）。Rust 测试用自己的 `CARGO_TARGET_DIR`（`/Volumes/PSSD/code/_vendor/target-r2-rust`），不要动共享 vendor。RUST-01 的路由语义先在报告里写清楚 Solo Return 时谁能被听到，再实现。

## R2-tooling

拥有路径：`scripts/**`（`scripts/orchestration/**` 除外）、`tooling/eslint/**`、`.lintstagedrc.json`、`.husky/**`、`docs/architecture/gpuix.md`、`docs/agents/setup.md`。

TD-01 到 TD-08 全部。TD-05 打开 app/main 的 DOM 规则后若报出现有代码违规，列出违规点 ask，不要自己改 `app/**`。TD-03 实现真正的 link-only 路径后，用一个已构建好的独立 vendor 根验证“已构建时不重建、不取锁”，不要碰共享 vendor。
