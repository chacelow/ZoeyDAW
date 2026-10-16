# F7：正式窗口按正常帧合并绘制

## 范围与决策

协调者批准运行时隔离方案 A：在 GPUI `App::flush_effects` 保留编译 cfg，并仅让非 `Production`（现有 `Test`）模式执行测试用同步 draw。正式窗口继续执行已有 dirty-window `schedule_frame`；保留 `test-support`、`TestGpuixRenderer`、`createTestRoot` 与 F3 `RESUME_FRAME.invalidated`。不新增 timer、失效队列、commit API、依赖或第二份 renderer。

已比较但未采用：只合并 `request_invalidate` 会遗漏 `setImage`、focus、clock 等直接 window update，tick 阶段也仍是同步 draw；拆分测试/正式二进制会扩大构建及解析契约。事实与比较见本会话停点材料 `/tmp/f7-redraw-options.md`，协调者已明确批准本地 zed 补丁及严格双仓补丁校验。

所有 vendor 操作限独立根 `/Volumes/PSSD/code/_vendor/f7-gpuix`，Cargo target `/Volumes/PSSD/code/_vendor/target-f7`；未改共享 vendor。

## 同根入口

- `applyBatch`（dirty 时）、`setQuads`、`clearSelection` 经 `request_invalidate`。
- `setImagePixels`、`setImage`、`registerFont`、`setWindowTitle`、focus/blur、selection listener、`scrollIntoView`、clock setter、debug overlay 经 window update。
- active/appearance listener、window key event 与 animation/resume callback 安排也进入 update。
- getter 在窗口已 dirty 时同样可能因 AppRefMut 释放而同步绘制；`getAutomationTree` 还主动 invalidates。

统一 mode 边界覆盖这些路径，不逐个 setter 打补丁。

## 原生回归：修前红、修后绿

真实 production `GpuixRenderer`，隐藏非激活窗口（`focus:false, show:false`）；初始化至三个同步 burst 结束零 `tick` / `await` / 事件泵。每次上传 16384 quads；同 `.node` 的独立 `TestGpuixRenderer.flush` 仅作显式离屏绘制耗时参考，来源不混称。

| 同步 setQuads 次数 | 修前同步 draw | 修后同步 draw | 修前 upload p90 ms | 修后 upload p90 ms |
| -----------------: | ------------: | ------------: | -----------------: | -----------------: |
|                  1 |             1 |             0 |           2.041125 |           0.033459 |
|                 64 |            64 |             0 |           0.688959 |           0.026292 |
|                512 |           512 |             0 |           0.646875 |           0.026125 |

命令：`GPUIX_BACKGROUND=1 GPUIX_NATIVE_ENTRY=/Volumes/PSSD/code/_vendor/f7-gpuix/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/index.js bun scripts/gpuix-main/redraw-regression/run.mjs`。修前命名 service `f7-native-before-proof` 退出 **42**，修后 `f7-native-after` 退出 **0**；JSON 为 `/tmp/f7-native-before.json`、`/tmp/f7-native-after.json`。两次均零 errors；修后 upload p90 / 离屏 native draw median 分别为 **5.23% / 5.20%**，通过 `<25%` 断言。窗口关闭后不泵 AppKit，同步输出断言结果再退出，进程退出释放平台任务。

## 构建及验证

- 原十二补丁独立完整构建：`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f7-gpuix CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f7 RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin bash scripts/gpuix-main/build.sh`，成功，262.37s；从固定 gpuix/zed SHA clone，产物 23948896 bytes。
- `pnpm install --frozen-lockfile`，成功；`pnpm native:build`，成功。
- `node --test scripts/gpuix-main/check.test.mjs`，1 pass；覆盖两仓独立前缀、完整序列、未登记改动/未跟踪源码/zed revision 漂移拒绝。
- production 离屏 lane 修前：200×50、976×758、真实后端 ready、10000 Clips；完整 JSON `/tmp/f7-lane-before.json`，截图 `/tmp/f7-lane-before.png`。该数据不是正式窗口 GPU/presentation 数据。
- 根目录 `cargo check && cargo test`，成功：engine 32、native 19，doc-tests 0；check 包含 Cargo package-cache 锁等待，整条命令 1195.85s。
- GPUI mode 对照：原实现 Production case 在首次 update 后 render count `2 != 1` 失败，Test case 通过；修后两项通过。`redraw-mode-mutations.mjs` 独立 `if true` / `if false` 变异各杀死对应模式，另一模式仍通过，恢复后 2 pass。命令：`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f7-gpuix CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f7 RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin node scripts/gpuix-main/redraw-mode-mutations.mjs`。
- 已有十二补丁 vendor 增量：逆向回退**仅本次 zed 补丁**到合法前缀，再运行相同 `build.sh`，自动追加 zed 补丁成功，47.66s；没有 reclone、没有改旧补丁。
- 干净完整构建：`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f7-gpuix/clean-build CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f7 RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin bash scripts/gpuix-main/build.sh`，从固定 SHA clone 并应用十二 gpuix 补丁及 zed 补丁，成功，104.61s；复用 Cargo 缓存，不称冷构建。
- GPUI 测试必须用 `--features test-support,gpui_platform/runtime_shaders`：首条只传 test-support 的命令因本机没有 `xcrun metal` 失败（构建前提，不是回归红）；补齐既有 runtime_shaders 后，真正的回归失败和两个变异均已观测。
- native guard 变异：`GPUIX_BACKGROUND=1 GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f7-gpuix CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f7 RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin CARGO_BUILD_JOBS=6 node scripts/gpuix-main/redraw-regression/mutate.mjs`，成功。真实二进制基线 **0** → guard=true **42** → 源码与二进制恢复 **0**；完整日志及 `passed:true` summary：`/private/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/gpuix-redraw-mutation-xuPRKK/`。
- 根目录 `pnpm verify:gpuix`，**passed**，97.21s：tsc 0 errors，eslint 通过，architecture 80 pass，Bun **1213 pass / 1 既有 todo / 0 fail**（194 files），真实后端 offscreen Home → project → resume smoke 通过并 `released idle`。
- `node scripts/gpuix-review-scan.mjs`，**0 HARD / 0 WARN**；扫描器只扫描应用源码，本次脚本与 vendor patch 不在其源码范围（0 source / 0 test files），因此另有 `ultracite fix`、预提交门禁及独立双轴审查，不把零扫描文件冒充覆盖。
- 完整 GPUI suite：在独立 vendor 的 `zed` 目录运行 `CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f7 CARGO_BUILD_JOBS=6 RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin cargo test -p gpui --lib --features test-support,gpui_platform/runtime_shaders -- --test-threads=1`，**275 pass / 0 fail**。
- 已有消费者变异入口全部被抓：`apps/gpuix` 目录依次运行 `bun src/project/sections/clip-edit/verification/mutations.mjs`（44 killed，基线 0 fail）、`bun src/project/sections/arrangement/lane/verification/mutations.mjs`（16 killed，基线 34 pass，源码指纹 unchanged）、`bun src/project/sections/arrangement/timeline/verification/mutations.ts`（18 killed）。日志 `/tmp/f7-clip-edit-mutations.log`、`/tmp/f7-lane-mutations.json`、`/tmp/f7-timeline-mutations.log`。
- vendor native Rust：在独立 vendor 的 `packages/native` 运行 `cargo check --release --features test-support,gpui_platform/runtime_shaders` 与相同 features 的 `cargo test --release`，**check 通过 / 313 pass / 0 fail / doc-tests 0**；包含 F3 resume、F4 fractional pixel parity 与 F5 focus 回归。现有 license/cfg cargo-clippy/dead_code/block future-incompat 告警保留，未扩展切片去改上游无关代码。

### production 离屏分段

在 `apps/gpuix` 目录运行：

```sh
NODE_ENV=production LANE_STRESS=1 LANE_REACT_PROFILE=1 LANE_PHASE_PROFILE=1 \
LANE_PROFILE_CAPTURE=/tmp/f7-lane-after.png \
bun --preload ./src/project/sections/arrangement/lane/verification/phase-preload.ts \
  ./src/project/sections/arrangement/lane/verification/render-cost.tsx
```

200×50、976×758、真实后端 ready；修前后各原十步，数据 `/tmp/f7-lane-before.json` 与 `/tmp/f7-lane-after.json`。所有时间是**离屏 CPU/native draw**，不是前台 GPU completion。没有观察到 p90 退化；不把两次十样本的墙钟差异归因为 F7 的加速（Test 模式本就保留原行为）。

| 分段 p90（ms）          |      修前 |      修后 |
| ----------------------- | --------: | --------: |
| projection              |  1.105249 |  0.985663 |
| React render envelope   |  6.012126 |  5.123543 |
| commit inclusive        |  6.303167 |  5.951834 |
| host queue flush        |  4.345166 |  4.250042 |
| native flush            | 16.179416 | 15.517541 |
| additional native flush | 12.928834 | 11.508250 |
| CPU render + flush      | 30.386708 | 28.138667 |
| native draw             | 15.195667 | 14.259292 |

修前后原生帧均 32（21 个样本），retained initial/min/max 均 2736/1632/3018；卸载零 retained 节点。初始截图 `/tmp/f7-lane-before.png` 与 `/tmp/f7-lane-after.png` **PNG bytes 完全一致**，已直接读取修后真实 native 图片观察，不以元数据代替像素。

## 前台复测交接

由协调者在前台串行执行既有 lane 200×50 十步协议；本 worker 不申请桌面时段，不宣称真实前台 p90 已通过。

在 `apps/gpuix` 目录启动自己的命名 service；协调者将该窗口置于前台可见后等待 `window-profile-complete`，读取 JSON 并立即关闭 service：

```sh
NODE_ENV=production GPUIX_BACKGROUND=1 LANE_STRESS=1 \
LANE_WINDOW_PROFILE_OUTPUT=/tmp/f7-lane-production-window.json \
LANE_WINDOW_PROFILE_DEADLINE="$(node -p 'new Date(Date.now()+120000).toISOString()')" \
bun --hot --preload ./src/project/sections/arrangement/lane/verification/window-profile-preload.ts \
  ./src/project/sections/arrangement/lane/demo/index.tsx
```

入口固定 window 1280×800，对应 lane viewport 976×758；协议自动校验完整 200×50 与原十步输入。验收实际 `nativeDraw` p90 ≤16ms，并核对每步 host `setQuads` 调用数不再对应同等同步 draw 增长。不能让后台遮挡窗口等待帧充当前台验收。

## 产品与视觉边界

| 产品规则 | Live 观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 绘制按原生正常帧合并 | 内部 GPUI 调度没有 Live 可读对照项，不操作 Live | Production/Test mode 边界隔离 | 前台 lane 十步 p90 由协调者复测 |

本切片不改可见布局、token、交互语义或文案；按 UI 规范第 13 节记录范围与证据，不以后台黑图作为视觉证明。

| 第 13 节检查 | 本次证据与边界 |
| --- | --- |
| Gallery 与业务整体布局 | 不改 Gallery；实际 lane 976×758 离屏业务组合 PNG 与修前逐字节一致；真实前台整体评审由协调者完成 |
| 跨区域对齐与居中 | 无布局/token 改动；lane 同一画面像素不变，不宣称重新逐项测量全 Gallery |
| 间距与内边距 | 共享 token 与业务 style 未修改；lane 像素一致 |
| 统一设计入口 | 未新增或覆写圆角、边框、gap、padding；只改 GPUI mode 边界 |
| 尺寸与紧凑感 | lane 捕获尺寸和 retained 数量不变；不操作 Live，渲染调度无 Live 对照项 |
| 深浅主题与中英文 | 无主题/i18n 改动；本次组合图为既有默认主题/locale，未新做四组合视觉验收 |
| 状态与键盘 | gpuix suite 1213 pass（含 TestGpuixRenderer），focus/resume/vendor native 回归通过；不把这些称为前台输入验收 |
| 拖动、滚轮、弹层与性能 | clip-edit/lane/timeline 78 个既有变异全部被抓；离屏分段及真实 production 上传回归通过；前台十步 p90 仍由协调者验收 |

## 错题

### 测试专用同步绘制进入正式窗口

- 错：为提供 `TestGpuixRenderer` 启用 `test-support`，却假设正式 `Application` 一定按平台帧绘制；离屏合成性能未覆盖正式窗口连续 setter。
- 对：编译 feature 只提供测试能力，运行时 `GpuiMode` 决定是否同步绘制；保留正式连续上传及 Test 模式对照回归。
- 因：`flush_effects` 的同步 draw 原来只受 cfg 控制，任何 dirty window 的每次 `App::update` 都会整窗绘制。
- 见：`zed-production-no-sync-draw.patch`、`redraw-regression/run.mjs` 与本报告。

### AppKit 终止不能冒充测试成功

- 错：回归的 finally 先 `closeWindow()` 再 `tick()`；后者执行 AppKit 排队的 `terminate:`，进程直接退出 0，跳过最终 JSON 和预期 exit 42。
- 对：同步关闭自己的窗口后不再泵事件，同步写证据，再按断言结果退出。
- 因：pinned `gpui_macos::MacPlatform::quit` 异步排队 `NSApp terminate:`；这不是 JS finally 可等待的普通退出回执。
- 见：修正后命名 service `f7-native-before-proof` 的真实 exit 42 与零清理 errors。

## 已验证做法

- 两仓补丁使用独立有序列表与临时 Git index 计算精确预期 diff；不放宽为“任何 zed dirty 都允许”。
- 正式窗口同步上传测量不需要前台或平台帧推进；离屏 flush 绘制成本须单独标明来源。
- 使用命名 service 并在结果后立即释放；不激活窗口、不控制桌面、不操作用户服务。

## 补丁体量与进程清理

- 代码提交：`c79fd685 fix(gpuix): defer production redraws to platform frames`；本地 pre-commit `ultracite fix` 通过，无 `--no-verify`，没有 push。
- `git apply --numstat scripts/gpuix-main/patches/zed-production-no-sync-draw.patch`：`118 11 crates/gpui/src/app.rs`；包含两个完整 mode 回归，生产逻辑只在已有同步绘制循环外增加 mode 判定，不改变 F3、任何 setter 或公开导出。
- 最后 `node scripts/gpuix-main/check.mjs --sources <独立主 vendor>` 与 `node scripts/gpuix-main/check.mjs --resolution` 均通过：所有变异已恢复，当前消费者 native 与 React 均唯一解析到隔离 clean-build 产物。
- 每个原生回归/变异/最终 profile 的命名 service 结束后均立即释放；没有操作用户启动的服务。
- 清理实测：执行 `ps -axo pid,etime,command`，再按规格正则 `bun .*--hot|cargo run|gallery|demo` 过滤（与规格的 shell 管道等价；使用工具正则过滤，未运行 shell grep），输出：

```text
No matches found
```

零残留 demo/gallery/bun --hot/cargo run。Rust check/test 与测试脚本均已结束；后台原生回归没有等待被遮挡窗口出帧。

## 自审结果

独立只读 `pstack-reviewer` 已完成 Standards / Spec 双轴审查；未运行 tests/build/lint/formatter、未改文件。代码审查提交列表为 `c79fd685`；完整 diff 命令 `git diff c79fd685^...c79fd685 -- scripts/gpuix-main`，文档命令 `git diff -- docs/research/gpuix-main-build.md`，另读本报告。审查结论：**Spec 0 项实现缺陷**，产品代码质量底线无其他违规；交付文档缺项已补齐。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| P3：报告缺残留进程实际命令/输出及自审表 | 必修 | 已补本报告「补丁体量与进程清理」和此表；不是运行时泄漏 | 实测 ps 正则过滤 `No matches found`；所有命名 service 已释放 |
| P3：mode mutation runner 的 SIGINT/SIGTERM 不保证执行 finally | 记录 | 不新增恢复框架；明确限制：仅在独立 vendor 跑，若中断先把 flush_effects 的唯一 guard 还原为 `if !matches!(self.mode, GpuiMode::Production) {`，再运行严格身份校验与构建；未做信号中断实验 | 正常变异已恢复，两模式重跑通过；最终 `check.mjs --sources` 通过；native mutation runner 另有信号恢复 |
| review scan 对本次 scripts/vendor patch 无源码覆盖 | 记录 | 不把 0 文件扫描当充分覆盖；补以脚本 ultracite、真实回归/变异、vendor tests 和独立逐行审查 | 0 HARD / 0 WARN；代码提交 pre-commit 通过；Spec 0 缺陷 |
| vendor 既有 license/cfg/dead_code/block 警告 | 记录 | 固定上游版本的既有项，不越界修改；结果按命令真实退出码报告 | vendor native check 成功、313 tests 通过；GPUI 275 tests 通过 |

本轮无未决「汇报仲裁」代码项。真实前台 lane 200×50 十步 p90 ≤16ms 是规格已分配给协调者的后续验收，不是本 worker 已完成的证明；复测命令见上节。LESSONS 内容只在本报告「错题」中交付，由协调者汇总，不直接改共享 `LESSONS.md`。
