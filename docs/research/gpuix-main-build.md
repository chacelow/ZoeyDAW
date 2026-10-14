# 固定 gpuix 主干自建的实测与成本

2026-10-14，A6 spike。消费者基线为 `d0db74c`，交付前按协调者要求合入 `gpuix-migration` 的共享错题本更新。第三方源码、构建缓存、消费者副本和 PoC 留在 `/Volumes/PSSD/code/_vendor`，不进入本仓库。

## 结论：选择 B，固定主干自建

推荐 **B：固定 `6a5c7c142ac32f9eb0caefe0121be995cfc18631` 自建，纳入本仓库的 native 构建管线**，计划包名为 `@zoeydaw/gpuix-native`。本轮没有发布包、修改应用依赖、推送第三方 fork 或发 PR。

依据是已运行的消费者，而不只是源码里的新 API：同一份 `apps/gpuix` 的 31 个测试在本地构建上通过，四个 feature demo 都打开真实窗口并完成 AX、截图检查；`onLayout` 对容器和文本的首次绘制、尺寸变化均有事件。关闭拦截的 macOS PoC 只改 gpuix renderer，Rust 为 33 行新增、1 行删除，不需要修改 zed 子模块。命令和日志见下文。

A 继续用 npm 0.10.0，会继续保留 A3、A4 为缺失 `onLayout` 写的测量采样。C 等上游发布，不解决当前依赖缺口，也没有可核实的发布时间。本次推荐 B，不把向上游贡献作为交付前置条件。

B 的限制必须一起接受：本机没有 Xcode，默认 release 构建失败；成功产物使用上游已有的 `gpui_platform/runtime_shaders`。Windows、Linux、自建发布流水线、真正清空系统 shader cache 后的首次启动均未验证。关闭 PoC 也不是跨平台生命周期实现。

## 固定版本与环境前置条件

| 项目 | 本轮实际值或前置条件 | 证据 |
| --- | --- | --- |
| gpuix | `6a5c7c142ac32f9eb0caefe0121be995cfc18631` | `git rev-parse HEAD` |
| zed 子模块 | `c2e9f882030ca95cee55d206512a0a3ee6cd72b0`，`remorses/zed` | `git submodule status` |
| Rust | 1.97.1，`8bab26f4f`，LLVM 22.1.6 | `rustc -vV`；两仓 `rust-toolchain.toml` 同为 1.97.1 |
| Bun | 1.3.14 | `bun --version` |
| 主机 | macOS 26.1 / arm64，10 CPU、16 GiB RAM | `sw_vers`、`nproc`、`sysctl -n hw.memsize` |
| 磁盘 | PSSD 约 1.5 TiB 空闲，系统卷约 51 GiB 空闲 | 开工时 `df -h / /Volumes/PSSD` |
| 编译并行度 | `CARGO_BUILD_JOBS=6` | 每次 gpuix 构建显式设置 |
| 默认 Metal 路径 | 完整 Xcode 与 MetalToolchain，只有 CLT 不够 | `xcrun --find metal` 失败；[上游 CI 安装步骤][ci] |
| 本机成功路径 | `--features test-support,gpui_platform/runtime_shaders` | `build-truecold.log` exit 0 |

克隆命令与实际输出：

```sh
git clone --filter=blob:none https://github.com/remorses/gpuix.git /Volumes/PSSD/code/_vendor/gpuix
git -C /Volumes/PSSD/code/_vendor/gpuix submodule update --init --depth 1
```

```text
主仓克隆 16.42s
Submodule path 'zed': checked out 'c2e9f882030ca95cee55d206512a0a3ee6cd72b0'
子模块获取 102.10s
初始化后主仓与子模块合计 136M
```

本机命名工具链 `1.97.1` 起初只有 cargo，没有 rustc，首个 napi 命令在 `cargo metadata` 前失败：

```text
error: Missing manifest in toolchain '1.97.1-aarch64-apple-darwin'
```

`stable` 的 `rustc -vV` 同样是 1.97.1、同一个 commit，因此实测构建使用 `RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin`。尝试 `rustup toolchain install 1.97.1 --profile minimal` 的下载在 900s 被超时中断，之后 `rustc +1.97.1 -vV` 已能运行；没有把中断的安装计为成功构建，也没有安装 Xcode。

## 构建耗时、产物与内存

可复现入口是 [`scripts/gpuix-main/build.sh`](../../scripts/gpuix-main/build.sh)。脚本固定两个 SHA，限制 jobs 为 1 至 6，并拒绝把 `CARGO_TARGET_DIR` 放在 PSSD 外。它构建 ESM native loader、native 的共享 JS runtime、React dist，不发布包。

本轮 release 命令：

```sh
cd /Volumes/PSSD/code/_vendor/gpuix/packages/native
export RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin
export CARGO_BUILD_JOBS=6
export CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target
/usr/bin/time -l bunx napi build --platform --esm --js index.js --release \
  --features test-support,gpui_platform/runtime_shaders
bun run build:js
cd ../react
bun run build
```

| 测量 | 实测 | 口径 |
| --- | --: | --- |
| 默认特性失败前耗时 | 782.94 s | 首次大图编译，最终在 `gpui_apple` 的 Metal 编译失败 |
| `runtime_shaders` 接续构建 | 158.59 s | 复用失败构建留下的依赖，不能叫冷构建 |
| 干净 target 的成功构建 | 400.30 s | 独立空目录 `/Volumes/PSSD/code/_vendor/target-cold`；Cargo 显示 6m29s |
| 改 renderer.rs 一行后的重建 | 67.39 s | 修改一行 doc comment，强制该 crate 重编译，使用原 `target` |
| 关闭 PoC 重建 | 34.66 s | 新 API、menu action guard；不是单行实验 |
| native 共享 JS 的 `tsc` | 13.01 s | napi 命令之后单独运行 `bun run build:js` |
| React `tsc` | 4.31 s | 先构建 native JS 后通过 |
| 可复现脚本 smoke | 10.47 s | 已有缓存，完整脚本；其中 napi 6.29s |
| 原始主干 `.node` | 23,656,800 bytes，22.56 MiB | `stat -f '%z bytes' gpuix-native.darwin-arm64.node` |
| npm 0.10.0 `.node` | 23,605,088 bytes | 同机已安装 `@gpuix/native-darwin-arm64` 的实际文件 |
| 关闭 PoC `.node` | 23,648,656 bytes | 加入 PoC 后的优化产物，不能混作原始主干大小 |
| 成功冷构建 target | 1,913,616 KiB，1.825 GiB | `du -sk /Volumes/PSSD/code/_vendor/target-cold` |
| 冷构建最大 RSS | 927,252,480 bytes，884.30 MiB | `/usr/bin/time -l` 的 `maximum resident set size` |
| 单行重建最大 RSS | 753,106,944 bytes，718.22 MiB | 同一命令口径 |

这里“冷”只指没有 Cargo 产物。crates.io、git 依赖下载缓存及文件系统缓存已由先前尝试填充，400.30s 不包含首次联网获取依赖。额外的 `cargo metadata` 曾花 401.12s 下载和解析依赖，不应把 CI 首次全流程成本缩写成 400s。

表中 target 大小是成功 release 构建后的采样值。加入 vendor Rust check/test 和本 worktree Rust 验证后，主 `target` 的最终 `du -sk` 为 3,451,744 KiB；另留一次独立冷构建缓存。完整验证的磁盘成本高于只构建 `.node`。

内存值是 `time -l` 的进程资源统计，不是六个 rustc 的 RSS 相加峰值，更不是整机内存。没有实测聚合构建树的峰值。不要据此把 CI 内存限制设置为 1 GiB。

成功冷构建日志 `/Volumes/PSSD/code/_vendor/build-truecold.log`：

```text
Finished `release` profile [optimized] target(s) in 6m 29s
400.30 real  1039.60 user  121.29 sys
927252480 maximum resident set size
EXIT=0
```

单行重建日志 `/Volumes/PSSD/code/_vendor/build-incremental.log`：

```text
Finished `release` profile [optimized] target(s) in 1m 00s
67.39 real  80.16 user  7.88 sys
753106944 maximum resident set size
```

### 默认构建失败点与修复

默认的 `bun run build` 没有通过。错误不是“Rust 不兼容”，而是缺失 Metal 编译器：

```text
error: gpui_apple@0.1.0: metal shader compilation failed:
error: failed to run custom build command for `gpui_apple v0.1.0`
xcrun: error: unable to find utility "metal", not a developer tool or in PATH
```

`xcode-select -p` 为 `/Library/Developer/CommandLineTools`，`/Applications/Xcode*.app` 不存在，`xcodebuild -version` 明确要求完整 Xcode。[上游 CI][ci] 同样说明 Xcode 26 默认不带 MetalToolchain，并运行 `xcodebuild -downloadComponent MetalToolchain`。

成功替代路径没有改 Cargo.toml，也没有改 zed：命令行启用已有 dependency feature。上游 [gpui_apple build.rs][apple-build] 在该 feature 下拼接 shader 文本，[Metal renderer][metal] 改用 `new_library_with_source`，而不是加载编译好的 metallib。zed 的 `nix/build.nix` 也使用 `--features=gpui_platform/runtime_shaders`。

第一次直接构建 React 时还遇到 `Cannot find module '@gpuix/native/host'`、`@gpuix/native/testing`。先运行 native 的 `bun run build:js`，再运行 React 的 `bun run build` 即通过。napi build 只生成 `.node` 与 loader，不会替代共享 TS runtime 的构建。

## `runtime_shaders` 的运行时差异

用同一段 probe 交替启动 npm、主干各三次，每次都是新的 `bun --hot` 进程。`performance.now()` 记录进程时间，首帧判据是 `getPaintedText()` 已包含 `A6 startup probe`，不是 `init()` 返回或 mount 日志。首帧后每 16ms 更新文本，3.5s 后打印 native draw stats 并退出。每次约有 210 至 212 个 draw samples。

```sh
A6_KIND=npm bun --hot startup-probe.mjs
A6_KIND=main bun --hot startup-probe.mjs
```

入口位于 `/Volumes/PSSD/code/_vendor/a6-consumer/apps/gpuix/startup-probe.mjs`，原始 JSON 保存为 `/Volumes/PSSD/code/_vendor/startup-results.json`。npm 分支从本 worktree 的实际 npm 安装目录加载；main 分支从 vendor build 加载。两边分别使用各自依赖图的 React 19.2.8、19.2.4，未混用 React 实例。

| 顺序 | 产物 | import 完成 ms | `init()` 本身 ms | 进程到首个内容帧 ms | draw p90 ms | draw p99 ms | draw max ms |
| --- | --- | --: | --: | --: | --: | --: | --: |
| 1 | npm 0.10.0 | 2470.74 | 539.63 | 3069.58 | 0.929 | 1.062 | 1.206 |
| 2 | main runtime_shaders | 207.66 | 1189.07 | 1445.09 | 0.943 | 1.216 | 1.349 |
| 3 | npm 0.10.0 | 177.98 | 570.97 | 788.95 | 0.926 | 1.220 | 1.464 |
| 4 | main runtime_shaders | 139.79 | 546.13 | 726.96 | 0.889 | 1.004 | 1.318 |
| 5 | npm 0.10.0 | 139.47 | 527.28 | 707.39 | 0.973 | 1.288 | 2.474 |
| 6 | main runtime_shaders | 189.35 | 562.25 | 794.20 | 0.910 | 1.181 | 1.330 |

实测第一轮 main 的 init 比后两轮多约 0.63s，符合 runtime shader 首次准备带来启动成本的风险；**不能把这 0.63s 全归因于 shader 编译**。本轮之前已打开过主干 demo，没有清空 macOS 的 shader cache，而且 npm 与主干存在其它源码差异。第一轮 npm 的 2.47s import 同样说明磁盘与进程冷启动会显著扰动结果。

后两轮 main 的首帧为 727ms、794ms；npm 为 789ms、707ms。小型文本更新场景没有观察到持续 draw 时间恶化，四个 feature demo 也都绘制出内容。但这不是重型 DAW 性能基准，draw stats 不是 GPU completion 时间，不能推导大型工程的帧率。真正首次安装、空 shader cache 的启动延迟仍未测量。

## 消费者兼容

消费者副本位于 `/Volumes/PSSD/code/_vendor/a6-consumer/apps/gpuix`。从本 worktree 复制 `apps/gpuix`，只在副本的 `node_modules` 中把 `@gpuix/native`、`@gpuix/react` 链接到 vendor 包。为避免两份 React，副本的 `react` 同样链接到 vendor 的 React。`@zoeydaw/native` 来自本 worktree 实跑 `pnpm native:build` 的产物，UI metrics 来自本 worktree 的已有包。没有修改任何应用源码、package.json 或 lockfile 来安装自建 gpuix。

```text
cd /Volumes/PSSD/code/_vendor/a6-consumer/apps/gpuix
bun test
31 pass
0 fail
58 expect() calls
Ran 31 tests across 3 files. [6.51s]
```

加入关闭 PoC 后再次运行，同样 `31 pass / 0 fail`，3.23s。消费者类型检查用本 worktree 已安装的 tsc 直接执行 `tsc --noEmit -p tsconfig.json` 通过。副本不是完整 pnpm workspace，直接 `pnpm exec tsc` 曾因 workspace resolver 报错，不能把该安装器错误称为类型不兼容。

四个真实窗口逐个运行，每次验证后关闭，仅操作自己启动的窗口：

| 入口，均使用 `bun --hot src/features/<name>/demo.tsx` | 结果 | 真实窗口证据 | 差异与边界 |
| --- | --- | --- | --- |
| `track-mixer` | 启动、绘制、AX 通过 | PID 75578；`Lead Synth`、`Drum Bus`、`FX Group`，Volume/Pan slider；按下 Lead Synth 的 Mute 后再截图 | 没有启动错误；没有做完整拖动回归 |
| `clip-render` | 启动、绘制、AX 通过 | PID 77979；`7/13 clips mounted`，Drums/Bass/Keys/FX 与 Clip 名称 | 裁剪后内容存在；拖动、resize 的自动行为断言由既有测试覆盖 |
| `waveform-automation` | 启动、绘制、AX 通过 | PID 79574；合成 peaks 的竖线波形、SVG automation 曲线实际可见 | 不是真实音频引擎；没有新增性能承诺 |
| `drag-pad` | 启动、绘制、AX 通过 | PID 80550；BPM 120、Pan 0.00、Percent 50、Disabled 42 的 incrementor | 未操作真实光标隐藏与恢复，避免改变用户光标；测试中该边界按原约定 mock |

这组结果证明这四个已有 demo 能消费当前构建，没有证明所有未使用的新 API 都正确。`onScrollChange`、`getElementsAt`、`registerFont`、Button、Dialog、createPortal 等在主干源码存在，但本轮没有逐项行为验收。

## `onLayout`：可以替代采样，但不能当任意文字宽度 API

20 行 probe 见附录。使用 `renderer.getDebugFrameOverlayStats().frames` 的真实 native draw 计数，不用 JS timer 数量冒充帧数。记录请求尺寸变化时的 frame，然后在事件到达时计算差值。

```text
bun --hot onlayout-demo.tsx
[gpuix] mount complete
{"kind":"div","width":120,"height":40,"frames":3,"ms":19.098165999999992}
{"kind":"text","width":80,"height":23,"frames":3,"ms":19.169040999999993}
{"kind":"div","width":220,"height":40,"frames":1,"ms":2.0788330000000315}
{"kind":"text","width":148,"height":45,"frames":1,"ms":2.1070420000000922}
```

真实窗口标题 `A6 onLayout`，PID 83741，AX 包含 `measure me`，截图显示蓝色容器与放大后的文字。首次监听在 3 次 native draw 后收到，约 19.1ms；React 更新容器宽度与文本 fontSize 后，1 次 draw 收到，约 2.1ms。这是一次实测，不是首帧固定为 3、resize 固定为 1 的时序保证。

**A4 可以用事件驱动容器测量。A3 可以用事件驱动已挂载文本测量，但必须让样本按内容收缩。** 第一版 probe 的父元素没有禁止 stretch，文字 `onLayout.width` 得到 560，实际是容器宽度。改成 flex column、`alignItems: "flex-start"` 后，同一文字得到 80，再随字号变化得到 148。事件报告 border box，不是单独 glyph advance，也不测尚未挂载的文本。

[上游契约][layout-doc] 与实现 `paint_reporter`、`report_layout` 规定事件在 paint 后 defer；只改变位置、没有改变大小不触发；隐藏未绘制的元素不报告。因而不能用 `visibility: "hidden"` 的样本等待该事件，也不能用 onLayout 在同一帧反向定位。A3、A4 的正式切换应删除旧采样路径，而不是同时保留两种 owner。本轮没有修改这两个切片的源码。

## 关闭拦截 PoC

本地分支 `zoeydaw-a6-close-poc`。补丁见附录，生成声明为 `setWindowShouldClose(callback: () => boolean): void`。

| 范围                                  |                  实际补丁大小 | zed 子模块          |
| ------------------------------------- | ----------------------------: | ------------------- |
| `packages/native/src/renderer.rs`     | +33 / -1，34 个 changed lines | 无修改              |
| 自动生成 `packages/native/index.d.ts` |                       +5 / -0 | 无修改              |
| 合计                                  | +38 / -1，39 个 changed lines | 子模块 SHA 保持固定 |

GPUI [Window::on_window_should_close][close-hook] 与 macOS [window_should_close][mac-close] 已实现。缺口在 gpuix，没有注册 hook。另一个必须处理的路径是 renderer 自己的 `CloseWindow` action，Cmd+W 原来直接调用 `window.remove_window()`，绕过 AppKit 的 should-close。PoC 让这两个路径都调用同一个 JS bool predicate。

```text
bun --hot close-poc.tsx
[gpuix] mount complete
{"closeRequest":1,"allow":false}
allow enabled
{"closeRequest":2,"allow":true}
exit=0
```

这组日志来自真实红灯关闭按钮，AX 先确认 `AXSubrole=AXCloseButton` 后按下。false 后窗口和 AX 内容仍存在；点击 demo 内的 `Allow next close` 再按红灯，窗口消失、进程退出 0。

第二次独立启动验证 Cmd+W：

```text
dispatch cmd-w
{"closeRequest":1,"allow":false}
allow enabled
{"closeRequest":2,"allow":true}
exit=0
```

第一次通过 live renderer 的 `simulateKeystrokes("cmd-w")` 走真实 GPUI key/action pipeline。必须先有 `tabIndex={0}` 的 focus target 并调用 `focusNext()`，无 focus handle 时之前的模拟没有触发 action。false 后用 AX 确认窗口仍存在；点击 Allow 后，向该窗口发送 `cmd+w`，收到 true 并退出。没有把“没触发关闭事件”误当成成功 veto。

PoC 的适用范围只到 macOS embedded loop：JS 通过 tick 泵 AppKit，同一线程可以用 `FunctionRef` 同步回调。Windows、Linux 的独立 UI 线程不能照搬同步回调，也不能在该线程阻塞等待 JS TSFN，否则有死锁风险。未实现 handler 清除、env teardown 测试、异步确认对话框、Cmd+Q 拦截或正式跨平台接口，不能把该 PoC 当成 `WindowCloseGuard` 已接通。

### `hideWindow`、`showWindow`

本轮没有添加这两个别名。GPUI 的 `PlatformWindow` 没有 hide 或 set-visible 方法，`Window.platform_window` 为 crate-private；`App::hide()` 隐藏整个应用，不能冒充窗口级 hide。

已有且明确的 show 路径是 `WindowOptions.show=false` 创建隐藏窗口，然后 `activateWindow()`。macOS `MacWindow::activate` 调用 `makeKeyAndOrderFront:`。不需要再给它增加等价 `showWindow` 别名。

真正的 `hideWindow` 需要 GPUI 新增窗口可见性 API，再在 macOS 使用 `orderOut:`。按 [gpuix fork 规则][fork-rule]，应先进入 remorses/zed 再升级 submodule。本轮没有修改 zed，没有通过 raw NSWindow 或重新打开窗口绕行。该项是条件不满足后的明确未实现，不是已完成能力。

## `measureText` 设计与补丁规模

仅设计，没有实现，也没有把节点测量称为 measureText。

[WindowTextSystem][text-system] 已公开 `layout_line`、`shape_line`、`shape_text`；`LineLayout` 有 width、ascent、descent。`shape_line` 只接受单行，新行会触发断言，包含换行的输入必须走 `shape_text`。native 已有 `text::runs::plain_runs`、font weight 解析与 `update_window`，不需要新的 shaping 库或 zed 修改。

建议接口为 `measureText(text, style) -> { width, height }`，尺寸是 logical pixels，不含 padding、border 或 stretch。style 只取 font family、font size、font weight、font style、line height，复用当前 renderer 的默认值与解析规则。明确换行的多行用 `shape_text`，没有隐式容器宽度；height 使用同 renderer 的 line height，而不是把 fontSize 当高度。Font fallback、emoji、CJK、组合字都交给 GPUI 的 text system，先 `registerFont` 再测自定义字体。

| 部分                                         | 预计新增行数，非实测补丁 |
| -------------------------------------------- | -----------------------: |
| napi 输入、输出类型与 style 边界             |                 25 至 40 |
| 共用 GPUI shaping helper、单行与显式换行尺寸 |                 30 至 50 |
| macOS 入口、Windows/Linux UI command 与响应  |                 35 至 55 |
| TestGpuixRenderer、host 类型与公开导出       |                 20 至 35 |
| 行为测试、README、changeset                  |                 50 至 80 |
| 总计                                         |               160 至 260 |

同步返回应复用现有窗口查询的 UI command/response 路径；不能让 napi 线程越过 Window owner 直接调用 text system。复用 GPUI 的 layout cache，不再增加 JS 字符宽度表。若只做 macOS 单行试验可更小，但那不等于正式的跨平台 `measureText`。

## 自建的持续成本

- **固定 Rust 与 zed。** 本次两个 rust-toolchain.toml 必须一致；zed 子模块本身包含完整 workspace 及若干 git 依赖。固定 gpuix SHA 不等于已经固定所有发布步骤，必须保存 Cargo.lock、JS lock、工具链、feature flags。
- **CI 构建。** 本机 arm64 干净 target 400.30s、1.825 GiB，首次网络 metadata 另有 401.12s。默认 shader 路径还需下载 MetalToolchain。CI 机器的墙钟和聚合内存未实测，不能照抄本机数字为保证。
- **增量成本。** renderer 改一行仍花 67.39s。缓存按工具链、目标平台、Cargo.lock、zed SHA 与 features 区分，避免每次清掉全部依赖。
- **主干跟随。** 升级一次同时看 gpuix、共享 JS host runtime 与 zed。napi、native JS、React 必须一起构建，不能只换 `.node`。最小验收继续保留本次 31 个测试、四个窗口、onLayout 时序、close false/true 转换。
- **fork 维护。** 当前 close patch 无需 zed 改动；hideWindow 要遵守先改 zed fork 的流程，不能靠 renderer reach-around。Windows/Linux close 的线程模型需另行实现与验收。
- **打包发布。** B 的包名是推荐，不是本轮已发布产物。`@gpuix/react` 内部仍 import `@gpuix/native`，切换到 `@zoeydaw/gpuix-native` 时必须统一包解析或迁移调用，保留上游许可证和 THIRD_PARTY_NOTICES。不要维护两份互相独立的 renderer。

## 验证范围

已运行：本 worktree 的 `pnpm install --frozen-lockfile`、`pnpm native:build`、`apps/gpuix` 的 `tsc --noEmit` 和 `bun test`；本地构建消费者的同样类型检查与 31 个测试；native JS、React 的 tsc；可复现脚本；六次真实启动测量；四个 demo、两种布局 probe 与红灯、键盘 close 转换。

附录的 diff 已用 `git apply --check --reverse` 对本地已修改的 vendor 验证，exit 0；20 行 probe 与实际运行的副本逐字一致。

| 最终检查 | 命令与结果 |
| --- | --- |
| 本 worktree gpuix 类型与测试 | `cd apps/gpuix && pnpm exec tsc --noEmit && bun test`，类型通过，31 pass、0 fail、58 expect |
| 本地构建消费者 | 从已安装路径直接执行 `tsc --noEmit -p tsconfig.json`，通过；`bun test` 31 pass、0 fail |
| 本 worktree Rust | 根目录 `cargo check && cargo test`，check 17.12s；engine 21 pass、native 0 tests、doc-tests 0，全部通过 |
| vendor Rust PoC | `cargo check --release --features test-support,gpui_platform/runtime_shaders`，通过；同 features 的 `cargo test --release`，266 pass、0 fail，doc-tests 0 |
| 构建入口 | `RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin bash scripts/gpuix-main/build.sh runtime`，exit 0；`bash -n` 通过 |

交付前以 `ps -axo pid,etime,command` 取进程列表，筛选 `bun .*--hot`、`cargo run`、gallery、demo，唯一匹配如下：

```text
85824       01:14 bun --hot src/gallery/controls.tsx
```

这是其它 worker 的 gallery，不属于 A6，本轮没有终止它。A6 启动的 feature、layout、close、startup 窗口均已退出；`computer.windows({title: "A6"})` 返回 `[]`。本轮未启动、重启或终止用户的 Tauri 应用。

## 错题

供协调者收敛到 LESSONS，本切片不直接修改共享错题本。

### 工具链与构建顺序

- 错：看到 `rustup toolchain list` 就认定 Rust 完整，看到 CLT 就认定有 Metal，或在 napi build 后直接构建 React。
- 对：先检查 `rustc -vV`、`xcrun --find metal`；缺 Xcode 时明确选择 `runtime_shaders`；native `build:js` 在 React tsc 之前。
- 因：命名工具链曾只有 cargo；默认构建花 782.94s 才报 Metal 缺失；React 依赖 native 的 host/testing/runtime 子路径。
- 见：`build-cold.log`、`build-truecold.log`、上游 CI 和本文构建章节。

### 文本布局不是 glyph 宽度

- 错：把任意 `<text onLayout>` 的 width 当字宽，或让未 paint 的隐藏样本等待事件。
- 对：让文本按内容收缩，监听实际 border box；未挂载文本交给未来的 `measureText`，不伪造事件。
- 因：同一字符串 stretch 时宽 560，禁止 stretch 后宽 80；上游报告器在 paint 后触发。
- 见：本文两种 probe 输出、`paint_reporter`、README onLayout 契约。

### 关闭模拟要确实到达 action

- 错：只注册 AppKit close hook，或把无 focus handle 时没有关闭当成 veto。
- 对：红灯和 `CloseWindow` action 共用判定；先设置 `tabIndex={0}` 与 focus，再模拟 Cmd+W，并核对 callback 日志。
- 因：Cmd+W 原来直接 `remove_window()`；无 focus target 的首次模拟没有任何 closeRequest。
- 见：关闭 PoC diff、`proc://a6-close-focused` 的 false/true 日志。

### 验证窗口及时关闭

- 错：首个布局窗口拿到截图后多留约 3 分钟。
- 对：每轮启动、取证、关闭；计时 probe 自行退出，交付前核对自有 PID。
- 因：常驻窗口持续占用 GPU 和内存，本轮该窗口被协调者终止。
- 见：共享 LESSONS 的 demo 清理规则和本文进程核对记录。

## 已验证做法

- 用空 Cargo target 区分冷构建与接续构建，另外披露网络缓存状态；400.30s 与 158.59s 不混报。
- 用 native `frames` 而不是 JS timer 次数测布局延迟，用 `getPaintedText()` 而不是 mount 日志判首个内容帧。
- 本地包链接时同步统一 React 实例，31 个消费者测试、四个真实窗口均能运行；不把两个 React 图混装成兼容性失败。
- 关闭测试同时验证 false 保留窗口、true 允许关闭，并通过 AX 精确定位自己的 `AXCloseButton`；不操作用户或其它 worker 的窗口。

## 附录：20 行 `onLayout` probe

在消费者副本的 `apps/gpuix/onlayout-demo.tsx` 中运行。tsconfig 使用现有 `jsxImportSource: "@gpuix/react"`。

<!-- prettier-ignore -->
```tsx
import { createRenderer, flushSync, render, startFrameLoop } from "@gpuix/react"
import type { EventPayload } from "@gpuix/native"
import { useState } from "react"
const renderer = createRenderer()
renderer.init({ title: "A6 onLayout", width: 600, height: 400, focus: false })
const now = () => ({ frames: renderer.getDebugFrameOverlayStats().frames, ms: performance.now() })
let requested = now()
const report = (kind: string, e: EventPayload) => console.log(JSON.stringify({ kind, width: e.width, height: e.height, frames: now().frames - requested.frames, ms: now().ms - requested.ms }))
let resize = () => {}
function App() {
  const [wide, setWide] = useState(false)
  resize = () => { requested = now(); flushSync(() => setWide(true)) }
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", height: "100%", padding: 20, backgroundColor: "#11111b" }}>
    <div onLayout={(e) => report("div", e)} style={{ width: wide ? 220 : 120, height: 40, backgroundColor: "#89b4fa" }} />
    <text onLayout={(e) => report("text", e)} style={{ fontSize: wide ? 28 : 14, color: "#ffffff" }}>measure me</text>
  </div>
}
render(<App />, { renderer })
startFrameLoop(renderer)
setTimeout(resize, 2000)
```

## 附录：关闭 PoC 的完整 diff

该 diff 只存在于本地第三方 clone 和本文，不复制第三方源码进本仓库。没有改动 zed 子模块指针。

```diff
diff --git a/packages/native/src/renderer.rs b/packages/native/src/renderer.rs
index cc780fc..0525e23 100644
--- a/packages/native/src/renderer.rs
+++ b/packages/native/src/renderer.rs
@@ -54,7 +54,11 @@ fn with_window_menu_actions(root: gpui::Div) -> gpui::Div {

     root.on_action(|_: &MinimizeWindow, window, _cx| window.minimize_window())
         .on_action(|_: &ZoomWindow, window, _cx| window.zoom_window())
-        .on_action(|_: &CloseWindow, window, _cx| window.remove_window())
+        .on_action(|_: &CloseWindow, window, _cx| {
+            if query_window_should_close() {
+                window.remove_window();
+            }
+        })
 }

 #[cfg(not(target_os = "macos"))]
@@ -62,6 +66,12 @@ fn with_window_menu_actions(root: gpui::Div) -> gpui::Div {
     root
 }

+#[cfg(target_os = "macos")]
+fn query_window_should_close() -> bool {
+    let handler = WINDOW_CLOSE_HANDLER.with(|stored| stored.borrow().clone());
+    handler.map(|handler| handler()).unwrap_or(true)
+}
+
 /// Parse a CSS font-weight value (string or number) into a GPUI FontWeight.
 /// Accepts named keywords ("bold", "semibold"), numeric strings ("700"),
 /// and raw numbers (700). Falls back to 400 (normal) for unrecognized values.
@@ -128,6 +138,8 @@ thread_local! {
     static GPUI_APP: RefCell<Option<gpui::ApplicationHandle>> = const { RefCell::new(None) };
     #[cfg(target_os = "macos")]
     static GPUI_WINDOW: RefCell<Option<gpui::WindowHandle<GpuixView>>> = const { RefCell::new(None) };
+    #[cfg(target_os = "macos")]
+    static WINDOW_CLOSE_HANDLER: RefCell<Option<Rc<dyn Fn() -> bool>>> = const { RefCell::new(None) };
     #[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
     static WEB_APP: RefCell<Option<gpui::ApplicationHandle>> = const { RefCell::new(None) };
     #[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
@@ -1664,6 +1676,26 @@ impl GpuixRenderer {
         Err(Error::from_reason("Unsupported operating system"))
     }

+    /// macOS embedded-loop PoC: both AppKit and JavaScript run on this thread.
+    /// The handler must return synchronously and must not mutate GPUI reentrantly.
+    #[cfg(target_os = "macos")]
+    #[napi]
+    pub fn set_window_should_close(&self, env: Env, callback: FunctionRef<(), bool>) -> Result<()> {
+        let handler: Rc<dyn Fn() -> bool> = Rc::new(move || {
+            match callback.borrow_back(&env).and_then(|callback| callback.call(())) {
+                Ok(allow) => allow,
+                Err(error) => {
+                    log::error!("Window close callback failed: {error}");
+                    false
+                }
+            }
+        });
+        update_window_without_view(move |window, cx| {
+            window.on_window_should_close(cx, |_, _| query_window_should_close());
+            WINDOW_CLOSE_HANDLER.with(|stored| *stored.borrow_mut() = Some(handler));
+        })
+    }
+
     /// Bring the window forward and give it focus. This is how a window opened
     /// with `show: false` or `focus: false` is revealed later.
     #[napi]
diff --git a/packages/native/index.d.ts b/packages/native/index.d.ts
index 2f865d1..dda6429 100644
--- a/packages/native/index.d.ts
+++ b/packages/native/index.d.ts
@@ -87,6 +87,11 @@ export declare class GpuixRenderer {
   resetDebugFrameOverlayStats(): void
   /** Same numbers as the on-screen overlay: current, p90, p99, max, frames. */
   getDebugFrameOverlayStats(): DebugFrameOverlayStats
+  /**
+   * macOS embedded-loop PoC: both AppKit and JavaScript run on this thread.
+   * The handler must return synchronously and must not mutate GPUI reentrantly.
+   */
+  setWindowShouldClose(callback: () => boolean): void
   /**
    * Bring the window forward and give it focus. This is how a window opened
    * with `show: false` or `focus: false` is revealed later.
```

[ci]: https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/.github/workflows/ci.yml#L75-L80
[apple-build]: https://github.com/remorses/zed/blob/c2e9f882030ca95cee55d206512a0a3ee6cd72b0/crates/gpui_apple/build.rs
[metal]: https://github.com/remorses/zed/blob/c2e9f882030ca95cee55d206512a0a3ee6cd72b0/crates/gpui_apple/src/metal_renderer.rs#L217-L224
[layout-doc]: https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/README.md#L3168-L3182
[close-hook]: https://github.com/remorses/zed/blob/c2e9f882030ca95cee55d206512a0a3ee6cd72b0/crates/gpui/src/window.rs#L6229-L6239
[mac-close]: https://github.com/remorses/zed/blob/c2e9f882030ca95cee55d206512a0a3ee6cd72b0/crates/gpui_macos/src/window.rs#L2893-L2904
[fork-rule]: https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/AGENTS.md#L13-L34
[text-system]: https://github.com/remorses/zed/blob/c2e9f882030ca95cee55d206512a0a3ee6cd72b0/crates/gpui/src/text_system.rs#L413-L451

## 集成

2026-10-15，D1。应用切换到上述固定 SHA 的自建产物，保留 `@gpuix/native` 与 `@gpuix/react` 导入名，没有发布 `@zoeydaw/gpuix-native`。版本唯一来源是 `scripts/gpuix-main/config.json`；上游 package.json 中的 `0.10.0` 不是这次构建的版本身份。

### 解析方案

`build.sh` 拥有 `/Volumes/PSSD/code/_vendor/zoeydaw-gpuix/<SHA>` 的源码、上游锁文件安装、native 二进制、native JS host 与 React dist，并生成本 checkout 的 `.gpuix-main` 符号链接。`.gitignore` 排除该链接，第三方源码与产物不进入仓库。`GPUIX_VENDOR_ROOT` 可改变外置源码位置，不需要改 package.json 或 lockfile。Cargo target 仍须位于 PSSD。

根 `pnpm-workspace.yaml` 只对 `@gpuix/native` 与 `@gpuix/react` 配置 `link:.gpuix-main/packages/...` overrides，所有 renderer 消费者使用同一组包。`apps/gpuix/package.json` 还直接链接 vendor React，使应用、React renderer、react-reconciler 与 Zustand 的 peer React 指向同一 realpath。pnpm 的 [root overrides](https://pnpm.io/settings#overrides) 和 [link 协议](https://pnpm.io/cli/link) 已提供包解析能力，不额外写 loader 或维护另一份 renderer。

| 方案 | 取舍 |
| --- | --- |
| 相对 `link:` 与 root overrides，已采用 | 外置构建仍是唯一 owner；内部 `@gpuix/native` 导入无需改名；每个 checkout 只生成一个忽略的链接 |
| 把 vendor 加成 workspace package | 外置源码变成 workspace 成员，上游 `workspace:^` 与本仓安装生命周期耦合，增加 owner |
| `file:` 复制包或改成 npm alias | 复制 dist 会增加过期副本；改 native 名称仍须处理 React 内部导入 |
| 全 workspace 覆写 React，已撤回 | vendor 锁定 19.2.4，而 Web/UI 的 react-dom 为 19.2.8，会产生不匹配；只链接 gpuix 的 React，Web/UI 保留 19.2.8 |

`node scripts/gpuix-main/check.mjs --resolution` 校验真实解析路径，覆盖应用、renderer、react-reconciler、Zustand，并确认保留的 Web/UI React 与 ReactDOM 版本一致。原 A6 `/Volumes/PSSD/code/_vendor/gpuix` 不修改，避免覆盖 PoC 证据。

### 干净 checkout 的安装顺序

前置工具为 Node 22.18 以上、pnpm 10.11.0、Bun、Git 与 Rust 1.97.1，并需要可写的 PSSD。默认 `runtime` 模式不要求完整 Xcode；`precompiled` 模式需要 `xcrun metal`。

```sh
bash scripts/gpuix-main/build.sh
pnpm install --frozen-lockfile
pnpm native:build
node scripts/gpuix-main/check.mjs --resolution
```

先构建 vendor，再安装消费者，最后构建本仓 `@zoeydaw/native`。没有 `.gpuix-main` 时，`pnpm:devPreinstall` 在依赖安装前报 `Missing .gpuix-main build link`，并给出 `Run bash scripts/gpuix-main/build.sh before pnpm install --frozen-lockfile.`。该失败路径已实跑，不回落到 npm renderer。

构建只允许固定 SHA、固定 zed SHA 与仓库中的 `patches/close-guard.patch`，拒绝额外 tracked diff、untracked 源码与 dirty zed。已应用的补丁可重复构建，不重复 apply。外置 `.build-lock` 确保同一 vendor 同时只有一个构建 owner；中断留下锁目录时，先确认原构建已结束，再移除空锁目录。`check.mjs` 校验补丁 diff、平台与产物 SHA-256 manifest，拒绝源码或产物发生变化的旧构建。

关闭补丁来自 A6 附录，纳入版本管理后由干净 checkout 应用。它仍只适用于 macOS embedded loop，未实现 Windows/Linux 的跨线程关闭流程、handler 清除或异步确认。`WindowCloseGuard.supported` 没有被改成 true。上游完整 Apache-2.0 LICENSE 与 THIRD_PARTY_NOTICES 原文保存在根 `THIRD_PARTY_NOTICES`。

### 升级到下一个主干 SHA

1. 核对上游 native、JS host、React、zed 子模块、Cargo.lock、bun.lock 与 Rust 工具链变更。
2. 更新 `config.json` 的两个 SHA。只在新的外置 SHA 目录构建，不覆盖旧目录。
3. 核对关闭补丁是否已被上游替代；否则在新基线重做并审查补丁，不绕过 dirty 检查。
4. 运行 `build.sh`。它完成 native、host、React 一起重建，并更新本 checkout 的链接与外置 build manifest。
5. 运行 frozen install、`pnpm native:build`、`check.mjs --resolution`、gpuix 的 tsc、完整 bun test、ESLint，以及受影响的 Rust check/test。
6. 逐个运行四个 feature demo、panel gallery、`bun --hot scripts/gpuix-main/probe.mjs` 和带 `--close` 的探针。验证布局事件、Space、红灯与 Cmd+W 的 veto/allow 转换，每个窗口验证后立即关闭。
7. 更新本报告与第三方 notice；只提交 SHA、补丁、构建与解析配置，不提交源码或二进制。

### D1 验收记录

本轮是 renderer 集成，不是全量控件视觉验收。协调者已批准这一范围，补充要求是保存截图、核对面板 token，并比较 A4、A3 在 npm 与自建 renderer 下的布局。

| 检查 | 实跑命令 | 结果 |
| --- | --- | --- |
| 独立 vendor 干净源码构建 | `bash scripts/gpuix-main/build.sh` | 通过，151.11s，复用现有 Cargo target；napi 部分 71.75s，二进制 23,665,216 bytes |
| 幂等重建 | `bash -n scripts/gpuix-main/build.sh && bash scripts/gpuix-main/build.sh && node scripts/gpuix-main/check.mjs --resolution` | 通过，42.84s，补丁不重复 apply，manifest 与包 identity 检查通过 |
| 干净消费者安装 | 把 `8b078fd` 的 `git archive` 解到独立临时目录，运行 `build.sh`、`pnpm install --frozen-lockfile`、`check.mjs --resolution` | 通过，999 个包；该目录起初没有 node_modules 或 `.gpuix-main`，验证后已删除 |
| 本仓 native | `pnpm native:build` | 通过 |
| gpuix 类型 | `pnpm --dir apps/gpuix exec tsc --noEmit` | 通过，0 error |
| gpuix 全部测试 | `pnpm --dir apps/gpuix exec bun test` | 406 pass、1 todo、0 fail，59 files，93,740 expect |
| lint | `pnpm exec eslint apps/gpuix/src scripts/gpuix-main/check.mjs scripts/gpuix-main/probe.mjs` | 0 error、0 warning |
| 本仓 Rust | `cargo check && cargo test` | 通过，engine 21、native 8，doc-tests 0 |
| vendor Rust | `CARGO_BUILD_JOBS=6 CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target cargo check --release --features test-support,gpui_platform/runtime_shaders` 与同 features 的 `cargo test --release` | 通过，266 pass、0 fail；上游 3 个 dead_code warning 未改 |
| 保留的 Web | `pnpm --filter @zoeydaw/web typecheck && pnpm --filter @zoeydaw/web test` | 类型通过，462 pass、78 files |

`packages/ui` 没有 test script，空的 `pnpm --filter @zoeymind/ui test` 不计为通过。额外运行 `cd packages/ui && pnpm exec tsc --noEmit`，报三处协调者确认的遗留 story API 错误：`data-table.stories.tsx:79` 的 `indeterminate`，`sheet.stories.tsx:26,36` 的 `asChild`。这些只读路径未改；Web/UI 的 React 与 ReactDOM 都保留 19.2.8，不是 vendor 的 19.2.4。

唯一 todo 是既有 `project/model/grid.test.ts` 的 `Ctrl/Cmd+1/2 maps to adjustGrid through the Arrangement keyboard hook`，由 Arrangement 切片接线。本轮提供窗口订阅端口，不把快捷键业务称为已完成。

面板生产代码删除 32ms 测量定时器、`useWindowSize` 与 `getElementBounds` 采样，只由 `onLayout` 更新尺寸。测试初次运行出现 7 个布局失败，原因是上游 `TestRenderer.flush()` 只 paint、不分发 paint 后事件；测试的 `settle()` 现在显式调用 `dispatchNativeEvents()`，原有拖动、折叠、resize 断言未放宽，10 个面板交互测试通过。元素焦点检查不属于尺寸采样，没有顺便删除。

`WindowKeyboard` 在 `platform/keyboard` 拥有每个 render root 的订阅，`main.tsx` 注入 `onKeyDown`、`onKeyUp` 并提供 context。取消订阅、消费阻止第二个 section 命令、root 隔离各有行为测试。接入约定见该目录的 README，ui 不 import platform。

### 真实窗口与探针

所有入口均用带 name 的 `bun --hot` service 启动；表中截图与 AX 来自真实窗口，每轮取证后立即关闭。图片位于 [`scripts/gpuix-main/evidence`](../../scripts/gpuix-main/evidence/)。

| 入口 | 观察到的内容或操作 | 截图 |
| --- | --- | --- |
| `src/features/track-mixer/demo.tsx` | Lead Synth、Drum Bus、FX Group，Volume/Pan sliders | `track-mixer.png` |
| `src/features/clip-render/demo.tsx` | `7/13 clips mounted`，Drums/Bass/Keys/FX 与 clip 名称 | `clip-render.png` |
| `src/features/waveform-automation/demo.tsx` | 合成竖线 peaks 与 SVG automation，非真实音频引擎 | `waveform-automation.png` |
| `src/features/drag-pad/demo.tsx` | BPM 120、Pan 0.00、Percent 50、Disabled 42 | `drag-pad.png` |
| `src/ui/panels/gallery.tsx` | 初始 Browser 275px、Clip 0px、Device 160px；Toggle Clip 后 Clip 160px，Device 仍 160px | `panel-geometry-default.png`、`panels-main.png` |
| `src/main.tsx` | 注入键盘 provider 的应用根正常绘制 foundation 文本 | `main.png` |
| `scripts/gpuix-main/probe.mjs` | Space 到达订阅，AX 变为 `Window key: space`；文字容器报告 border box | `capability.png` |
| 同探针带 `--close` | Cmd+W veto、红灯 veto，Allow 后红灯关闭，exit 0 | `close-veto-final.png` |

最终探针实际输出如下，`width` 是收缩文字容器的 border box，不是任意字符串 shaping API。

```json
{"kind":"textLayout","width":227,"height":29}
{"kind":"windowKeyDown","key":"space"}
{"kind":"windowKeyUp","key":"space"}
{"kind":"closeRequest","allow":false}
{"kind":"closeRequest","allow":false}
{"kind":"closeRequest","allow":true}
```

### 渲染器切换的布局对照

A4 比较旧采样版 npm 0.10.0 与 D1 `onLayout` 版自建主干，均打开 Clip，窗口外框 1120×788。A3 两边使用相同源码 `gpuix-migration@136f1dda8c06e153cc129daee08f1746cde70550` 的外置消费者，窗口外框 1050×808；本 worktree 不含 A3，未修改或访问其它 worktree。

临时消费者通过 `git archive` 取源码，npm 对照只安装既有 `@gpuix/native@0.10.0`、`@gpuix/react@0.10.0`、React 19.2.8；主干对照只把三个链接改到固定 vendor。两个消费者的 React 都与自己的 renderer 一致，比较后移除临时目录。以下 x/y 相对 AX 窗口外框原点，包含标题栏。`Δ` 是自建减 npm 的 x/y/w/h。

| 画廊与节点                   | npm x/y/w/h    | Δ x/y/w/h |
| ---------------------------- | -------------- | --------- |
| A4 Toggle Browser            | 7/35/108/35    | 0/0/0/0   |
| A4 Toggle Clip               | 122/35/82/35   | 0/0/0/0   |
| A4 Toggle Device             | 211/35/100/35  | 0/0/0/0   |
| A4 browser                   | 7/77/275/342   | 0/0/0/0   |
| A4 arrangement               | 289/77/824/342 | 0/0/0/0   |
| A4 clip                      | 7/426/1106/160 | 0/0/0/0   |
| A4 devices                   | 7/593/1106/160 | 0/0/0/0   |
| A4 Resize browser            | 282/77/7/342   | 0/0/0/0   |
| A4 Resize browser columns    | 93/114/7/303   | 0/0/0/0   |
| A4 Resize clip               | 7/419/1106/7   | 0/0/0/0   |
| A4 Toggle device by dragging | 7/586/1106/7   | 0/0/0/0   |
| A3 Active button off         | 33/178/54/13   | 0/0/0/0   |
| A3 No highlight              | 97/178/58/13   | 0/0/0/0   |
| A3 Play icon                 | 165/178/13/13  | 0/0/0/0   |
| A3 Outline                   | 33/191/36/13   | 0/0/0/0   |
| A3 Secondary                 | 79/191/51/13   | 0/0/0/0   |
| A3 Ghost                     | 140/191/31/13  | 0/0/0/0   |
| A3 Delete                    | 181/191/33/13  | 0/0/0/0   |
| A3 Link                      | 224/191/23/13  | 0/0/0/0   |
| A3 Warp mode                 | 363/174/117/13 | 0/0/0/0   |
| A3 Continuous adjustment     | 490/174/63/13  | 0/0/0/0   |
| A3 Commands                  | 363/187/54/13  | 0/0/0/0   |
| A3 BPM                       | 33/207/34/13   | 0/0/0/0   |
| A3 Transport BPM             | 70/204/45/20   | 0/0/0/0   |
| A3 Level                     | 33/224/34/13   | 0/0/0/0   |
| A3 Bipolar                   | 77/224/45/13   | 0/0/0/0   |
| A3 Pan                       | 132/224/39/13  | 0/0/0/0   |
| A3 Gallery input             | 693/178/286/13 | 0/0/0/0   |

28 个节点、112 个 bounds 标量全部相同。原始双边数据在 `evidence/renderer-comparison.json`；截图为 `panels-npm.png`、`panels-main.png`、`controls-npm.png`、`controls-main.png`，控件局部放大为 `controls-npm-zoom.png` 与 `controls-main-zoom.png`。截图的窗口阴影与红灯颜色受 OS 焦点影响，不据此宣称像素完全相同。该比较只覆盖已列节点与状态，不推导全部控件无回归。

### 面板度量与视觉范围

面板 AX 原始坐标在 `evidence/panel-bounds.json`，完整图与放大图为 `panel-geometry-default.png`、`panel-divider-default-zoom.png`。本轮没有调整样式；修复的是测量 owner 与测试事件泵。

| 度量 | token 或既有约定 | 实测 | 结论 |
| --- | --- | --- | --- |
| Browser 到 Arrangement 间隙 | `PROJECT_METRICS.panelGap = 7` | 1009 − 727 − 275 = 7 | 一致 |
| 竖向分隔条宽 | 同一 panelGap | 7 | 一致 |
| Device 水平分隔条高 | 同一 panelGap | 7 | 一致 |
| default 控件高 | `CONTROL_METRICS.default["--spacing-control-track"] = 13` | A3 已列 default 按钮与数值控件均 13 | 一致 |
| transport 控件高 | transport track = 20 | Transport BPM 20 | 一致 |
| 图标按钮正方形 | default track × track | Play icon 13×13 | 一致 |
| Device 固定高 | A4 画廊既有 160px fixture，不是新增 token | 160，Clip 展开前后不变 | 一致 |
| Panel 边框 | panelBorder = 2 | 未逐像素量出厚度 | 未验证，由 A4 ui-panels 验收 |

只读观察 Live 的「无标题」窗口，AX 确认 Browser、Arrangement、Clip 细节与装置详情区域；没有点击、拖动、输入或修改 Live。参照图为 `live-reference-current.png` 与 `live-browser-default-zoom.png`。

| 规则 | Live 观察 | 我们实现 | 一致性 |
| --- | --- | --- | --- |
| Browser 在左，Arrangement 在右，细节在下 | AX 与截图可见这些区域 | A4 画廊有对应 Panel 组合 | 区域关系一致，不声称像素复刻 |
| 布局尺寸只有一个 owner | 无法从 Live UI 观察其内部测量机制 | renderer onLayout 事件持有尺寸 | Live 内部机制未验证 |
| 紧凑控件 | 参照图有密集列表与轨道控件 | 默认 13px、transport 20px 实测符合本仓 token | 全量 Live 同区域密度未验证，由 A3 ui-controls 验收 |
| Space 窗口快捷键 | 未在 Live 输入 | 窗口根订阅已收到 Space，不实现播放业务 | Live 行为未验证，播放接线由 B2 Arrangement/Transport 验收 |
| 关闭拦截 | 未操作 Live 关闭 | 自建 PoC 的 veto/allow 已观察 | Live 行为未验证 |

按 `gpuix-ui-standards.md` 第 13 节逐项声明如下。D1 不宣称通过全量视觉规范。

| 检查 | 本轮证据或边界 |
| --- | --- |
| 每个控件每个状态放大图 | 提交已列默认、Clip 展开、Space、关闭 veto 图及局部 zoom；全量状态未验证，由 A3 ui-controls 与 A4 ui-panels 验收 |
| 间距同一 token | panelGap 与控件高度实测见上表；其它间距未验证，由各 UI owner 验收 |
| 文字、数值、图标居中 | 提交 zoom 与 bounds；未逐节点做居中误差量测，由 A3 ui-controls 验收 |
| 同组等高、图标正方形 | 已列 default 13、transport 20、Play icon 13×13；未覆盖所有控件，由 A3 ui-controls 验收 |
| 与 Live 同区域紧凑感 | 提交只读 Live 参照与本轮画廊图；全量同区域并排密度未验证，由 A3 ui-controls 与 B2 sections 验收 |
| 深浅主题、中英文 | 未验证，由 A3 ui-controls、A4 ui-panels 与 B2 sections 验收 |
| Tab、焦点环、Space | Space 根事件与有焦点时的 Cmd+W 已验证；完整 Tab 顺序、焦点环与输入框快捷键优先级未验证，由各 UI owner 与 B2 app-shell 验收 |
| 拖动、滚轮、弹层保持打开 | 现有面板交互自动测试通过；全量原生手势与弹层状态未验证，由 A3 ui-controls 与 A4 ui-panels 验收 |
| 裁剪、帧数与耗时 | Clip demo 实际显示 7/13 挂载；本轮没有重测 draw stats 或大型工程性能，由 B2 Arrangement 验收 |

### 清理与未实现项

每个自有窗口验证后已关闭，最长一次交互探针约 82 秒；没有长期存活的 D1 demo。干净安装快照与 npm 比较消费者已删除，固定 vendor 源码与构建缓存保留用于后续切片。

最终进程核对命令及输出：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

```text
33614 05:43       bun --hot src/gallery/controls.tsx
```

该 PID 属于 `gpuix-a3b-gallery-polish/apps/gpuix`，已用 `lsof -a -p 33614 -d cwd -Fn` 确认，未停止它。D1 比较时也曾按 PID 区分同名窗口，启动的所有 service 均已退出，自有残留为 0。没有启动、重启或停止用户的 Tauri 应用。

D1 指定的依赖切换、面板测量替换、键盘订阅端口均已实现。未实现的仍是原报告限定的跨平台 close/hideWindow/measureText，以及上面明确列出的其它 owner 的 UI 与快捷键业务；未把它们计入本轮完成能力。
