# R2-tooling 验证报告

2026-10-16。分支 `chacelow/gpuix-r2-tooling`。TD-01～TD-09 与已批准的 Header 修复完成；TD-10 Send 的 hosted 根因尚未确认，需新 CI 的完整失败日志。没有放宽断言、跳过测试、安装或隐藏字体，也没有 push。

## 实现与回归

| 条目 | 根因修复 | 修前与修后证据 | 变异 |
| --- | --- | --- | --- |
| TD-01 | `--stage` 批量读取 Git index，直接更新地图 index；保留已编辑工作树地图，同步干净地图 | 已暂存 A、完全未暂存 B 与部分暂存/删除回归修前失败；真实 lint-staged commit 只提交 A 对应 selector，B 和用户地图修改不变；7 项地图回归通过 | 撤销 index 读取、撤销干净地图同步均被抓 |
| TD-02 | native/React dist 全量递归哈希，包含内部 JS、嵌套类型和 JSX runtime | 内部 runtime 与类型文件修改/删除的 10 项回归修前全部漏放，修后拒绝；原补丁前缀回归仍通过 | 省略 native 内部产物被抓 |
| TD-03 | 完整 source/output/mode 校验位于构建锁之前，有效缓存只链接 | 修前已有锁时失败；修后已有锁仍可链接，失效缓存仍拒绝。独立已构建 vendor `r2-tooling-proof.Y187YJ` 实测 156 个 dist 文件内容和 mtime 不变，预置锁保留，没有重建或取锁 | 强制先重建被已有锁回归抓住 |
| TD-04 | 现有 TypeScript parser 检查禁用测试 AST，不再用旧 skip 正则 | `describe.skip`、todo、skipIf/todoIf、if(false)、链式 each/concurrent、computed skip、exclusive 均拒绝；正常 suite、字符串和注释示例通过；20 项 scanner 回归通过 | 去掉 describe 检查被抓 |
| TD-05 | 未分层的 app/main 等 gpuix 非测试源码也检查 DOM 全局 | app/main/未分层路径修前负例失败，修后 7 项通过；shadowing、属性访问和测试豁免保留。开启规则后真实 app eslint 0 warning，无需改 app 违规点 | 撤销未分层全局边界被抓 |
| TD-06 | 条件模板输出两个 selector，并保留条件前的字面前缀 | 实际 ClipCard 表达式修前遗漏，修后生成 `clip-source-…`、`clip-ghost-…`；地图只由生成器重写 | 撤销条件处理、丢失字面前缀均被抓 |
| TD-07 | 硬规则区分交互 host 和批绘制几何，明确 PeakColumns/QuadBatch | **文档专属**，协调者批准不做伪行为测试/变异。现有两组真实 QuadBatch PNG 对比 `differentPixels=0`，RGBA hash 相同 | 不适用，已获例外批准 |
| TD-08 | 只计数 `type(scope):` 标记，不扫描普通 type 单词 | `fix(build): restore renderer output validation`、`test: cover native build failure` 修前误拒绝，修后通过；真实多类型仍拒绝，6 项 CLI 回归通过 | 恢复普通单词计数被抓 |
| TD-09 | Git common-dir 推导 vendor/target；规范化路径、拒绝共享 symlink 与双向重叠；mktemp；全仓 HARD 路径门禁 | Git 主仓/linked worktree、环境覆盖、target 越界及 symlink 逃逸、缺 Git 身份、两种 mutation 入口的共享/祖先/别名路径均覆盖；裸根 shell 默认值也拒绝。全仓 788 文件，0 HARD、0 WARN | 完整路径分类、裸根结束边界、共享 vendor/target alias、两个 ancestor 保护均被抓 |
| TD-10 Header | 删除 L/C/R onLayout 缓存与 JS 列宽函数，只测 viewport，由 native flex 分配列 | 原 mount 时序下 Helvetica 和 missing 两项修前各偏 2px；修后 1800/1070/900/620 八项新回归及原测试共 18 项全绿，没有增加 flush；旧 helper 和纯模型测试删除 | 在隔离源码副本恢复反馈缓存，两项首次居中回归均失败 |
| TD-10 CI 诊断 | Bun 失败输出完整日志；failure-only workflow 跑字体和逐次 bounds 诊断 | 本地执行真实 verify 的失败分支，用真正 Bun 早期失败后跟 80 个测试输出，Expected/Received 保留、退出 1、无 success marker；诊断入口真实运行默认/Helvetica/missing 字体、1/4 pass 与 Send resize | 不声称 hosted 验证完成 |

## 实际验证

最终代码校验点为 `2f019c45`。

| 命令或场景 | 实际结果 |
| --- | --- |
| `pnpm verify:gpuix` | `verify:gpuix passed`；1283 Bun pass、1 inherited todo、0 fail；81 CLI pass；87 架构规则 pass；tsc 0 errors；app eslint 0 warning；默认 review scan 0 HARD/0 WARN；地图 9 entries、3 routes、226 selectors；真实后端离屏 smoke 播放推进并 `released idle` |
| `node scripts/gpuix-review-scan.mjs --absolute-paths` | 788 跟踪源码，0 HARD、0 WARN |
| `bun test src/project/sections/transport/index.test.tsx`，在 app 目录 | 18 pass、0 fail；83 断言 |
| `pnpm --dir apps/gpuix exec tsc --noEmit -p ../../scripts/gpuix-main/ci-geometry/tsconfig.json` | 通过，使用项目已有 TypeScript 5.9 和 Bun/共享 SVG 声明，不添加依赖或 suppression |
| 六个独立 mutation 入口 | 共 16 个变异全部被抓，均修改临时副本 |
| 现有 QuadBatch `pixel-parity.tsx` 与 `compare-pixels.py` | stereo-inset-clamp、fractional-position-size 两组均 0 差异像素 |
| 完整日志失败 smoke | 真实工具链执行到 Bun 失败；早期断言保留在 80 行后续输出之前；退出 1，没有伪通过 |
| mktemp 失败清理 smoke | 向临时 TMPDIR 执行实际 verify 的早期失败路径，退出后该目录零文件 |
| 独立 vendor link-only smoke | 真实已构建副本、预置锁、156 emitted files 不变，锁未被删除 |

原有 1 个 todo 是 Arrangement adaptive-grid Cmd/Ctrl+1/2 的继承项，本切片未增加或跳过测试。未改 Rust 源码，本切片没有单独运行 cargo check/test；`pnpm native:build` 已包含在最终实际 verify 中。

变异入口：

```sh
node scripts/gpuix-main/mutations-build-contract.mjs
node scripts/verification/mutations-ui-map.mjs
node scripts/verification/mutations-tooling-gates.mjs
node scripts/verification/mutations-absolute-path.mjs
node scripts/verification/mutations-mutation-isolation.mjs
node scripts/gpuix-main/ci-geometry/mutations-header.mjs
```

## TD-10 尚未确认的 hosted Send 问题

已读取 GitHub run `38847615641` 的失败日志和完整 job 日志。镜像为 `macos-15-arm64`，与本机架构相同；旧 verify 只保留测试名和尾部，具体失败断言已经丢失。

在四个独立进程使用默认、missing number、missing sans、Helvetica 后，完整原 Send 场景都通过。列为 32/33/32，总和差为 0，Down 后新行 y 增量为 17，UpUp 后 Send 隐藏。不能由此宣称 CI 缺 Menlo，也不能宣称 Send 根因已经修复。本机字体清单有 353 个启用 family，Menlo 和 Helvetica 都存在。

已保留 `ci-geometry/probe.tsx` 和失败后 CI 步骤，输出 hosted 字体清单、1/4 次布局 bounds、width/sum error 与 resize 状态。下一步由协调者合入并推主干触发真实 CI；worker 不自行 push、dispatch 或修改 Send 断言。

Header 已确认的根因是 transport 自身对测量结果的第二层反馈。字体更新使实际 center 宽度改变，但左右列仍使用上一轮 center 宽度；额外 layout 虽能掩盖症状，却不是产品修复。当前实现直接使用 native flex，不修改共享 `useMeasuredTextWidth`。

## UI 第 13 节证据

原生截图证据位于 `os.tmpdir()/r2-tooling-ui-k2QjuG`。该目录实际存在，PNG 未进入 Git。Gallery 由新的可重跑入口生成；业务组合沿用 `r1c-surfaces.tsx`，使用 `native-fixture.ts` 接真实后端。

| 检查 | 结论与证据 |
| --- | --- |
| Gallery 与业务整体布局 | 实际检查 Gallery `en-dark.png`、`zh-light.png` 与业务 `en-US-dark-midi.png`、`en-US-light-midi.png`、`zh-CN-dark-audio.png`、`zh-CN-light-audio.png`；保留卡片、工具栏、轨道、Clip Editor 组合空间关系 |
| 跨区域对齐与居中 | 8 个首次挂载回归检查 4 档宽度的组间非重叠、宽屏居中、非对称 intrinsic 边界与窄屏滚动；Helvetica/missing 首次误差由 2px 降到 0；默认 Menlo 的设备像素误差为 0.5px |
| 间距与内边距 | 仍使用 transportColumnGap=12、transport track gap=4、pad=2，未加业务像素补丁；组合截图无新增组间错位 |
| 统一设计入口 | 未改共享 token、圆角、边框、颜色或控件外观；只替换 Header 列布局 owner |
| 尺寸与紧凑感 | transport 控件 token 高度 20；Live 只读 AX 为 19 原始单位，未按未知 scale 换算；同组控件保持等高、图标按钮方形 |
| 深浅主题与中英文 | Gallery 实际捕获 4 组；真实业务捕获 8 组，实际审阅上述 4 个代表性组合；Header 标签可读，无新增裁切 |
| 状态与键盘 | 原 Header Space、held repeat、Record、BPM coarse/fine/wheel/Undo 回归与新字体/滚动用例共 18 项通过；未改变键盘或共享控件状态语义 |
| 拖动、滚轮、弹层与性能 | 窄档真实 native wheel 回归通过，宽度不抖动；未改拖动/弹层实现。未测前台帧耗时，不能声称性能提升；Gallery native nodes 释放检查通过，验证子进程均退出 |

真实前台整体评审与性能验收仍由协调者执行，worker 未申请桌面时段或调用 control.acquire。

## 产品规则与 Live 观察

Live 窗口只读观察，无点击、按键、播放、缩放或工程修改。窗口 1463×1049，显示器元数据 1920×1080、scale=0（未知）；以下为 AX 原始单位。

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| 紧凑单行 Transport | 整个走带组 x=510、y=59、1346×19；tempo 315×19、playback 169×19、record 148×19、loop 237×19 | 沿用高 20 的 transport token，不变更控件尺寸或 gap | 不将未知 AX scale 转换成像素；不照抄 Live 每组数量和宽度 |
| 数值与按钮不因布局反馈移位 | 速度 AX 控件 44×19，模式和监听均位于同一条走带行 | 原生 flex 在子控件宽度更新时重新分配列，不缓存旧 L/C/R | 本轮仅改变同一次布局收敛，保持项目既有稳态布局规则 |
| 宽屏居中，空间不足保留 intrinsic minima 并滚动 | Live 当前窗口可看到完整走带组，未调整用户窗口验证窄档 | native 回归覆盖 1800/1070/900/620；两个窄档实际横向滚动 | Live 窄窗口行为未操作验证；此处保留已有项目契约 |

## 自审结果

初审采用两个独立 pstack-reviewer，分别 Standards 与 Spec；随后对安全修补、Header 和 CI 诊断分别复审。审查为只读，不把代理未运行的验证当成执行结果。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| P1 共享 vendor/target 的 symlink 未 canonicalize | 必修 | 在唯一 paths owner 统一规范化，两个入口补别名回归 | `d1f4d7a9`；4 个 alias CLI 红转绿，两个 alias mutation 被抓；独立复审关闭 |
| P1 输入为保护目录祖先时隔离可绕过 | 必修 | 拒绝 canonical 保护目录的双向包含，结合原有 checkout containment | `d1f4d7a9`；4 个 ancestor CLI 红转绿，两个 ancestor mutation 被抓；独立复审关闭 |
| P2 shell 裸根后 `}` 没被识别 | 必修 | 补 shell 结束边界，保留相对路径负例 | `d32d7eda`；五种根目录产生 5 HARD，恢复缺陷 mutation 被抓；独立复审关闭 |
| 新门禁揭出 orchestration 的 TMPDIR fallback | 汇报仲裁 | 未自行改共享拥有路径；协调者在主干 57aeab2e 修复并授权合入 | 合入点 `2f019c45`，全仓 788 文件 0 HARD/0 WARN |
| Header 原生布局 cutover | 记录 | 独立 Standards/Spec 无 finding | `0dd34d25` 五文件冻结审查；18 native tests 和恢复缓存 mutation |
| CI 诊断文档误称输出滚动状态 | 记录 | 删除多声明的“滚动与”，不扩诊断功能 | `docs/agents/setup.md` 现在只声明 bounds 与 resize；诊断审查无安全/类型/生命周期必修项 |

初审完整差异命令：

```sh
git diff ea11b3f1..242673dc -- scripts/gpuix-main scripts/gpuix-ui-map.mjs scripts/gpuix-review-scan.mjs scripts/check-commit-scope.mjs scripts/verify-gpuix.sh scripts/verification tooling/eslint docs/architecture/gpuix.md docs/architecture/gpuix-ui-map.md docs/agents/setup.md
```

安全复审差异命令：

```sh
git diff 242673dc..d32d7eda -- scripts/gpuix-main/paths.mjs scripts/gpuix-main/redraw-mode-mutations.mjs scripts/gpuix-main/redraw-regression/mutate.mjs scripts/gpuix-review-scan.mjs scripts/verification
```

Header 与诊断复审差异命令：

```sh
git diff d32d7eda..0dd34d25 -- apps/gpuix/src/project/sections/transport scripts/gpuix-main/ci-geometry/mutations-header.mjs
git diff 0dd34d25..028bca2c -- .github/workflows/ci.yml docs/agents/setup.md scripts/verify-gpuix.sh scripts/gpuix-main/ci-geometry
```

实现提交依次为 `a338bc14`、`942092f9`、`85db3d8d`、`856b06f6`、`b61b8c48`、`be3ec9a1`、`45fe9637`、`b43064fb`、`d1f4d7a9`、`d32d7eda`、`0dd34d25`、`028bca2c`。授权主干同步为 `242673dc`、`2f019c45`；报告与措辞修正不冒充新的功能提交。

## 错题

- 错：用工作树生成要进入部分提交的地图；对：index 是提交源码的 owner，批量读取并保留未暂存文件；因：lint-staged 默认并不隐藏完全未暂存文件；见：UI map 真实 commit 回归。
- 错：以“配置路径不等于共享字符串”当作隔离；对：规范化保护路径并拒绝双向目录重叠；因：symlink 和祖先 root 都能绕过单向前缀；见：mutation-isolation CLI 与四个隔离变异。
- 错：看到字体相关偏差就给测试多 flush；对：删除父布局对旧子测量结果的反馈；因：字体改变是触发器，Header 列缓存才是滞后一轮的 owner；见：两项修前 2px、修后 0px 回归。
- 错：失败日志只输出测试名和尾部；对：失败时保留完整 Expected/Received；因：旧 hosted Send 失败的具体断言已丢失，不能据测试名猜根因；见：真实 Bun 失败日志 smoke。
- 记录：一次本地提交遇到共享 lint-staged backup 消失；检查工作区、当前 commit、stash 与锁后原样重试通过，未删除其他 stash、未用 no-verify；沿用已有 LESSONS 流程。

## 已验证做法

- 完整 manifest + lock 前校验提供真实 link-only；预置锁不阻止只读复用，失效缓存不会被误链接。
- 原生 flex 负责列约束，viewport 是唯一局部测量状态，子组宽度变化不需要第二层缓存。
- 每个不确定边界用真实 CLI/native 行为回归；source replacement 只用于隔离变异，不以源码文本断言冒充行为。
- 真实后端业务组合、Gallery 与 QuadBatch 像素证据留在外部目录，进程验证完退出；不上传逐状态 PNG。

## 进程清理

实际运行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空，grep 退出 1 表示没有匹配；自启验证窗口/service 零残留。未停止用户的 Live 或其他服务。

Build the Lever 选择保留可重跑 CLI、native probe 与变异入口；Fix Root Causes 选择删除 Header 反馈缓存而不是增加测试 flush；Prove It Works 选择真实已构建 vendor、完整 verify、真实 native 像素与行为结果。throughput checkpoint：独立地图和门禁回归并行准备，父 worker 执行修前红再集成，独立双轴审查及增量复审完成，真实 UI 验证串行执行。
