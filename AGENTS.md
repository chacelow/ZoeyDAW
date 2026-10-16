# zoeydaw

DAW，使用 gpuix 原生应用：`apps/gpuix`（React 逻辑 + gpuix 原生元素）与 `crates/native`、`crates/engine`（Rust napi 与真实引擎）。旧 Web/Tauri 应用及共享 packages 已删除；主题度量、i18n 与日志由 gpuix 应用内模块持有。产品范围与长期清单见 [产品范围](docs/product-prototype.md)。包名与版本以各 `package.json` 为准。

## 开工与必读路由

开工先扫 [LESSONS.md](LESSONS.md)，再按本次修改范围读取契约，不把所有文档全文加载：

| 修改范围 | 动手前必读 |
| --- | --- |
| `apps/gpuix`、`crates/*` 的任何改动 | [gpuix 架构与切片契约](docs/architecture/gpuix.md) |
| 可见界面：控件、面板、间距、居中、尺寸、紧凑感、颜色、状态、拖动、弹层、键盘焦点 | [gpuix UI 规范](docs/architecture/gpuix-ui-standards.md)，交付按其第 13 节逐条给证据 |
| 自动化或验收要找入口、路由、环境开关、`testId` | [gpuix UI 地图](docs/architecture/gpuix-ui-map.md)（脚本生成，不要手改） |
| Arrangement 的 `tracks`、`lane`、`timeline`、`core` 之间的接口与键盘 owner | [Arrangement 组合契约](docs/architecture/gpuix-arrangement-composition.md) |
| 渲染器版本、构建、`@gpuix/*` 依赖、关闭拦截 | [主干自建报告](docs/research/gpuix-main-build.md) |
| 引擎、音频播放、遥测、峰值、`ProjectBackend` | [播放图选型](docs/research/engine-playback-graph.md) 与 `apps/gpuix/src/project/adapters/README.md` |
| 协调者会话、派发切片、review 与合入、决策权 | [gpuix 重构的协调方式](docs/agents/coordination.md) |
| 命令、工具链、HMR、原生重启或提交 | [setup](docs/agents/setup.md) |
| 新模块、多文件修改、状态/目录/依赖调整 | [modules](docs/architecture/modules.md) |
| 任何颜色、尺寸、间距、字体、动效、文案、默认值、阈值、快捷键（不写死，统一来源） | [统一配置契约](docs/architecture/configuration.md) |
| 工程数据、编辑事务、保存或后端接口 | `apps/gpuix/src/project/stores/README.md` 与 `apps/gpuix/src/project/adapters/README.md` |
| 产品范围、长期功能清单、Rust/插件/文件格式方向 | [产品范围](docs/product-prototype.md) |

## 不可破的边界

- **Never**：提交 secrets/token/API key；停止用户自己启动的应用或服务。
- **Always**：复用 `apps/gpuix/src/ui` 的公共组件与 `shared/theme` 的 token；跨文件重命名用 LSP；保留其他 Session/Agent 的未提交与暂存工作。
- **决策默认归 Agent**（2026-10-15 用户原话：“你不是作为转发的，你是作为决策性 approve 和 review 的，只有重大事件再向我汇报”）。问用户只限下面这张封闭清单，清单外的一切（包括没想到的新情况、规则没写到的灰色地带）都由协调者自己判断、执行，在汇报里写明理由：
  - 不可撤回或影响外部：PR、发布、强推或推 `main` 以外的分支（满足下方“推送授权”条件的 `main` 快进推送除外）、删除用户自己的文件或数据、改系统设置、改 Live 工程内容。
  - 改变方向：偏离产品规则或交互语义、推翻已定架构。
  - 新增 npm/Rust 依赖、`.github/workflows/`。
  - Agent 物理上做不到、必须用户本人操作的事（如账号登录）；汇报里说明为什么做不到。
- 拿不准时按三问自己判：能不能撤回？会不会动到用户的数据或外部？是不是改方向？三个都是否就直接做。规则之间冲突或没覆盖到，选更保守、可撤回的做法，事后把判断补进规则，不停下来等用户。worker 卡在工具或权限上，先查以前切片的做法给出路线。细则见 [协调方式](docs/agents/coordination.md)。
- gpuix 的验证窗口由 Agent 自己用 `bun --hot` 启动，验证完立即关闭；Rust 改动重跑 `pnpm native:build` 后重启自己的窗口，不要求用户重启其服务。
- 提交授权：`gpuix-migration` 及其切片分支的本地提交已由用户授权（2026-10-14 12:40 UTC，撤销逐次“我确认”）；`main` 与其它分支仍须用户在本次提交上下文说 **“我确认”**。细节见 setup。
- 推送与验证（用户 2026-10-16）：本机性能不足，完整门禁 `pnpm verify:gpuix`、打包与 Windows 构建都放在 GitHub Actions 上跑，只在 `main` 上跑，不推其它分支。worker 与协调者本地只跑轻量检查：`tsc --noEmit`、改动文件的 eslint 与相关 `bun test`、必要的单窗口 smoke；单个本地检查超过 1 分钟就不进日常流程（用户 2026-10-17）。测试只写核心与主流程（见 gpuix 架构「测试范围」）。把 `gpuix-migration` 推到 `chacelow/ZoeyDAW` 的 `main` 满足“快进、轻量检查全过、密钥与 >2MB 文件扫描通过”即可直接推，不逐次询问；推后看 Actions，红了在 `main` 上向前修，不回滚改写历史。每次推完在汇报里写明推送范围与 CI 结果。强推、改写历史、推其它分支或发布正式版仍须先问。
- 派发复用 lane（用户 2026-10-16）：worker 是长期保留的 lane（gpuix-migration 子 worktree 加它的 omp 终端），新任务和返工用 `scripts/orchestration/lane.sh assign` 派给空闲 lane 的同一个 agent，保留它读过的上下文；只有并行不够时才 `lane.sh new`。切片合入后不删 worktree、不关终端。细则见 [协调方式](docs/agents/coordination.md)「派发」「合入后」。

## 设计与完成门槛

多文件/新模块先定数据 owner、生命周期、接口、文件职责与验收，再写代码；细则见 modules。单次 plan 留在 Session，持久文档只保存契约与可复用经验。

相关类型、测试与工具链检查通过后，UI 还须在真实 gpuix 窗口验证主路径并观察实际结果。只报告运行过的验证；不把元数据、接口或占位能力称为已接通的功能。稳定契约变化更新对应文档，反馈错题进入 LESSONS；用户后来的指令取代旧条款时，直接改写旧条款，不在旁边叠加例外。
