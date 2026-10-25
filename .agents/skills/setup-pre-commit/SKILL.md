---
name: setup-pre-commit
description: 用户要求安装或修改 Husky、lint-staged 或提交检查时使用，优先保留本仓库已有工具链。
---

执行全局 [setup-pre-commit](/Users/caishilong/.agents/skills/setup-pre-commit/SKILL.md)，并先读取本仓库 `docs/agents/setup.md`。

本仓库已有 Husky、lint-staged 与 Ultracite，不重新 init、不覆盖现有配置、不增加整套重复检查。只改本次明确需要的门禁，依赖变更按项目授权执行。阶段完成自动本地 commit，不引入用户确认口令，不自动 push。
