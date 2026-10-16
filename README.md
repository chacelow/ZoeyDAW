# zoeydaw

原生 DAW。`apps/gpuix` 使用 React 逻辑与 gpuix 原生渲染，`crates/native` 提供 Rust napi 平台能力，`crates/engine` 拥有音频播放引擎。gpuix 是唯一产品入口，旧 Web、Tauri 与共享包工作区已删除。

已有首页、单项目面板、Browser、Arrangement 与 Audio/MIDI/Pattern 编辑界面；工程状态通过 adapter 接入真实原生后端，设置、日志和快照使用原生存储。已实现与未实现的产品范围见 [产品范围](docs/product-prototype.md)，不把插件 host 或 `.als` 导入视为已完成。

## 安装

macOS arm64 安装包由 [Release 流水线](.github/workflows/release.yml) 构建为 draft，维护者手动发布后可在 [GitHub Releases](https://github.com/chacelow/ZoeyDAW/releases) 下载。尚未运行远程流水线不代表已有可下载版本。

打开 `.dmg`，把 `zoeydaw.app` 拖到「应用程序」；或解压 `.app.zip` 后移动应用。首版不使用 Developer ID 签名、不公证。首次打开用右键 →「打开」；仍被拦截时，确认下载来源后运行：

```bash
xattr -dr com.apple.quarantine /Applications/zoeydaw.app
```

不要全局关闭 Gatekeeper。校验资产、用户数据目录与已知限制见 [安装说明](scripts/release/NOTES.md)，本机打包与 tag 流程见 [打包与发布](docs/agents/setup.md#打包与发布)。图标为占位，可替换。

## 开发

新 checkout 在根目录依次执行：

```bash
bash scripts/gpuix-main/build.sh
pnpm install --frozen-lockfile
pnpm native:build
pnpm verify:gpuix
```

开发窗口：

```bash
pnpm --filter @zoeydaw/gpuix-prototype dev
```

工具链、固定渲染器构建、热更新与原生重启规则见 [setup](docs/agents/setup.md)。Node 版本以根 `package.json` 为准，pnpm 使用项目固定版本；当前自建渲染器的验收平台是 macOS arm64。

## 结构

```text
apps/gpuix/src/app/          应用外壳、路由与组合根
apps/gpuix/src/project/      工程模型、store、adapter 与业务面板
apps/gpuix/src/ui/           共享原生控件与面板
apps/gpuix/src/shared/theme/ 主题、预设与共享度量
apps/gpuix/src/platform/     原生端口、i18n 与日志
crates/native/              Rust napi 桥与平台能力
crates/engine/              音频引擎
```

跨目录导入使用 `@/` 指向 `apps/gpuix/src`；依赖方向由 ESLint 强制，见 [gpuix 架构](docs/architecture/gpuix.md)。

## 工程与编排

工程文档、工作区偏好与临时会话分别由 [stores](apps/gpuix/src/project/stores/README.md) 管理；编辑事务、播放与保存边界见 [adapters](apps/gpuix/src/project/adapters/README.md)。Arrangement 的 timeline、tracks、lane 与 core 职责见 [组合契约](docs/architecture/gpuix-arrangement-composition.md)。共享面板与外观见 [面板契约](docs/architecture/project-panels.md)。

License: Apache-2.0。
