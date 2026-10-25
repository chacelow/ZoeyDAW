---
name: commit-checklist
description: 每个 Feature、Bug 修复或独立阶段完成后提交前使用；核对 staged 范围、敏感信息、项目契约及实际验证，再自动本地 commit。
---

# 阶段提交检查

由当前主 Agent 顺序执行。每个可独立验证阶段完成后自动本地 commit，无需确认口令或环境变量。具体提交规则以 [setup](../../../docs/agents/setup.md#按-feature-或阶段提交) 为准。

1. 检查当前工作区和 index，识别本阶段文件与其他 Session 的工作。只暂存本阶段；已有他人暂存内容保持不变，必要时使用独立 index。
2. 阅读完整 staged diff，排除 secrets、token、私有路径载荷、缓存、临时产物及无关功能。发现问题先修复，不重置他人改动。
3. 对照 [AGENTS.md](../../../AGENTS.md)、[模块契约](../../../docs/architecture/modules.md) 和实际需求，检查状态所有权、公开面、资源释放、共享 UI/token、i18n 及跨语言契约。按需读对应文档，不复制其他产品的约束。
4. 删除当前改动引入的重复实现、无依据抽象和兼容路径；保留有效行为测试。缺少第二个调用方不自动意味着一个隔离边界应被内联。
5. 运行受影响路径的检查，复用本阶段已经通过且未失效的结果，不为提交重复运行全套测试。实现验证与待用户操作的桌面验收分开记录，不伪报通过。
6. 主 Agent 自审 Standards 与需求覆盖；修复实际问题。提交标题描述一个 Feature、Bug 或阶段，正文记录改动原因、验证与剩余验收边界。
7. 使用正常 `git commit`。pre-commit 运行 lint-staged，commit-msg 检查职责；失败先修复，不默认使用 `--no-verify`。本地 commit 不自动 push、发布或部署。

完成条件是本阶段已形成可审查提交、未混入其他工作，原 todo 与 Bug 验收仍保留。
