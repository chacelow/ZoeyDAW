# P1 macOS arm64 打包交付

## 范围与决定

本切片新增可重跑 Bun 单文件打包、cargo-packager app/DMG、draft release 流水线、占位图标与安装说明。不改 `apps/gpuix/src`、Rust、vendor、依赖 manifest；不推送、不打 tag、不发布 release。

- Bun plugin 在构建时将两个 NAPI 包和内部相对 `index.js` 导入替换为静态 `.node` require。它不修改生成 loader，也不使用两个 binding 会争用的 `NAPI_RS_NATIVE_LIBRARY_PATH`。
- 本机用 cargo-packager `0.11.8` 的隔离安装，CI 用 `cargo install --version 0.11.8 --locked`，不新增依赖。
- release matrix 目前只有 `{ runner: macos-15, platform: macos-arm64 }`。各项上传 `release-<platform>`，draft job 聚合资产；W1 拥有后续 Windows 平台分支。
- 保留与 `ci.yml` 一致的工具链步骤，不在本切片抽 composite action。缓存按协调者修订后的两层结构，路径通过 `RUNNER_WORKSPACE` 写入 `GITHUB_ENV`，cache action 读 `env.GPUIX_VENDOR_ROOT` 与 `env.CARGO_TARGET_DIR`。
- tag 必须匹配 root 与 gpuix 应用的版本，且 tag 提交属于 `origin/main`。带预发布后缀的 tag 创建 draft + Pre-release。已发布 release 拒绝覆盖，重跑只更新 draft 资产。
- 首个远程版本是 `v0.1.0-alpha.1`。协调者统一同步 manifest 与应用展示版本，本切片不越界修改它们；本机证据来自分支当时的 `0.0.0`。

接口已通过 Orca `msg_10c796de334f`、`msg_fb910ede6c6f` 交给 W1。实现提交为 `efbe07b9`、`1ce8b43a`，分发 notices 修复为 `a8c86e3c`，固定像素图标为 `816d1693`。

## 本机产物

`bun scripts/release/package.mjs <version> [output-directory]` 默认生成 `dist/release/<version>`。本机成功重跑同目录，产物如下。体积取文件字节总和，不是磁盘占用估算。

| 产物                                |     字节 |   MiB |
| ----------------------------------- | -------: | ----: |
| `zoeydaw.app`                       | 95269161 | 90.86 |
| `zoeydaw_0.0.0_aarch64.dmg`         | 36314000 | 34.63 |
| `zoeydaw-0.0.0-macos-arm64.app.zip` | 36257396 | 34.58 |

SHA-256 清单 `SHA256SUMS-macos-arm64` 用 `shasum -a 256 -c` 验证，两项均为 `OK`。`codesign -dv --verbose=4` 显示 `Signature=adhoc`、`TeamIdentifier=not set`、`Sealed Resources=none`；这是 Bun 链接器的 ad-hoc 签名，不是 Developer ID 签名或公证。

图标从 Default dark 的 background、foreground、chart2 取色。Swift 生成 1024×1024 PNG，`sips` 生成 iconset，`iconutil` 成功生成 icns。自审将生成器改为显式 1024 像素 bitmap，不再依赖显示器 scale，也不经 TIFF 中转；单独运行 Swift 与 sips 再次确认尺寸，已查看 `icon-fixed.png`。它是占位图标，可替换 `scripts/release/icon.swift`。

自审补入了既有 root LICENSE、NOTICE、THIRD_PARTY_NOTICES 与 gpuix LICENSE、THIRD_PARTY_NOTICES.md，位于 `Contents/Resources/licenses`。仅重跑 packager 使用已有可执行文件，没有再次完整构建；五份分发文件逐字节核对源文件相同，随后重建 zip 与校验和。证据为 `notice-packaging.json`，表中为补入 notices 后的最终体积。

## 运行与资源证据

证据保存在 Git 忽略的 `dist/release-evidence/`，未提交生成图片。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 独立可执行离屏 smoke | 同一 bundler 编译，仓库外临时 cwd，无 `node_modules`，Home → 新建工程 → Arrangement | `home.png`、`arrangement-playing.png`、`smoke.json` |
| 真实默认后端 | sample clock frame `5156 → 12525`，bar `1.0537140832 → 1.1304705208`，48 kHz，playing true，停止后 false，unmount 后 session idle | `smoke.json` |
| 实际 `.app` 启动 | 将应用复制到 `/tmp/zoeydaw-p1-WnDT2W/zoeydaw.app`，`open -g -W -n <app> --env GPUIX_BACKGROUND=1`，观察到独立原生窗口 | `bundle-launch.json`、`background-window.png` |
| 内存 | 遮挡后台窗口稳定后 `phys_footprint: 54 MB`，`phys_footprint_peak: 121 MB`，不当作 Home 首帧后的前台内存 | `bundle-launch.json`，本轮 `footprint -p 72231` 输出 |
| `.app` 不写入自身 | 启动前原包与运行后拷贝逐文件字节比较相同 | `bundle-launch.json` |
| 用户目录 | 原生 `userDirectories()` 返回 settings/data 为 `~/Library/Application Support/com.zoeydaw.desktop`，logs 为 `~/Library/Logs/com.zoeydaw.desktop` | `smoke.json`、`crates/native/src/settings.rs` |
| 运行时资源 | i18n TS 模块、主题预设/JSON 度量、lucide 与 Phosphor SVG 为静态导入；系统字体包含 Menlo；真实独立 smoke 中均可渲染 | `app/i18n/index.ts`、`shared/theme/design-tokens.ts`、`ui/controls/Icon/index.tsx` 与两张业务截图 |

离屏验证使用真实默认后端和空工程，不模拟 clock，也不声称验证可听音频素材。离屏帧由明确的验证 driver 推进，不当作窗口帧率或性能证据。真实后台窗口被遮挡，截图全黑，AX 只有 chrome；协调者已明确接受此限制，真实窗口 Home/Arrangement 播放截图由协调者收尾时前台补验。

工程导入的外部音频仍使用用户文件路径，打包不会把工程媒体复制进 `.app`。

## 实际执行的检查

| 命令 | 结果 |
| --- | --- |
| `bash scripts/gpuix-main/build.sh` | 已有完整 manifest 校验通过，link-only，无渲染器重建 |
| `pnpm install --frozen-lockfile` | 通过，无 manifest/lockfile 改动 |
| `pnpm native:build` | 初次真实二进制构建通过，后续打包使用增量产物 |
| `CARGO_PACKAGER_BIN=<isolated-tool> bun scripts/release/package.mjs 0.0.0` | app、DMG、zip、SHA-256 生成成功，同目录重跑成功 |
| `pnpm --filter @zoeydaw/gpuix-prototype exec tsc --noEmit` | 通过 |
| `pnpm --filter @zoeydaw/gpuix-prototype exec tsc -p ../../scripts/release/tsconfig.json` | 通过 |
| `pnpm exec ultracite check scripts/release README.md docs/agents/setup.md .github/workflows/release.yml` | 通过；未装 Stylelint 的既有提示不涉及 CSS 改动 |
| `dist/actionlint -shellcheck= .github/workflows/release.yml` | 官方 `v1.7.12` 二进制通过；未启用额外 shellcheck |
| `bun scripts/release/smoke.mjs dist/release-evidence` | 真实原生 smoke 通过，临时可执行目录退出时删除 |
| metadata 边界断言 | 当前合法版本通过；缺失、`v` 前缀、路径注入、manifest 不匹配全部拒绝 |
| `node scripts/gpuix-review-scan.mjs` | 0 HARD / 0 WARN；扫描器的 app source 范围未覆盖 scripts，故另跑 scoped Ultracite 与 tsc |
| `node scripts/gpuix-review-scan.mjs --absolute-paths` | 817 个 Git 跟踪源文件，0 HARD / 0 WARN |
| 三个代码 commit 的 Ultracite hook | 均通过，没有 `--no-verify` |
| `swift scripts/release/icon.swift <png> <palette-colors>` 与 `sips -g pixelWidth -g pixelHeight <png>` | 修订后的显式 bitmap 生成器通过，PNG为1024×1024；Swift-only commit 的 hook 无匹配 lint 文件，未声称 Ultracite lint 了 Swift |

本地没有运行完整 `pnpm verify:gpuix`，遵守协调者转发的用户最新指令：完整门禁、最终发布包与 Windows 构建在 `main` 的 GitHub Actions 上运行。本切片无 Rust 源码改动，不另跑 `cargo check/test`；没有新增永久行为测试，验证入口是可重跑 compiled smoke。

## 自审结果

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| `runner.workspace` 不是合法 GitHub context | 汇报仲裁 | 已 ask，协调者同意并在 `7839828d` 统一修 CI；本切片 release 使用 env 路径，W1 由协调者通知 | actionlint 初次两条 expression ERROR，修改后通过 |
| 静态包名 plugin 漏掉测试模块的 `../index.js` | 必修 | 增加两个 loader 实际路径的 onLoad，仍不改 vendor | 最终 compiled smoke 成功 |
| 用户目录文案不能按产品名猜测 | 必修 | 按真实 `userDirectories()` 改为 `com.zoeydaw.desktop`；最终 bundle identifier 使用既有 app id | `smoke.json`、native settings APP_DIR |
| 后台无法提供前台视觉帧 | 汇报仲裁 | 协调者接受离屏/后台证据，承担最终前台截图 | Orca 协调者对首次验收问题的 reply |
| 打包遗漏既有分发许可证 | 必修 | 补 root 与 gpuix notices 到 Resources/licenses，packaging-only 重跑并逐文件比对 | `notice-packaging.json` 五项 bytesMatch=true |
| `NSImage.lockFocus` 的像素尺寸依赖显示器 scale | 必修 | 换显式 1024×1024 bitmap，去掉 TIFF 复制 | `icon-fixed.png`、Swift运行成功、sips尺寸输出 |

独立只读 `reviewer` 已审完整 `git diff d0db74c..HEAD -- scripts/release .github/workflows/release.yml README.md docs/agents/setup.md` 与四个代码提交。Standards 与 Spec 两轴均无发现，必修、汇报仲裁、记录均为 0；审查还只读核对 cargo-packager 的同名 app/DMG 重建行为。首次强制派发的 `pstack-reviewer` 路由只完成 skill 读取后挂起，已取消并由 `ReleaseReviewRetry` 完成替代审查。审查者没有运行检查或修改文件，上面的实测结果均由本 worker 执行。

## UI 第 13 节与产品参照

没有修改应用控件、布局、主题入口或交互语义。可见新增仅应用图标，已查看生成 PNG。

| 检查 | 结论与证据 |
| --- | --- |
| Gallery 与业务整体布局 | 未改 Gallery；已查看独立 compiled Home 与 Arrangement 完整组合截图，前台整体评审由协调者完成 |
| 跨区域对齐与居中 | 沿用既有 AppShell 与业务组件，未新增布局尺寸；不声明额外 UI 修正 |
| 间距与内边距 | 未改 token 或业务实例样式 |
| 统一设计入口 | 占位图标颜色读取 Default preset，应用样式无第二份入口 |
| 尺寸与紧凑感 | 未改控件度量；图标 PNG 明确为 1024×1024 |
| 深浅主题与中英文 | 独立运行验证 dark/en-US；未做本切片的完整深浅/双语言视觉验收，不改变既有覆盖结论 |
| 状态与键盘 | Home create 原生 Enter 激活；播放/停止调用真实工程动作，未改快捷键行为 |
| 拖动、滚轮、弹层与性能 | 未改这些路径；后台 footprint 不是前台帧性能证明 |

| 产品规则 | Live 观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 独立安装包与 draft release | 没有对应的 Live 产品交互；未操作用户 Live 工程 | 原生 app/DMG 与 draft-only pipeline | 未签名、未公证 |
| 新建、播放、停止 | 本切片不新增或改变这些既有行为，因此没有重复操作 Live | 复用 AppShell、projectActions、真实 Rust backend | 空工程 clock 已验证，可听素材与前台交互不在本轮证据内 |

## 错题

- 错：只处理 `@gpuix/native` 包名导入，就认为所有 renderer 调用都绕过生成 loader。对：测试 renderer 还有内部相对 `../index.js`，必须覆盖实际 loader 路径。因：Bun plugin 的包名 onResolve 不会匹配相对导入。
- 错：把 `RUNNER_WORKSPACE` 环境变量当作 `runner.workspace` expression context。对：用 shell 写 `GITHUB_ENV`，cache action 读 `env`。因：GitHub 的 runner context 没有 workspace 字段，actionlint 可确定性拦截。
- 错：按 `zoeydaw` 猜用户目录。对：先读原生 `userDirectories()`；既有目录名是 `com.zoeydaw.desktop`。

## 已验证做法

- 用静态 require 把两个 `.node` 嵌入 Bun，可在没有 `node_modules` 的外部目录加载真实 native，且不改 vendor。
- cargo-packager 可直接包装现有 Bun 可执行文件，`formats: ["app", "dmg"]` 成功生成两种产物；ditto 生成 `.app.zip`，SHA-256 清单可复核。
- 同一 bundler 编译的离屏可执行程序，可在独立 cwd 中验证真实 Rust sample clock、原生像素、session 释放；不是依赖仓库模块路径的伪 smoke。
- `open -g` 配合应用自身 `GPUIX_BACKGROUND=1` 可验证真实安装包启动而不抢前台；观察后立即终止自己的 app PID 和 launcher service。

## 未验证与交接

- 未触发 GitHub Actions、未创建 draft、未上传远程资产。协调者合入 `main` 后推测试 tag，检查完整 gate、draft/Pre-release 标志与 `.dmg`、`.app.zip`、SHA-256 资产。
- `0.1.0-alpha.1` manifest/app 展示版本由协调者统一同步。本机早期包是 `0.0.0`，不能当作首个远程版本。
- 最终前台 Home 与 Arrangement 播放截图、前台稳定 footprint 交由协调者；本轮后台测量不冒充该结果。
- macOS 13 只是二进制声明的最低系统，未实机验收旧系统；Intel、Windows、自动更新不在本切片交付范围。

## 进程清理

`p1-compiled-probe` 在观察后通过 `proc://p1-compiled-probe/kill` 关闭。`open -g` 启动的拷贝 app PID `72231` 已终止，launcher service `p1-open-package` 随后退出 0 并释放。compiled smoke 的临时程序自然退出，runner 的 finally 删除目录。

交付前执行以下规定命令，输出为空，grep 退出码为 1，表示零匹配。记录见 `dist/release-evidence/process-cleanup.txt`。

```bash
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

未启动或停止用户已有服务，没有调用 `computer.control.acquire`。

## 上游依据

- [Bun executable native addon embedding](https://github.com/oven-sh/bun/blob/main/docs/bundler/executables.mdx)：Context7 查询确认 `.node` 需要静态 require，最终方案另以实际独立可执行验证。
- [cargo-packager README](https://github.com/crabnebula-dev/cargo-packager/blob/main/README.md) 与 [configuration schema](https://github.com/crabnebula-dev/cargo-packager/blob/main/crates/packager/schema.json)：复用 app/DMG 格式、现有 binary、resources 映射。
- [Zed release workflow](https://github.com/zed-industries/zed/blob/main/.github/workflows/release.yml) 与 [bundle-mac](https://github.com/zed-industries/zed/blob/main/script/bundle-mac)：查阅当前上游的 tag workflow 与 macOS bundle 流程；本项目按用户决定省去 Developer ID、公证和自动公开发布。
- [GitHub hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)：当前 `macos-15` 是 arm64 runner；release 仍在脚本入口拒绝非 darwin-arm64 宿主。
