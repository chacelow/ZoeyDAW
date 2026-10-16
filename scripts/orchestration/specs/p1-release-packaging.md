# P1：可安装包与 GitHub Release 流水线（macOS arm64 起步）

## 用户决定（2026-10-16）

- 第一版只出 macOS arm64；Windows x64 由并行切片 W1 移植，移植合入后再加进同一条流水线。你的脚本与 workflow 要让 W1 只加一个 matrix 项和 Windows 分支，不重写。
- 不签名、不公证。README/Release 说明里写清首次打开的方法（右键→打开，或 `xattr -dr com.apple.quarantine`）。
- 触发：推 `v*` tag → CI 构建 → 上传到 **draft** release，由用户手动发布。参考 Zed 的 release 流程（`zed-industries/zed` 的 `.github/workflows/release*.yml` 与 `script/bundle-mac`），先用 Context7/GitHub 看最新版本。
- 用户已明确要求做 GitHub CI/CD，新增 `.github/workflows/release.yml` 在授权内。不新增 npm/Rust 依赖；`cargo-packager` 作为 CI 里 `cargo install --locked` 的构建工具使用（gpuix README「Wrap it in an app」推荐路径），不写进任何 Cargo.toml/package.json。

## 已查证（协调者 2026-10-16 实测）

- `cd apps/gpuix && NODE_ENV=production bun build --compile --minify src/main.tsx` 能产出 68 MB 单文件，但运行即崩：`Cannot find module './gpuix-native.darwin-arm64.node'`。根因：`@gpuix/native/index.js`（NAPI-RS 生成）用运行时拼接的路径 `require`，Bun 只嵌入静态可见的 `.node`；`--conditions=require` 不解决。`@zoeydaw/native`（`crates/native/index.js`）同理。
- 两个 loader 都支持 `NAPI_RS_NATIVE_LIBRARY_PATH` 覆盖，但一个进程两个 binding 共用一个环境变量，不能直接用。可选方案（自己实测后选，报告写理由）：入口前置静态 `require("…/gpuix-native.darwin-arm64.node")` 让 Bun 嵌入；或 `.node` 作为 sidecar 放 `.app/Contents/MacOS`（README 的 Hermes 做法）并在 loader 之前解析绝对路径；或改生成 loader 的方式。**不改 vendor 生成物来绕路**；需要改 vendor 就走补丁序列（`scripts/gpuix-main/config.json`）。
- 未打包时内存实测：`GPUIX_BACKGROUND=1 NODE_ENV=production bun src/main.tsx` 到 Home 后 phys_footprint 84 MB，峰值 152 MB。
- 原生体积：`gpuix-native.darwin-arm64.node` 23 MB，`zoeydaw-native.darwin-arm64.node` 5.6 MB。gpuix README 写 Bun 单文件 chat `.app` 为 82 MB。

## 要做

1. 打包脚本 `scripts/release/package.sh`（或 `.mjs`，按仓库习惯），输入版本号，产出 `zoeydaw.app` + `.dmg`（cargo-packager `formats: ["app","dmg"]`），本机可重跑。依赖 `bash scripts/gpuix-main/build.sh` 与 `pnpm native:build` 的现有产物，不另起构建路径。
2. 打包后的应用在**另一个目录**（不在仓库内、无 node_modules）启动成功：Home → 新建工程 → 进入 Arrangement → 播放/停止，真实引擎输出有 clock。打包应用的工程/设置/日志写入用户目录（`~/Library/Application Support/…`），不写进 `.app`；查清所有运行时文件读取（字体、图标、i18n、预设）在单文件内能找到。
3. 图标：仓库没有 app 图标。用现有品牌色做一个简单可替换的 1024 PNG → `.icns`（按 README 的 sips/iconutil 步骤）；在报告里标为占位、用户可替换。
4. `.github/workflows/release.yml`：`push: tags: ['v*']` 与 `workflow_dispatch`；macos-15 上复用 `ci.yml` 的 vendor/target 缓存与工具链步骤（抽成 composite action 或保持一致，二选一写理由），跑 `verify:gpuix` 后打包，`gh release create --draft` 并上传 `.dmg` 与 `.app.zip`、附 sha256。版本号来自 tag，与 `apps/gpuix/package.json`/产品名一致性要校验。
5. 文档：`docs/agents/setup.md` 加「打包与发布」小节（本机命令、tag 流程、未签名说明、已知限制）；README 或 Release 说明模板写安装方法。

## 验收

- 本机：脚本产出 `.app` 与 `.dmg`，记录体积；从 `/tmp` 下拷出的 `.app` 用 `open` 启动，真实窗口截图 Home 与 Arrangement 播放各一张（截图 Git 忽略），测稳定后 phys_footprint；验完关闭。
- 你不 push、不打 tag。合入后由协调者推 main、打测试 tag 跑 release 流水线并核对 draft 资产。
- workflow 用 `actionlint` 检查（本机没有就下载官方二进制到临时目录运行，不装进系统）；`pnpm verify:gpuix` 通过。
