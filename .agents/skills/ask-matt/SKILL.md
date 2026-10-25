---
name: ask-matt
description: 为当前项目选择一个必要的工作流程，避免多个 Skill 重复驱动同一任务。
disable-model-invocation: true
---

# 选择工作流程

项目入口以已加载的 `AGENTS.md` 为准。当前主 Agent 顺序执行；保留原 todo，不为使用流程清空会话、启动其他 Agent 或强制配置 issue tracker。

| 当前目标 | 主要流程 |
| --- | --- |
| 明确的 Feature 或阶段实现 | `implement`，结构遵守全局 `project-structure-discipline` |
| 故障或性能回退 | `diagnosing-bugs`，建立实际反馈路径并修根因 |
| 审查工作区、branch 或 PR | `code-review`，顺序核对 Standards 与 Spec |
| 模块接口与状态归属 | `codebase-design`，需要用户产品取舍时才用 `grilling` |
| 一手事实调研 | `research`，默认当前 Agent 调研，按需保存结论 |
| 验证未确定的状态或交互 | `prototype`，实际运行后保留结论、清理临时实现 |
| 编写或维护 Skill | 全局 `writing-for-agents` |
| 提交阶段 | 项目 `commit-checklist`，检查后自动本地 commit |

`to-spec`、`to-tickets`、`wayfinder`、访谈和交接只在用户需要该产物时使用，不是每项开发的必经流程。旧 `writing-great-skills` 仅保留为全局写作入口别名。
