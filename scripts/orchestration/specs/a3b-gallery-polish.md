# A3b gallery-polish：组合画廊的统一布局与整体评审

## Target

Worktree `gpuix-a3b-gallery-polish`(子 worktree,基线 `gpuix-migration`,已含 A3)。

## 背景

A3 已合入并通过类型、测试与真实窗口交互,但协调者 review 时用 AX bounds 量出画廊有布局问题(不是控件本体):

- 画廊里控件之间水平 gap 一律 10px(写死的 `gap: 10`),而 `CONTROL_METRICS.default` 的 `--spacing-control-gap`=2、`--spacing-control-track-gap`=4。Ableton Live 同类控件间隔只有 1–2px。画廊现状像网页表单,不是 DAW。
- 行间垂直 gap 实测 0 / 3 / 4px,不一致(第一行到第二行贴死)。
- `Transport BPM`(transport 档,h=20)与默认档(h=13)控件混在同一行,把整行撑高。
- 画廊里存在写死的 `gap: 10/12/16`、`padding: 12/16`,没有取 token。画廊是后续所有切片参考样式的地方,必须作为紧凑感的标杆。

## Change

1. 画廊里所有间距、内边距取 `useTheme()` 的 token 或 `CONTROL_METRICS`/`PROJECT_METRICS`;需要的值不存在就**先加 token 再引用**(token 属共享契约:新增 token 前 `orca orchestration ask` 给出名称、值与理由)。
2. 同类位置同一值:同一行控件间水平 gap 取同一 token;相邻行的垂直 gap 取同一 token;卡片内边距取同一 token。transport 档控件单独成区,不与默认档混行。
3. 并排对比 Ableton Live 同类区域(只读观察:`computer.window({app:"Live"})` 的 screenshot/zoom/ax;**不要点击或改 Live 工程、不抢焦点**),调整到同一密度量级,记录对比表(Live 观察→画廊实现→差异)。
4. 以组合 Gallery 同屏比较控件组、卡片、工具栏、展开/收起面板，协调者亲自评审跨区域对齐、垂直居中、卡片 gap、按钮 gap、padding 与共享 token。状态通过实际操作和有效原生回归验证；深浅/中英用少量整体 overview，局部截图仅定位具体缺陷。
5. 发现问题先改再重新截图确认,报告写修了什么;控件本体(`ui/controls/**`)的缺陷也可以修,但每处修改要写明依据并保持既有测试断言不被删弱。
6. 截图输出仓库外或 Git 忽略目录，不批量提交图片；提交可重跑 Gallery 入口、必要行为回归与整体评审结论。

## Constraints

- 拥有路径:`apps/gpuix/src/gallery/**`、`apps/gpuix/src/ui/controls/**`、`apps/gpuix/src/shared/theme/**`(仅新增已批准的 token)。
- 不动 `project/**`、`crates/**`、`ui/panels/**`。不新增依赖。不 push,不碰 `main`,不碰其他 worktree。
- 进程清理强制:画廊窗口验证完立刻关(用带 name 的 service 启动并 kill);`worker_done` 前贴 `ps` 零残留输出。

## Observable acceptance

- `tsc --noEmit`、`bun test`、`pnpm exec eslint apps/gpuix/src` 通过(贴命令与计数)。
- 报告含整体布局与共享入口检查、必要的间距/token 对照、Live 同区域比较、修复与未验证路径，不以逐按钮截图数量作为验收。
