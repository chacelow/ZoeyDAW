---
name: implement
description: 按当前项目契约实现已明确的 Feature、Bug 或任务阶段，并完成定向验证和本地提交。
disable-model-invocation: true
---

# 实施阶段

1. 阅读已加载的 `AGENTS.md`、`LESSONS.md` 及本次范围对应契约。源码结构遵守全局 `project-structure-discipline`，不重复建立工程状态或同步 owner。
2. 由当前主 Agent 独立调查、设计、实现与自审。新需求追加到原 todo；保留此前任务、Bug、已完成证据和阻塞原因，不初始化另一份清单覆盖它们。
3. 按可独立验证的行为划分阶段。先读调用链并复用已有实现，修根因；有便宜且有效的回归 seam 时使用 TDD。
4. 运行实际受影响路径及必要的类型或编译检查；UI 使用用户持有的应用验证。Agent 不启动或重启 `tauri:dev`，需要原生重启时告知用户并保留验收 todo。
5. 阶段完成后执行本项目 `commit-checklist`，自动本地 commit。沿用已经通过且仍有效的检查，不反复运行全套测试，不等待口令。远程与不可逆操作另行确认。
6. 报告本阶段提交、实际验证和未验收边界，再继续可执行的后续阶段。
