# R2-sections 验证报告

2026-10-16。SEC-01～SEC-05 已实现；独立审查发现的缩放取消时序缺陷已修复并复核关闭。没有新增依赖，没有 push，没有改 Rust。前台组合视觉与性能验收按派发要求留给协调者，不以离屏截图或后台 AX 冒充前台证据。

## 范围与提交

基线 `ea11b3f167bdb32298b02dd2de3cbb280657b96a`，分支 `chacelow/gpuix-r2-sections`。

| 提交       | 内容                                                     |
| ---------- | -------------------------------------------------------- |
| `9623c68e` | SEC-04 搜索 Escape 后恢复有效 roving 行                  |
| `6282e77a` | SEC-01 大选区剪贴板往返                                  |
| `deebf72a` | SEC-02 稳定 ID 选区                                      |
| `354f911d` | SEC-03 内容坐标拖动                                      |
| `11ce906e` | SEC-05 性能状态本地化                                    |
| `b8b790a5` | MIDI 变异、原生 smoke、契约                              |
| `ee20a01c` | 缩放入口同步取消，覆盖无 flush 的 release 时序           |
| `51206599` | 按协调者指令合入 `c7a7caf3` 的 R2-project 解析边界归一化 |
| `7c56ed32` | 无 ID 旧快照的选区历史回归                               |

人工改动仅在四个拥有 section 内。协调者批准了 `app/locales/sections/transport.ts` 两个语言对象的 `enginePhases`；新增 `midi-body` testId 的 UI 地图由预提交生成器更新，没有手改。同步主干的 project 改动来自已批准的 R2-project，不是本切片另写一套归一化。

## 红绿回归

| 项目 | 修前结果 | 修复与修后行为 |
| --- | --- | --- |
| SEC-01 | 2049 音符的 Copy→Paste 仅有 2049 而非 4098，Cut→Paste 为 0；1024 音符、超过 250000 字符的负载同样不能 Paste，四项失败 | 去掉消费端独有的数量、字符上限，保留版本及音符字段的整份校验。四项往返完整保留音乐字段、生成新 ID，startBeat 沿用既有 +0.25 语义；非法负载不改工程或历史 |
| SEC-02 | Undo 恢复前序 A 后，上移把 A 改为 73，B 仍为 64；Redo 移除 A 后 Delete 错删 B，两项失败 | selection/current 保存 ID，下标只从当前 notes 派生；历史恢复后 Up、Delete 仍作用于 B，消失的 ID 不选择替代成员 |
| SEC-02 旧快照 | 合入归一化前，无 ID 快照解析后编辑结果为 `[72,64]` 而非 `[72,65]` | 合入协调者提供的 `c7a7caf3`，parseProject 为旧音符补唯一 ID。旧快照实际 hydrate/parse 路径后 Undo、Up、Delete 均作用于原选中音符。三个 selection 用例通过 |
| SEC-03 | 拖动中横移一个 beat 后 Move 起点仍为 1、Resize 长度仍为 0.5；缩放后预览仍为 3.5，三项失败 | 时间差使用 content-space 位移，包含 Shift+wheel；release 一条 Undo。外部布局比例变化取消手势 |
| SEC-03 审查补充 | 仅 effect 取消时，直接派发 wheel→release 的恢复变异失败一项，拖动保留为 3.5 | 时间/音高缩放入口先同步取消，再更新视口。回归直接命中真实 `midi-body` onScroll owner，不经过 nativeSimulate 的逐事件 flushSync；快速 release 不提交修改 |
| SEC-04 | Escape 后焦点是树容器 1022，而非有效行 1968 | 清空 query 的提交完成后聚焦有效 0 行；仅真正无结果才聚焦树。原生键盘覆盖有匹配与无匹配搜索，下一次 Tab 到 Browser 后方 sibling |
| SEC-05 | 中文弹层为 `引擎: idle`，而非注入的中文状态 | 标签由 `Record<ProjectRuntimeStatus["phase"], string>` 穷尽，app 与 demo 中英文覆盖 idle/opening/ready/pending/error；五种状态显示注入标签 |

主要回归入口为 `midi/{large-selection,history-selection,scroll-gesture}.test.tsx`、`browser/index.test.tsx` 和 `transport/PerformanceStatus/localization.test.tsx`。

## 变异验证

全部 baseline 为 0 fail，八个恢复变异全部被捕获，文件均在 finally 恢复。

| 变异                                   | 失败用例数 |
| -------------------------------------- | ---------: |
| SEC-01 恢复字符上限                    |          2 |
| SEC-01 恢复音符上限                    |          2 |
| SEC-02 按数组位置选择                  |          3 |
| SEC-03 不计横移                        |          2 |
| SEC-03 外部几何改变时提交而非取消      |          1 |
| SEC-03 缩放取消重新延后到 React commit |          1 |
| SEC-04 Escape 聚焦 -1 树容器           |          1 |
| SEC-05 显示原始 phase                  |          1 |

在根目录实际运行：

```sh
bun --cwd apps/gpuix src/project/sections/clip-edit/verification/mutations.mjs SEC-
bun --cwd apps/gpuix src/project/sections/browser/verification/mutations-r1c.mjs SEC04
bun --cwd apps/gpuix src/project/sections/transport/verification/mutations.mjs
```

## 全量与原生验证

- 合入 R2-project 后在根目录运行 `pnpm verify:gpuix`，最终 `verify:gpuix passed`。身份校验、native build、tsc 0 errors、eslint 0 warnings、80 条架构测试、9 条文档路由、UI map current 全通过；Bun 为 **1239 pass / 1 todo / 0 fail**，199 文件。已有 todo 没有被本切片新增或跳过。
- 独立运行 `node scripts/gpuix-review-scan.mjs`，**9 source files / 5 test files / 0 hard / 0 warn**。所有 WARN 数为零，无需豁免。
- 合入后的第一次门禁在 renderer 身份前置检查停止，提示 outputs 或 patch 相对 build seal 改变。依照提示执行 `bash scripts/gpuix-main/build.sh`、`pnpm install --frozen-lockfile` 后完整门禁通过；未换 npm renderer，未手改 vendor、锁或补丁。
- 真实后端整应用 smoke 完成 Home→工程→resume first present，实际 `nativePlaying:true`、`frames:21`，结束 `released idle`。
- `verification/r2-smoke.tsx` 经 app native fixture preload 配置真实引擎，实际执行 Undo 后继续编辑、Cut/Paste、预览拖动→无 flush 的 wheel/release→回滚。最终 `phase:ready`、`pending:0`、`acceptedRevision:6`、`error:null`；音符音乐字段为 `[[0.25,72],[3.25,65]]`。使用注入的内存剪贴板，不读写宿主剪贴板。
- 原生截图为 `/tmp/zoeydaw-r2-sections/r2-midi.png`，已读图核对 MIDI 工具栏、琴键、网格、音符与力度区域的组合关系。可重跑命令在 Clip Edit README。
- 自己用命名 service `r2-sections-demo` 启动 `GPUIX_BACKGROUND=1 bun --hot src/project/sections/clip-edit/demo/index.tsx`。只读 AX 观察到 `zoeydaw clip editor dark en` 窗口，8.6 秒后 kill。后台 AX 只暴露窗口 chrome，不能证明内容首帧或焦点交互。
- 本切片没有 Rust 源码变更，未另跑 cargo check/test；native:build 是实际执行的全量门禁步骤。
- 所有本地提交通过 ultracite/lint-staged；未使用 --no-verify。提交的代码、测试与变异脚本扫描 `/Volumes|/Users|/tmp|/private|/var/folders` 无命中。证据输出目录由 `B2_EVIDENCE_DIR` 注入。

### 进程清理

实际执行 `ps -axo pid,etime,command`，按 `bun .*--hot|cargo run|gallery|demo` 筛选；输出为：

```text
(no matches)
```

没有残留 demo、Gallery、cargo run 或 bun --hot 进程。没有停止用户服务。

## 产品规则与 Live 观察

只读观察 Live 的窗口、编辑菜单、AX 与截图，没有操作其工程内容。

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| Copy/Cut/Paste/Undo | 编辑菜单实际为 Cmd+C/X/V/Z，Redo 为 Shift+Cmd+Z | 保持既有命令，修大选区完整往返及稳定选区 | Live 当前没有打开 MIDI Clip，未在用户工程执行大选区或历史恢复 |
| MIDI 手势随源坐标 | 当前 Live 为 Arrangement 与空设备详情，未暴露 MIDI 编辑面 | content-space 横移，缩放前同步取消，真实后端回滚证明 | 未在 Live 执行 MIDI 拖动/缩放，不宣称其取消策略完全一致 |
| Browser 焦点连续 | AX 有搜索、浏览器侧边栏和结果 outline；当时结果 outline 已聚焦 | Escape 聚焦当前有效 roving 行，Tab 向后继续 | 未向 Live 发送 Escape 或 Tab；本项目行为由原生键盘回归证明 |
| 性能状态本地化 | AX 见中文 CPU 量表、采样率和走带控件 | 不直接显示内部 phase，中英文穷尽注入 | Live 没有对应本项目 backend phase 协议，不要求逐字段同名 |

Live 观察时窗口为 1463×1049，截图显示尺寸 1250×896；不把截图缩放后尺寸当 AX 像素，也不把 Arrangement 全图当 MIDI 同区域密度实测。

## UI 规范第 13 节

| 检查 | 本次证据与边界 |
| --- | --- |
| Gallery 与业务整体布局 | 已查看原生 MIDI 组合截图；全应用真实后端离屏 smoke 通过。前台真实 Gallery/业务整体评审留给协调者 |
| 跨区域对齐与居中 | 离屏 MIDI 图可见工具栏、键区、网格和力度的整体关系；本轮不改布局或样式，不声称已完成前台 AX 量值对比 |
| 间距与内边距 | 复用原有共享控件/token，未增加实例 gap/padding |
| 统一设计入口 | 没有新增样式入口、圆角或边框覆盖；仅修改状态、焦点、手势和注入标签 |
| 尺寸与紧凑感 | 截图保留原有控件密度；Live 对应 MIDI 区域没有打开，未完成同区域比较 |
| 深浅主题与中英文 | phase 标签中英对象均由类型穷尽，中文五态回归通过；组合 Gallery 的深浅主题、中英文全页前台对照未执行 |
| 状态与键盘 | Copy/Cut/Paste、历史后编辑、Escape→Tab、缩放取消均有原生有效行为回归及恢复变异 |
| 拖动、滚轮、弹层与性能 | 横移 Move/Resize、外部 resize、无 flush wheel→release、五态性能弹层行为通过；真实前台帧耗时没有测量 |

## 自审结果

独立审查为 `pstack-reviewer`，Standards 与 Spec 两轴，覆盖完整固定基线 diff 和新增文件；约束包含 gpuix 架构、UI 规范、Arrangement 契约、LESSONS 与代码质量底线。审查只读，没有代跑检查。

```sh
git diff ea11b3f167bdb32298b02dd2de3cbb280657b96a -- apps/gpuix/src/project/sections/clip-edit apps/gpuix/src/project/sections/browser apps/gpuix/src/project/sections/transport apps/gpuix/src/app/locales/sections/transport.ts
```

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| 缩放取消 effect 可能晚于快速 release | 必修 | 同步取消入口；新增不 flush 的事件回归与恢复变异；独立复核已关闭 | `ee20a01c`，变异失败 1 项；reviewer 复核无新发现 |
| 旧快照音符没有 ID | 汇报仲裁 | 协调者选择 R2-project 解析边界补 ID，禁止 UI 写 ID；已合入 `c7a7caf3` | `51206599`、`7c56ed32`；旧快照回归红→绿，位置变异失败 3 项；独立复核通过 |
| app 中英文 phase 标签超出 section 所有权 | 汇报仲裁 | 精确批准仅改两个标签对象，已执行 | `11ce906e`；TransportLabels 类型穷尽和全量 tsc 通过 |
| 新 testId 导致生成地图更新 | 汇报仲裁 | 协调者确认生成器登记不需逐次询问，禁止手改 | `ee20a01c` 的自动生成地图；UI map current 224 testIds |
| 扫描静态规则 | 记录 | HARD 0、WARN 0，不加豁免 | 最终独立 scan 输出 |
| 前台组合视觉、真实帧性能 | 记录 | 按派发要求由协调者收尾串行验收 | 本报告第 13 节逐项列明未验证范围 |

实现项没有剩余。余下交付步骤为协调者合入复核与前台统一验收。

## 错题

- 错：把取消事务放在 viewport 几何变化的 React effect，就以为缩放一定先于 release 回滚。测试 renderer 逐事件 flushSync 会掩盖生产并发提交时序。
- 对：主动缩放入口同步取消后再排队更新视口，外部 resize 保留 effect 兜住几何改变；用直接事件分发覆盖连续 wheel→release。
- 因：release 先清空 gesture 后，晚来的 effect 已没有可取消事务。
- 见：`midi/MidiEditor.tsx`、`midi/scroll-gesture.test.tsx`、恢复同步取消的变异。

## 已验证做法

- 大选区的生产/消费契约必须一致；分别恢复字符上限、数量上限，真实 Copy/Cut/Paste 回归均变红。
- 选区保存稳定 ID，历史恢复只重新派生下标；缺 ID 的旧数据在既有解析边界归一化，不在 UI 挂载时写工程。
- 搜索清空后聚焦已提交结果集的有效 roving 行；原生 Escape→Tab 验证真实后继 sibling，不能只断言 query 为空。
- Section 原生 smoke 通过 preload 使用 app native fixture，不在 section 源码反向 import app；证据目录从环境变量注入，截图在仓库外。
