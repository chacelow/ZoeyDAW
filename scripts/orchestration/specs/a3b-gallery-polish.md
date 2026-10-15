# A3b gallery-polish:控件画廊的间距、居中与紧凑感修正(含逐状态视觉证据)

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
4. **逐状态逐控件截图并放大**(这是 `docs/architecture/gpuix-ui-standards.md` 第 13 节的要求,A3 没做到):每个控件的默认、悬停、按下、聚焦、禁用、激活、预编辑、编辑各一张,放大看居中(文字、数值、图标)、同组等高、纯图标控件为正方形、数值控件宽度在内容变化与进入编辑态时不抖动。用 `win.ax()` 的 bounds 量出实际值与 token 核对,表格写进报告。深色与浅色、中英文各复核一遍。
5. 发现问题先改再重新截图确认,报告写修了什么;控件本体(`ui/controls/**`)的缺陷也可以修,但每处修改要写明依据并保持既有测试断言不被删弱。
6. 关键截图复制进 `apps/gpuix/src/ui/controls/evidence/`(命名含控件与状态),小体积,提交。

## Constraints

- 拥有路径:`apps/gpuix/src/gallery/**`、`apps/gpuix/src/ui/controls/**`、`apps/gpuix/src/shared/theme/**`(仅新增已批准的 token)。
- 不动 `project/**`、`crates/**`、`ui/panels/**`。不新增依赖。不 push,不碰 `main`,不碰其他 worktree。
- 进程清理强制:画廊窗口验证完立刻关(用带 name 的 service 启动并 kill);`worker_done` 前贴 `ps` 零残留输出。

## Observable acceptance

- `tsc --noEmit`、`bun test`、`pnpm exec eslint apps/gpuix/src` 通过(贴命令与计数)。
- 报告含:间距对照表(量出的像素值 vs token)、每控件每状态的检查结论与截图路径、与 Live 的对比表、修了什么、未验证项。未验证的写「未验证」。
