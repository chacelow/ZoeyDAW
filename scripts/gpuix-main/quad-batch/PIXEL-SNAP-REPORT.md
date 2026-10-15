# F4b 原生矩形像素对齐

2026-10-15。任务起点 `556d829ae6133e8c7ed6a17ade5cba7f988f477d`，按协调者通知 fast-forward 至规则更新 `7cf7215`。仅修改 F4 patch、F4 验证及证据、本文与主干自建报告的 F4 小节。没有修改 lane、PeakColumns、clip-editors、F3、theme 或共享 vendor。

## 原因与修复

GPUI `taffy.rs` 先把 authored absolute lengths 乘 scale factor，按 half-toward-zero 取整，再计算布局。`Window::paint_quad` 对绝对边缘取整。旧 F4 只走第二步，因此 `y=5.5,height=4.5,top=10` 在 scale 1 画到 y=20，原 div 只画到 y=19。

F4 paint 现在先调用 GPUI 的 `Window::pixel_snap_bounds` 处理本地 x、y、width、height，再加 host origin。绝对边缘仍由现有 `Window::paint_quad` 处理。没有自行实现取整函数、TS 补偿、额外 layout node 或缓冲分配。`setQuads`、`Arc<[f32]>`、React ref、mutation queue、hitbox、focus、AX 契约不变。

隔离 source 为 `/Volumes/PSSD/code/_vendor/f4b-gpuix/6a5c7c142ac32f9eb0caefe0121be995cfc18631`，target 为 `/Volumes/PSSD/code/_vendor/target-f4b`。固定 gpuix、zed SHA 与九补丁顺序未变。

## 原生回归与失败证据

原生测试直接比较两个 `GpuixView` 的实绘 `painted_quads()` bounds。一边为 retained quad-batch，另一边为独立 explicit-position div，不用修复函数计算期望值。每个测试执行 scale 1、1.25、1.5、2。

| 回归                                        | 修复前实测失败                                     |
| ------------------------------------------- | -------------------------------------------------- |
| `fractional_position_matches_native_div`    | scale 1.25，宽 13dp，div 为 12dp                   |
| `fractional_size_matches_native_div`        | scale 1.25，`[1,1,1.9,1.9]` 的宽高 3dp，div 为 2dp |
| `stereo_lane_half_pixel_matches_native_div` | scale 1，高 5dp，div 为 4dp                        |
| `fractional_host_origin_matches_native_div` | scale 1，宽高 11×12dp，div 为 10×13dp              |

最初 fractional-size 输入没有暴露缺陷，不能计作失败证据。替换为上表的非整数尺寸后，单独运行该测试得到 `0 passed; 1 failed`，exit 101。其它三个类别在首轮得到 `3 passed; 3 failed`。原始日志位于隔离 vendor 的 `native-before.log` 与 `native-size-before.log`。

修复后的完整 release suite 得到 `287 passed; 0 failed`。随后显式把 paint 改回 raw-f32 构造，仅撤销本次 geometry 修复，得到 `2 passed; 4 failed`，exit 101；上表四个回归全部失败。该 mutation 已还原，证据为 `evidence/pixel-snap-native-mutation.json`。

还原后重新运行完整release suite，最终为`287 passed; 0 failed`，test runtime0.50s，命令exit0；日志为隔离vendor的`native-restored.log`。随后严格source与binary manifest校验通过，确认没有留下mutation或benchmark二进制替换。

## 解码像素对照

`pixel-parity.tsx` 用命令式 `useQuadBatch` 上传几何。stereo fixture 精确复用 lane 报告的四个矩形、100×100 视口、top=10、背景 10、前景 250、opacity=0.6。另一个 fixture 覆盖 fractional position、fractional size 和负本地位置。

| 对照 | 解码后不同像素数 | 证据 |
| --- | --: | --- |
| 原 lane actual 对 reference | 1，`(1,19)` 为 154 而非 10 | `evidence/pixel-snap-original-lane.json` |
| 修复前等价 stereo quad 对 div | 1，同一坐标与 RGBA | `evidence/pixel-snap-before.json`、`pixel-snap-before/` |
| 修复后 stereo quad 对 div | 0 | `evidence/pixel-snap-after.json`、`pixel-snap-after/` |
| 修复后 stereo quad 对原 lane reference | 0 | `evidence/pixel-snap-after.json` |
| 修复后 fractional quad 对 div | 0 | `evidence/pixel-snap-after.json` |

stereo 修复后 decoded RGBA SHA-256 为 `4868c659b24e33e8f7543845fca941a660de2e262f3bc503f644714a2709db93`，与原 lane reference 相同。比较的是 Pillow 解码后的 RGBA，不是 PNG 压缩字节。`compare-pixels.py` 在不同像素非零时 exit 1，使用本机已有 Pillow，没有安装依赖。

复验入口，从 `apps/gpuix` 运行：

```sh
bun ../../scripts/gpuix-main/quad-batch/pixel-parity.tsx ../../scripts/gpuix-main/quad-batch/evidence/pixel-snap-after
```

仓库根解码入口：

```sh
python3 scripts/gpuix-main/quad-batch/compare-pixels.py scripts/gpuix-main/quad-batch/evidence/pixel-snap-after/stereo-inset-clamp-quad.png scripts/gpuix-main/quad-batch/evidence/pixel-snap-after/stereo-inset-clamp-div.png
```

## F4 render-cost 对照

仍使用原 F4 `render-cost.tsx` 的 50×50 合成 workload，共 14,065 个矩形。每种 React mode、每个 variant 启动三个独立 Bun 进程，各取 30 个样本。raw 与 fixed quad 交替运行，再运行 div。证据为 `evidence/pixel-snap-render-cost.json`，包含全部 540 个样本。

| React mode | native binary | 绘制方式 | retained nodes | render+flush p90 ms | native p90 ms | additional flush p90 ms |
| --- | --- | --- | --: | --: | --: | --: |
| development | raw-f32 | quad | 4 | 1.971 | 0.662 | 0.680 |
| development | fixed | quad | 4 | 2.146 | 0.763 | 0.697 |
| development | fixed | div | 14066 | 165.495 | 60.730 | 62.061 |
| production | raw-f32 | quad | 4 | 1.648 | 0.792 | 0.733 |
| production | fixed | quad | 4 | 0.889 | 0.377 | 0.429 |
| production | fixed | div | 14066 | 153.628 | 83.154 | 77.280 |

DEV quad render+flush p90 增加 0.175ms，native p90 增加 0.101ms。fixed DEV 与 production 都远低于 16ms，节点仍为 4，没有观察到影响 F4 性能目标的回退。production raw/fixed 差异及本轮 div 比历史更慢说明机器负载和调度有噪声，不能把 production 下降解释为 snapping 加速。该测量是 CPU React render 与 headless native flush，不是 GPU completion 或真实工程满量回放。

driver 把修复前二进制保存在隔离 root 的 `raw-f32.node`，修复后保存在 `fixed-snap.node`。每次复制对应二进制到隔离 native package，执行以下命令，`finally` 恢复 fixed 二进制。测量期间本 worker 没有并行构建或测试。

```sh
NODE_ENV=development bun ../../scripts/gpuix-main/quad-batch/render-cost.tsx quad
NODE_ENV=production bun ../../scripts/gpuix-main/quad-batch/render-cost.tsx quad
NODE_ENV=development bun ../../scripts/gpuix-main/quad-batch/render-cost.tsx div
NODE_ENV=production bun ../../scripts/gpuix-main/quad-batch/render-cost.tsx div
```

## 构建与应用验证

| 工作目录与命令 | 实测结果 |
| --- | --- |
| 根：`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f4b-gpuix CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f4b RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin bash scripts/gpuix-main/build.sh` | 先在隔离 vendor 用 `git restore --source=HEAD --staged --worktree .` 恢复本 worker 的 patched source，再重放完整九补丁；通过，48.20s，napi 阶段42.87s，binary23849104bytes |
| vendor：`RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin CARGO_BUILD_JOBS=6 CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f4b cargo check --release --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders` | 通过 |
| vendor：同环境 `cargo test --release --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders --lib` | 修复后287pass、0fail，默认release LTO |
| vendor：同环境、同flags加`--lib quad_batch`，仅把 geometry 变异回 raw f32 | 2pass、4fail，exit101，四类回归全部捕获 |
| 根：`pnpm install --offline --frozen-lockfile`、`pnpm native:build` | 构建完成后成功。第一次提前安装因缺少`.gpuix-main`被门禁拒绝，没有绕过门禁 |
| 根：`node scripts/gpuix-main/check.mjs --resolution` | 通过；native、React、reconciler、Zustand解析到隔离F4b vendor，Web/UI保持匹配版本 |
| apps/gpuix：`pnpm exec tsc --noEmit` | 通过 |
| apps/gpuix：`pnpm exec tsc --noEmit -p ../../scripts/gpuix-main/quad-batch` | 通过 |
| apps/gpuix：`bun test src/shared/quads` | 3pass、0fail、13assertions |
| apps/gpuix：`bun test` | 1051pass、1既有todo、0fail，1052tests，169files，48.77s |
| 根：`node scripts/gpuix-review-scan.mjs` | 0HARD、0WARN；本次patch与scripts不在scanner应用源码统计范围，实际显示0source、0test，不把它当作native正确性证明 |
| 根：`pnpm exec ultracite fix scripts/gpuix-main/quad-batch/pixel-parity.tsx` 后 `pnpm exec ultracite check scripts/gpuix-main/quad-batch/pixel-parity.tsx` | 通过；初次check报告格式问题，已格式化 |
| 根：`python3 scripts/gpuix-main/quad-batch/compare-pixels.py <quad.png> <div.png>` | before stereo exit1、1差异像素；after stereo与fractional均exit0、0差异像素 |

release build保留上游三个dead-code warning，native test保留既有`renderer.rs:123`的refining-impl-trait warning；没有新增F4 warning。首次空target baseline构建394.54s，修复后是clean source、warm target重建，不能称为冷构建。

## 自审结果与验收边界

| 发现 | 分类 | 处置与证据 |
| --- | --- | --- |
| Standards审查时新增报告链接的目标文件尚在撰写 | 必修，已关闭 | 本文已存在；reviewer确认关闭，`evidence/pixel-snap-review.json` |
| Standards与Spec独立只读审查 | 0未关闭发现 | 没有API、allocation、geometry oracle或所有权问题；reviewer没有运行验证命令 |
| scanner不扫描本次native patch与验证scripts | 记录 | 另跑fixture tsc、Ultracite、native div oracle、GPU pixels和独立审查，不宣称scanner覆盖native |

本次任务明确不需要desktop window或input。UI规范第13节按本轮适用范围记录如下。

| 检查 | 本轮证据或不适用原因 |
| --- | --- |
| 控件各状态放大截图 | 无控件状态改动；headless原生PNG覆盖stereo与fractional矩形，保留before/after |
| 间距与尺寸 | 不改token或authored几何；四类native div bounds回归覆盖device-pixel位置和尺寸 |
| 文字、数值、图标居中 | 不适用，没有文字或图标改动 |
| 同组等高与方形图标 | 不适用，没有控件布局改动 |
| Live紧凑感对照 | 不适用，本轮修复GPUI/div等价性，不新增产品规则或改Live |
| 深浅主题、中英文 | 不改颜色或文案；原生既有color/opacity测试通过，不声称本轮desktop主题语言重验 |
| Tab、focus、Space | F4无focus/AX/hitbox契约不变，既有native与shared/quads测试通过；没有输入操作 |
| 拖动、滚轮、弹层 | 不改交互；不把合成render-cost称为真实lane滚动整链路 |
| 性能与可见范围 | 上述14,065矩形A/B及retained-node统计；不改viewport裁剪算法 |

四种scale的证据来自native painted-bounds测试，decoded GPU截图是当前headless renderer的默认scale。结论仅覆盖显式位置与显式尺寸，不扩展到percentage、flex或grid派生几何。Windows、Linux、真实lane整链路与desktop界面未在本轮运行。

## 错题

- 错：F4 的整数合成几何 PNG 相同，就认定批量绘制与 div 等价。
- 对：补充 authored fractional positions、sizes 和小数 scale 的原生 div oracle。lane 的真实 0.5px 几何单独保留 GPU 像素证据。
- 因：paint-time edge rounding 不能代替 layout 的 authored metric rounding。

## 已验证做法

- 直接调用 `Window::pixel_snap_bounds`，复用 GPUI 唯一的 half-toward-zero 规则；`paint_quad` 保留绝对边缘取整。
- 原生 bounds oracle 与 decoded GPU pixels 分别证明 geometry 和实际绘制。相同压缩文件 hash 不是本次验收依据。
- 隔离 vendor 的 source 恢复到固定 HEAD 后重放九补丁，不触碰 `/Volumes/PSSD/code/_vendor/zoeydaw-gpuix`。

## 改动文件与进程清理

- Native修复与四类GPUI回归：`scripts/gpuix-main/patches/quad-batch.patch`。
- 契约说明：`docs/research/gpuix-main-build.md`的F4小节。
- 验证入口：`scripts/gpuix-main/quad-batch/pixel-parity.tsx`、`compare-pixels.py`。
- 本报告：`scripts/gpuix-main/quad-batch/PIXEL-SNAP-REPORT.md`。
- JSON证据均在`scripts/gpuix-main/quad-batch/evidence/`：`pixel-snap-original-lane.json`、`pixel-snap-before.json`、`pixel-snap-after.json`、`pixel-snap-native-mutation.json`、`pixel-snap-render-cost.json`、`pixel-snap-review.json`。
- PNG证据在同目录的`pixel-snap-before/`与`pixel-snap-after/`，每个目录各有`stereo-inset-clamp-{quad,div}.png`、`fractional-position-size-{quad,div}.png`。

本worker没有启动desktop窗口、hot demo或service。交付前执行`ps -axo pid,etime,command`，按当前worktree路径与`bun --hot|cargo run|demo.tsx|gallery`筛选，结果`matches: []`。所有headless root在`finally`卸载，fixture retained-node检查为零。
