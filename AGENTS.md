# zoeydaw

Web-UI DAW，正在重构为 gpuix 原生应用（`apps/gpuix` + `crates/*`），`apps/web` 与 `src-tauri` 在迁移完成后删除。React 做交互，Tauri 承载桌面壳；当前是单项目 Web 原型，adapter 提供模拟数据、时钟和本地快照，没有真实音频引擎或工程文件系统。产品范围见 [原型策略](docs/product-prototype.md)。包名与版本以各 `package.json` 为准。

## 开工与必读路由

开工先扫 [LESSONS.md](LESSONS.md)，再按本次修改范围读取契约，不把所有文档全文加载：

| 修改范围 | 动手前必读 |
| --- | --- |
| `apps/gpuix`、`crates/*` 的任何改动（gpuix 原生重构，取代 web 与 Tauri） | [gpuix 架构与切片契约](docs/architecture/gpuix.md) |
| 可见界面：控件、面板、间距、居中、尺寸、紧凑感、颜色、状态、拖动、弹层、键盘焦点 | [gpuix UI 规范](docs/architecture/gpuix-ui-standards.md)，交付按其第 13 节逐条给证据 |
| Arrangement 的 `tracks`、`lane`、`timeline`、`core` 之间的接口与键盘 owner | [Arrangement 组合契约](docs/architecture/gpuix-arrangement-composition.md) |
| 渲染器版本、构建、`@gpuix/*` 依赖、关闭拦截 | [主干自建报告](docs/research/gpuix-main-build.md) |
| 引擎、音频播放、遥测、峰值、`ProjectBackend` | [播放图选型](docs/research/engine-playback-graph.md) 与 `apps/gpuix/src/project/adapters/README.md` |
| 命令、工具链、HMR、原生重启或提交 | [setup](docs/agents/setup.md) |
| 新模块、多文件修改、状态/目录/依赖调整 | [modules](docs/architecture/modules.md) |
| 工程数据、编辑事务、保存或后端接口 | [stores](apps/web/src/pages/project/stores/README.md) 与 [adapters](apps/web/src/pages/project/adapters/README.md) |
| Panel、共享控件、token、Canvas 布局 | [project-panels](docs/architecture/project-panels.md) 与 `apps/web/src/pages/project/ProjectLayout.tsx` |
| 原型范围、Rust/插件/文件格式方向 | [product-prototype](docs/product-prototype.md) |

## 不可破的边界

- **Never**：提交 secrets/token/API key；Agent 启动、重启 `tauri:dev` 或停止用户已有应用。
- **Always**：复用共享 UI 包及其 token；跨文件重命名用 LSP；保留其他 Session/Agent 的未提交与暂存工作。
- **Ask first**：修改 `src-tauri/tauri.conf.json`、共享 UI 公共 API、新增 npm 依赖或 `.github/workflows/`。
- 修改 Rust、原生配置、capabilities、Cargo 依赖或 plugin 注册后，明确告诉用户“需要重启 tauri:dev”，由用户操作。
- 每次 commit 都须用户在本次提交上下文明确说 **“我确认”**，历史授权不延续；门禁细节见 setup。

## 设计与完成门槛

多文件/新模块先定数据 owner、生命周期、接口、文件职责与验收，再写代码；细则见 modules。单次 plan 留在 Session，持久文档只保存契约与可复用经验。

相关类型、测试与工具链检查通过后，UI 还须在已有应用/页面上验证主路径并观察实际结果。只报告运行过的验证；不把模拟电平、接口或占位能力称为已接通的音频引擎。稳定契约变化更新对应文档，反馈错题进入 LESSONS。
