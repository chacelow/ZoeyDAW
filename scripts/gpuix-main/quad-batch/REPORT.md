# F4 原生批量矩形交付

2026-10-15。任务起点 `28eb9bf`，最终同步主干 `9f21648` 与 `d5325b9`，合并提交 `31ad0c6`、`962853d`。F4核心提交为 `7f7c472`、`2ed2d59`、`e194113`、`d386dd6`、`f451715`。

## 最终接口

`QuadBatch` 只接收 style、testId 与 ref，**没有 quads prop**。`useQuadBatch()` 返回稳定的具名 `QuadBatchController { ref, setQuads }`。在事件或 layout effect 中调用 `setQuads(Float32Array)`，数据不进入 React props 或 state，更新不触发 React render。

Controller 缓存挂载前的最新数组，在 native ref attach 后上传。同一 host 上引用不变不上传。detach 后不访问旧 host，remount 时向新 host 重放最新数组。缓冲视为不可变，修改后替换引用。

SDK ref 的 `QuadBatchInstance.setQuads` 直接调用所属 renderer 的 napi `setQuads(elementId, Float32Array)`。每四个 float 为本地 x/y/width/height。napi 验证后一次拷贝到节点拥有的 `Arc<[f32]>`，后续 paint 只 clone Arc。通用 JSON mutation queue 已恢复上游原样，没有兼容旧 quads prop 的二进制队列。

每种颜色一个节点，颜色取 `style.color`，透明度取节点及祖先 opacity。GPUI 实绘同时遵守元素边界和祖先 content mask。节点不注册 hitbox、focus 或 AX；明确忽略 cursor 和 pointerEvents。

最终补丁顺序来自config.json，依次为 `close-guard.patch`、`frame-callback.patch`、`input-select-all-on-focus.patch`、`anchored-center.patch`、`select-trigger-space.patch`、`window-active-change.patch`、`window-appearance-close.patch`、`context-menu.patch`、`quad-batch.patch`。固定gpuix SHA为`6a5c7c142ac32f9eb0caefe0121be995cfc18631`，zed SHA为`c2e9f882030ca95cee55d206512a0a3ee6cd72b0`。

## 性能

协调者批准独立等量合成探针，不改 lane 产品代码。50轨×50 clip，共14,065矩形，包括1,565网格、2,500 MIDI音符和10,000波形列。两路使用同一976×758 viewport、十步滚动/缩放、三轮共30样本。全量矩形保留，由原生 mask 剔除屏外绘制，刻意隔离节点成本，不冒充产品可见范围挂载裁剪。

以下为合并H1/F2后的最终九补丁实现，测量的是CPU墙钟时间，不是GPU完成时间。render+flush包含React commit、命令式上传和第一次native flush；额外flush与lane原探针一样单独记录。

| React 模式 | 路径 | 保留节点 | render+flush p90 ms | 其中 native flush p90 ms | 额外 native flush p90 ms |
| --- | --- | --: | --: | --: | --: |
| development | div | 14066 | 83.208 | 33.176 | 31.932 |
| development | quad | 4 | 0.855 | 0.322 | 0.284 |
| production | div | 14066 | 66.490 | 32.017 | 33.099 |
| production | quad | 4 | 0.670 | 0.311 | 0.283 |

节点减少超过一个数量级；DEV 与 production 的整体 p90 均低于16ms。两路初始 native GPU PNG 的 SHA-256 完全相同：`2160c362c2dbca60e50c9e9404dbd6e7b9f9b1bc32c7c9bc694e8654e0435eee`。

完整数据为 `evidence/{div,quad}-2026-10-15.json`、`{div,quad}-production-2026-10-15.json`，图片为 `div-headless-2026-10-15.png`、`quad-headless-2026-10-15.png`。

早期声明式数组 prop 方案在 DEV 超过75ms。CPU profile 定位到 React development 的 `addObjectToProperties`、`addValueToProperties` 和 `performance.measure` 遍历 typed-array props。原生40,000-float上传约0.02ms，单独几何生成100次 p90为0.147ms。协调者要求消除该限制，最终接口删除 quads prop，未改 React instrumentation。`dev-profile-2026-10-15.json` 已标为历史诊断证据，不代表最终性能。

这些数据不是 lane 真实 `readProjectPeaks` 满量工程，也不是已接通音频引擎的性能声明。lane 和 clip-editors 接入后仍须验证各自完整链路。

## 真实窗口

命令式API定型后，在协调者授权的05:29至05:32 UTC时段内做过实际窗口复验。该次尚未合入主干H1/F2，不把它称为最终九补丁窗口重测。命名service `f4-quad-imperative` 运行`bun --hot window.tsx`，设150秒到期kill，实际在51.6秒取证后立即kill并回报桌面释放。

实际执行10次横向/纵向滚轮和3次缩放键。最终 AX 为 `Quad batch x=600 y=300 zoom=1.25`。原生统计67 frames、59 samples，CPU draw p90为0.418ms，p99为0.855ms，max为2.164ms。证据为 `window-imperative-2026-10-15.json` 和 `imperative-scroll-zoom-2026-10-15.png`。

首轮原生绘制验证另覆盖深浅主题及中英文根 AX 标签，保存六张全图/放大图。该轮 service `f4-quad-window` 存活4m11s，取证后立即关闭。命令式切换不改原生几何或主题路径，最终 GPU A/B 初始图片仍与 div 版逐字节相同。

两次首次完全遮挡的 Metal 窗口都抓到黑色旧帧。截图确认后，只激活授权的自启窗口，再取实际可见图像。未遇到 InvalidCoordinateFrame，没有添加应用代码绕过，也没有操作用户已有应用。

合并后的额外90秒复验时段为07:06:03至07:07:33 UTC。启动前绝对截止守卫检测到已过期，fail-closed，未启动service、未发输入、未请求抢占前台控制。协调者明确批准采用已有真实窗口证据直接交付，不再开时段。最终九补丁的283项原生测试、完整应用996pass/1todo/0fail、相同GPU PNG及DEV/production A/B分别作为合并后的实测证据。

## UI 规范第13节

| 检查 | 结论与证据 |
| --- | --- |
| 每控件每状态放大图 | 本次为无交互矩形，没有 hover、pressed、focus、disabled 控件态；默认绘制及两主题放大图见 `dark-detail-2026-10-15.png`、`light-detail-2026-10-15.png` |
| 间距/token | 未改产品布局和 token；36高行、192宽clip等属于压力数据。两路同一几何，初始 GPU PNG 哈希相同 |
| 居中 | 矩形没有文本、图标或数值；GPUI实绘验证本地坐标，不声称新增控件居中验收 |
| 尺寸 | 实绘断言矩形10×12、本地偏移3/4，元素位置20/10下画于23/14；x+1变异失败。未新增产品尺寸 |
| 紧凑感/Live | 没有产品表头、面板或控件外观变化；以本项目原div路径的相同GPU输出为参照，没有操作用户Live |
| 深浅/中英 | 首轮 `light-en`、`light-zh-scroll-zoom`、`dark-zh`、`dark-en-final` 四组合截图；语言只影响探针根AX标签。最终命令式API另有实际滚动/缩放截图 |
| 键盘/焦点 | 矩形不能Tab聚焦、不响应Space；根探针实际接收缩放键。AX只有根group和native chrome，共6节点，没有batch或矩形节点。原生prepaint回归证明cursor也不能创建hitbox |
| 拖动/滚轮/弹层 | 未新增拖动或弹层；最终API的横纵滚轮及缩放后AX和图像均改变，最终x=600、y=300、zoom=1.25 |
| 性能/裁剪 | GPUI实绘验证祖先80×60 mask、自身缩小后的右60/下40 mask和屏外剔除，去mask变异失败。DEV和production均满足16ms；产品可见范围挂载裁剪未改 |

## 实跑门禁

| 位置/命令 | 结果 |
| --- | --- |
| 根：`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f4-gpuix CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/f4-gpuix/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/target bash scripts/gpuix-main/build.sh` | 从干净source基线重新应用九补丁成功，33.20s；native编译23.61s，napi阶段28.25s，binary 23,832,144 bytes。最终index378条、untracked0、严格diff91,722 bytes |
| 根：`pnpm install --offline --frozen-lockfile`、`pnpm native:build` | 合并后成功，真实自有native在本worktree重建。F4未新增依赖；主干已批准的H1及i18n依赖随合并同步 |
| 根：`node scripts/gpuix-main/check.mjs --resolution` | 最终通过；native、host、React、reconciler、Zustand统一到F4 vendor；Web/UI的React与DOM版本匹配 |
| apps/gpuix：`pnpm exec tsc --noEmit` | 最终通过 |
| apps/gpuix：`pnpm exec tsc --noEmit -p ../../scripts/gpuix-main/quad-batch` | 最终通过 |
| apps/gpuix：`bun test src/shared/quads` | 最终3 pass、0 fail、13 assertions；覆盖render-free更新、premount实际GPU截图、remount、卸载后调用、指针穿透 |
| apps/gpuix：`bun test` | 合并后996 pass、1 todo、0 fail，997 tests、157 files。既有todo为`project/model/grid.test.ts:66`的键盘映射集成占位；F4三项均执行。旧tracks secondary-click失败未在最终运行中出现，不再按失败豁免交付 |
| 根：`cargo check`、`cargo test` | 合并后通过，49 tests、4 suites；F4没有手写修改自有Rust模块 |
| vendor：`cargo check --release --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders`，同flags的`cargo test --lib` | 最终九补丁通过，283 pass、0 fail，默认release LTO；无数据帧借静态空slice，新增unused import已删除，无F4新warning |
| vendor：同test命令加`CARGO_PROFILE_RELEASE_LTO=off` | 变异迭代阶段七补丁273 pass；最终九补丁的默认release结果以上行为准 |
| 根：`node scripts/gpuix-review-scan.mjs` | 最终扫描2 source、1 test，0 HARD、0 WARN |
| 提交：pre-commit与Ultracite | 三个TS实现提交运行Ultracite通过；patch-only性能提交门禁通过，没有匹配的TS格式任务。没有 --no-verify |

`evidence/mutations-2026-10-15.json` 保存变异结果。本地x+1、移除mask、错误color、强制opacity，各使GPUI断言失败。cursor回归先复现真实prepaint hitbox，修复后通过。Controller三种变异各使一个消费者测试失败：强制render得到2而非1次render；删除attach上传使premount GPU PNG与直接native setter不同；删除引用去重得到2而非1次upload。所有变异均已恢复。

首次根级tsc命中根TypeScript6的既有baseUrl弃用检查，改用应用TypeScript5.9后通过，未改tsconfig。首次安装在新patch未登记时被source gate拒绝，登记并构建后正常通过。pre-commit曾拦截非提交文件的intent-to-add、测试点击fixture缺键盘语义及node:path命名导入，均修正后通过。没有操作其他worker的stash。

一次从仓库根用 `.gpuix-main/packages/native/Cargo.toml` 相对路径检查vendor，Cargo将其误归入本仓库workspace而拒绝。改在独立vendor根运行相同check/test flags后通过，没有修改workspace members或exclude。无数据帧优化后新增的unused test import已删除；保留上游既有warnings，不扩围修F1或其他模块。

## 自审结果

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| 独立Spec审查发现cursor样式创建native hitbox | 必修 | prepaint回归先失败；清空cursor后273项通过，复审关闭 | `self-review-2026-10-15.json`、提交2ed2d59 |
| React DEV遍历Float32Array props导致超预算 | 必修 | 按协调者要求删除quads prop和二进制mutation队列，改稳定命令式controller；双模式达标 | 提交e194113、四组A/B JSON、历史profile |
| 测试fixture键盘语义与node:path导入 | 必修 | 补button语义、Tab/Enter及默认导入；pre-commit通过 | `QuadBatch.test.tsx` |
| 无数据帧Arc分配及优化后unused test import | 必修 | 无数据时借静态空slice，删除已无用途的glob import；最终九补丁283项通过 | 提交d386dd6及最终quad-batch.patch |
| Apple Git apply-N丢index、source gate ENOBUFS | 汇报仲裁 | 在一次性repo复现，协调者主干d5325b9统一修复；合并后九补丁从基线重建通过，没有提高buffer上限掩盖问题 | `build-source-gate-2026-10-15.json`、提交962853d |
| 旧tracks secondary-click基线失败 | 汇报仲裁 | 前期交A3b；同步主干后本次完整套件0fail，不再作为最终豁免 | 最终996pass/1todo/0fail |
| vendor沿用std::sync::Mutex | 汇报仲裁 | 协调者批准既有GpuixView锁契约例外；锁内无布局、绘制、JS回调 | native setters与协调者ask回复 |
| 上游renderer/test_renderer已超600行，host-config新增ref绑定后601行 | 记录 | 只在既有分发/绑定入口接线；绘制和原生回归独立放quad_batch.rs，避免为十行绑定引入另一层或扩大上游重构 | quad-batch.patch |
| 确定性扫描 | 记录 | HARD/WARN均0，无未处置WARN | 2 source、1 test扫描结果 |
| 脚本依赖归属与计时lint | 必修 | 复用主干统一package-aware规则；build.sh为每个tsconfig探针建链接，run.sh不重复创建；计时进入函数作用域，泄漏断言位于finally外 | 提交31ad0c6、当前build.sh及render-cost.tsx |

独立只读pstack-reviewer审查Standards与Spec。初审Standards0项、Spec1项必修，cursor修复后关闭。命令式API再次复审Standards0、Spec0，确认生命周期、ref时序、数据不进props、旧队列删除及回归有效性。完整diff命令、提交列表和处置见 `evidence/self-review-2026-10-15.json`。

## 接入与重跑

Lane与clip-editors使用 `shared/quads/QuadBatch` 和 `shared/quads/useQuadBatch`。在数据owner内生成矩形，在事件或layout effect中上传；不要先把Float32Array传给另一个React组件。稳定契约和上游PR草稿见 `docs/research/gpuix-main-build.md` 的F4段。

```tsx
const batch = useQuadBatch()
useLayoutEffect(() => {
  batch.setQuads(buildLocalRectangles(viewport))
}, [batch, viewport])
return <QuadBatch ref={batch.ref} style={batchStyle} />
```

`buildLocalRectangles` 是消费者已有的几何计算，不是共享导出。颜色和产品度量继续取现有主题token。

独立vendor构建并安装后，运行以下命令。`build.sh`统一为scripts/gpuix-main下每个含tsconfig.json的探针目录建立app依赖链接；`run.sh`只启动探针，不安装依赖或改产品数据。

```sh
bash scripts/gpuix-main/quad-batch/run.sh div
bash scripts/gpuix-main/quad-batch/run.sh quad
NODE_ENV=production bash scripts/gpuix-main/quad-batch/run.sh div
NODE_ENV=production bash scripts/gpuix-main/quad-batch/run.sh quad
```

窗口入口为 `window.tsx`。先运行共享build.sh完成依赖链接，再获桌面时段，以命名service从该目录执行 `bun --hot window.tsx`，取证后立即kill。

## 进程清理

实际执行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

该次完整stdout保存在 `evidence/process-cleanup-2026-10-15.txt`，仅匹配查询本身：

```text
82354       00:00 /usr/bin/grep -E bun .*--hot|cargo run|gallery|demo
```

两个自启service均已kill。没有残留bun --hot、cargo run、gallery或demo运行进程，没有停止其他worker或用户已有服务。

## 未实现与交接

- lane和clip-editors的产品迁移由各自owner接入新命令式API，本切片没有复制或修改其他worktree代码。
- lane真实工程、真实readProjectPeaks和产品可见范围裁剪的整体收益尚未验证。这里的合成结果不能替代那项验收。
- wasm没有setter，SDK明确报unsupported。Windows、Linux未实跑，不承诺其独立UI线程上多个setter调用的原子绘制。
- 上游PR只有草稿，没有远程发布或push。协调者合入后须重建共享vendor，不能套用本worktree的manifest。
