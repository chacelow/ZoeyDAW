# F3 自审结果

## 扫描与独立视角

第一次已提交实现的 `node scripts/gpuix-review-scan.mjs`：5 source、4 test，0 HARD、0 WARN。独立只读 `pstack-reviewer` 同时按 Standards 与 Spec 审查，Standards 实现缺陷 0、Spec 实现缺陷 0；提出两项待闭合运行证据。后续接合 F4/F4b 与新增消费者的最终复核另以最终提交为准。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| 正式表格仅有基线，first-attempt 不代表最终 CPU/帧行为 | 汇报仲裁 | 协调者批准重测；已补干净版本前台/后台各 12 秒与全部场景，区分后续 F4 接合的 headless 范围 | `after-2026-10-15.jsonl`、`after-summary-2026-10-15.json` |
| 最小化恢复证据不能代替纯遮挡且失活的恢复 | 汇报仲裁 | 协调者批准补纯遮挡场景；5/5 首 submission 严格相等，五次均确认 key=false/occlusionVisible=true | `present-uncover-2026-10-15.txt`、`uncover-state-2026-10-15.jsonl` |
| 强制 draw fixture 杀不死遗漏失效的变异 | 必修 | 新增真实 GPUI dirty-gated redraw 回归，不手工实现 dirty 判断；变异让第二次机会仍是旧 scene | `mutations-2026-10-15.json`、`resumed_commit_is_visible_through_dirty_gated_gpui_redraws` |
| 停止播放后 hold/decay 仍 active 时未订阅恢复 | 汇报仲裁 | 协调者批准 `playing |  | active`，复用唯一 driver；实际 headless meter 回归与变异覆盖，动画耗尽两类需求均为 0 | `TrackMeter.test.tsx` |
| F4 `setQuads` 与“only applyBatch”旧文案不一致 | 汇报仲裁 | 协调者批准安全 retained batch setters；更新文案并验证新几何，移除失效调用时仍绘旧 x=0，变异失败 | `quad-resume-mutation-2026-10-15.json` |
| upstream renderer 超过 600 行 | 记录 | 原文件已经远超 1000，本次没有跨越禁止阈值；恢复状态集中为具名状态机，glue 直接依赖既有私有 Window/App/thread-local owner。拆迁 upstream monolith 会扩大 rebase 面，独立 reviewer 未要求拆分 | `resume-frame.patch`、独立 Standards 审查 |
| 桌面相对 TTL 未绑定授权绝对结束 | 必修 | 停止并清理全部自启窗口；入口新增绝对 UTC deadline fail-closed、输入前检查与进程到期退出。已列错题与 LESSONS 候选，不再开桌面 | `desktop-deadline.test.ts`、`deadline-fail-closed-2026-10-15.txt` |

## 审查范围与底线

审查包含 `gpuix.md` 代码质量底线、UI 规范、Arrangement 组合契约与 LESSONS；未发现新增 any、逃逸 cast、产品 mock、跳过测试、TODO 或 JS 替代帧链。平台不依赖 project/renderer；消费侧显式 flushSync；普通帧仍 deferred；窗口引用 retain/release 配对，关闭后清理回调与指针。

最终运行报告必须准确区分：GPUI submission 与 GPU 扫出、JS 已交付样本与音频线程待交付样本、F3 桌面数据与 F4/F4b 接合后的 headless 证明。生成 PNG 按最新规则只留本地忽略目录，不以截图矩阵或数量作为验收。

## 最终关闭

产品 HEAD `ee47dbe` 的最终扫描为 8 source、5 test，0 HARD、0 WARN。独立 reviewer 对 `d57b07b..ee47dbe` 及最终证据增量复核后，Standards 通过、Spec 通过，剩余真实缺陷 0；原两项证据缺口关闭。最新完整 Bun 为 1067 pass、1 todo、0 fail；F4b 四类 oracle 已在最终 vendor 293 tests 中实际通过，quad 模块单独 6 pass。没有把主代理门禁冒称为 reviewer 独立复跑。
