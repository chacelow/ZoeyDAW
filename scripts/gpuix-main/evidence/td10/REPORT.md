# TD-10：离屏测试窗口尺寸与 backing scale

## 结论与范围

macOS 的 `createTestRoot` 保留请求的逻辑尺寸，不再被 AppKit 按屏幕可见区域夹取；离屏 backing scale 默认固定为 `1`，可显式传 `scaleFactor: 2`。普通应用窗口的 class、屏幕约束与 nil-screen fallback 保持原行为。没有放宽业务断言、跳过测试、调整 CI 显示分辨率、增加依赖或写入远程。

工作分支：`chacelow/gpuix-td10-window`；实际派发基线：`284352f3fd49a386ad74b22eae46c9b6fa6571d2`。实现提交：`9c3d853b`、`b8c8a365`；平台边界与本报告另作收尾提交。完整审查命令：`git diff 284352f3fd49a386ad74b22eae46c9b6fa6571d2...HEAD`；提交列表：`git log 284352f3fd49a386ad74b22eae46c9b6fa6571d2..HEAD --oneline`。

## 根因与实现

调用链：React `createTestRoot` → native `TestGpuixRenderer` → GPUI `VisualTestAppContext::open_offscreen_window` → `Window::new` → macOS `MacWindow::open`。请求尺寸在这些层中原样传递；真正夹取发生在 AppKit `constrainFrameRect:toScreen:`。

| 阶段 | 请求 / 结果 | 证据 |
| --- | --- | --- |
| 修前，本地真实 native | 请求 `4000×3000`，viewport / 根 bounds 为 `1920×1021` | 超屏幕尺寸回归失败 |
| 父类约束变异 | 请求 frame `4000×3028`，父类返回 `1920×1049`；viewport 回到 `1920×1021` | 专用子类临时调用父类约束，回归转红 |
| 只修 bounds 后 | viewport 正确，但 PNG 为 `8000×6000` | `screen=nil` 触发旧 `2.0` fallback；物理屏幕实际为 1x |
| 显式默认 / 1x | viewport / 根 bounds `4000×3000`，PNG `4000×3000` | 原生 PNG IHDR 断言通过 |
| 显式 2x | viewport / 根 bounds `4000×3000`，PNG `8000×6000` | 原生 PNG IHDR 断言通过 |
| 普通真实窗口 | 请求 `4000×3000`，viewport `1920×1021`；AX window `1920×1049` | 自建后台窗口 PID 19093，service 验证后 12.5 秒内关闭 |

专用 `GPUIOffscreenWindow` 继承原 `GPUIWindow`，只覆盖 frame 约束和 backing scale。最终 `WindowOptions` / `WindowParams` 用 `offscreen_scale_factor: Option<f32>` 区分离屏测试与正常窗口；默认 `None`。离屏标量在 `alloc` 后、AppKit 初始化前写入专用 ivar，不持有额外 Objective-C 对象。native 边界在创建窗口前检查 scale 经 f32 转换后仍为有限正数，拒绝零、负数、NaN、Infinity、溢出及下溢。

协调者先批准专用测试窗口补丁，发现 nil-screen scale 问题后裁决采用显式默认 1x，不跟真实屏幕走。Windows/Linux 的离屏 `scaleFactor` **未实现**：本次门禁只支持 macOS，新回归入口在非 darwin 显式报 unsupported 并非零退出，不跳过或假通过。

## 补丁、隔离与复现

- gpuix 新增 `test-window-scale-factor.patch`，包含 Rust constructor、JS options 与生成的 `.d.ts` 契约。
- zed 在 `zed-production-no-sync-draw.patch` 后追加 `zed-offscreen-window-bounds.patch`、`zed-test-window-scale-factor.patch`。
- 所有新增补丁登记在 `scripts/gpuix-main/config.json`；不修改既有补丁序列中间项。
- 独立 vendor 根：`/Volumes/PSSD/code/_vendor/td10-gpuix`；独立 Cargo target：`/Volumes/PSSD/code/_vendor/target-td10`。未写入共享 vendor / target。

可重跑构建：

```sh
base="$(node scripts/gpuix-main/paths.mjs)"
GPUIX_VENDOR_ROOT="$base/td10-gpuix" CARGO_TARGET_DIR="$base/target-td10" \
  bash scripts/gpuix-main/build.sh
bun test scripts/gpuix-main/test-window/test-window.test.tsx
```

变异只在自有隔离 vendor 执行：把 `constrain_offscreen_frame` 的返回值临时改为父类 `constrainFrameRect:toScreen:` 的结果，直接执行 native napi release rebuild，再运行超屏幕回归。观察到上述 frame / viewport 夹取及非零退出；随后恢复 callback，使用 `build.sh` 重建并通过完整 source / artifact identity 校验。全部临时日志与变异均已移除。

scale 的独立红绿证据：新增 PNG 断言在旧 2x fallback 二进制上报 `Expected: 4000 / Received: 8000`；显式 scale 实现后 9 个原生用例全部通过。非 macOS 入口分支在临时源码副本中以 `win32` 常量替换 host 判定，明确输出 `Unsupported platform: offscreen scaleFactor regression requires macOS` 并退出 1；副本已删除。这不是 Windows 实机验证。

## 实际验证

| 命令 / 场景 | 结果 |
| --- | --- |
| 隔离 `build.sh` | release native、native JS、React build 与完整补丁/产物身份校验通过 |
| `bun test scripts/gpuix-main/test-window/test-window.test.tsx` | 9 pass，0 fail，21 assertions；默认 / 1x / 2x viewport、bounds、PNG 及非法 scale |
| `pnpm --dir apps/gpuix exec tsc --noEmit -p ../../scripts/gpuix-main/test-window/tsconfig.json` | 0 errors，使用应用所用 compiler |
| `pnpm verify:gpuix`（显式 scale 实现提交） | 通过；应用 1315 pass、1 个既有 todo、0 fail；架构 87 pass；工具 CLI 81 pass；新增窗口回归通过；真实后端 Home → project → resume smoke 通过，最终 `released idle` |
| `node scripts/gpuix-review-scan.mjs` | 0 HARD，0 WARN；没有需逐条豁免的 warning |
| worktree 根 `cargo check && cargo test` | 通过，54 tests / 4 suites |
| 隔离 native `cargo check --features gpui_platform/runtime_shaders` | 通过，覆盖未启用 test-support 的生产 cfg |
| 隔离 native `cargo test --lib --features test-support,gpui_platform/runtime_shaders` | 313 pass，0 fail |
| 离屏 native screenshot | 真实 GPU PNG 已观察；超屏幕内容可完整绘制。回归截图用系统临时目录并在 finally 删除，不提交 PNG |
| 普通后台原生窗口 | 已启动并读取 viewport / AX，验证普通窗口仍受约束；立即关闭，只操作自建窗口 |

首轮 bounds-only 的完整门禁有 10 个失败（超时、半点布局与 waveform 像素差异），因此没有把局部回归通过当成交付。补齐显式 scale 后，上表完整门禁通过；未修改这些既有业务测试。补充字体/几何 probe 曾在 60 秒内未完成，其启动首先同步执行 `system_profiler SPFontsDataType`；不把该补充命令描述成通过，原有 Header / Sends 路径由完整应用测试覆盖。

上游 vendor 编译仍打印已有 objc `cargo-clippy` cfg、dead_code 及 block future-incompatibility warnings；本轮未改其无关代码。根目录直接调用全局 `pnpm exec tsc` 曾遇 TypeScript 6 的 baseUrl deprecation，改用应用自身 compiler 后通过，没有加 ignoreDeprecations。

## 自审结果

两次独立只读 `pstack-reviewer`（TD10Standards、TD10Spec）分别执行 Standards / Spec 审查，涵盖原补丁和显式 scale 后的完整 diff；未让审查者运行构建、测试或改文件。Standards 对照架构、UI、Arrangement 契约、LESSONS 与「代码质量底线」。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| 真正离屏后触发固定 2x fallback | 汇报仲裁 | 协调者裁决显式默认 1x，专用子类持有 scale；普通窗口不变 | 1x PNG 修前红、修后绿；完整应用门禁恢复通过 |
| 生成的 constructor 声明未登记会使 source identity 失败 | 必修 | 把实际生成的 `.d.ts` 第三参数契约纳入 native 补丁 | 重建后完整 source / artifact 校验通过 |
| Windows 参数未实现但测试无平台边界，Spec P2 | 汇报仲裁 | 协调者选 A：回归非 macOS 显式失败；setup、verify usage、主干自建文档明确限制，不扩展 Windows | unsupported 分支 smoke 退出 1；实际 macOS 9 pass |
| Standards 复审无规范 / 生命周期 / ObjC dispatch 缺陷 | 记录 | 无需改动 | 独立 reviewer 检查 ivar 在 init 前赋值、子类分派隔离与 production cfg |
| 扫描 HARD / WARN | 记录 | 均为 0，无豁免 | review scan 实际输出 |

## UI 第 13 节与 Live 对照

本切片修改测试基础设施，不修改任何产品控件、布局、主题或交互；不把测试窗的纯色截图当作产品 Gallery 视觉验收。

| 检查                   | 本轮范围与证据                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| Gallery 与业务整体布局 | 产品 UI 未改；真实后端应用 smoke 通过，未额外宣称前台 Gallery 视觉评审 |
| 跨区域对齐与居中       | 未改产品布局；原 Header 居中回归保留并随全套通过                       |
| 间距与内边距           | 未改 token、gap 或 padding                                             |
| 统一设计入口           | 只修改 native 测试窗口契约，没有业务实例绕过共享组件                   |
| 尺寸与紧凑感           | 验证的是离屏 viewport 与正常窗口约束，不改变产品控件尺寸               |
| 深浅主题与中英文       | 未改主题或文案；没有新增视觉验收声明                                   |
| 状态与键盘             | 未改产品输入处理；既有原生行为测试保留并通过                           |
| 拖动、滚轮、弹层与性能 | 未改这些产品路径，不报告未经实测的新性能指标                           |

| 产品规则 | Live 观察 | 实现 | 差异 / 未验证 |
| --- | --- | --- | --- |
| 离屏测试不依赖物理屏幕限制 | 无 Live 对应行为，不操作用户工程 | 专用 AppKit 测试窗口与显式 scale | 产品交互未变；前台组合视觉验收仍由协调者执行 |

## 错题

- 错：只修 frame 夹取，就把超屏幕 viewport 通过当作完整修复。对：真正屏外窗口没有 NSScreen，必须一并检查 backing scale、PNG 尺寸和原有布局/像素回归。因：旧 GPUI nil-screen fallback 固定为 2x，掩盖了显示器依赖。
- 错：原生 constructor 改签名后只登记 Rust / JS 源码补丁。对：生成的 `.d.ts` 也须进入补丁契约。因：构建生成声明后，严格 source identity 会拒绝未登记漂移。

## 已验证做法

- 用超屏幕 `4000×3000` 加真实 viewport / 根 bounds / PNG IHDR 建立秒级红绿回路；恢复父类 AppKit 约束的变异能直接击中故障。
- 用 `Option<f32>` 同时表达「正常窗口」与「显式离屏 scale」，保持唯一 owner；专用子类只持有一个标量，正常窗口 class 和 fallback 不变。
- 构建只追加有序补丁，隔离 vendor / target；源身份、生产 cfg、原生用例与完整业务门禁一起验证，避免本机局部绿掩盖 hosted runner 差异。

## 进程清理与剩余验证

自建 service `td10-production-bounds` 已关闭；临时 smoke / unsupported 副本已删除。执行：

```sh
ps -axo pid,etime,command | grep -E 'bun .*--hot|cargo run|gallery|demo'
```

输出为空；grep 退出 1 表示无匹配，没有自建 demo / gallery / hot 窗口残留。未停止用户已有应用或服务。

**剩余：** Windows/Linux 显式离屏 scale 未实现（协调者明确不扩展本切片）；hosted macOS CI 尚未在本 worker 触发。协调者合入后重建共享 vendor，再按其授权推 main，检查 `verify:gpuix` 与原先失败的 Header / Sends 场景；本 worker 不 push、不发布。
