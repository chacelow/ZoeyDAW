# R2-ui：控件手势与窗口键盘所有权

## 范围与决策

- 实现提交：`21f0734f`；idle Escape 自审修复：`407f91fc`。覆盖 UPA-04、UPA-05、UPA-06、UPA-07，以及协调者追加的 ARR-05 MenuTrigger Tab 排除能力。
- UI 内复用 `cancelDrag`、既有 cursor port 和 Menu navigation；没有新增依赖、主题 token、Rust 或事件源。
- 协调者批准两个跨路径点：`app/NativeRoot.tsx` 的 controls 注入同一个 `window.subscribeApplicationActive`；真实业务组合 smoke 由 `app/verification/r2-ui-smoke.tsx` 持有，避免 UI 向 app/platform/project 反向依赖。
- 窗口 activation 订阅通过 React `useEffectEvent` 读取最新取消回调，订阅只依赖环境源，不随数值预览重建；见 [React 官方说明](https://react.dev/reference/react/useEffectEvent)。只取消存在 anchor 的手势，不把文本编辑误作拖动取消。
- Menu 的 Tab 关闭菜单后保留原生焦点前进；工具栏 trigger、数值根和 CollapseDivider 的 Space 仍冒泡给播放；菜单项自身 Space 仍选择并消费。

## 行为回归：先红后绿

入口（在 `apps/gpuix` 执行）：

```sh
bun test src/ui/verification/r2-controls.test.tsx
bun src/ui/verification/mutations-r2.mjs
B2_EVIDENCE_DIR="$EVIDENCE_DIR" bun src/app/verification/r2-ui-smoke.tsx
```

`EVIDENCE_DIR` 由调用方提供一个隔离目录。永久测试使用真实 `createTestRoot` 输入与真实 Arrangement `createTimelineKeyboard` 窗口 owner；只替换会改变宿主光标状态的端口与窗口 activation 通知。

| 条目 | 修前实际失败 | 修后行为 |
| --- | --- | --- |
| UPA-04 | 失活后 BPM 仍为 130，期望恢复 120 | 恢复 120、光标可见且回按下点、事务取消；之后 move/up 不提交；卸载释放订阅 |
| UPA-05 | Home/End/Up/Down/Escape/子菜单 Left 出现在 window received；另补 Enter/Up/Down/子菜单 Right 四条红回归 | Menu 独占已处理导航和开关命令；Home 不 rewind，Escape 不关闭 Clip Edit，Left 不移动播放位置 |
| UPA-06 | Home/End/Up/Down 到达窗口 owner | 分隔条独占导航与活动取消；Home/Up 展开，End/Down 折叠，活动 Escape 回滚；idle Escape 与 Space 仍到窗口 |
| UPA-07 | Escape 虽回滚 BPM，却继续到达窗口 | 只取消活动数值事务/预编辑，保留 Clip Edit，光标恢复；idle Escape 可关闭弹层或 Clip Edit；Space 仍播放 |
| ARR-05 追加项 | ContextMenuTrigger asChild 显式 `tabIndex=-1` 的宿主实际为 0 | 显式 -1 保留，缺省仍 0；真实 Tab 跳过从属 trigger，进入下一入口 |

最初四条问题共 13 条回归全部红；追加 Tab 回归红；补菜单 opening 四条回归全红。独立 review 又抓住两个 idle Escape 过度消费问题，补三条实际红回归后修复，并删掉原先错误固化 idle divider Escape 的 case；最终定向入口 20 pass / 0 fail / 95 expect。

| 变异（还原对应缺陷）                | 被抓住的失败测试数 |
| ----------------------------------- | -----------------: |
| UPA-04：不在失活时取消              |                  1 |
| UPA-05：移除 Home/End 消费          |                  2 |
| UPA-06：移除分隔条消费              |                  5 |
| UPA-07：移除 Escape 消费            |                  1 |
| ARR-05：重新写死 trigger tabIndex=0 |                  1 |
| UPA-07：重新吞掉 idle Escape        |                  2 |
| UPA-06：重新吞掉 idle Escape        |                  1 |

变异脚本先运行正常基线，并在 `finally` 恢复源文件；只有命中指定行为断言且非语法错误才计为抓住。

## 实际原生运行

- `r2-ui-smoke.tsx` 组合真实 AppShell、窗口 keyboard 和 `app/verification/native-fixture.ts` 后端：Home 新建 → 原生会话 ready → 选中 MIDI track → Footer Home → Device Menu Home/Escape → 打开 MIDI Clip Edit → Transport BPM 拖动 Escape → 再拖动并失活 → 释放会话。
- 实测 Footer/Menu Home 均保留第 9 小节；Transport Escape 回滚 BPM 并保留 `native-midi-clip`；失活回滚 BPM 并释放 cursor port；真实遥测 sample-rate=48000、playing=false、recording=false，应用序列已确认；卸载后后端 idle 且 activation listeners=0。
- 输出完整业务组合图 `project-en-US-dark.png`、`project-en-US-light.png`、`project-zh-CN-dark.png`、`project-zh-CN-light.png`，以及 `gallery.png` 和 `project.ax.json`。生成物只留调用方证据目录，不提交 PNG。
- 自己启动的命名后台 service `r2-ui-window` 使用 `GPUIX_BACKGROUND=1 bun --hot` 启动隔离 NativeRoot 工程窗口；日志 `created native window`、`mount complete`、`r2-ui-window-ready`。只读 AX 看到 `zoeydaw R2 UI probe` 窗口 chrome，遮挡窗口未产出业务 AX，不能据此声称前台画面或 OS 失活端到端已验收；获取证据后立即 kill，运行 17.2 秒，随后删除临时 probe。

## 产品规则 → Live 观察 → 实现 → 差异/未验证

| 产品规则 | Live 只读观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 数值手势失活取消并恢复光标 | 读取现有 Live 窗口与 AX，观察到走带、速度/节奏、Arrangement 和装置详情；没有改真实工程或激活其拖动 | 复用数值取消路径与 native activation 源 | Live 的失活拖动行为、宿主真实光标多显示器效果未实测 |
| 菜单导航不能同时编辑工程 | 只读读取选项菜单，确认绘制模式 B、电脑 MIDI 键盘 M、网格 Cmd+1…5 等独立命令；没有打开用户工程的上下文菜单 | 消费 Menu 的局部命令，窗口 timeline 不接收 | Live 菜单 Home/Escape/Left 的动态输入未实测；本项目行为由原生组合回归确认 |
| 固定 Footer 分隔条 Home 不 rewind | AX 可见 Live 装置详情与 Arrangement 为独立区域 | CollapseDivider 独占导航 | 不声称 Live 有同名或相同 Home 分隔条语义 |
| Space 属于窗口播放 owner | 本轮未向 Live 发送 Space，以免改变用户播放位置 | 控件根不吞 Space，菜单项 Space 保留选择 | 本项目测试确认播放，Live 动态行为未验证 |

## UI 规范第 13 节

| 检查 | 本轮证据与结论 |
| --- | --- |
| Gallery 与业务整体布局 | 离屏真实 Gallery 与 AppShell/native fixture 完整组合图；未改布局和样式；前台整体评审交协调者 |
| 跨区域对齐与居中 | 已打开 Gallery 与英文深色、中文浅色完整 raster，标题、Transport 数值与面板关系可复查；未改几何，未宣称全部前台像素验收 |
| 间距与内边距 | 生产样式无 diff；仍使用原共享 token，未增加实例 padding/gap |
| 统一设计入口 | 只改共享行为与 provider 注入；圆角、边框、间距入口不变 |
| 尺寸与紧凑感 | Gallery 与业务组合保留原密度；本轮不改尺寸；Live 无并排尺寸验收声明 |
| 深浅主题与中英文 | 同一业务组合捕获四组；Gallery 本轮仅英文深色，完整 Gallery 四组前台复核留协调者 |
| 状态与键盘 | 20 条真实原生回归，覆盖菜单导航/取消、Footer 导航、Space 播放、Tab 排除、数值活动取消/idle Escape 放行及 popup 关闭恢复焦点；原生业务 smoke 另证内容与播放位置不受串扰 |
| 拖动、滚轮、弹层与性能 | 实际 BPM 拖动 Escape/失活回滚、Menu 操作；本轮未改滚轮与渲染，未测真实前台帧耗时，不作性能完成声明 |

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `bun test src/ui/verification/r2-controls.test.tsx` | 20 pass / 0 fail |
| `bun src/ui/verification/mutations-r2.mjs` | 7/7 变异抓住对应行为断言 |
| `B2_EVIDENCE_DIR="$EVIDENCE_DIR" bun src/app/verification/r2-ui-smoke.tsx` | 真实工程行为链通过，输出组合 raster，卸载无会话/activation 订阅残留 |
| `pnpm exec ultracite fix <本轮改动文件>` | 通过；提交 hook 的 ultracite/lint-staged 同样通过 |
| `node scripts/gpuix-review-scan.mjs` | HARD=0；WARN=1，见自审表 |
| `pnpm verify:gpuix`（worktree 根，含自审修复） | 通过，末行 `verify:gpuix passed`；tsc=0 errors、eslint=0 warnings、architecture=80 pass、Bun=1244 pass / 1 todo / 0 fail（196 文件）、UI map current、真实后端 resume smoke 释放 idle |
| `ps -axo pid,etime,command` 按 `bun .*--hot\|cargo run\|gallery\|demo` 过滤 | `(no matching processes)`；自己的 service 已关闭，未停止用户进程 |

Rust 未改，不将 native 构建称为 Rust 修改验收。最初全量 verify 被 renderer manifest 新旧格式差异阻断；按协调者指令同步 `gpuix-migration` 的 TD-03 工具修复（合并提交 `f887a014`）并执行 `build.sh` 后最终通过。本次脚本仍输出 identity mismatch 后的 native release/host React tsc 构建（并非仅建链接），已如实通知协调者；未删除共享锁或手动 `--record`。

## 自审结果

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| app composition smoke 最初放在 UI 造成跨层依赖 | 必修／已批准跨路径 | 经协调者批准移至 `app/verification/r2-ui-smoke.tsx`，没有 lint 豁免 | ultracite 分层错误 → 移动后通过 |
| offscreen smoke 4 个视口宽高裸值 | 记录 | 固定验收视口而非组件设计值，不加入主题 token；与既有 smoke 入口同约定 | scanner 唯一 `px-literal` WARN，1280×800 业务视图与 1050×780 Gallery |
| Reviewer Standards S1 / Spec P1：idle DragPad 吞 Escape | 必修 | 限定仅 anchor/preEdit 取消才消费；idle popup Escape 正常关闭且还焦点，idle root Escape 可关闭 Clip Edit | 三条新增红回归之一；修后定向绿，idle 数值变异抓住 2 条 |
| Reviewer Spec P2：idle divider 吞 Escape，旧测试固化错误行为 | 必修 | cancel 从 anchor 返回是否实际取消；idle 放行；删除错误 case，改为活动拖动取消后第二次 Escape 交给窗口 | 新增红回归；修后定向绿，idle divider 变异抓住 1 条 |

独立 `pstack-reviewer` 初审命令：`git diff gpuix-migration...21f0734f`，提交列表 `21f0734f`；Standards 1 项、Spec 2 项（重叠后两处缺陷）。复核 `407f91fc` 对应五个源码/回归/变异文件的完整增量后，明确 S1/P1/P2 全部关闭，Standards 与 Spec 无剩余 findings；子代理未编辑文件、未运行测试/构建/lint。最终可复查实现 diff：`git diff gpuix-migration...HEAD`；提交列表还含协调者要求的同步 merge `f887a014`。

## 错题

- 错：只让局部 handler return，误以为已阻止窗口快捷键；焦点转移或菜单关闭不等于消费原始事件。对：处理同一次原生 KeyEvent 时同时 `preventDefault` 与 `stopPropagation`，保留明确未消费的 Space/Tab 默认行为；用实际 window keyboard + timeline owner 断言状态不串扰。
- 错：把依赖 AppShell、platform 和 ProjectBackend 的验证脚本放在 UI 层。对：行为回归可留 UI 测试，组合 smoke 由 app/verification 持有；没有通过关闭分层规则绕过。
- 工具记录：格式化后立即 LSP rename_file 使用了过期位置，写坏一个 import 偏移；已按真实文件纠正并再次格式/类型验证。后续在跨文件结构操作前刷新 LSP 文档状态。

## 已验证做法

- 共享 `ControlEnvironment` 注入同一个原生 activation 源；DragPad 不另建窗口 observer，取消统一恢复值、资源与事务。
- `createTestRoot` 的真实原生 keystroke 顺序可以稳定抓住局部键漏到窗口的副作用；保留真实 timeline owner 比断言 helper 返回值更有效。
- 原生像素组合与真实后端 smoke 不需要争用前台桌面；宿主光标操作通过已允许的 cursor port 替换，不隐藏用户光标。
- 每项一条还原缺陷的变异，验证必须命中指定消费者断言；语法错误不计成功。

## 未实现项与验收边界

- 本切片要求与协调者追加项没有未实现功能。
- 未做前台 OS 失活/恢复的光标端到端、人手速度、多显示器、真实前台性能与完整 Gallery 四组视觉复核；后台遮挡不能提供这些证据，按派发要求由协调者在前台收尾，不申请桌面。
- 不修改 Live 工程，Live 对照仅为只读观察；不把本项目回归推断成已验证 Live 的动态行为。
