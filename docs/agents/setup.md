# 开发环境与操作边界

## 当前工程

gpuix 原生应用在 `apps/gpuix`（bun 运行），Rust 原生能力在 `crates/native`（napi，产物 `@zoeydaw/native`），引擎在 `crates/engine`。工作区使用 pnpm，只保留 gpuix 应用与 Rust crates。主题度量在 `apps/gpuix/src/shared/theme/metrics`，语言与日志分别在 `apps/gpuix/src/platform/i18n`、`apps/gpuix/src/platform/log`。版本、包名和脚本以对应 `package.json`、`Cargo.toml` 为准。

## 运行与热更新（gpuix）

- 新 worktree 初始化（没有依赖）：在 worktree 根目录依次运行 `bash scripts/gpuix-main/build.sh`、`pnpm install --frozen-lockfile`、`pnpm native:build`、`node scripts/gpuix-main/check.mjs --resolution`。
- `build.sh` 在取构建锁前校验 vendor 的 revision、完整补丁序列、native 与 React 的全部 dist 文件、根入口及 JSX runtime 产物哈希、构建模式。校验通过时只生成本 checkout 的 `.gpuix-main` 与测试依赖链接，不执行安装、编译或取锁，已有构建锁也不阻止链接。产物失效或构建模式不符时才由持锁 owner 重建并记录 manifest。不要删构建锁；补丁序列不一致的处理见 LESSONS「修改补丁序列中间的补丁」。
- 缓存基目录由 `git rev-parse --path-format=absolute --git-common-dir` 推导，为 `resolve(dirname(commonDir), "../_vendor")`，与主仓库位于同一磁盘。所有 linked worktree 使用同一个基目录。`GPUIX_VENDOR_ROOT` 默认是基目录下的 `zoeydaw-gpuix`，`CARGO_TARGET_DIR` 默认是基目录下的 `target`，两者都可用环境变量覆盖。除 `CI=true` 外，规范化后的 Cargo target 必须位于基目录内，符号链接不能绕过限制。
- 原生 redraw mutation 必须显式传入隔离的 `GPUIX_VENDOR_ROOT`；native mutation 还要求 `CARGO_TARGET_DIR`，mode mutation 默认使用隔离 vendor 下的 `target`。两种入口都拒绝共享 vendor、共享 target 和仓库内路径，`CI=true` 只豁免 target 的磁盘位置约束，不豁免隔离要求。
- 开发窗口：`apps/gpuix` 下 `bun --hot <入口>`（应用入口 `src/main.tsx`，切片 demo 与画廊各有入口）。改 TS/TSX 保存即热更新。
- Rust 改动：根目录 `pnpm native:build` 重建 `.node`，再重启自己的窗口。
- Agent 自己启动验证窗口，启动时用带 `name` 的 bash service，拿到截图/AX 证据后立刻 kill；收尾前确认零残留。
- 后台启动：任何入口（`src/main.tsx`、Gallery、各 demo）加 `GPUIX_BACKGROUND=1`，窗口打开时不抢键盘焦点，用户的前台应用保持不变，统一由 `platform/window` 的 `LAUNCH_FOCUS` 控制。AX 只读量值、离屏截图（`createTestRoot`）和例行回归都用这种方式。后台窗口不能替代真实桌面验收：它通常被前台应用遮挡，macOS 会停发遮挡窗口的 animation frame（F3 实测），所以窗口截图可能全黑，等待原生帧的测量（性能、首帧）会一直卡住；`el.press()` 等输入还可能报 `BackgroundUnavailable`。遇到这些情况，把对应项标为未验证，不要用 headless 数据冒充窗口数据；需要真实帧的验收在真实桌面上串行完成。
- 不停止用户自己启动的应用或服务。

## 验证命令（gpuix）

`verify:gpuix` 保留 macOS 完整门禁。Windows x64 使用独立的 `node scripts/verify-windows.mjs`，覆盖原生构建、Rust、TypeScript、Bun、离屏 scale、生产 UI 帧与真实后端截图。Windows job 首轮为 `continue-on-error`，看到 Actions 稳定通过后转为必过。Linux 不在本次移植范围，离屏 scale 回归仍显式报 unsupported。实际支持状态见 [Windows 移植报告](../research/windows-port.md)。

完整门禁只在 GitHub Actions 运行，不在本机重复跑 `pnpm verify:gpuix`。本地交付执行 `tsc --noEmit`、改动范围的 Bun 测试与 eslint、本切片变异入口、必要的单窗口 smoke；Rust 只检查和测试改动 crate。`verify:gpuix [baseRef]` 依次检查绝对路径、渲染器身份与单一解析、native 构建、类型、lint、架构与工具回归、文档路由、Bun、离屏 scale、review scan、UI 地图和真实后端应用 smoke。任一步失败即非零退出，全部通过打印 `verify:gpuix passed`。review scan 默认对比 `gpuix-migration...HEAD`，不覆盖未提交改动。

`node scripts/gpuix-review-scan.mjs --absolute-paths` 检查全仓 Git 跟踪的 `.mjs`、`.js`、`.ts`、`.tsx`、`.sh`、`.rs`、`.json` 文件，包括注释和 usage 示例。机器目录根的路径属于 HARD，包括 shell 默认值；相对路径不算。`evidence/` 运行记录、Markdown 和 `file://` URL 测试数据不在此门禁范围内。验证日志和 smoke 证据使用 `mktemp`，退出时清理，不依赖固定临时目录。

预提交的 UI 地图从 Git index 读取源码，不包含完全未暂存或部分暂存文件的未暂存内容。生成器直接更新地图的 index 条目，只有工作树地图未被编辑时才同步刷新文件。日常生成与 `--check` 仍读取工作树；ClipCard 的条件前缀会生成 `clip-source-…`、`clip-ghost-…` 两个稳定 selector。

Header 只测 viewport，左右列由原生 flex 和 intrinsic minima 分配，不缓存子组 L/C/R 后再反馈列宽。首挂载回归覆盖 Helvetica、缺失字体和 1800/1070/900/620 四档宽度，保持原 mount 时序。

CI 的 Bun 测试失败时输出完整日志，保留早期 Expected/Received；随后失败诊断步骤分别用 `PROBE_PASSES=1` 和 `PROBE_PASSES=4` 运行 `bun scripts/gpuix-main/ci-geometry/probe.tsx`。入口输出启用字体 family 列表、Header/Send 逐次布局 bounds 与 resize 状态。`PROBE_NUMBER`、`PROBE_SANS` 只替换请求的字体 family，不安装或隐藏系统字体。

离屏测试窗口不受宿主显示器可见区域限制：`VisualTestAppContext` 显式传入 `offscreen_scale_factor`，macOS 只对这类窗口使用 `GPUIOffscreenWindow` 跳过 AppKit 的 frame 约束。`createTestRoot({ width, height, scaleFactor })` 的 macOS backing scale 默认为 `1`，可显式请求 `2`，不读取真实屏幕 scale；viewport 保持请求的逻辑尺寸，PNG 尺寸为逻辑尺寸乘以 scale。普通应用窗口保留原有屏幕约束与 scale fallback。`bun test scripts/gpuix-main/test-window/test-window.test.tsx` 请求 `4000×3000`，覆盖默认/1x/2x 的 viewport、根 bounds、PNG 尺寸及非法 scale，已纳入 `verify:gpuix`。对应序列为 `zed-offscreen-window-bounds.patch`、`zed-test-window-scale-factor.patch`，native 选项由 `test-window-scale-factor.patch` 持有；修改时使用独立 vendor 根与 Cargo target。

`bun scripts/gpuix-main/ci-geometry/gallery.tsx <外部证据目录>` 捕获深浅主题与中英文的完整 Gallery；业务组合沿用 `app/verification/r1c-surfaces.tsx`，配合 `native-fixture.ts` 接真实后端。生成 PNG 留在外部证据目录，不提交图片。

## 根工具与度量

根 `package.json` 定义 `doctor`、`check`、`fix`、`test` 等入口；gpuix 的完整验收使用上面的 `verify:gpuix`。Node 版本要求与各命令实际覆盖范围以 manifest 和脚本为准，不再运行旧 Web、共享包或 Tauri 的命令。

共享度量的配置源是 `apps/gpuix/src/shared/theme/metrics/control-metrics.json`，同目录 `config.ts` 直接导入 JSON 并导出类型化度量。消费者通过 `shared/theme` 使用同一份配置，不复制数字；原 Web 度量 CSS 生成与漂移检查命令已删除，gpuix 不需要生成 CSS。

正确性、类型、无障碍与项目架构/token 是硬门禁。自动检查只覆盖规则声明的静态范围，不代表完整依赖图或所有动态样式已验证。不要未经审查重跑 `ultracite init` 覆盖项目配置；升级时核对预设、peer 绑定与本地规则，再执行对应工具、类型、测试和界面验证。

完整门禁在 GitHub Actions 的 `main` 上跑（用户 2026-10-16：本机性能不足）：`.github/workflows/ci.yml` 在 macOS 上执行同一套 `build.sh` 与 `verify:gpuix`；只有 `CI=true` 允许 Cargo target 位于 Git 推导的缓存基目录之外。本地只跑轻量检查：`tsc --noEmit`、改动文件的 eslint 与相关 `bun test`、必要的单窗口 smoke。本地 `verify:gpuix` 只在排查 CI 失败时使用。不把 workflow 文件存在称为 CI 已运行，只报告实际看到的 run 结果。

**本地检查不超过 1 分钟（用户 2026-10-17）**：单个本地检查命令超过 1 分钟就不进日常流程。只对改动文件跑 eslint，不对整个 `apps/gpuix/src` 跑；测试只跑改动模块附近的文件；变异入口和全仓扫描不在每次改动时跑，交给 CI 或核心算法重写时一次性运行。工具或规则变慢到超过 1 分钟，先找出耗时项删掉或改成 CI 专用，不让每个 lane 反复等待。`import-x/no-cycle` 在全仓 lint 中耗时 73 秒，已关闭。

UI 改动必须在真实 gpuix 窗口验证主路径，观察新截图或实际状态。单元测试通过不能代替 UI 验证；报告实际检查与限制。

## 打包与发布

打包在 GitHub Actions 的 macOS arm64 或 Windows x64 runner 上执行，本机不重复构建整包。版本号必须等于根目录与 `apps/gpuix/package.json` 的 `version`。固定工具与打包入口如下：

```bash
cargo install cargo-packager --version 0.11.8 --locked
bun scripts/release/package.mjs "$(node -p 'require("./apps/gpuix/package.json").version')"
```

`package.mjs <version> [output-directory]` 默认输出 `dist/release/<version>`。macOS 复用 `build.sh` 与 `pnpm native:build`；Windows 复用 `build-windows.mjs` 与 native package 的同一个 build script。然后 Bun 编译单文件，cargo-packager 生成宿主安装包。`CARGO_PACKAGER_BIN` 可指定隔离安装的工具路径。

| 目标 | 产物 |
| --- | --- |
| macOS arm64 | `zoeydaw.app`、`zoeydaw_<version>_aarch64.dmg`、`zoeydaw-<version>-macos-arm64.app.zip`、`SHA256SUMS-macos-arm64` |
| Windows x64 | `zoeydaw_<version>_x64-setup.exe`、`SHA256SUMS-windows-x64` |

`build/` 保留编译产物与 packager 配置。macOS 还保留 PNG、iconset 和 icns；Windows 暂用默认安装器图标。Windows 单文件 exe 留在 `build/` 供安装器使用，只分发包含许可证资源的 NSIS 包。输出目录不混放不同版本的安装器。Windows PE 的数值 FileVersion 不含 alpha 后缀，应用与安装器版本保留完整 semver。

两个 NAPI-RS loader 使用运行时 `require`，Bun 无法自行发现 `.node`。`bundle.mjs` 在打包时把包名和真实 loader 路径都解析为静态 `require`，将两个 binding 嵌入可执行文件；Windows 使用 `win32-x64-msvc` ABI 后缀。不改 vendor 生成 loader，不共用 `NAPI_RS_NATIVE_LIBRARY_PATH`。macOS 占位图标仍由 Default 预设与 `icon.swift` 生成，替换该文件可换品牌图标。

`bun scripts/release/smoke.mjs <evidence-directory>` 用同一 bundler 编译独立离屏验证程序，在仓库外的临时目录启动，覆盖 Home → 新建 → Arrangement → 原生 sample clock 前进 → 停止与 session 释放。截图与 `smoke.json` 写入传入目录，临时可执行文件退出时删除。它使用默认真实后端与空工程，不声称验证音频素材播放或前台窗口帧。真实包另外用 `open -g` 启动，前台视觉验收仍由维护者完成。

发布按以下顺序操作。推 tag 属于远程写入，须遵守本次授权边界，本机打包命令不会推送或创建 tag。

1. 同步根目录、gpuix 应用与应用内展示版本，完成本地轻量检查，再合入 `main`。完整 `pnpm verify:gpuix` 在 GitHub Actions 运行。
2. 在 `main` 的目标提交创建同版本 `v*` tag 并推到 GitHub。首个版本是 `v0.1.0-alpha.1`，之后依次使用 alpha、beta、稳定版。
3. `release.yml` 的 macOS 和 Windows matrix 分别校验 tag 指向 `main` 且匹配 manifest，执行对应门禁后打包。开发切片分支不推送。Windows 必须通过才产生包含 Windows 资产的 draft。
4. 流水线上传安装包与 SHA-256 到 draft release。带预发布后缀的 tag 同时标记 Pre-release；维护者核对安装与真实播放后手动发布。

`workflow_dispatch` 只接受已有版本 tag。重跑覆盖同一 draft 的资产，已发布 release 不允许覆盖。matrix 每项上传 `release-<platform>` artifact，draft job 聚合资产并校验 checksum；验证截图使用 `evidence-release-<platform>`，不会混进 release 下载。工具链与缓存保持 `ci.yml` 一致：step 将 `RUNNER_WORKSPACE` 下的绝对路径写入 `GITHUB_ENV`，actions/cache 读取 `env.GPUIX_VENDOR_ROOT` 和 `env.CARGO_TARGET_DIR`，分别缓存。

安装包目标为 macOS arm64 和 Windows x64。Windows 构建、NSIS 安装与真实桌面尚需 Actions 和实机证据，不能仅凭 workflow 声称已支持。macOS 无 Developer ID 签名、无公证，首次打开方法见 [Release 安装说明](../../scripts/release/NOTES.md)。Bun ad-hoc 签名不等于 Developer ID 签名。macOS 最低系统声明为 13，旧系统未实机验收；Intel、Linux、自动更新不在本次范围。

macOS 的设置与工程快照写入 `~/Library/Application Support/com.zoeydaw.desktop`，默认日志写入 `~/Library/Logs/com.zoeydaw.desktop`。Windows 目录由原生 `userDirectories()` 选择，日志位于 data_dir/logs。字体使用系统字体；图标、语言资源、主题预设与度量随 Bun 可执行文件编译，不依赖可写安装目录或仓库的 `node_modules`。用户导入的音频仍保留外部文件路径，打包不搬入工程媒体。

## 修改前确认

问用户的范围只有根 `AGENTS.md`「决策默认归 Agent」那张封闭清单；清单外的技术决定（含共享 UI 公共 API）由 Agent 自己决定。

secrets、token 和 API key 不进入仓库。保留其他 Session、Agent 的未提交和暂存工作。

## 提交授权

**`gpuix-migration`**：用户 2026-10-14 12:40 UTC 授权本地提交，不再逐次索取“我确认”。非交互提交照常带 `USER_CONFIRM_HASH=$(git write-tree)` 通过 hook；`ultracite`/lint-staged 门禁仍必须通过，不用 `--no-verify`。

**`main` 与其它分支**：每次 commit 都要求用户在本次提交上下文明确说出 **“我确认”**。之前的授权不延续；“提交吧”“commit 一下”“push 吧”不能替代。

两种情况都不自动扩展为 push、发布或部署。确认 hash 绑定本次 staged tree；通过 hash 校验的非交互提交记录在 `.git/commit-audit.log`。
