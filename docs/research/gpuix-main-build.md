# 固定 gpuix 主干自建的实测与成本

2026-10-14，A6 spike。消费者基线为 `d0db74c`，交付前按协调者要求合入 `gpuix-migration` 的共享错题本更新。第三方源码、构建缓存、消费者副本和 PoC 留在 `/Volumes/PSSD/code/_vendor`，不进入本仓库。

历史范围：各节保留对应切片当时的命令与结果，不把历史通过数当成当前验证。本仓库的 `apps/web`、`packages/**`、`src-tauri` 已删除，涉及这些目录的旧命令不再执行；vendor gpuix 的 `packages/native`、`packages/react` 仍是外部源码路径，不属于此次删除范围。当前本地入口见 [setup](../agents/setup.md)。

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

关闭补丁来自 A6 附录，纳入版本管理后由干净 checkout 应用。它仍只适用于 macOS embedded loop，未实现 Windows/Linux 的跨线程关闭流程、handler 清除或异步确认。`WindowCloseGuard.supported` 没有被改成 true(后由 H1 接通，见「H1 窗口外观与程序化关闭」)。上游完整 Apache-2.0 LICENSE 与 THIRD_PARTY_NOTICES 原文保存在根 `THIRD_PARTY_NOTICES`。

### 升级到下一个主干 SHA

1. 核对上游 native、JS host、React、zed 子模块、Cargo.lock、bun.lock 与 Rust 工具链变更。
2. 更新 `config.json` 的两个 SHA。只在新的外置 SHA 目录构建，不覆盖旧目录。
3. 核对关闭补丁是否已被上游替代；否则在新基线重做并审查补丁，不绕过 dirty 检查。
4. 运行 `build.sh`。它完成 native、host、React 一起重建，并更新本 checkout 的链接与外置 build manifest。
5. 运行 frozen install、`pnpm native:build`、`check.mjs --resolution`、gpuix 的 tsc、完整 bun test、ESLint，以及受影响的 Rust check/test。
6. 逐个运行四个 feature demo、panel gallery、`bun --hot scripts/gpuix-main/probe.mjs` 和带 `--close` 的探针。验证布局事件、Space、红灯与 Cmd+W 的 veto/allow 转换，每个窗口验证后立即关闭。
7. 更新本报告与第三方 notice；只提交 SHA、补丁、构建与解析配置，不提交源码或二进制。

### D1 首轮验收记录，同步新基线前

本轮是 renderer 集成，不是全量控件视觉验收。协调者已批准这一范围，补充要求是保存截图、核对面板 token，并比较 A4、A3 在 npm 与自建 renderer 下的布局。

| 检查 | 实跑命令 | 结果 |
| --- | --- | --- |
| 独立 vendor 干净源码构建 | `bash scripts/gpuix-main/build.sh` | 通过，151.11s，复用现有 Cargo target；napi 部分 71.75s，二进制 23,665,216 bytes |
| 幂等重建 | `bash -n scripts/gpuix-main/build.sh && bash scripts/gpuix-main/build.sh && node scripts/gpuix-main/check.mjs --resolution` | 通过，42.84s，补丁不重复 apply，manifest 与包 identity 检查通过 |
| 干净消费者安装 | 把 `8b078fd` 的 `git archive` 解到独立临时目录，运行 `build.sh`、`pnpm install --frozen-lockfile`、`check.mjs --resolution` | 通过，999 个包；该目录起初没有 node_modules 或 `.gpuix-main`，验证后已删除 |
| 本仓 native | `pnpm native:build` | 通过 |
| gpuix 类型 | `pnpm --dir apps/gpuix exec tsc --noEmit` | 通过，0 error |
| gpuix 全部测试 | `pnpm --dir apps/gpuix exec bun test` | 407 pass、1 todo、0 fail，60 files，93,745 expect |
| lint | `pnpm exec eslint apps/gpuix/src scripts/gpuix-main/check.mjs scripts/gpuix-main/probe.mjs` | 0 error、0 warning |
| 本仓 Rust | `cargo check && cargo test` | 通过，engine 21、native 8，doc-tests 0 |
| vendor Rust | `CARGO_BUILD_JOBS=6 CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target cargo check --release --features test-support,gpui_platform/runtime_shaders` 与同 features 的 `cargo test --release` | 通过，266 pass、0 fail；上游 3 个 dead_code warning 未改 |
| 保留的 Web | `pnpm --filter @zoeydaw/web typecheck && pnpm --filter @zoeydaw/web test` | 类型通过，462 pass、78 files |

`packages/ui` 没有 test script，空的 `pnpm --filter @zoeymind/ui test` 不计为通过。额外运行 `cd packages/ui && pnpm exec tsc --noEmit`，报三处协调者确认的遗留 story API 错误：`data-table.stories.tsx:79` 的 `indeterminate`，`sheet.stories.tsx:26,36` 的 `asChild`。这些只读路径未改；Web/UI 的 React 与 ReactDOM 都保留 19.2.8，不是 vendor 的 19.2.4。

唯一 todo 是既有 `project/model/grid.test.ts` 的 `Ctrl/Cmd+1/2 maps to adjustGrid through the Arrangement keyboard hook`，由 Arrangement 切片接线。本轮提供窗口订阅端口，不把快捷键业务称为已完成。

面板生产代码删除 32ms 测量定时器、`useWindowSize` 与 `getElementBounds` 采样，只由 `onLayout` 更新尺寸。测试初次运行出现 7 个布局失败，原因是上游 `TestRenderer.flush()` 只 paint、不分发 paint 后事件；测试的 `settle()` 现在显式调用 `dispatchNativeEvents()`，原有拖动、折叠、resize 断言未放宽，10 个面板交互测试通过。元素焦点检查不属于尺寸采样，没有顺便删除。

`WindowKeyboard` 在 `platform/keyboard` 拥有每个 render root 的订阅，`main.tsx` 注入 `onKeyDown`、`onKeyUp` 并提供 context。取消订阅、消费阻止第二个 section 命令、root 隔离各有行为测试。接入约定见该目录的 README，ui 不 import platform。

同步 A3 前，`keyboard-native.test.tsx` 的 native host 端到端测试为 1 pass、5 expect，验证 trailing 事件链。同步 A3 后已删除该手写 host，改为真实共享 `Button` 与 `Input` 的两条永久回归测试；当前红灯与 A3b 归属见末尾交接记录。窗口订阅不能拦截先运行的元素 handler；业务订阅者仍须判断输入与菜单焦点。没有新增原生消费返回值 API 或修改上游事件系统。

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
| Tab、焦点环、Space | Space 根事件、有焦点时的 Cmd+W、native host 的 input Space 停止冒泡已验证；完整 Tab 顺序、焦点环与产品输入框快捷键优先级未验证，由各 UI owner 与 B2 app-shell 验收 |
| 拖动、滚轮、弹层保持打开 | 现有面板交互自动测试通过；全量原生手势与弹层状态未验证，由 A3 ui-controls 与 A4 ui-panels 验收 |
| 裁剪、帧数与耗时 | Clip demo 实际显示 7/13 挂载；本轮没有重测 draw stats 或大型工程性能，由 B2 Arrangement 验收 |

### 清理与未实现项

每个自有窗口验证后已关闭，最长一次交互探针约 82 秒；没有长期存活的 D1 demo。干净安装快照与 npm 比较消费者已删除，固定 vendor 源码与构建缓存保留用于后续切片。

最终进程核对命令及输出：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

最终 stdout 为空，grep 退出码为 1，表示没有匹配的进程；未把这个退出码当成清理失败。

较早核对曾见其它切片的 A3b 画廊 PID 33614，已核实工作目录并保持不动；最终核对时没有任何匹配进程。D1 启动的所有 service 均已退出，自有残留为 0。没有启动、重启或停止用户的 Tauri 应用。

D1 指定的依赖切换、面板测量替换、键盘订阅端口均已实现。未实现的仍是原报告限定的跨平台 close/hideWindow/measureText，以及上面明确列出的其它 owner 的 UI 与快捷键业务；未把它们计入本轮完成能力。

### 同步 ce38c47 后的 A3b 兼容迁移交接

按协调者要求，`df124cd` 合入 `gpuix-migration@ce38c47c5575358b9fbc7a59ba7c5382d30711d5`，包含 C1 真实引擎、E1 剪贴板与 A3 控件。自动合并没有冲突，未手工改 Cargo.lock 或 ui/controls。最新检查结果如下，不把首轮绿灯当成同步后的结果。

| 检查 | 命令 | 同步后结果 |
| --- | --- | --- |
| 依赖安装 | `pnpm install --frozen-lockfile` | 通过，lockfile 未重新求解 |
| 本仓 native | `CARGO_BUILD_JOBS=6 pnpm native:build` | 通过，Rust release 编译 51.13s |
| 本仓 Rust | `CARGO_BUILD_JOBS=6 cargo check && CARGO_BUILD_JOBS=6 cargo test` | 通过，35 pass、0 fail |
| GPU app 全套测试 | `cd apps/gpuix && bun test` | 463 pass、2 todo、10 fail，475 tests / 88 files，94,274 expect |
| GPU app 类型 | `pnpm --dir apps/gpuix exec tsc --noEmit` | 4 个 ui/controls 的 EventPayload→KeyEvent 错误 |
| lint | `pnpm exec eslint apps/gpuix/src` | 0 error、0 warning |
| renderer identity | `node scripts/gpuix-main/check.mjs --resolution` | 通过，应用、renderer、reconciler、Zustand 仍共用 vendor React；Web/UI 仍为 19.2.8 |

10 个失败的根因都在新合入的 ui/controls，其中 2 条回归测试位于 D1 的 `platform/keyboard/keyboard-native.test.tsx`。协调者明确决定，D1 先交付自有部分，这些兼容迁移与 Space 策略统一归正在修改同一目录的 A3b。D1 不越界、不放宽测试、不加 renderer 猴补；此处不是全量绿灯交付。

#### readOuterBounds 的 89 处引用

主干 `getElementBounds` 已返回真实 border box。`ui/controls/useMeasuredTextWidth.tsx:13-52` 仍按 0.10 的行为减 padding/边框原点、加 border 尺寸，导致重复补偿。LSP 引用分类如下，全部路径与行号保存在 `scripts/gpuix-main/evidence/compatibility-callers.json`，以 ce38c47 为基准。

| 类别 | 引用数 | 定位 |
| --- | --- | --- |
| 声明 | 1 | `useMeasuredTextWidth.tsx:17` |
| helper 内部调用 | 2 | `useMeasuredTextWidth.tsx:83,160`，文字采样与浮层采样 |
| 外部生产 import | 3 | `Popover/index.tsx:17`、`Menu/index.tsx:17`、`RadioGroup/keyboard.ts:1` |
| 外部生产调用 | 4 | `Popover/index.tsx:212`、`Menu/index.tsx:311`、`RadioGroup/keyboard.ts:31,32` |
| 测试 import 与调用 | 79 | 逐项见 JSON，不能只迁生产代码而让测试继续误读 border box |
| 合计 | 89 | 不含注释或字面字符串匹配 |

这些补偿使 ControlGroup 相邻命中边界相差 1px、浮层最大宽被读成 306 而非 304、指针锚点被读成 x=175 而非 180。应移除旧补偿、统一真实 border-box 语义，不通过改宽断言或新增版本分支通过测试。

#### useFloatingCenterOffset 的调用点

此函数的注释明确说明它补偿 gpuix 0.10 的 center 对齐。LSP 共 7 处引用，声明 1、import 3、调用 3。迁移时不能只处理 Menu 与 Popover，DropdownButton 也在用它。

| 消费者         | import                        | 调用                           |
| -------------- | ----------------------------- | ------------------------------ |
| Menu           | `Menu/index.tsx:17`           | `Menu/index.tsx:389`           |
| Popover        | `Popover/index.tsx:17`        | `Popover/index.tsx:189`        |
| DropdownButton | `DropdownButton/index.tsx:14` | `DropdownButton/index.tsx:101` |

#### KeyEvent 类型边界

主干键盘回调是 `KeyEvent`，包含 `defaultPrevented`、`preventDefault()`、`stopPropagation()`。当前四处用宽泛的 `EventPayload` 参数再传给键盘回调，丢掉这些能力。只迁键盘参数的可信类型，不把鼠标 payload 伪装成 KeyEvent，不加 cast 或空方法。

| 文件                        | 参数声明行 | tsc 错误行 |
| --------------------------- | ---------- | ---------- |
| `DragPreviewArea/index.tsx` | 129        | 131        |
| `Menu/index.tsx` 的 trigger | 269        | 271        |
| `Menu/index.tsx` 的 item    | 534        | 536        |
| `Popover/index.tsx`         | 115        | 117        |

#### 10 个失败的具体边界

| 失败 | 实际证据 | 归属 |
| --- | --- | --- |
| 真实 Button 的 Space 状态 | 点击后 Pressed，Space 后变 Released；`Button/index.tsx:102` 仍对 enter/space 都 activate | A3b Space 策略 |
| 真实 Input 的 Space 冒泡 | Input 聚焦后窗口订阅收到 `["space"]`；`Input/index.tsx` 没有 printable-key stopPropagation | A3b 输入消费边界 |
| ControlGroup 相邻命中区 | 左边界终点 23，右边起点 22 | A3b bounds 补偿 |
| Popover asChild 边缘点击 | 期望最后一次 close，实际未发出；测试点依赖旧 bounds | A3b bounds/命中 |
| Popover side/align | 左侧定位期望 240，读取 233 | A3b bounds/center 补偿 |
| Popover intrinsic center | 左侧定位期望 240，读取 233 | A3b bounds/center 补偿 |
| Popover 大表面夹取 | 最大 304，读取 306 | A3b bounds 补偿 |
| Menu 指针锚点 | 期望 x≥180，读取 175 | A3b bounds 补偿 |
| Menu 小视口夹取 | 最大 304，读取 306 | A3b bounds 补偿 |
| DropdownButton center | 允许误差 0.5，读取 1.5 | A3b bounds/center 补偿 |

真实 Button/Input 测试用 `createTestRoot` 的 `nativeSimulateKeystrokes`，不是复制控件策略的假组件；当前 0 pass、2 fail 是被批准保留的红灯回归。A3b 迁移完成后应直接运行这两条测试与完整套件，不恢复手写 host、不 skip、不放宽断言。旧 Popover 的 Enter/Space 激活断言也须按新的「Space 只播放」产品契约更新，不能继续把 Space 激活当正确行为。

静态 28 节点 bounds 的零差异仍只证明当时列出的默认/展开状态，未覆盖弹层与键盘策略；本次完整测试补上了这个限制。协调者收到本清单后合入 D1，再让 A3b 在同一自建 renderer 上完成迁移。

### F1 renderer 补丁集成

2026-10-15。基线包含 D1，另同步 `gpuix-migration` 的 `675f112` 导入规范。F1 在独立 vendor checkout 构建，没有修改原 D1 checkout 或 zed 子模块。

`config.json.patches` 是补丁顺序的唯一来源。`build.sh` 只接受干净源码或已审查补丁序列的完整前缀，再按序 `git apply` 剩余补丁。`check.mjs` 用临时 Git index 从固定 SHA 重建预期 diff，与工作树逐字比较。构建记录包含每个补丁及 native、host、React 产物的 SHA-256，包含这次修改的 `dist/components/select.js` 和声明文件。

| 补丁 | 修改的 vendor 文件 | 契约 |
| --- | --- | --- |
| `frame-callback.patch` | `native/src/renderer.rs`、`native/index.d.ts`、`native/js/host.ts` | 显示帧驱动、显式 active、单调时间 |
| `input-select-all-on-focus.patch` | `native/src/custom_elements/input.rs`、`native/js/host.ts` | 非鼠标聚焦时可选全选，默认关闭 |
| `anchored-center.patch` | `native/src/custom_elements/anchored.rs` | 仅无 position 的 snap trigger-flex 路径让 flex 独占交叉轴居中 |
| `select-trigger-space.patch` | `react/src/components/select.tsx` | `activateOnSpace` 默认 true，尊重 caller `defaultPrevented` |
| `window-active-change.patch` | `native/src/renderer.rs`、`native/index.d.ts`、`native/js/host.ts` | GPUI 原生窗口激活观察，异步 bool 回调 |
| `window-appearance-close.patch`(H1) | `native/src/renderer.rs`、`native/index.d.ts`、`native/js/host.ts` | 窗口明暗外观观察；`closeWindow()` 不经否决关闭，见「H1 窗口外观与程序化关闭」 |
| `context-menu.patch`(F2) | `native/src/context_menu.rs`、`native/src/{lib,renderer}.rs`、`native/js/{host,mutations}.ts` | 最近宿主的原生右键通知，越过交互后代并尊重后续遮挡，见「F2 原生 contextMenu」 |

前置 `close-guard.patch` 保持 D1 的关闭契约。新增补丁不改变两个固定 SHA，没有新增依赖。

#### 帧与窗口事件的唯一 owner

原生帧接口为 `setAnimationFrameCallback(callback | null)` 和 `setAnimationFrameActive(active)`。`timestampMs` 来自单调时钟。callback 同步返回，不得重入修改 GPUI。inactive 不再请求下一帧，已排队的一帧可排空，但不调用 JavaScript。原生回调不强制 redraw，React commit 自己使视图失效，避免一次显示帧绘制两次。

`platform/frame` 的 `createAnimationFrameSource(renderer)` 在首次订阅时注册并激活原生回调，最后一个订阅释放时关闭并清空回调。回调通过 microtask 投递，取消的订阅和旧 session 的排队回调都不能再更新消费者。一个 renderer 共用一个 source。

`AnimationFrameProvider` 接收这个 source，`useAnimationFrame(callback, active)` 只有两个参数。callback 更新不重启原生订阅。active=false、source 更换和卸载都会取消。源码不 import renderer 包，类型一致性测试同时检查 napi `GpuixRenderer` 和 React 的 `NativeRenderer`。

帧接口仍限 macOS embedded loop。Windows、Linux 的同步帧回调没有实现，也没有定时器 fallback。窗口激活接口另用非阻塞 TSFN，已实现 macOS 更新路径和 Windows、Linux、FreeBSD 的 UI command 路径，后三者没有实跑。

`renderer.onWindowActiveChange(callback | null)` 首次异步回报当前窗口状态，再回报激活变化。null 释放 GPUI observer。`createWindowPlatform(renderer).subscribeApplicationActive(listener)` 共用一个惰性 observer，第一条原生值只建立 baseline，不通知消费者。它报告当前窗口激活，不是进程内所有窗口的合并状态。旧全局 sampler、`startSampling` 和 50ms interval 已删除。`@zoeydaw/native.isApplicationActive` 查询保持不变，供没有窗口的场景使用。

本基线没有 `MeterDecayDriver` 或 `clip-lane` 的自动滚动 owner，F1 未改 `project/**`。协调者将其切换分配给 tracks 与 lane 的 owner，接入时不能同时保留定时链和帧订阅。

#### 输入与弹层边界

`selectAllOnFocus` 的类型 owner 是 `native/js/host.ts`，生成到 `native/dist/host.d.ts`。React 的 `InputProps`、`TextareaProps` 继承它，共享 `Input` 再继承 React 类型并使用已有 `...props` 透传。没有重复声明或第二个输入实现。napi 的 `index.d.ts` 不包含 input props，不在其中另造类型。

autoFocus 可以早于编辑器 state 构造，因此构造时也检查现有 focus。普通聚焦订阅调用既有 `select_all`。鼠标 focus 的标记在 focus 前设置，由延迟 focus 通知消费，保留普通点击插入符和拖选。readOnly 允许选择，但仍拒绝文本修改。重复聚焦重新全选。

弹层最初尝试用零尺寸中间节点定位中心点。半尺寸漂移消失，但奇偶尺寸组合仍有两次舍入形成的 1 logical px 误差。最终只在 `position` 为空且 `fit="snap"` 的 trigger-flex 路径改用 cross-axis start，flex 独占交叉轴居中，不增加节点。显式 position、显式 anchor、fill、start、end 与 `fit="switch"` 保持原 GPUI 语义。协调者批准这一保守范围，`switch` 模式的 double-half 未修复，不把它描述成全模式居中修复。默认 snap 回归继续使用 0.51 logical px 容差。

SDK SelectTrigger 的 Space 默认行为不变。共享 `DropdownButton` 传 `activateOnSpace={false}`，Space 不激活也不阻止冒泡。Enter 仍打开，菜单项的 Space 仍选中。caller 的 `preventDefault()` 在 SDK 内建键盘行为之前生效。

#### 上游 PR 草稿

以下是五份独立 PR 说明草稿，按本轮任务要求保留，未提交远程。F1 的 consumer hook 和平台订阅不要求进入上游。上游当前规则禁止外部贡献者开 PR，要求先开 issue，公开 API 变更还须同步 README。因此真正贡献前需要维护者决定流程并补 README；本轮不擅自扩围，也没有发 issue 或 PR。

##### Frame callback

Title: `feat(native): expose demand-driven animation frame callbacks on macOS`

Add `setAnimationFrameCallback(callback | null)` and `setAnimationFrameActive(active)` to the embedded-loop renderer. GPUI `on_next_frame` drives the callback with a monotonic millisecond timestamp. An inactive callback does not schedule another frame, and a pending frame drains without calling JavaScript. Registration is idempotent while a frame is pending.

Callbacks must return synchronously and must not mutate GPUI reentrantly. Consumers can defer React updates. The renderer does not force a redraw for a callback, so a React commit remains the only redraw owner.

Validation: native GPUI scheduling and cancellation regression, consumer hook lifecycle tests with an injected frame source, cancellation mutations, and a real macOS counter window. This API is macOS embedded-loop only. Windows and Linux need a different delivery model because their UI thread is separate from JavaScript.

##### Input focus selection

Title: `feat(input): add selectAllOnFocus without changing pointer caret placement`

Add the optional boolean `selectAllOnFocus` to native input and textarea props. The default remains false. Keyboard focus, programmatic focus, and autoFocus reuse the existing select-all action. Pointer focus preserves ordinary caret placement and drag selection.

Keep focus subscriptions on the editor state and handle autoFocus that occurs before state construction. A pointer-origin flag prevents a deferred focus notification from selecting over the caret placed by the mouse handler. readOnly inputs remain selectable and reject edits.

Validation: real native editor tests cover automatic focus replacement, Tab, programmatic refocus, pointer placement, omitted and false props, and readOnly transitions. Consumer `Input` inherits the prop without a second implementation. No synthetic Cmd+A or OS keyboard workaround is used.

Known limitation: the current native accessibility node does not expose AXSelectedText or AXSelectedTextRange. Runtime verification uses enlarged selection screenshots, AX values, and real replacement or caret-insertion behavior. This change does not modify the GPUI accessibility backend.

##### Anchored center alignment

Title: `fix(native): center snap-mode trigger layers on the cross axis only once`

For trigger-relative layers with no explicit `position` and `fit="snap"`, the wrapper already centers the layer with flex. A center GPUI anchor subtracts the half extent again. Use the cross-axis start anchor only for that snap-mode wrapper path. Explicit positions, explicit anchors, fill, start and end alignment, and switch fitting retain their original GPUI anchors.

A zero-size center wrapper removes the large drift but adds a second rounding point for odd sizes. The proposed snap-only fix adds no wrapper. The existing double-half drift in `fit="switch"` is deliberately not fixed in this bounded change, so its flip and clamp decisions remain compatible.

Validation: native GPUI regressions cover snap-mode sides and alignments, seeded odd and even sizes, padding, deferred rendering, explicit-position snap margins, and original switch flip decisions. The property fixture assembles the same GPUI layout path and calls the real anchor helpers. A separate raw TestRenderer comparison exercises the complete native custom element and matches the original binary pixel-for-pixel for the public position and switch cases. Widening the cross-start condition fails both compatibility regressions.

##### Select trigger keyboard policy

Title: `feat(react): let SelectTrigger opt out of Space activation`

Add `activateOnSpace?: boolean`, default true, to `SelectTriggerProps`. Consume it inside SelectTrigger instead of forwarding it to the native host. Enter still opens the popup. Space opens it only when enabled, so toolbar consumers can leave Space to their window shortcut owner. SelectItem behavior does not change.

After calling the caller's `onKeyDown`, check `defaultPrevented` before running built-in keyboard actions.

Validation: native React tests cover the unchanged default, Space opt-out and window propagation, Enter, caller cancellation, and menu Space selection. Removing either guard fails the corresponding regression.

##### Window activation events

Title: `feat(native): expose window activation events without polling`

Add `onWindowActiveChange(callback | null)` backed by GPUI `observe_window_activation`. The first asynchronous callback reports the current state. Later callbacks report activation changes. Passing null drops the observer. A weak, nonblocking TSFN delivers a boolean directly to JavaScript and does not keep the process alive.

The macOS renderer updates its view directly. Windows, Linux, and FreeBSD register the same observer through their existing UI command queue. No JavaScript timer or GPUI submodule change is required.

Validation: native GPUI tests cover the initial value, activation, deactivation, and unsubscription. Consumer tests cover shared leases, duplicate listeners, queued event cancellation, session replacement, and seeded transition sequences. Removing native observer cleanup or consumer cancellation fails these tests. Only the macOS runtime has been exercised.

#### F1 实测记录

证据保存在 [scripts/gpuix-main/evidence/f1](../../scripts/gpuix-main/evidence/f1/)（合入时从 `apps/gpuix/src/platform/frame/evidence` 移出应用源码树，与其它 gpuix-main 证据同处）。日志使用 `.txt`，不再被根目录的 `*.log` 忽略。`runtime-summary-2026-10-15.json` 保存可重算的阶段数据和 CPU 计算。完整日志的头部读取有长度上限，可能在一条记录中间结束，独立 tail 文件保存最终停帧区间。

| 观察场景 | 实际结果 | 证据 |
| --- | --- | --- |
| 当前主显示器 | `1920 x 1080 @ 60.00Hz`，`system_profiler SPDisplaysDataType -json` | `display-refresh-2026-10-15.json` |
| 显式激活后的 counter | 75.724s 阶段，单调 timestamp，60.00117Hz；4506 callback 对应 4506 draw | `f1-frame-final-2026-10-15.txt`、`runtime-summary-2026-10-15.json` |
| 末次 draw 统计 | 最后 1000 个样本，p90 0.470ms、p99 0.609ms、max 0.799ms | 同上 |
| active=false | 阶段 0.496s 与 27.517s 的 `frames` 均为 8698，callback 均为 0 | `frame-optimized-inactive-tail-2026-10-15.txt`、`runtime-summary-2026-10-15.json` |
| 初版完整遮挡 | counter 被自有 1200×828 cover 覆盖后 callback=0，`frames` 固定 13294 | `frame-probe-2026-10-15.txt`、`occlusion-cover-2026-10-15.png` |
| 初版最小化 | AXMinimized=true，callback 累计数 742、`frames` 15480 不再增长；阶段平均 Hz 包含最小化前采样，不作为最小化帧率 | `frame-first-hidden-tail-2026-10-15.txt`、summary 中的 AX 记录 |
| 初版前台 CPU | 60.032s 使用 CPU 10.63s，平均 17.707% 单核；ps 样本 13.7% 至 22.6% | `frame-cpu-2026-10-15.json` |
| 去掉冗余 redraw 后的 active CPU | 60.040s 使用 CPU 6.97s，平均 11.609% 单核；ps 样本 9.1% 至 14.7%；该区间未固定前台 | `frame-optimized-cpu-2026-10-15.json` |
| deferred hook 边界 | hook callback 内直接调用 GPUI stats 成功，首次读到 frames=6，没有重入 panic | `f1-frame-final-2026-10-15.txt` |
| 原生激活订阅 | baseline=true 不通知平台消费者；最小化与恢复通知 false、true；注销后再次最小化与恢复没有回调 | `f1-activity-final-2026-10-15.txt`、`window-activation-2026-10-15.png` |

两组 CPU 的前台条件不同，不能据此作等条件性能提升结论。draw 统计是 CPU 绘制耗时，不是 GPU 完成时间，小型 counter 也不代表大型 DAW。遮挡与最小化的停帧证据来自删除冗余 `window.refresh()` 前的初版；最终构建没有在固定桌面时段内复测隐藏窗口，这一项明确列为未验证，不推断平台保证。

原始 TestRenderer snap 探针覆盖 360 组合、2160 条断言，最终为 0 失败，容差保持 0.51。公开 position 与 switch 的 14 个组合另从未改 D1 二进制采集 baseline，最终二进制逐像素一致。`anchored-public-baseline-2026-10-15.json` 与 `anchored-public-final-2026-10-15.json` 内容相同。被拒绝的 broad cross-start 版本改变了其中 11 个组合，见 `anchored-public-rejected-2026-10-15.json`。测试脚本已清理，永久 GPUI 回归保留在补丁中。

#### 输入与第 13 节验收

| 检查 | 结论与证据 |
| --- | --- |
| 控件状态放大图 | `input-autofocus-light-zh-zoom-2026-10-15.png` 显示聚焦全选；首轮默认、Tab 替换、鼠标插入及第二轮重聚焦、textarea 各有截图。没有声称覆盖未改动的全部 hover、pressed、disabled 状态 |
| 间距 token | 没有修改共享 Input 的布局或 token；探针容器不是产品布局，不把其临时 gap 当成产品度量验收 |
| 文字与数值居中 | 沿用既有 Input 排版，截图核对选择文本未溢出；本轮没有修改数值控件或图标居中 |
| 尺寸 | 深色英文输入框 AX 为 240×13；实际 `CONTROL_METRICS.default` height=13、fontSize=9；共享控件高度与 token 一致。没有新增图标控件 |
| 紧凑感与 Live | 参照既有 13 高 Input，没有新卡片布局；没有操作用户的 Live 作并排对照，此项未验证 |
| 主题与语言 | 深色英文 `input-autofocus-2026-10-15.png`；浅色中文 `input-autofocus-light-zh-2026-10-15.png`。没有声称完成四种交叉组合 |
| 键盘与焦点 | autoFocus 将 Rename me 替换 X；Tab 将 Tab replace 替换 Y；shift-Tab 重聚焦后将鼠标插入符整串替换 Z。Input Space 基线问题仍归 A3b |
| 鼠标与只读 | 普通点击后 Mouse caret 变 Mouse caretZ，没有全选替换；只读字段输入 R 后 AX 仍是只读文本；textarea 两行内容整串替换 T，见 `input-textarea-light-zh-2026-10-15.png` |
| 动态拖动、滚轮与弹层 | 本轮没有修改产品拖动、滚轮或弹层保持打开行为；SDK 的额外 OS popup 窗口没有在时段内打开，未验证。原生几何与 SDK 键盘行为由真实 TestRenderer 验证 |
| 性能与可见范围裁剪 | 表中有真实 callback、native frames、CPU 与 draw 统计；未改时间线可见范围裁剪，不声称做了该项产品验收 |

AX 节点不公开选区文本属性。协调者批准使用放大全选截图、AX 前后值以及实际替换或插入的组合证据，没有用 Cmd+A 或假键盘选区绕路。

#### F1 命令与例外

| 位置 | 实跑命令 | 结果 |
| --- | --- | --- |
| 根目录 | `GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f1-gpuix bash scripts/gpuix-main/build.sh` | 最终成功，native 增量 23.01s，总 27.49s；六补丁精确验证，无干净重建 |
| 临时干净 index | 六个补丁逐个 `git apply --cached --check` 后按序 apply | 通过；zed 无修改 |
| 根目录 | `node scripts/gpuix-main/check.mjs --resolution` | native、host、React 统一解析到该外置构建 |
| apps/gpuix | `bun test src/platform/frame src/platform/window src/ui/controls/Input` | 44 pass，0 fail |
| apps/gpuix | Select SDK 四项行为测试的 `--test-name-pattern` 子集 | 4 pass，0 fail；没有替代完整套件 |
| vendor | `cargo check --release --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders` | 通过，保留上游既有 warnings |
| vendor | 同 feature 的 `cargo test --release --manifest-path packages/native/Cargo.toml --lib` | 最终 271 pass |
| 根目录 | `cargo check`、`cargo test` | 通过，35 tests，4 suites；本轮未改自有 Rust 源码 |
| 根目录 | `pnpm exec eslint apps/gpuix/src/platform` 及 `pnpm exec eslint apps/gpuix/src` | 通过，本切片 HARD 扫描无匹配 |
| apps/gpuix | `pnpm exec tsc --noEmit` | 非零，仅下列 4 个主干基线错误，F1 新增文件零错误 |
| apps/gpuix | `bun test` | 508 pass、2 todo、10 fail，520 tests，93 files；下列 A3b 例外已获协调者批准 |

tsc 的四处主干基线错误为 `DragPreviewArea/index.tsx:131`、`Menu/index.tsx:271`、`Menu/index.tsx:536`、`Popover/index.tsx:117`，均是 EventPayload 缺少 KeyEvent 的 defaultPrevented、preventDefault、stopPropagation。协调者在主干 `1143ef7` 独立复现并批准豁免，由 A3b 负责，不伪称 tsc 全绿。

剩余 10 个测试失败归 A3b 的 0.10 bounds 与 center 补偿和 Input Space 边界。包括 Input Space 1、ControlGroup 1、Popover 4、Menu 2、DropdownButton center 与 fill 2。center 从旧 1.5px 变成 63.5px 是旧 `useFloatingCenterOffset` 在二次补偿已修好的 native 默认 snap 居中。协调者明确禁止 F1 越界删除这些兼容代码，接受已知失败后由 A3b 在合入 F1 后收尾。断言没有删除、skip 或放宽。

变异结果保持可复查。删除 hook unsubscribe 产生 5 失败；inactive 仍激活帧源产生 4 失败；删除激活订阅取消产生 4 失败。SDK Space guard 删除产生 2 失败，defaultPrevented guard 删除产生 1 失败。原生 frame、observer cleanup、旧 center anchor 的组合变异产生 266 pass、3 fail。放宽 snap-only 条件产生 1 pass、2 public-mode fail，268 filtered。恢复后最终 271 个原生测试通过，未保留任何变异。

双轴 pstack-reviewer 的 Spec 轴发现并促成了 position 与 switch 兼容修复，最终复审已关闭全部本切片发现。Standards 轴没有本切片代码 HARD 违规。无用 factory re-export 已删除，新增 Rust 块已单独格式化。共享 `LESSONS.md` 与 A4 panels README 的旧采样器描述已交给协调者，不越界修改。审查处理记录见 `self-review-2026-10-15.json`。

首轮 NAPI 生成曾把 Rust `Option<FunctionRef>` 变成可选参数 `callback?`，精确 source 校验拒绝了该产物。实现改为 `Either<FunctionRef, Null>`，保持 API 要求的必填 nullable 参数后增量修正；没有重复干净构建。后续 center 舍入和 public-mode 范围修正均按协调者仲裁完成。

六个自有命名 service 均在每组取证后关闭，临时探针和补丁片段已删除。交付前实际执行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空，grep 返回 1 表示无匹配，不是残留进程失败。原始 stdout 与自有 service 清单见 `process-cleanup-2026-10-15.json`。没有启动或停止用户已有应用，没有 push 或远程贡献。

### H1 窗口外观与程序化关闭

2026-10-15。补丁 `window-appearance-close.patch` 接在 `window-active-change.patch` 之后，修改 `native/src/renderer.rs`、`native/index.d.ts`(NAPI 生成)、`native/js/host.ts`。不改 zed 子模块，不改两个固定 SHA，不新增依赖。构建在独立 vendor 根 `/Volumes/PSSD/code/_vendor/h1-gpuix` 上完成，共享 checkout 未改动。合入主干时由协调者统一重建共享 vendor。

| 接口 | 契约 |
| --- | --- |
| `onWindowAppearanceChange(callback \| null)` | 基于 GPUI `observe_window_appearance`。第一次回调异步回报当前值，之后回报变化。传 null 释放 observer。弱、非阻塞 TSFN，不让进程保活。`VibrantLight`/`VibrantDark` 归并为 `"light"`/`"dark"` |
| `getWindowAppearance()` | 同步返回当前 `"light" \| "dark"`。macOS 走 `update_window`，Win/Linux 走 UI command 加 2 秒超时应答。供首帧主题使用，因为订阅首值只当基线 |
| `closeWindow()` | 调用 `Window::remove_window()`，**不**经过 `setWindowShouldClose`。在 `QuitMode::LastWindowClosed` 下最后一个窗口关闭即 `cx.quit()`，`tick()` 返回 false，JS 退出。禁止在 `setWindowShouldClose` 回调里同步调用：AppKit 询问期间 GPUI `App` 已被借用，再次 `borrow_mut` 会 panic，而且发生在 AppKit 的 FFI 回调里，可能直接 abort 进程。`platform/window` 守卫会在这种情况下抛错拦截 |
| `NativeRenderer` | host 的 Pick 列表补上 `onWindowAppearanceChange`、`getWindowAppearance`、`setWindowShouldClose`、`closeWindow`，`platform/window` 的结构端口在编译期与它核对 |

macOS 直接更新 view；Windows、Linux、FreeBSD 走 UI command 队列，与激活接口相同，但这三个平台没有实跑。

**约束**：回报的是窗口的 `effectiveAppearance`，它继承 `NSApp.appearance`。如果以后为了让原生标题栏跟随所选模式而调用 GPUI `set_window_appearance`，「跟随系统」读到的就会是被覆盖的值，系统切换也不再触发变化。为此记入 LESSONS。另一条备选方案是在 `crates/native` 里监听 `NSDistributedNotificationCenter` 的 `AppleInterfaceThemeChangedNotification`：它能读到真实的系统值，但要新增 objc2-foundation/block2，只覆盖 macOS，也无法在 GPUI 测试里模拟。协调者批准走补丁方案。

TS 侧：`createWindowPlatform(renderer).subscribeSystemAppearance` 与 `subscribeApplicationActive` 共用 `createNativeValueSubscription`，旧的 `application-active.ts` 已删除；`getSystemAppearance()` 给出首帧值。`createWindowCloseGuard(renderer, { shouldClose })` 返回 `{ supported, close() }`：`supported` 只表示能否否决(仅 macOS)，`close()` 只依赖三平台都有的 `closeWindow`，在 `shouldClose` 执行期间调用会抛错。设置中的 `themeMode`(`light | dark | system`，缺省按 system)与 `themePreset` 互相独立。详见 `apps/gpuix/src/platform/window/README.md`。

**已知限制(推断，未实测)**：GPUI `gpui_macos/src/window_appearance.rs` 只识别 Aqua、DarkAqua 和两个 Vibrant 名称，其它名称一律回落为 `Light`。开启「增强对比度」后，系统报告的深色外观名(如 `NSAppearanceNameAccessibilityHighContrastDarkAqua`)会被当作 `"light"`。修复要么改 zed 子模块(本补丁不改)，要么在 renderer 里另读 `NSAppearance`。协调者决定只记录，不在本机切换辅助功能设置实测。

**减少动态效果(协调者追加)**：GPUI 只有 `App::reduce_motion` 字段(默认 false，不从系统读取)，vendor 也没有相应接口，所以放在 `crates/native/src/reduced_motion.rs`，不改补丁。napi 提供 `reducedMotion()` 与 `onReducedMotionChange(callback | null)`：观察者对象用 `define_class!` 定义，挂在 `NSWorkspace.notificationCenter` 上，监听 `NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification`。注册时先经弱、非阻塞 TSFN 异步回报当前值，传 null 时移除 observer，进程内只有一个 owner。依赖变化：`objc2-foundation 0.3.2` 由传递依赖改为直接依赖，`objc2-app-kit` 增加 `NSWorkspace`、`NSAccessibility` 两个 feature；`Cargo.lock` 只在 zoeydaw-native 的依赖列表里多一行。非 macOS 平台两个接口都返回错误。

#### H1 实测记录

证据在 [scripts/gpuix-main/evidence/h1](../../scripts/gpuix-main/evidence/h1/)。由协调者代为在系统设置里切换外观，demo 窗口为 420×140。

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 基线 | 系统为深色，订阅后原生回报 `dark`，平台层不通知 | `h1-demo-log-2026-10-15.txt` |
| 深 → 浅 | 原生 `light`，约 90ms 后平台 `appearanceChange light`；AX 读到 `System appearance: light` | 同上、`appearance-light-2026-10-15.png` |
| 浅 → 深 | 原生 `dark`，平台 `appearanceChange dark` | 同上、`appearance-dark-2026-10-15.png` |
| dirty 时按关闭按钮 | AX `AXCloseButton` press 触发 `closeRequest allow=false`，窗口保留，AX 读到 `Close guard: dialog: unsaved changes`(截图早于重绘，仍显示 dirty，以 AX 为准) | 日志与 AX 抄录 |
| 选择「不保存」 | `discardChosen` 后调用 `guard.close()`，窗口消失，bun 进程 exit 0 | 日志、窗口列表 |

#### H1 命令

| 位置 | 实跑命令 | 结果 |
| --- | --- | --- |
| 根目录 | `GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/h1-gpuix bash scripts/gpuix-main/build.sh runtime` | native release 172.99s，RSS 798 MB；七个补丁经 `check.mjs --sources` 精确校验 |
| vendor | `cargo test --release --manifest-path packages/native/Cargo.toml --lib --features test-support,gpui_platform/runtime_shaders` | 274 pass(F1 后 271 个，新增 3 个) |
| vendor 变异 | 把 VibrantDark 映射为 light，并删除注册时的基线回调 | 2 个外观测试失败，恢复后通过 |
| 本仓 Rust 变异 | `ThemeMode::Dark` 加 `alias = "Dark", "auto"`(宽松解析) | `rejects_unknown_theme_mode_on_read_and_write` 失败，恢复后通过 |
| TS 变异 | 删除守卫的 `deciding` 拦截；`shouldClose` 恒为 true；不支持时 `close()` 变成空操作；外观端口误接 `onWindowActiveChange`；去掉基线判断；删除 `register(null)` | 依次 1、2、1、1、6、5 个失败，恢复后全部通过 |
| 根目录 | `cargo check`、`cargo test` | 通过，native 17(含 reduced motion 合成通知测试)、engine 32 |
| reduced motion 变异 | 注册时不回报基线；TS getter 恒为 true；替换时跳过 `removeObserver` | 前两项分别使 Rust 测试、TS napi 测试失败。第三项测试仍通过：旧 observer 的 `Retained` 已被释放，macOS 10.11 起 NotificationCenter 对已释放的 observer 是弱引用，不会再回调，所以 `removeObserver` 在测试里观察不到差别。代码仍然显式移除，不依赖弱引用行为 |
| 真实进程 | gpuix 窗口内调用 `getReducedMotion()` 与 `onReducedMotionChange` | 两者都是 false，与 `defaults read com.apple.universalaccess reduceMotion` 一致(该键不存在，即关闭)；注销后进程 exit 0。系统设置的真实切换未实测(协调者决定不改辅助功能设置)，变化路径只由合成通知测试覆盖 |
| apps/gpuix(merge 主干 4b447b6 后) | `pnpm exec tsc --noEmit`、`bun test` | tsc 0 错误；bun 只有 1 个失败 `secondary click on an interactive title opens its track context menu`，干净主干同样复现，属于主干已知问题 |

GPUI 的 `TestWindow::simulate_appearance_change` 与 `TestAppContext::test_window` 都是 crate 私有，补丁内的测试无法模拟变化，只能覆盖基线、归并和 observer 的释放；「变化会触发 observer」由 GPUI 自带的 `test_appearance_change_runs_after_app_update` 与上面的真实窗口证明。

### F2 原生 contextMenu

2026-10-15。`context-menu.patch` 接在 H1 的 `window-appearance-close.patch` 后面。独立 vendor 根为 `/Volumes/PSSD/code/_vendor/f2-gpuix`，Cargo target 为 `/Volumes/PSSD/code/_vendor/target-f2`。固定 gpuix、zed SHA 不变，没有新增依赖或修改 zed。

#### 消费方契约

`native/js/host.ts` 是 `HostProps.onContextMenu` 的类型 owner，`@gpuix/react` 的 `Props` 继承它。`mutations.ts` 把 prop 注册成 `contextMenu`。能力作用于 `<div>`、`<text>` 宿主。

| 项目 | 契约 |
| --- | --- |
| 触发 | 右键按下，不等待松开。普通左键、中键、键盘不触发 |
| 命中 | 元素 bounds 包含该点，且该点未被祖先 content mask 裁掉。交互后代的 `BlockMouse`、`BlockMouseExceptScroll` 不阻断通知 |
| owner | 包含该点的最近声明作用域接收一次。重叠的独立作用域按 GPUI 绘制顺序选择最前面的一个 |
| 遮挡 | 后续兄弟或 deferred anchored 浮层的 `BlockMouse`、`BlockMouseExceptScroll` 会阻断被盖住的作用域 |
| 顺序 | 在 capture 阶段选定 owner，`App::defer` 在既有 descendant `mouseDown`、`mouseDownOutside` 后发送通知。不调用 `stop_propagation` 或 `prevent_default` |
| macOS | GPUI `gpui_macos/src/window.rs:2583-2635` 已把 ctrl-left down/up 归一化成 Right，并清掉 control。renderer 和消费方都不再检查 ctrl |
| payload | `elementId` 为作用域 id，`eventType="contextMenu"`，`x/y` 为鼠标事件同源的窗口坐标，`button=2`、`clickCount`、`isRightClick=true`、`modifiers`。不填 `key`、`keyChar`、`keystrokeId` |
| 不改变 | 后代右键 `onMouseDown`、普通 `onClick`、hover 边沿、滚轮 owner、指针捕获及布局 |

A3b 的 `ContextMenuTrigger` 应从 `onMouseDown` 的 button/ctrl 分支切换到 `onContextMenu`，以 `event.x/y` 定位现有弹层。保留后代自己的 mouse-down handler。F2 不改 `ui/controls`。

#### GPUI 命中与生命周期

GPUI `window.rs:5454-5472` 的 capture 按监听注册顺序运行，bubble 反序运行。Div 在子元素 paint 前注册自身监听。`window.rs:1089-1110` 逆序遍历 hitbox，对 bounds 与 content mask 取交集；`BlockMouse` 截断命中列表，`BlockMouseExceptScroll` 截断 hover 集合。

F2 的透明 `Scope` 复用 child 的 `LayoutId`，不增加布局节点。它先 prepaint 子树，再在元素自身 bounds 上插入 Normal probe。probe 位于普通交互后代前面，但仍在后续兄弟和 deferred 层后面。原祖先 hitbox 的 `is_hovered=false` 不再阻断通知；probe 的 hover 查询只复用 GPUI 的遮挡结果。Normal probe 不改变其它 hitbox 的 hover 或 scroll 资格。

每个 `GpuixView` 只有一个可复用的作用域 registry。只在 paint 按前序登记，避免虚拟列表 speculative prepaint 回滚留下幽灵项。每帧最前面的 canvas 清空 registry，root capture 反向选择最后一个 eligible。隐藏宿主不登记，隐藏祖先也不会 paint 子树。probe 使用单独的 GPUI identity，避免重绘时替换祖先已捕获的 hitbox。

没有使用 automation 的 `RetainedTree.elements_at`，也没有在 UI 层伪造或转发事件。`check.mjs` 额外校验 `native/dist/mutations.js` 和 `.d.ts` 的 SHA-256，覆盖新增的运行时事件名映射。

#### 验证与集成边界

真实 Button、DragPadNumber 的 TS 失败用例在补丁前为 1 pass、3 fail，补丁后扩展为 8 pass。原生七项回归覆盖两种阻断后代、最近作用域、左键、bounds 外、deferred 遮挡与 content mask；逐项变异都使对应测试失败。含 H1 的 vendor 完整套件为 281 pass。

真实 macOS 窗口验证了 Button 右键、数值控件右键、inner owner、ctrl-click、anchored 遮挡、primary 点击、Tab 和 Space，以及深浅主题。数值始终为 120；ctrl-click payload 的 button 为 2，ctrl 为 false。窗口取证后立即关闭，临时探针已删除。截图、AX、完整命令、变异与自审记录见 [F2 交付报告](../../scripts/gpuix-main/evidence/f2/merge-ready.md)。

最终 `apps/gpuix` 类型检查通过，完整 `bun test` 为 825 pass、1 todo、1 fail。唯一失败仍是 `secondary click on an interactive title opens its track context menu`，原因是消费方 `ContextMenu` 尚未改用 `onContextMenu`，不是全套全绿。协调者批准先合入原生端口、重建 vendor，再通知 A3b 接入；协调者在 A3b 合入时重跑该用例，作为 F2 的最终集成验收。

#### 上游 PR 草稿

Title: `feat(native): notify the nearest context-menu scope through interactive descendants`

Add `HostProps.onContextMenu` for div and text hosts. Notify the deepest eligible scope on a right-button press, using the same window coordinates and modifiers as other mouse events. macOS control-click keeps the existing GPUI normalization. The notification carries no keyboard fields.

A layout-transparent wrapper inserts a Normal hitbox after ordinary descendants. This lets the scope receive context-menu notification through descendants that block mouse input, while later siblings, content masks, and deferred layers still occlude it. Resolve one owner during capture and defer notification until existing mouse-down handlers have run. Do not stop propagation, change descendant pointer interactivity, or patch GPUI.

Validation: GPUI tests cover both blocking descendant behaviors, nearest scope, repeated presses, primary clicks, outside bounds, deferred overlays, and clipping. Mutation runs detect each regression. Native React tests use real Button and numeric controls and also cover hover, scroll, hidden scopes, listener removal, and pointer capture across repaint. A real macOS window verifies control-click and occlusion. Windows, Linux, and browser runtimes have not been exercised.

This is a local draft only. No issue or PR was published. Follow the upstream contribution policy noted in F1 before sending it, including the required public README update.

### F4 native quad batches

2026-10-15。`quad-batch.patch` 排在 `context-menu.patch` 后，包含主干 H1 与 F2 契约。独立 vendor 为 `/Volumes/PSSD/code/_vendor/f4-gpuix`，不修改共享 vendor 或 zed。补丁包含 retained buffer、paint、napi 与 TestRenderer setter、React ref 方法、intrinsic 与 TS 类型。通用 mutation queue 保持上游原样。

`<QuadBatch>` 接收 style、testId、ref 与每 batch 的标量 `strokeWidth?: number`、`strokeColor?: string`，**不接收 quads prop**。`shared/quads/useQuadBatch.ts` 提供稳定的 `QuadBatchController { ref, setQuads }`。数据只经事件或 layout effect 内的 `batch.setQuads(Float32Array)` 上传，不进入 React props 或 state。数据更新不触发 React render。挂载前设置的数据由 controller 缓存，在 native ref attach 后上传；卸载后不再访问旧 host，重新挂载时重放最新数据。controller 按引用去重，缓冲视为不可变，替换引用才发布修改。

每四个 float 为本地 `x, y, width, height`。填充色取 `style.color`，透明度取节点与祖先 opacity，每种 paint material 一个 host。原生边界拒绝非四倍长度、非有限值与负尺寸，零尺寸不绘制。绘制受元素自身边界与祖先 content mask 裁剪。几何 ABI 不变；未来如批准逐记录颜色，可追加并列索引 buffer，本轮未实现。

F4b 修复 fractional geometry：本地 `x/y/width/height` 先经 GPUI `Window::pixel_snap_bounds`，沿用 authored absolute lengths 的 device-pixel half-toward-zero 规则；再加 host origin，由既有 `Window::paint_quad` 取整绝对边缘。没有 TS 补偿、zed 修改、逐矩形 layout node 或额外缓冲拷贝。原生测试以独立 div 的实绘 bounds 为 oracle，覆盖小数位置、小数尺寸、lane stereo case 与小数 host origin，scale 为 1、1.25、1.5、2。

lane 的 `pixels=2,height=40,inset=1,top=10` 等价 GPU fixture 在修复前复现 `(1,19)` 的唯一像素差，修复后 decoded RGBA 与原 lane reference 逐像素相同。验证使用隔离 `/Volumes/PSSD/code/_vendor/f4b-gpuix` 与 `/Volumes/PSSD/code/_vendor/target-f4b`。命令、mutation、像素和性能证据见 [F4b 报告](../../scripts/gpuix-main/quad-batch/PIXEL-SNAP-REPORT.md)。

F4c 描边宽度使用逻辑像素，默认 0；颜色使用原生已有 color parser，默认 transparent。native batch 在任何树修改之前验证描边 metadata，拒绝非有限或负宽度、不支持的颜色与错误类型；null 或缺失 width 明确表示默认 0，null 或缺失 color 明确表示 transparent。JSON.stringify 会将 JS NaN/Infinity 编码成 null，因此这类输入按协议移除 prop，而不是原生非有限 number；该行为有真实 native 截图回归。按协调者仲裁不在 TS 建立第二套清洗或校验。

`strokeWidth=0` 保持 F4b 单 fill 路径；`strokeWidth>0` 对同一 bounds 先画背景，再画 border-only quad，完全沿用 GPUI div 的绘制顺序与原生 border snapping，不拆成五个 independently snapped fill rectangles。每 note 仍只有一条四 float geometry record，不增加 retained node；描边路径原生 paint 调用数由 N 增至 2N。单 filled-and-bordered quad 在 alpha 组合上与 div 差 169 个 decoded RGBA 像素，协调者据此批准统一双 paint，未放宽像素阈值、未改 zed。

F4c 的四种 scale（1、1.25、1.5、2）由原生 div scene oracle 比较实绘 bounds 与 border widths；decoded RGBA 像素验收在默认 scale，非默认 scale 不宣称截图验证。真实消费者初始 viewport 导出的 10,000-note 几何（40,000 floats、112 materials）在同一 viewport 与 div oracle 为 0diff。验证使用独立 `/Volumes/PSSD/code/_vendor/f4c-gpuix` 与 `/Volumes/PSSD/code/_vendor/target-f4c`，十一补丁保留 F5 与 F3 顺序；详见 [F4c 报告](../../scripts/gpuix-main/quad-batch/BORDERED-REPORT.md)。

采用命令式数据上传是性能决策。React 19.2 development 的 performance track 会遍历 typed-array props；即使不走 JSON，声明式 quads prop 仍使开发版超过一帧。最终接口删除该 prop 与二进制提交队列，不改 React instrumentation。DEV 与 production 的完整测量见[交付报告](../../scripts/gpuix-main/quad-batch/REPORT.md)。

选择独立 `<quad-batch>`，保留 `<canvas>` 给通用绘图上下文。批量叶子没有 children、输入或 AX props，不注册 hitbox、focus handle 或 AX 节点。绘制路径忽略 cursor 与 pointerEvents，即使指定 pointer cursor 也不注册 hitbox。

napi `setQuads(elementId, Float32Array)` 借用 JS typed-array slice，验证后一次拷贝到节点拥有的 `Arc<[f32]>`。paint 只 clone Arc，不复制数据。SDK 的 `QuadBatchInstance.setQuads` 绑定所属 renderer，每次显式调用上传一次；共享 controller 负责引用去重。没有跨帧借用可被 JS 修改或 detach 的 ArrayBuffer，没有新依赖。沿用上游 `Arc<std::sync::Mutex<RetainedTree>>` 是协调者批准的既有锁契约例外。锁内只访问树、验证与拷贝，不布局、绘制或回调 JS。

当前覆盖 napi desktop 与 native TestRenderer。wasm renderer 没有 setter，SDK 明确抛 unsupported。Windows、Linux 未实跑，独立 UI 线程上的多 setter 调用不承诺原子绘制。macOS embedded loop 在 JS 同步提交结束后绘制。

验收工具在 `scripts/gpuix-main/quad-batch/`。两路使用同一 50×50 合成几何、14,065 个矩形，不改 lane 产品代码。该探针不是 lane 真实 `readProjectPeaks` 满量工程，不能代替 lane 接入后的整链路验收。

#### Lane 与 clip-editors 接入

在数据 owner 内生成缓冲，用事件或 layout effect 上传。不要把 Float32Array 传给 `QuadBatch` 或另一个 React 组件，再指望下游隐藏它。

```tsx
const batch = useQuadBatch()
useLayoutEffect(() => {
  batch.setQuads(buildLocalRectangles(viewport))
}, [batch, viewport])
return <QuadBatch ref={batch.ref} style={batchStyle} />
```

`buildLocalRectangles` 表示消费者已有的几何计算，不是共享模块导出。Style 继续由消费者取主题 token；本切片不迁移 lane 或 clip-editors。

#### Upstream PR draft, not published

Title: `feat(native): add visual rectangle batches with imperative buffer uploads`

Add a visual-only `quad-batch` host leaf. Style supplies fill color and opacity. Native painting uses content-masked GPUI quads without per-rectangle React or layout nodes. Ignore cursor styles, and never register pointer hitboxes, keyboard focus, or accessibility nodes. Keep the unimplemented general-purpose canvas type separate.

Expose `setQuads(elementId, Float32Array)` and a typed native ref method. Do not accept a geometry prop: React development performance instrumentation recursively records typed-array props. Upload buffers directly after native host attachment, outside JSON mutations and React props or state. Copy each explicit upload once into retained native storage. A consumer controller can cache pre-mount data, replay it on attachment, and skip unchanged references without rendering.

Validation covers GPUI local coordinates, clipping, nested opacity, color, and cursor-induced hitbox prevention. Consumer native tests cover render-free updates, pending data through GPU screenshot comparison, remount, and pointer pass-through. Each targeted invariant has a failing mutation. Equal-geometry DEV and production measurements and initial screenshot hashes are included in the local report.

Scope is napi desktop. wasm remains explicitly unsupported. No issue or PR has been sent; the upstream contribution policy noted in the F1 section still applies.

### F5 renderer-applied focus events

2026-10-15。`autofocus-focus-event.patch` 接在九个已合入补丁的 `quad-batch.patch` 后；按协调者要求，quad 补丁同步 `496a17d` 已评审的 F4b 像素吸附版本，不二次修改。隔离源码根为 `/Volumes/PSSD/code/_vendor/f5-gpuix`，Cargo target 为该目录下的 `target`。不重建共享 vendor，不修改 F3 或 zed。

GPUI `Context::on_focus/on_blur` 创建订阅后，通过 `defer` 激活监听。`Window::draw` 在当前帧完成时比较前后 focus path 并通知当时已激活的监听；不会为后来激活的监听重放事件。因此在 `GpuixView::sync_focus_handles` 内先 focus 再订阅，会得到已聚焦的 input，却丢失 JS focus 通知；仅在同一 render 内提前订阅也不够。

修复沿用同一个 GPUI 订阅路径：只在 handle 创建时选择 autoFocus；已有目标仅在 target focus/blur 与 source blur 的已声明订阅均就绪时同步聚焦，否则等待 sync 激活后完成转换。所有显式请求保留至下一次 sync，统一优先于同批 autoFocus。请求之后的 Tab/click 取消旧请求，该次 sync 的 autoFocus 也不能覆盖用户焦点；renderer 自己执行 autoFocus 时只更新等待中的 pending 基线，不把它误判为用户导航。

pending intent 的基线字段与 deferred focus 均持有稳定 `FocusHandle` 身份，等待跨越旧 owner 退休也不按可回收 id 误判取消；已退出 focusable 集合的请求目标不参与仲裁。所有 renderer-owned focus 合并成一个候选，在订阅激活 defer 之后用一次 `Context::defer_in` 应用；随后由 GPUI focus-path 转换交付 focus/blur。Window 的 GpuixView owner 释放时一并释放 intent、handles 与订阅。没有手工补发事件、JS 轮询、逐帧 refocus 或新公共 API。

完整失败前、通过后、旧时序变异、DragPadNumber 消费方、隔离重建与自审证据见 [F5 验证报告](../../scripts/gpuix-main/evidence/f5/REPORT.md)。本切片按专项验收使用 offscreen real renderer，不打开桌面窗口；不声称完成视觉或 Live 对照验收。

### F6 native ARIA toggle states

| 补丁 | 顺序 | 契约 |
| --- | --- | --- |
| `aria-toggled.patch` | `resume-frame.patch` 之后 | `aria-pressed`、`aria-checked` 的 boolean / `"mixed"` 映射到 AccessKit `Toggled`；两者同时给时 checked 优先，删除属性后清空 |

F6 使用独立 vendor 根 `/Volumes/PSSD/code/_vendor/f6-gpuix`，不修改共享 vendor 或业务控件。沿用 `bool_prop`，不接受字符串 `"true"` / `"false"`。macOS 实测 button 加 pressed 暴露为 `AXCheckBox` / `AXToggle`（role description 为 `toggle button`），`AXValue` 随 false → true 更新；删除状态后恢复普通 button。原生 AccessKit 的 Mixed 在本机 AX 读取中显示为 `true`，不据此改变业务 role。验证入口与原始 AX 见 [F6 报告](../../scripts/gpuix-main/evidence/f6/REPORT.md)。

### F7 production frame scheduling

| 补丁序列 | 文件 | 应用位置 | 契约 |
| --- | --- | --- | --- |
| gpuix `patches` | 原有十二个补丁，末项 `aria-toggled.patch` | vendor 根 | 保持现有 API 与离屏测试能力 |
| zed `zedPatches` | `zed-production-no-sync-draw.patch` | `vendor/zed`，gpuix 补丁之后 | `flush_effects` 只有 `GpuiMode::Test` 同步 draw；`Production` 使用已有 dirty-window `schedule_frame` |

保留 `test-support` 构建 feature：`TestGpuixRenderer` / `createTestRoot` 依赖其 context 与 platform API。原故障是测试同步绘制只由编译 cfg 控制，导致正式窗口每次 `App::update` 都整窗绘制；运行时已有 `GpuiMode` 是正式与测试调度的正确边界。补丁不改变 `RESUME_FRAME.invalidated`、setter 返回值、retained tree、绘制内容或正常平台帧逻辑；一次同步 commit 的多次 `setQuads` 只更新 retained 数据及 dirty 状态。

此次触及 zed 经协调者批准，只维护固定 SHA 上的本地补丁，不推送 fork。`config.json` 为两仓分别登记有序补丁；`check.mjs` 的 `--pending` 同时校验两个已应用前缀，输出 `zed/<补丁名>` 给构建脚本。`--sources` 要求两侧完整序列，`--record` 把两侧补丁摘要一起登记；未登记的 zed 改动、未跟踪源码及 revision 变化仍被拒绝。已有十二补丁 vendor 可直接追加 zed 补丁，不需 reclone，不回退或改写已有补丁。

隔离构建：`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f7-gpuix CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f7 bash scripts/gpuix-main/build.sh`。回归入口与实际执行结果见 [F7 报告](../../scripts/gpuix-main/evidence/f7/REPORT.md)。前台 lane 200×50 十步协议由协调者串行复测；后台窗口仅用于不依赖帧推进的同步上传断言，不代表前台 p90 验收。
