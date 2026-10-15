# zoeydaw

DAW，正在从 Web + Tauri 重构为 gpuix 原生应用：`apps/gpuix`（React 逻辑 + gpuix 原生元素）与 `crates/native`、`crates/engine`（Rust napi 与真实引擎）。`apps/web`、`packages/**`、`src-tauri` 只作迁移参考，迁移完成后删除，新工作不往里加。产品范围与长期清单见 [产品范围](docs/product-prototype.md)。包名与版本以各 `package.json` 为准。

## 开工与必读路由

开工先扫 [LESSONS.md](LESSONS.md)，再按本次修改范围读取契约，不把所有文档全文加载：

| 修改范围 | 动手前必读 |
| --- | --- |
| `apps/gpuix`、`crates/*` 的任何改动（gpuix 原生重构，取代 web 与 Tauri） | [gpuix 架构与切片契约](docs/architecture/gpuix.md) |
| 可见界面：控件、面板、间距、居中、尺寸、紧凑感、颜色、状态、拖动、弹层、键盘焦点 | [gpuix UI 规范](docs/architecture/gpuix-ui-standards.md)，交付按其第 13 节逐条给证据 |
| Arrangement 的 `tracks`、`lane`、`timeline`、`core` 之间的接口与键盘 owner | [Arrangement 组合契约](docs/architecture/gpuix-arrangement-composition.md) |
| 渲染器版本、构建、`@gpuix/*` 依赖、关闭拦截 | [主干自建报告](docs/research/gpuix-main-build.md) |
| 引擎、音频播放、遥测、峰值、`ProjectBackend` | [播放图选型](docs/research/engine-playback-graph.md) 与 `apps/gpuix/src/project/adapters/README.md` |
| 协调者会话、派发切片、review 与合入、决策权 | [gpuix 重构的协调方式](docs/agents/coordination.md) |
| 命令、工具链、HMR、原生重启或提交 | [setup](docs/agents/setup.md) |
| 新模块、多文件修改、状态/目录/依赖调整 | [modules](docs/architecture/modules.md) |
| 工程数据、编辑事务、保存或后端接口 | `apps/gpuix/src/project/stores/README.md` 与 `apps/gpuix/src/project/adapters/README.md` |
| 产品范围、长期功能清单、Rust/插件/文件格式方向 | [产品范围](docs/product-prototype.md) |
| 只读参考旧 Web/Tauri 实现时 | [project-panels](docs/architecture/project-panels.md)、`apps/web/src/**`（不修改） |

## 不可破的边界

- **Never**：提交 secrets/token/API key；停止用户自己启动的应用或服务（包括 `tauri:dev`）。
- **Always**：复用共享 UI 包及其 token；跨文件重命名用 LSP；保留其他 Session/Agent 的未提交与暂存工作。
- **Ask first**：新增 npm/Rust 依赖、`.github/workflows/`、push/PR/发布、改系统设置、改 Live 工程内容。其它技术决定（含共享 UI 公共 API）由协调者决定，范围见 [协调方式](docs/agents/coordination.md)。
- gpuix 的验证窗口由 Agent 自己用 `bun --hot` 启动，验证完立即关闭；Rust 改动重跑 `pnpm native:build` 后重启自己的窗口，不再提示用户重启 `tauri:dev`。
- 提交授权：`gpuix-migration` 及其切片分支的本地提交已由用户授权（2026-10-14 12:40 UTC，撤销逐次“我确认”）；`main` 与其它分支仍须用户在本次提交上下文说 **“我确认”**。细节见 setup。

## 设计与完成门槛

多文件/新模块先定数据 owner、生命周期、接口、文件职责与验收，再写代码；细则见 modules。单次 plan 留在 Session，持久文档只保存契约与可复用经验。

相关类型、测试与工具链检查通过后，UI 还须在真实 gpuix 窗口验证主路径并观察实际结果。只报告运行过的验证；不把元数据、接口或占位能力称为已接通的功能。稳定契约变化更新对应文档，反馈错题进入 LESSONS；用户后来的指令取代旧条款时，直接改写旧条款，不在旁边叠加例外。
