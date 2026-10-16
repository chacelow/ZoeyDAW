# T2 标题栏系统手势

## 当前实现

PC 续跑基于 WIP `07b821d4456dcdbeb32f1fa896411ab89781e90e`，原始 T2 实现为 `395ddffe`、`16722ce8`，共同基线为 `3f5659566ca2d0ca52a7ff5494a9a21b4e1476e2`。Windows 能力来自当前分支内合入的 W1 `4029041`。没有 push、改系统设置、新增依赖或重建共享 vendor。

- macOS：`titlebarDoubleClick()` 经组合根、窗口端口调用 GPUI `Window::titlebar_double_click()`，由 GPUI 读取 `NSGlobalDomain/AppleActionOnDoubleClick`。None 不执行、Minimize 最小化、Maximize 或缺省缩放。固定 GPUI 的 Fill 降级为 zoom，协调者批准披露上游限制，不调用私有 API、不冒充 fullscreen。
- Windows：保留透明自绘标题栏，不叠加系统 caption。新增 `Style.windowControlArea?: "drag"`，Rust 枚举在反序列化边界拒绝其他值，统一 `apply_interactive_styles` 映射 GPUI `WindowControlArea::Drag`。标题栏使用原生拖动区，居中展示层不挡命中，Settings 的 `pointerEvents: "auto"` 排除父 drag hitbox。
- Windows `NativeRoot` 不注入 JS 双击命令，`TitleBar` 不注册空 mouse-down handler。caption 双击由 OS 独占，避免原生 maximize 与 JS zoom 各切换一次。显式窗口端口仍提供 Windows maximize 命令，但不是标题栏手势入口。
- macOS/Linux/FreeBSD 的注入路径只接受左键且 `clickCount === 2`。没有双击计时器、鼠标捕获、JS 拖窗、重复 observer 或新的 UI 度量。

补丁尾部顺序由协调者批准：`windows-ui-bridge.patch` → `windows-renderer-cleanup.patch` → `titlebar-double-click.patch` → `window-control-area.patch`。W1 的清理与生命周期协议未删改。

## Windows 实测

证据在 Git 忽略的 `dist/t2-pc-evidence/`，PNG 与可执行探针不提交。

| 路径 | 实测结果 | 证据 |
| --- | --- | --- |
| 真正 main、production、DirectComposition 未禁用 | 子进程显式删除继承开关；preload 在启动前拒绝非空开关。最终带事件完成屏障的窗口 PID 111296，16 frames、14 successful presents | `native-caption.json`、`live-main.log` |
| 原生命中 | 空白 `(320,14)` 与标题中心 `(640,14)` 为 HTCAPTION=2；Settings `(1262,14)` 为 HTCLIENT=1；从实际 frame/client 差派生的左边框为 HTLEFT=10 | `native-caption.json` 的 points/hits |
| 一次双击消息 | `WM_NCLBUTTONDBLCLK(HTCAPTION)` 后 IsZoomed false → true，client 1280×800 → 2483×1080 | `maximize.before/after` |
| 第二次双击消息 | IsZoomed true → false，恢复原 client 1280×800 及窗口 bounds | `restore.before/after` |
| JS 动作没有重复执行 | 两组真实 native clickCount 为 `[1,2,1,2]`，等待原 handler 返回后的 microtask 确认再读计数，JS 系统动作 0 | `after.nativeClickCounts`、`after.systemActions` |
| Settings 隔离 | 原生 HTCLIENT 命中和原生组件回归证明它不属于 caption；没有把它伪装成 caption 发送非客户区双击消息 | hit-test 与 TitleBar 回归 |
| 业务与 Gallery | 真实后端生成深浅、中英、Audio/MIDI 共 8 张业务组合；Gallery 4 张，退出检查 retained nodes 为 0 | `surfaces/`、`gallery/` |
| 反双执行负对照 | 在内存中错误启用 Windows JS 回调，真实 native counts `[1,2]`、系统动作计数 1，探针非零退出；随后正常实现通过 | `duplicate-action/native-caption.json`、`windows-caption-mutations.mjs` |

可重跑的验证入口：

```text
rustc --edition=2021 apps/gpuix/src/app/shell/verification/windows-caption-driver.rs -o <evidence>/windows-caption-driver.exe
bun apps/gpuix/src/app/shell/verification/windows-caption.mjs <evidence> <evidence>/windows-caption-driver.exe
bun apps/gpuix/src/app/shell/verification/windows-caption-mutations.mjs <evidence> <evidence>/windows-caption-driver.exe
```

runner 启动真实 `src/main.tsx`，只向其 PID 下标题恰为 `zoeydaw` 的唯一顶层窗口发送有超时的消息。点位取实际 renderer bounds；命中查询前先发送目标窗口的 `WM_MOUSEMOVE`，因为 GPUI 的 caption 查询读取已更新的 mouse hit-test。runner 在 finally 结束自己的 main，保留日志。它不使用 SetForegroundWindow、SendInput 或真实光标。

驱动先等待系统双击时限结束，再发送 client down/up 和非客户区 double 消息，确保 GPUI 实际产生 count=1、count=2。验证专用 Bun preload 只在内存中包裹现有 TitleBar handler 表达式，原 handler 原样调用，返回后用 microtask 确认事件已进入 JS。Windows 没有产品 handler 时仍附加这个被动观察器，以获得同样的 native 事件屏障；不依赖 stdin snapshot 早于 native 投递时的零计数。负对照仅去掉 NativeRoot 的 Windows callback 排除条件，证明它确实执行了一次错误命令且被抓。

### 物理输入限制

已按批准时段用 `computer.window` 操作自己启动的 main。背景双击没有 bounds 变化；精确窗口 takeover 返回 `InputFailed: Windows refused to activate the exact target window 1115146; no input was sent`。立即停止输入并关闭窗口，没有绕过前台锁或调用 `computer.control.acquire`。

物理鼠标双击、Settings 物理双击后 bounds、实际拖窗仍未验证。协调者随后明确改用上述确定性 Win32 消息证据，不再申请桌面时段。原生 HTCAPTION 证明拖动区接通，但不把它称为实际拖窗已通过。

第一次 Home 截图为 `window-before.png`。后续环境断言发现 named service 中 `env -u` 没有可靠清除继承开关，因此这张图只作 Home 启动证据，不作最终 DirectComposition 证明；`windows-input-limit.json` 已更正。最终 runner 从子进程 env 对象删除该键，再由 preload 检查，才取得上表生产路径证据。

## Windows 轻量检查

| 命令 | 结果 |
| --- | --- |
| 独立 `build-windows.mjs` | 完整 source/output manifest 通过；native 产物 23,748,608 bytes。初次编译 10m35s；新增 Drag patch 后增量 1m22s |
| `pnpm native:build` | 同一独立 target，真实引擎绑定构建通过 |
| `pnpm --filter @zoeydaw/gpuix-prototype exec tsc --noEmit` | 通过 |
| scoped `bun test`：TitleBar、AppShell、platform/window，CLI timeout 30000 | 42 pass / 0 fail，162 assertions。错误边界用例的预期日志不是测试失败 |
| `bun src/app/shell/verification/mutations.mjs` | 4 mutants 全捕获：clickCount、主键判断、Settings hitbox、标题 hitbox；不写产品源码 |
| scoped eslint，NativeRoot 与 shell | 实现与既有验证入口通过；新增 native probe 的 lint 发现已就地修正，不加豁免 |
| renderer `cargo check --release --target x86_64-pc-windows-msvc --features test-support` | 通过 |
| renderer `cargo test --release --target x86_64-pc-windows-msvc --features test-support --lib` | 316 pass；包括新 Drag 字段的非法值边界回归 |
| Win32 production caption probe | 退出 0；HTCAPTION/HTCAPTION/HTCLIENT/HTLEFT，false → true → false，JS actions=0 |
| `windows-caption-mutations.mjs <evidence> <driver>` | native 反双执行变异被抓，错误回调计数 1；紧接的正常路径 count 序列 `[1,2,1,2]`、JS 计数 0，整体退出 0 |
| `node scripts/gpuix-review-scan.mjs` | 接入共享修复 `2e470f1` 后 7 source、1 test：0 HARD / 1 WARN；固定验证尺寸已归为记录 |
| `node scripts/gpuix-review-scan.mjs --absolute-paths` | 全仓 tracked source，0 HARD / 0 WARN |

独立 vendor 是 `D:/Code/_vendor/pc-gpuix-p1-release/6a5c7c142ac32f9eb0caefe0121be995cfc18631`，target 为其父目录内的 `target`。共享 vendor 仅被只读复制，未重置、clean 或构建。

初始化时先装依赖但未执行 hooks，之后原生构建和身份检查单独执行。原生 binding 尚未生成时的 tsc 缺模块、Windows Bun 相对 symlink 导致的 React 解析失败均保留为初始化失败，不修改产品逻辑。按协调者实测路线，将独立 vendor 的顶层目录 symlink 换为指向原始解析目标的绝对 junction；根 node_modules 未另加 React。`check.mjs --resolution` 证明 app/renderer/reconciler/Zustand 解析到同一 React。

未运行本地完整 `pnpm verify:gpuix`；完整门禁由协调者合入 main 后在 Actions 执行。本报告不声称 CI 已运行。

## macOS 历史证据

以下只属于 macOS arm64、原始 T2 `395ddffe` / `16722ce8` 及 WIP `07b821d` 的历史记录，不是 PC 重测。PC 不能执行 macOS 二进制；本轮新 Drag patch 的 macOS 真机行为也未验证。

| 历史检查 | 当时结果 | 历史证据位置 |
| --- | --- | --- |
| 修复前 TitleBar 回归 | 双击动作 Expected 1 / Received 0 | 原会话失败记录 |
| 修复后原生组件 | 3 tests 通过，4 mutants 被抓 | 原会话与 `TitleBar.test.tsx`、`mutations.mjs` |
| 独立 native Rust | check 通过，313 tests 通过 | `dist/t2-evidence/renderer-cargo-gates.txt` |
| 隐藏 production renderer 直接 API | 内容 640×480 → 2560×1049，finally 关闭，退出 0 | `hidden-native-action.json`、`verification/native-window.ts` |
| 真实后台手势 | PID 47841；截图黑，双击后 bounds 不变，不算通过 | `background-window.json`、前后截图 |
| Gallery/业务组合 | 4 Gallery、8 真实后端业务组合生成并查看代表 overview | 原 `dist/t2-evidence/gallery/`、`surfaces/` |

历史 vendor 为 `/Volumes/PSSD/code/_vendor/zoeydaw-t2-task24349149/6a5c7c142ac32f9eb0caefe0121be995cfc18631`，target 为 `/Volumes/PSSD/code/_vendor/target-t2-task24349149`，当时用 APFS CoW 隔离。历史 ignored 证据路径属于原 Mac checkout，不暗示已复制到 PC。

当时 scoped 测试 40 pass，Cmd+F 在并行 Cargo 时超默认 5 秒；Cargo 结束后按 CLI 30000ms 单独重跑，1 pass / 7 assertions，未改断言。macOS 真实前台双击/拖动、None/Minimize 的系统设置逐项验收仍未验证；Fill 上游降级保留。

## 自审结果

| 发现 | 类别 | 处置与证据 |
| --- | --- | --- |
| Windows 透明标题栏没有原生 Drag 区，直接新增后又可能 OS/JS 双切换 | 汇报仲裁 | 协调者批准桥接 GPUI Drag、Windows OS-only，拒绝增加第二条系统 caption；最终真实 main 消息证明命中与单次切换 |
| macOS pinned GPUI Fill 降级 zoom | 汇报仲裁 | 原协调者批准保持上游行为并披露限制 |
| 精确窗口前台激活被系统拒绝 | 汇报仲裁 | fail-closed 关闭并释放桌面；协调者改用定向 native 消息，不声称物理手势通过 |
| 初次边框探针把 client x=0 当作 resize frame | 必修 | 从真实 bounds/clientOrigin/DPI 派生负 client x；HTLEFT=10 通过，不改变产品边框实现 |
| service 的 `env -u` 未清除继承 DComp 开关 | 必修 | runner 显式删除子进程 env 键，preload 启动断言；纠正初次截图证据属性 |
| 反双执行探针可能在非阻塞 native 事件投递前读到零，单条 NC double 不保证 count=2 | 必修 | 独立 reviewer 发现；驱动补完整 count 序列、真实 handler 完成屏障和错误 Windows callback 负对照，负例计数 1 被抓，正常例计数 0 通过 |
| native-window.ts 的固定 640×480 触发 px-literal WARN | 记录 | OS 验证夹具，不是产品 UI token，不为消警新增主题度量 |
| review scan 的 Windows eslint wrapper 报 HARD；commit hook 的 `/usr/bin/git` ENOENT | 汇报仲裁 | Git 修复来自 W1 `c6e1566`，与主干 `cf0e77f` 等价，9 个调用方原样接入；merge `5f2abda` hook 通过。C5 扫描修复 `b90f55e` 原样接入为 `2e470f1`，完整 scan HARD 已清零，没有本 lane 专用方案 |

macOS 原独立 pstack-reviewer 对两个代码提交的 Standards/Spec 结论均 Clean；此结论不覆盖本轮 Windows 增量。本轮 `T2PCReviewer` 审阅 `4029041..5f2abda` 的 17 个 T2 文件，Spec 和生产实现 Clean，发现上表一项验证必修。修复后 `T2BarrierReviewer` 独立复核四个 native 验证文件，确认真实 count=2、原 handler 完成屏障、负对照与 finally 清理均闭合，Standards/Spec Clean，没有新增必修或仲裁项。两个 reviewer 均只读，不代跑检查。

本轮 T2 实现提交 `5f2abda`，共享扫描入口接入提交 `2e470f1`。原始 T2 提交 `395ddffe`、`16722ce8` 和 WIP `07b821d` 保留。最终验证修复与本报告在后续独立提交中交付，确切 HEAD 由 merge_ready 消息提供。

## UI 第 13 节

| 检查 | 结论与证据 |
| --- | --- |
| Gallery 与业务整体 | PC 生成 4 Gallery 与 8 业务组合；查看 en-dark Gallery、zh-light Gallery、en-US-dark-midi、zh-CN-light-audio overview。真实 Home 截图另列环境限制 |
| 对齐与居中 | 标题与 Settings 沿用原几何，native 命中点取实际 painted bounds，没有新增第二条 caption |
| 间距与内边距 | gap/padding 未改，继续使用原共享 theme/project tokens |
| 统一设计入口 | 仅新增原生语义 style 属性，没有业务实例自己的圆角、颜色、边框或尺寸 |
| 尺寸与紧凑感 | titlebar/transport 共享尺寸不变；组合图保留原工作站密度 |
| 深浅主题与中英文 | 8 业务、4 Gallery 在 PC 生成成功；查看上述四张代表组合，不声称逐控件全状态验收 |
| 状态与键盘 | 42 scoped tests、4 原生组件 mutants 和 1 native 反双执行负对照通过；Settings native HTCLIENT 与组件回归通过。没有改键盘语义 |
| 拖动、滚轮、弹层与性能 | native Drag/resize 命中和窗口状态转移通过；物理拖窗未验证。滚轮/弹层未改，16 frames/14 presents 不是满量性能门槛证明 |

| 产品规则 | Live 观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 标题栏执行 OS 手势规则 | 属于系统窗口行为；没有操作用户 Live 工程或修改其窗口 | macOS 系统偏好；Windows 原生 HTCAPTION | macOS 真机和 Windows 物理手势未验证 |
| 空白/标题区可拖动双击，Settings 排除 | 保留既有 Live 风格 chrome，不新增 UI 行 | 原生 Drag 和后代 BlockMouse | Win32 定向消息通过；无物理拖窗声明 |

## 错题

- 错：把透明标题栏等同于已接通 Windows 原生拖动。对：追踪 WindowControlArea → WM_NCHITTEST，实测 HTCAPTION/HTCLIENT/HTLEFT。因：renderer 原先没把 GPUI 控制区暴露到 style。
- 错：加 Drag 后仍让 Windows JS handler zoom。对：OS 独占 caption 双击，组合根不注入重复命令。因：GPUI 会先投递 mouse-down，再让 DefWindowProc 处理未消费的非客户区双击。
- 错：只相信启动命令里的 `env -u`。对：显式构造子进程 env，再在目标进程断言开关缺失；截图与日志分开标来源。
- 错：发送 native 双击消息后立即读取 JS 零计数。对：确认真实 clickCount=2 的原 handler 已完成，再取窗口状态和计数，并用错误启用 Windows 回调的负对照证明会失败。因：native ThreadsafeFunction 非阻塞投递，stdin 先到不等于手势已处理完。
- 错：把键盘的 stopPropagation 套到鼠标 payload。对：用原生命中排除 Settings；没有鼠标传播包装时不虚构 API。
- 错：手动登记 Rust 改动却漏掉 NAPI 生成声明。对：历史 T2 从真实生成输出补入同一补丁，再验证 source/output manifest。

## 已验证做法

- 最小 typed style 属性接通 GPUI 既有能力，原生 hit-test、OS 手势和边框继续由平台拥有，不建立 JS 窗口几何 owner。
- 独立 vendor/target 与完整有序补丁序列可在 PC 构建新 native API，同时不写共享缓存。
- 精确 PID/标题校验、有超时的 native 消息、真实 bounds 派生点位和 JS 调用计数能提供可重跑的无前台锁证据，但不能冒充物理输入。
- 每个窗口由命名 service 或其 finally 管理，拿到证据即关闭；长期 lane、worktree、分支保留，不清理用户进程。

## 清理与交接

所有本轮命名窗口 service 均已停止。最终 native runner 退出 0，finally 杀掉其 main，成功 service 约 5 秒即释放。failed preload launch 也立即停止；没有窗口闲置超过 5 分钟。

交付前执行 PowerShell `Get-CimInstance Win32_Process`，筛选属于本 lane 的 bun、cargo、caption-driver 命令，输出 `No T2-owned bun/cargo/caption-driver processes remain.`，退出 0。`computer.windows({app: "Bun"})` 返回空数组，随后 `computer.close()` 释放会话。记录为 `dist/t2-pc-evidence/process-cleanup.txt`。不运行过时的 macOS ps 命令，不停止用户应用。共享 vendor 重建、main Actions、macOS 真机和物理输入属于协调者收尾项。

上游依据：[GPUI Window::titlebar_double_click](https://docs.rs/gpui/latest/gpui/struct.Window.html#method.titlebar_double_click)，以及 pinned `zed/crates/gpui_macos/src/window.rs` 和 `gpui_windows/src/events.rs`。系统偏好不由 TS 复制。
