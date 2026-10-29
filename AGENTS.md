# zoeydaw

Web-UI DAW。React 实现界面与交互，Tauri 承载桌面壳，唯一 Tracktion Engine 提供原生音频播放，Rust 核心提供工程存储、媒体分析和 Browser。Gallery 与行为测试显式注入 mock。当前能力及验收边界见 [产品范围](docs/product-prototype.md)；包名与版本以 manifest 为准。

## 开工与必读路由

开工先扫 [LESSONS.md](LESSONS.md)，再按本次修改范围读取契约，不把所有文档全文加载：

| 修改范围 | 动手前必读 |
| --- | --- |
| 命令、工具链、HMR、原生重启或提交 | [setup](docs/agents/setup.md) |
| 新模块、多文件修改、状态/目录/依赖调整 | [modules](docs/architecture/modules.md) |
| 工程数据、编辑事务、保存或后端接口 | [stores](apps/web/src/pages/project/stores/README.md) 与 [adapters](apps/web/src/pages/project/adapters/README.md) |
| Panel、共享控件、token、Canvas 布局 | [project-panels](docs/architecture/project-panels.md) 与 `apps/web/src/pages/project/ProjectLayout.tsx` |
| 原型范围、Rust/插件/文件格式方向 | [product-prototype](docs/product-prototype.md) |

## 开发执行方式

本仓库由当前主 Agent 独立完成调查、设计、实现、审查与验证。禁止启动或委派 subagent，包括 scout、并行候选、独立 reviewer 和外部模型 CLI；Skill 中的相关步骤改为主 Agent 顺序执行。只有用户在当前任务明确要求恢复时才启用。保留其他 Session 的工作与用户持有的服务。

编写和修改源码先读全局 `project-structure-discipline` Skill，项目状态与依赖边界见 [modules](docs/architecture/modules.md)。`pnpm check:file-size --report` 显示当前超长文件；检查基线只用于存量追踪，不构成超过 800 行继续追加的授权。

## 不可破的边界

- **Never**：提交 secrets/token/API key；误停其他项目或无关的用户服务。
- **Always**：复用共享 UI 包及其 token；跨文件重命名用 LSP；保留其他 Session/Agent 的未提交与暂存工作。Agent 负责检查、启动并保持本项目 `tauri:dev`，错误修复后等待热更新或恢复进程；流程见 [setup](docs/agents/setup.md#开发应用由-agent-维护)。
- **Ask first**：修改 `src-tauri/tauri.conf.json`、共享 UI 公共 API、新增 npm 依赖或 `.github/workflows/`。
- 修改 Rust、原生配置、capabilities、Cargo 依赖或 plugin 注册后，由 Agent 等待原生重编译与应用恢复；需要重启时自行执行并验证就绪，不再等待用户启动。
- 每个独立 Feature 或阶段通过受影响检查后自动做本地 commit，不再等待确认；范围与门禁见 [setup](docs/agents/setup.md#按-feature-或阶段提交)。push、发布、部署和不可逆操作另行确认。

## 设计与完成门槛

多文件/新模块先定数据 owner、生命周期、接口、文件职责与验收，再写代码；细则见 modules。单次 plan 留在 Session，持久文档只保存契约与可复用经验。所有可验证的业务实现必须同时提供一个不依赖 WebUI 的 CLI 子功能。CLI adapter 是该功能的原子验收入口，直接调用同一 Rust/native adapter、请求 schema 和状态 owner；不得复制一套只服务测试的业务逻辑。

CLI adapter 必须完成准备、动作、结果断言和资源释放，成功输出机器可读结果，失败使用非零退出码。验证不得依赖坐标点击、WebView timer、固定 sleep 或模拟 meter。Web adapter 与 CLI adapter 只负责边界映射，核心规则、事务、队列、音频时钟和错误语义由 Rust/native owner 共享。

性能验收优先走 CLI adapter 的 typed/native 路径，记录真实 callback、队列、PCM、meter、延迟和资源释放指标；WebUI 只做最后的呈现与交互验收，不作为唯一功能证明。

相关类型、测试与工具链检查通过后，UI 还须在已有应用/页面上验证主路径并观察实际结果。只报告运行过的验证；不把模拟电平、接口或占位能力称为已接通的音频引擎。稳定契约变化更新对应文档，反馈错题进入 LESSONS。
