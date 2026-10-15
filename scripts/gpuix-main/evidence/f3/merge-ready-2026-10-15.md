# F3 merge-ready

## 结论与范围

恢复首帧同步路径已完成：普通帧仍 deferred；独立 resume 回调允许安全的 retained batch writes（`applyBatch`、F4 `setQuads`），原生读/借用 GPUI 的调用在该阶段抛明确错误，失效由当前 window/cx 在回调结束后应用。保留失活可见的节流、完全遮挡/最小化停帧，以及停止且动画耗尽时零帧需求；没有 JS 替代帧 timer。

已迁移消费者：tracks 电平 driver（`playing || active`，先 wake 再 advance）、PerformanceStatus（ordinary/resume 共用刷新逻辑与 predicate，暂停 popup 也同步显示最新 latency/time）。测试 frame adapters 的必选 resume 接口一次性迁完，普通 emit/step/count 含义不变。app composition 的永久订阅与 lane playhead 消费者由协调者交各自 owner，不将这些未迁路径冒充本切片完成。

产品代码提交为 `ee47dbe`，已包含合并基线 `d57b07b`，祖先包含 F4b `496a17d`。最终文档/工具提交的精确 HEAD 由 merge_ready/worker_done 消息提供。

## 实际运行证据

完整测量、原始数据、失败版本与复算命令见 [measurement](measurement-2026-10-15.md)。关键结果：

- 最小化主动恢复 5/5：首次 GPUI submission 的 scene/latest-delivered 为 193/193、385/385、578/578、770/770、962/962。
- 保持失活的纯遮挡恢复 5/5：206/206、426/426、646/646、870/870、1090/1090；五次均核对 key=false、occlusionVisible=true。
- 干净 F3 桌面样本：前台约 60Hz、失活可见约 22Hz；遮挡、最小化、停止无动画阶段计数不增长，但真实引擎遥测继续。前后台 CPU 各取 ≥12 秒；不把短样本差值宣称为优化。
- 证明的是 GPUI presentation submission，不是 GPU 扫出；latest 边界是同步回调时 JS 已收到的引擎样本，不包含尚未交付的音频线程样本。
- 桌面数据属于 F3 key-order 状态机版本、F4/F4b 接合前；之后仅做授权的 headless/代码/编译验证，不宣称测过接合后的桌面 CPU。

## F4b 最终补丁与产物

独立根：`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f3-gpuix`，没有改共享 vendor。十补丁的末尾顺序为 `context-menu.patch → quad-batch.patch → resume-frame.patch`，固定 gpuix/zed SHA 不变。

| 补丁                       | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| quad-batch.patch（含 F4b） | `50521d343f35f86ffd1fd3502e4d4be5024d25695ea11df9952d3735903cb003` |
| resume-frame.patch         | `d9340e770ed1b4887142aab2c59b0572db3a76f89a966db73f0d0482cacf995b` |

最终 vendor 全套为 293 pass；quad 模块单独 6 pass，输出明确包含 `fractional_position_matches_native_div`、`fractional_size_matches_native_div`、`stereo_lane_half_pixel_matches_native_div`、`fractional_host_origin_matches_native_div` 四类 oracle。旧 289 结果只属于旧 quad，未将其称作 F4b 验证。`setQuads` 恢复内新几何首绘与删除失效调用的反向变异均已验证。

## 门禁

| 位置 / 命令 | 实际结果 |
| --- | --- |
| 根：`pnpm native:build` | 已通过并加载真实本地二进制 |
| 根：`cargo check && cargo test` | 通过，51 tests / 4 suites |
| 根：`GPUIX_VENDOR_ROOT=… bash scripts/gpuix-main/build.sh` | 最终十补丁干净构建通过 |
| 根：`node scripts/gpuix-main/check.mjs --resolution` | 原生、host、React/reconciler/Zustand 单实例检查通过 |
| vendor：release `cargo check` 与 `cargo test --lib`，features `test-support,gpui_platform/runtime_shaders` | 通过，293 tests |
| vendor：同 features，`cargo test --lib quad_batch::tests` | 6 pass，含四类 F4b fractional oracle |
| apps/gpuix：`tsc --noEmit` | 通过 |
| apps/gpuix：`tsc --noEmit -p verification/tsconfig.json` | 通过 |
| frame / tracks meter / footer / transport / deadline 相关 Bun 回归 | 69 pass，54,940 assertions |
| apps/gpuix：完整 `bun test` | 1067 pass、1 todo、0 fail；170 files、1,103,212 assertions |
| 自有代码 Ultracite / 提交 hook | 已通过，无 `--no-verify` |

早期记录中的 tracks context-menu 基线失败已随主干同步消失；最终完整 suite 无失败。已有 todo 不属于本切片，未新增 skip/todo。

最终构建恢复全部临时插桩与变异，`git -C <vendor>/zed status --porcelain` 输出为空；生产补丁不改 zed。保留上游既有警告与旧 objc 宏的 `cargo-clippy` cfg 警告，不伪称零 warning。

## 回归与变异

- idle floor → 新 stereo telemetry：首 resume 同步提交；删除 wake 或 flushSync 都失败。
- stopped but held/decay active → 恢复到 floor → 两类需求均释放：退回仅 playing 时保留旧峰值并失败。
- paused PerformanceStatus popup：只发布新 telemetry，不喂普通帧；emitResume 后 retained readout 立即为 15ms、2 秒 sample time。移除消费侧 flushSync 时仍为 10ms、0.1 秒，变异失败。
- GPUI first paint / inactive-visible continuation / reentry guard：遗漏 resume dispatch、错误的 inactive 排除、取消文本读取 guard、要求等待 occlusion Visible，均被行为回归抓住。
- 原 forced-draw fixture 中遗漏 invalidation 曾存活；新增不强制 draw 的真实 GPUI dirty-gated redraw 回归后，同一变异第二次机会仍 `[[stale],[stale]]`，测试失败。因此失效分支必要，不删除。
- F4 retained quad 上传在 resume 中合法，画出新 `(4,6,32,20)`；删除 setter 的失效调用仍旧 x=0，变异失败。

## 自审结果

独立 reviewer 的 Standards / Spec 实现缺陷均为 0，原两项运行证据缺口已补齐。分类及处置见 [self-review](self-review-2026-10-15.md)。upstream renderer 原本远超 1000 行；本次保持具名恢复状态机及私有生命周期 glue 的局部补丁，未把小于 1000 的文件推过阈值；不为拆迁上游 monolith 扩大 rebase 面。

## UI 第 13 节：按最新组合验收规范限定结论

| 检查 | 结论 / 证据范围 |
| --- | --- |
| Gallery / 业务整体布局 | 没有改产品布局、共享控件或 token；真实独立 probe 运行与 AX 已验收，不将它当完整 DAW Gallery |
| 跨区域对齐、居中、间距 | 未改动；不声称做过新的产品几何评审 |
| 统一设计入口、尺寸、紧凑感 | 沿用 ThemeProvider；窗口外框是测试 viewport，不是新增控件尺寸 token |
| 深浅主题、中英文 | 本切片未新增产品样式/文案；未声称四组合视觉验收 |
| 状态、键盘、拖动、滚轮、弹层 | 未改这些交互；PerformanceStatus 仅复用原 popup 并更新数据时机，真实 headless Enter/paused popup 回归覆盖 |
| 性能与帧 | 实际 callback/stats/telemetry/CPU 与两类首 submission 数据见测量报告；不以 timer 数量冒充帧 |

生成 PNG 依 d57b07b 规则只留本地 ignored evidence，不 force-add、不生成逐按钮矩阵；Git 保留可重跑入口、文本/JSON 记录与简短结论。

## Live 对照边界

| 产品规则 | Live 观察 | 实现 | 差异 / 未验证 |
| --- | --- | --- | --- |
| 可见但失活的播放视图继续更新 | 本任务明确不碰 Live，未观察 | 自启 probe 同步 flags / frames / telemetry 验证 | 不宣称测得 Live 的帧率或 CPU |
| 遮挡/最小化返回首帧最新 | 未操作 Live | 两条恢复路径各五次真实 submission | 不等同于 GPU 扫出完成 |
| 停止且无动画不额外请求帧 | 未操作 Live | 真实停止阶段计数不增长，headless stopped-decay 耗尽取消回归 | 不推断 Live 内部调度 |

## 错题

见测量报告同名节。新增明确教训：相对 TTL 未守住授权绝对结束，收到停止要求后立即清理。已编码 `F3_DESKTOP_DEADLINE`，启动与每次输入 fail-closed，timer 仅退出自有进程，不驱动渲染；过期两入口都退出而未创建窗口，纯 headless keepalive 也在 deadline 退出。作为 LESSONS 候选由协调者整理，未直接改 LESSONS。

## 已验证做法

同一时钟采样与真实 submission 插桩区分问题；保留失败首版；独立 vendor 精确前缀和 manifest；普通 deferred / 恢复 synchronous 分离；retained-only setter 与当前 window 失效；共享唯一 driver；消费者状态回归与反向变异；测试 adapter 必选接口 clean cutover；工具绝对 deadline；验证后立即清理自启进程。

## 最终进程清理

实际执行以下命令，stdout 为空，grep 返回 1 表示没有匹配进程。全部自启 probe、cover、有限测试与构建任务均已结束，没有启动、停止或重启用户已有应用。

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

最终已提交产品扫描为 8 source、5 test、0 HARD、0 WARN。独立只读 reviewer 最终确认 Standards 与 Spec 均通过，必修、汇报仲裁、记录类剩余缺陷均为 0。
