# T2 标题栏双击系统动作

## 交付与语义

基于 `3f5659566ca2d0ca52a7ff5494a9a21b4e1476e2`，提交 `395ddffe`、`16722ce8`。原生桥、窗口端口和生产组合根已接通；不推送、不改系统设置、不覆盖共享 vendor，也没有新增依赖。

- `titlebar-double-click.patch` 在固定补丁序列末尾增加 NAPI `titlebarDoubleClick()`，同时包含 NAPI 自动生成的声明和 `NativeRenderer` 的 host 类型。macOS 调现有 GPUI `Window::titlebar_double_click()`；Linux/FreeBSD/Windows 透明自绘标题栏复用 `UiCommand::ZoomWindow`，补丁注释说明 Windows 原生 caption 仍由系统处理。
- 系统偏好由 GPUI 持有，TS 不读取或缓存 `AppleActionOnDoubleClick`。`None` 不执行，`Minimize` 最小化，`Maximize` 和缺省缩放。固定 GPUI 的 `Fill` 因缺少公开 API 降级为 `zoom_`，不是完整的原生填充；协调者已批准保留此上游限制，不调用私有 API。
- 双击标题栏的 macOS 系统动作是缩放或填充，不是进入全屏。本切片没有把双击接到 `toggleFullscreen()`。
- `NativeRoot` 经 `createWindowPlatform`、`AppShell` 注入命令，`TitleBar` 不导入 renderer。生产组合根始终提供命令；既有离屏 shell 没有原生窗口，可以省略回调。窗口端口缺少 native 能力时明确抛错，不静默退回 zoom。
- 唯一手势入口只接受左键且 `clickCount === 2`。标题展示层使用 `pointerEvents: "none"`；Settings 使用 `pointerEvents: "auto"`，在原生命中阶段排除控件，不改变设置按钮激活行为。没有双击计时器、鼠标捕获、模拟窗口移动或新订阅。

## 回归与变异

修复前执行 `cd apps/gpuix && bun test src/app/shell/TitleBar.test.tsx`，双击空白区域断言失败：`Expected: 1, Received: 0`。修复后 3 个用例全部通过，覆盖单击、双击、三击、非主键、居中标题与 Settings 排除。

测试通过真实 GPUI native hit testing 获取事件目标。现有 native 自动化只生成 `clickCount=1`，所以测试仅重放该字段，保留真实目标与事件分派，并在 finally 恢复分派方法。会改变宿主窗口状态的系统动作回调按架构允许的测试例外替代；没有模拟 renderer 命中。

`bun src/app/shell/verification/mutations.mjs` 在独立子进程通过 Bun preload 改变模块内容，不写产品源码。以下 4 项均被行为断言捕获：

| 变异 | 观察到的失败 |
| --- | --- |
| 删除 `clickCount === 2` | 单击错误触发系统动作 |
| 删除左键判断 | 非主键双击错误触发 |
| Settings 不再阻挡命中 | 控件双击错误触发标题栏动作 |
| 标题展示层阻挡命中 | 居中标题双击无法触发动作 |

## 独立 vendor 与 Rust

独立源码为 `/Volumes/PSSD/code/_vendor/zoeydaw-t2-task24349149/6a5c7c142ac32f9eb0caefe0121be995cfc18631`，target 为 `/Volumes/PSSD/code/_vendor/target-t2-task24349149`。二者由 APFS copy-on-write 副本建立，构建最多 2 jobs；本 lane 的 `.gpuix-main` 指向独立 vendor，未修改共享 vendor 或共享 target。

只修改了 renderer Rust 源码与 host 类型，再由 NAPI 构建生成声明，没有手改生成文件。首次真实 native 编译通过，release 编译 19m35s，native/React 的 JS 构建通过；随后发现生成声明新增的两行尚未纳入补丁，最终 identity record 按预期拒绝。将这两行生成差异加入补丁后，`check.mjs --record --build-mode runtime` 验证全量 source/output manifest 通过，重新运行 `build.sh` 为 link-only，没有再次编译；`check.mjs --resolution` 确认 native/host/React/reconciler/Zustand 单一解析。

实际运行的 Rust 命令均针对独立 vendor 的修改 crate，并保留 `test-support,gpui_platform/runtime_shaders`：

```bash
CARGO_TARGET_DIR=<isolated-target> CARGO_BUILD_JOBS=2 cargo check --release --target aarch64-apple-darwin --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders
CARGO_TARGET_DIR=<isolated-target> CARGO_BUILD_JOBS=2 cargo test --release --target aarch64-apple-darwin --manifest-path packages/native/Cargo.toml --features test-support,gpui_platform/runtime_shaders --lib
```

check 通过，Rust 测试 **313 pass / 0 fail**。保留上游既有 license、`cargo-clippy` cfg、dead-code 和 `block` future-incompatibility 提示；没有为了静默它们加 allow。新 Rust 方法只委托既有 OS 动作，没有新增纯逻辑，也没有可复用的窗口动作单测模式，因此不加仅验证转发或不抛错的 Rust 单测，采用真实 native 命令的尺寸变化证明。完整原始日志保存在 `dist/t2-evidence/native-build.log` 和 `renderer-cargo-gates.txt`，不是分页工具输出的截断副本。

## 原生运行证据

证据在 Git 忽略的 `dist/t2-evidence/`，没有提交 PNG。

| 场景 | 实测 | 证据 |
| --- | --- | --- |
| 隐藏的真实 production `GpuixRenderer` | `show:false/focus:false` 初始化，通过窗口端口调用新命令后，内容尺寸从 **640×480 → 2560×1049**；finally 关闭，进程退出 0 | `hidden-native-action.json`；可重跑入口 `shell/verification/native-window.ts` |
| 实际 main 后台窗口 | 自己的 PID `47841`，初始窗口 1280×800；截图全黑、AX 仅 chrome；`computer.window.doubleClick(200,38)` 后尺寸仍 1280×800 | `window-before.png`、`window-after.png`、`background-window.json` |
| 真实后端业务组合 | `native-fixture.ts` 配合 `r1c-surfaces.tsx` 生成深浅、中英及 Audio/MIDI 的 8 张整体组合；真实 sample clock/3 条轨道，真实 peaks 256 值，范围约 ±0.4 | `surfaces/*.png`、`surfaces/native-backend.json` |
| 共享 Gallery | 固定验证入口生成深浅/中英 4 张完整组合，退出检查 retained nodes 为 0 | `gallery/*.png` 与 JSON |

后台实际双击的手势**没有验收通过**，也没有把隐藏窗口的直接 API 调用当作前台手势证据。协调者已明确接受此拆分：合入并重建共享 vendor 后，由协调者收尾前台双击、截图与原生拖动。未申请桌面帧时段、未使用 takeover、未调用 `computer.control.acquire`。

## 轻量检查

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @zoeydaw/gpuix-prototype exec tsc --noEmit` | 通过 |
| scoped `ultracite check`，覆盖 shell、AppShell、NativeRoot、window port、README、config | 通过，未修改断言或增加 lint 豁免 |
| `bun test .../TitleBar.test.tsx .../AppShell.test.tsx .../platform/window` | 40 pass；既有 Cmd+F 用例在并行 Cargo 时超过默认 5 秒，1 timeout |
| Cargo 结束后单独重跑 Cmd+F，CLI `--timeout 30000` | 1 pass，18 filtered out，7 assertions；不改测试源码或产品逻辑，不声称该环境的 5 秒期限已证明稳定 |
| `bun src/app/shell/verification/mutations.mjs` | 4 变异全部捕获，提交格式化后再次通过 |
| `node scripts/gpuix-review-scan.mjs` | 0 HARD / 1 WARN，见自审表 |
| `node scripts/gpuix-review-scan.mjs --absolute-paths` | 845 个 Git 跟踪源文件，0 HARD / 0 WARN |
| 实现提交的 Ultracite hook | 通过，无 `--no-verify`，UI 地图由 hook 从 index 生成 |

按用户最新规则，没有在本地执行完整 `pnpm verify:gpuix`。完整门禁在协调者推送 `main` 后由 Actions 执行；本切片不推分支或 tag。

## 自审结果

独立 `pstack-reviewer` 已完整审阅 `git diff 3f5659566ca2d0ca52a7ff5494a9a21b4e1476e2..HEAD` 的 12 个文件与两个代码提交，并追踪真实 native 命中、GPUI 系统动作和 production 组合根。Standards 与 Spec 两轴均 Clean，必修 0、新增汇报仲裁 0、缺陷类记录 0；审查者只读，没有运行检查或修改文件。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| native-window 验证入口的 640×480 触发两处 px-literal WARN | 记录 | 固定 OS 验证夹具尺寸，不是产品 UI 度量，不为消除 WARN 增加主题 token | scan 0 HARD / 1 WARN；独立 reviewer 同意 |
| macOS `Fill` 在 pinned GPUI 中降级为 zoom | 汇报仲裁 | 协调者批准严格复用并披露限制，不调用私有 API，不声称全屏或完整 Fill | `gpui_macos/src/window.rs:2025-2029`、Orca ask reply |
| 遮挡后台窗口没有手势尺寸变化 | 汇报仲裁 | 协调者接受隐藏 native 命令/离屏命中证据，承担共享 vendor 重建后的前台双击与拖动 | `background-window.json`、第二次 ask reply |
| 原始鼠标 payload 没有 `stopPropagation()` | 必修 | 删除错误用法，改为原生 pointer-events 命中隔离，并用两个 hitbox 变异覆盖 | 真实命中 3 用例、4 mutants |
| NAPI 构建后生成声明未登记，identity 拒绝 | 必修 | 从真实生成输出补入补丁，source/output manifest 与 link-only 入口均通过 | final `check.mjs --record`、`--resolution` |
| 既有 Cmd+F 测试超时 | 记录 | 按协调者要求在 Cargo 结束后单独以 CLI 较长期限重跑，断言不变并通过 | 1 pass / 7 assertions |

## UI 第 13 节

| 检查 | 结论与证据 |
| --- | --- |
| Gallery 与业务整体布局 | 已查看完整 dark/en Gallery、light/zh Gallery，以及四种主题/语言业务组合；没有调整业务几何或控件变体 |
| 跨区域对齐与居中 | 标题仍居于窗口中心，Settings 位于右侧；沿用既有 absolute 标题布局与共享交通灯 inset，整体截图未见本切片引入错位 |
| 间距与内边距 | gap/padding 未改，仍来自共享 theme/project tokens |
| 统一设计入口 | 只改输入命中属性，没有第二套颜色、圆角、边框或尺寸入口 |
| 尺寸与紧凑感 | 同一 TitleBar/transport 尺寸配置不变；Gallery 与业务组合保留原有密度 |
| 深浅主题与中英文 | 业务 8 张及 Gallery 4 张生成成功，查看了四种业务主题/语言组合和两种 Gallery overview |
| 状态与键盘 | 单/双/三击、非主键、居中标题、Settings 行为由原生回归覆盖；相关窗口和 AppShell 回归均已覆盖，Cmd+F 的环境超时及重跑单列 |
| 拖动、滚轮、弹层与性能 | 没有接管拖动或改变滚轮/弹层；实际前台拖动由协调者补验，未声称测量帧性能 |

| 产品规则 | Live 观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 双击标题栏遵循 macOS 系统设置 | 这是系统窗口规则，不新增 Live 编辑行为；未操作用户 Live 窗口或工程 | 复用固定 GPUI 的 AppleActionOnDoubleClick 路径 | 只实测缺省缩放；None/Minimize 来源于上游代码，未改系统设置逐项验收 |
| 空白和居中标题可双击，设置控件不触发 | 不改变现有 Live 风格的标题栏布局 | 单一原生 mouse-down 入口与 native hitbox 排除 | 前台实际手势/拖动交接协调者；Fill 上游降级已披露 |

## 错题

- 错：把键盘包装事件的 `stopPropagation()` 套到鼠标 payload。对：先追踪 renderer-state 的分派契约；本切片用原生命中遮挡边界。因：只有键盘事件共享包装 flags，鼠标事件直接传原始 payload。
- 错：补丁只登记 Rust/host 改动，忽略 NAPI 再生成的声明。对：让生成器产出声明，再把生成差异纳入同一补丁，最后重新核对 source/output manifest；不手改生成文件。
- 错：把系统标题栏双击当成进入全屏。对：区分 zoom/fill 与 fullscreen；固定 GPUI 的 Fill 仍降级 zoom，明确披露。

## 已验证做法

- 原生 `pointerEvents` 在实际 hit testing 阶段隔离透明控件，比 TS 中模拟鼠标传播或缓存几何更直接；两个 hitbox 变异证明回归能抓到边界破坏。
- APFS CoW 隔离 vendor 与 target 后，保留固定版本和完整补丁序列即可构建真实新 NAPI 方法，不覆盖共享产物。
- 隐藏 production renderer 的系统动作可通过实际内容尺寸变化验证，并在 finally 关闭；后台截图不能冒充前台手势验收。
- scoped 测试在 Cargo 并行时可能受本机资源影响；保留失败记录，单独重跑受影响用例，不修改断言或产品逻辑来消除超时。

## 进程清理与交接

`t2-hidden-native` 自然退出 0 后立即释放 service；`t2-app-window` 拿到前后证据后立即 kill。离屏验证均在 finally unmount，Rust/build/测试有限任务已退出，没有测试窗口继续占用 GPU。

交付前执行规定命令，输出为空，grep 退出码 1，即零匹配；原始记录为 `dist/t2-evidence/process-cleanup.txt`。

```bash
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

长期 lane 的 worktree、终端、分支保留，遵守用户最新规则。独立 vendor/target 也保留供协调者复查；共享 vendor 重建、前台双击/拖动及 main Actions 由协调者完成。

上游依据：[GPUI Window::titlebar_double_click](https://docs.rs/gpui/latest/gpui/struct.Window.html#method.titlebar_double_click)，以及本次实际读取的固定 `zed/crates/gpui_macos/src/window.rs:1983-2040`。Context7 查询确认该方法为 macOS 系统标题栏动作；实现与限制以 pinned 源码和实测为准。
