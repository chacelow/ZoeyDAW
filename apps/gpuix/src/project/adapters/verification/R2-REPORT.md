# R2-project 交付报告

2026-10-16。基线 `ea11b3f1`，分支 `chacelow/gpuix-r2-project`。范围为 PC-01 至 PC-04，以及协调者消息 `msg_ac6f5ff48dd4` 追加的 PC-05。未修改其他切片路径、Rust、共享契约或依赖。

## 修复与回归

| 项目 | 根因修复 | 修前失败 | 修后证据 |
| --- | --- | --- | --- |
| PC-01 | 拒绝不再清空 `recordingPending`，只在包含记录的 revision 被接受后消费 | commit 和 recover 连续拒绝后 markers 为 `[]` | `recording-lifecycle.test.ts` 的 `retains submitted recording` 检查失败后 dirty、release 后 reopen 内容仍保留 |
| PC-02 | 在 persistence 区分 `barPosition >= 1` 与严格正 duration | loop、clip、marker、automation 的 bar=0.5 均 restore 成功 | `snapshots.test.ts` 四条拒绝回归保持 document 和 undo；bar=1、1.125 以及 length=0.25 可恢复 |
| PC-03 | 以选中根及完整后代为复制单元，在原分支末尾插入完整副本 | `Drums, Drums Copy, trager, trager Copy, sidechain, sidechain Copy` | `project.test.ts` 两条回归检查原树和副本连续、祖先后代多选去重、父组 membership、routing、undo 和 redo |
| PC-04 | 注册失败时 dispose 已打开 handle，cleanup 自身失败也保留原注册异常 | 真实 handle 的 sourceInfo 仍可访问；复核双失败回归收到 cleanup 异常 | `native.test.ts` 正常清理和清理抛错两种故障注入，检查原异常对象身份及真实 handle 已失效 |
| PC-05 | parseProject 克隆 MIDI Clip 后为缺 ID 音符补 `snapshot-note-N`，先收集全部已有 ID 并跳过占用 | 解析后的缺 ID note 仍无 ID | `persistence-midi-identity.test.ts` 检查唯一性、后置已有 ID 不冲突、已有 ID 和音乐字段不变、序列化再解析不变、输入不被修改 |

PC-05 使用确定性编号而非随机 UUID。`stringifyProject` 也复用 parseProject，确定性编号避免同一旧文档重复序列化产生不同字符串。ID 唯一性限定在同一 Clip，未改变 MidiNote 公共类型。

## 实际验证

| 命令或场景 | 结果 |
| --- | --- |
| 初始化：`bash scripts/gpuix-main/build.sh`、`pnpm install --frozen-lockfile`、`pnpm native:build`、`node scripts/gpuix-main/check.mjs --resolution` | 通过。使用已有 vendor 配置，未修改其路径或锁 |
| 在 `apps/gpuix` 执行 `bun test src/project/adapters/runtime/recording-lifecycle.test.ts src/project/adapters/snapshots.test.ts src/project/model/project.test.ts src/project/adapters/backend/native.test.ts src/project/model/persistence-midi-identity.test.ts` | 37 pass，0 fail，434 assertions |
| 在 `apps/gpuix` 执行 `bun src/project/adapters/verification/mutations.mjs` | 14 个变异全部触发目标行为回归失败 |
| 在 `apps/gpuix` 执行 `pnpm exec tsc --noEmit` | 0 errors |
| 根目录 `pnpm verify:gpuix`，最终实现树 | 通过。1224 pass、1 个既有 todo、0 fail，共 195 文件；architecture rules 80 pass；UI map current；真实后端离屏 smoke 结束为 idle |
| 根目录 `node scripts/gpuix-review-scan.mjs` | 4 source、5 test，0 HARD、0 WARN |
| 仓库外临时 native runtime smoke | 真实 backend ready，复制行顺序为 `1 Group, 1 Audio, 1 Group Copy, 1 Audio Copy, Main`；保存和恢复内容一致；非法 loop restore 不替换工程；恢复后 MIDI ID 为 `snapshot-note-0` 和 `snapshot-note-1`；最后 release 为 idle |
| createTestRoot + `app/verification/native-fixture.ts` + captureScreenshot | 真实 backend ready；原组完整分支后紧跟副本完整分支；截图 `/tmp/r2-project-evidence/duplicated-group.png` 已打开检查；root.unmount 后 idle |
| 命名 service `r2-project-window`：`GPUIX_BACKGROUND=1 ZOEYDAW_ROUTE=/project/r2-project-verification bun --hot src/main.tsx` | 自有 pid 64311、窗口 `zoeydaw`，1280×800，focused=false；AX 仅暴露窗口根，未把它当业务布局证据；13.9 秒后立即 kill |

两份临时 smoke 脚本已删除，截图保留在仓库外。可重复的行为入口是上表五个测试文件及 mutation runner。业务截图场景为：native-fixture → MIDI 输出设为 main → groupTracks 两轨 → duplicateTracks 组 → 等待真实 backend idle → captureScreenshot。截图为 1280×1100，并将 fixture 轨高设置为已有 DEFAULT_TRACK_HEIGHT 以同屏显示两棵树。

本切片没有 Rust 源码变更，因此未另外运行 cargo check 或 cargo test。完整门禁已实际构建 native 并运行 native 集成测试。

## 变异证据

| 本轮变异                                | 目标失败数 |
| --------------------------------------- | ---------: |
| drop-submitted-recording-on-rejection   |          1 |
| accept-before-bar-one                   |          4 |
| interleave-group-copies                 |          2 |
| leak-failed-native-construction         |          2 |
| mask-original-native-construction-error |          1 |
| leave-legacy-midi-notes-without-ids     |          1 |

同一 runner 中既有 8 个变异也全部被捕获。runner 在 finally 恢复每个变异文件，未留下坏实现。

## 自审结果

独立只读 reviewer：`ReviewR2Project`，agent 类型 `pstack-reviewer`。完整审查命令为 `git diff ea11b3f1...HEAD -- apps/gpuix/src/project/model apps/gpuix/src/project/stores apps/gpuix/src/project/adapters`，并在增量复核时阅读新测试文件。Standards 轴包含 gpuix 架构的全部代码质量底线、UI 规范、Arrangement 组合契约和 LESSONS；Spec 轴包含 R2 规格和 PC-05 追加授权。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| PC-04 cleanup 抛错覆盖原注册异常 | 必修 | 新增红回归后修复，增加第二个 native mutation | `31aba15a`；双失败回归通过；reviewer 增量复核关闭 finding |
| PC-01 新回归使用同步 backend，不代表所有异步在途交错都已实测 | 记录 | 不把静态推演当运行证据；本轮交付限定已执行场景 | reviewer 查了 queue、revision fence、recovery、release，未发现可确认缺陷 |
| PC-05 唯一 ID 归一化 | 已授权追加项 | 在 parseProject 边界实现；无 UI 层补 ID 路径 | `5a9eb35e`；reviewer Standards 和 Spec 均通过 |
| review scan | 记录 | 无需处置 | 0 HARD，0 WARN，无待仲裁项 |

reviewer 最终结论：PC-04 原必修关闭，PC-05 满足授权要求；必修 0、汇报仲裁 0。未增加永久 skipped/todo 测试。

## 产品规则与 Live 观察

只读观察 Live 窗口 `无标题`，没有修改用户工程内容。

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| 一基音乐位置 | AX Arrangement 位置 4.3.1，循环起点 9.1.1，长度 4.0.0 | barPosition >= 1，duration 可小于 1 | 未在 Live 输入非法快照或改变位置 |
| Group 复制保持分支连续 | 编辑菜单含重复复制 Cmd+D、编组 Cmd+G、取消编组 Shift+Cmd+G；当前工程没有 Group | 完整复制树跟在原树之后，routing 和 membership 同步重映射 | 未在用户 Live 工程创建或复制 Group；不宣称已实测 Live 的复制动作 |
| 拒绝提交不丢录制 | 当前播放=0、Arrangement 录制=0 | pending 保留至接受，失败和 reopen 后保留 | Live 内部拒绝协议不可通过只读观察注入 |
| MIDI 身份跨快照稳定 | AX 不公开内部 note ID | parseProject 归一化，往返保持 | 无可对照的 Live 内部 ID API |
| native 构造失败释放资源 | 无对应可见交互 | 真实 handle 故障注入验证 | Live 原生内部异常不可观察 |

## UI 第 13 节证据

本轮未改 TSX 控件、主题 token 或交互 owner。PC-03 改变消费者看到的行顺序，因此补了真实后端业务组合截图，其余视觉维度不宣称重新验收完成。

| 检查 | 证据或边界 |
| --- | --- |
| Gallery 与业务整体布局 | 业务组合截图保留 Browser、Transport、Arrangement 和 Footer，原分支及副本连续；未重新运行 Gallery，控件代码未变 |
| 跨区域对齐与居中 | 截图中轨道表头与 lane 对应；未做全控件 AX bounds 复核 |
| 间距与内边距 | 未修改相关 token、padding 或 gap |
| 统一设计入口 | 保留既有共享控件与 token，没有业务样式修补 |
| 尺寸与紧凑感 | smoke 只用既有 DEFAULT_TRACK_HEIGHT；未改变产品默认尺寸 |
| 深浅主题与中英文 | 本轮截图为暗色英文；浅色及中文前台复核由协调者收尾 |
| 状态与键盘 | 本轮回归覆盖文档状态、恢复、undo、redo；未修改或重新验收键盘行为 |
| 拖动、滚轮、弹层与性能 | 无相关实现改动，未进行前台性能测量 |

## 进程清理

交付前实际执行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空，grep 退出码 1，未发现匹配的残留进程。自有 background window 已通过 `proc://r2-project-window/kill` 关闭；两次 smoke 的 root 或 runtime 均报告 idle。未停止用户服务。

## 提交

- `98a2bd64` fix(project): retain rejected recording until acceptance
- `9ff4ec23` fix(project): reject snapshot positions before bar one
- `4ffd8453` fix(project): duplicate complete track branches
- `5d4301bd` fix(project): dispose failed native backend construction
- `5c58727c` test(project): verify R2 repairs with mutation reversals
- `31aba15a` fix(project): preserve native registration failure during cleanup
- `5a9eb35e` fix(project): normalize legacy MIDI note identities

所有提交均通过现有 pre-commit hook，非交互提交带 staged tree 的 USER_CONFIRM_HASH，未使用 --no-verify，未 push。

## 错题

- 错：只在 subscribe 失败后调用 dispose，就以为原始异常必然传回调用方。
- 对：cleanup 也是 fallible 边界，回归同时检查真实 handle 失效和原异常对象身份。
- 因：dispose 的异常会中断后面的 throw，首次实现漏了双失败路径，独立 reviewer 找到并关闭。
- 错：在仓库根直接调用 tsc -p app 配置，误用根解析到的 TypeScript 6，得到 baseUrl 弃用错误。
- 对：按 setup 在 apps/gpuix 执行 pnpm exec tsc --noEmit，使用应用自己的工具链；该命令及完整门禁均通过。

## 已验证做法

- 未确认 recording journal 只由 acceptance 消费；拒绝从 accepted checkpoint 重放，避免永久丢失。
- 快照解析区分绝对一基位置、正 duration 和 signed source offset，拒绝发生在 hydrate 前。
- native 故障注入仍使用真实 session，以释放后的 sourceInfo 拒绝访问证明资源失效，不测内部调用次数。
- 缺 MIDI note ID 在已校验、已克隆的 parseProject 边界补齐，先保留全部已有 ID，确定性编号通过往返和变异检查。

## 剩余验收

PC-01 至 PC-05 无未实现项。协调者尚需合入复核，并完成前台整体视觉、浅色中文和性能收尾；本报告没有将这些未执行检查称为通过。
