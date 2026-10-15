# B2 timeline/minimap 验证记录

2026-10-15，分支 `gpuix-b2-timeline-minimap`，代码合入点 `a6aad34`。已同步 A3b 第一增量、统一 metrics 与主干波形组件，最新全应用类型检查和测试通过。尚未完成的视觉状态、帧统计诊断、G1 与 A3b 第二增量单列，不将本记录写成全部验收通过。

## 迁入清单

源根目录为 `apps/web/src/pages/project/sections/ArrangementPanel/`。目标相对 `arrangement/timeline/`，原 web 文件保持只读。

| 来源 | 目标 | 行为与复用 |
| --- | --- | --- |
| `MiniMap/index.tsx`、`MiniMap/OverviewCanvas/index.tsx` | `minimap/index.tsx` | 原生 Clip 色带、源轨道行、定位点、播放位置与视口选框。折叠组的源行保留，Return/Main 不进入 overview |
| `MiniMap/useMinimapGesture.ts` | `minimap/gesture.ts` | 原生光标捕获、隐藏与恢复；按下基线、抖动阈值、双边缩放、epoch 与取消所有权。计算复用 B1 `viewport/minimap`、`viewport/zoom` |
| `Timeline/Toolbar/index.tsx` | `toolbar/index.tsx` | 共享 Button、菜单与数值控件。Snap、网格、绘制、Automation、缩放、快照和电脑 MIDI 状态来自真实 Store |
| `Timeline/Viewport/useTimelineViewport.ts` | `viewport/controller.ts` | 测量、夹取、滚轮、缩放、reveal 与 Follow。权威 scroll/zoom 在 workspace |
| `Timeline/useArrangementKeyboard.ts`、`useMidiKeyboard.ts`、`drawModeKey.ts` | `keyboard/controller.ts` | 单一键盘 owner；输入/菜单保护、Space、网格、历史、MIDI、held-B 与项目 epoch |
| `Grid/geometry.ts`、`canvas/painters/grid.ts` | `grid/index.tsx` | 绘制壳使用 B1 `rulers/grid-lines`，不复制网格计算 |
| `canvas/painters/rulers/{index,time,markers,loop}.ts` | `rulers/index.tsx` | 音乐位置、BPM 真实时间、编号区域、定位点与循环。Shape 使用共享 SVG 序列化 |
| `canvas/interactions/rulers/{index,markers,loop}.ts` | `rulers/controller.ts` | preview/commit/cancel、一次历史、项目 epoch、选中定位点与循环边界 |
| `canvas/interactions/rulers/RulerMenuItems`、`MarkerEditor` | `rulers/Menu.tsx`、`MarkerEditor.tsx` | 共享菜单/Input；原生提交、取消与 select-all-on-focus |
| `canvas/interactions/autoScroll.ts`、`coordinates.ts` | `viewport/auto-scroll.ts`、`coordinates.ts` | 原生帧源驱动、接受后的视口坐标与同帧预览重算 |
| `Timeline/TimelineCanvas.tsx` 的本切片组合职责 | `controller.ts`、`ArrangementTimeline/index.tsx` | 唯一 Scene 投影、窗口键盘 owner、Minimap 下唯一音乐横条。复合轨道行与 overlay 经 slot 提供 |

经协调者批准的共享增量包括 ControlledScrollbar、PROJECT_METRICS 时间线度量、B1 标尺纯函数及密度修正。两个纯性质测试由协调者移入 `core/rulers/`，timeline 不保留副本。

## 与 web 的差异

- Minimap 下拖缩小、上拖放大，修正 web 的反向行为。主体平移保持固定 PAN_DRAG_SCALE，不增加速度或阻尼。
- Ctrl/Cmd+E 不再承担网格细分。无 Clip 选择时消费且不改网格，有选择时由 lane Split。此归属按协调者核实的 Live 行为收敛。
- 音乐位置按真实拍号分母换算十六分音符，4/8 不按每拍四个十六分音符显示。
- 正常缩放的 Pattern 区域逐小节交替。低于既有 8px 可读单元时按 2 幂合并。编号、背景区域与可调网格分开派生。
- 标尺多档 Live 阈值与极端缩小时的区域合并没有完成 Live 实测。8px 合并是协调者批准的密度约束，不标作 Live 的已观察阈值。
- 原生帧、窗口失活与光标能力由组合根注入，不创建浏览器 Canvas、DOM 监听、JS 走带时钟或轮询链。

## 自动检查

| 实跑命令 | 结果 |
| --- | --- |
| 根目录 `pnpm install --no-frozen-lockfile` | 通过，依赖与锁文件无需更新 |
| 根目录 `node scripts/gpuix-main/check.mjs --resolution` | 通过，同一 patched native/host/React renderer |
| 根目录 `pnpm native:build` | 通过 |
| `apps/gpuix` 中 `bun test src/project/sections/arrangement/core/rulers src/project/sections/arrangement/timeline` | 早期基点 `9faa2e2` 为 55 pass，0 fail，461710 assertions，10 files；之后新增两项 B 回归 |
| `apps/gpuix` 中 `bun test` | 最新 614 pass，2 todo，0 fail，582266 assertions，616 tests、108 files |
| 根目录 `pnpm exec eslint apps/gpuix/src/project/sections/arrangement/timeline` | 通过，0 输出 |
| 根目录 `node scripts/gpuix-review-scan.mjs` | 21 source、9 test files；0 hard、0 warn，包含本切片 eslint 检查 |
| `apps/gpuix` 中 `pnpm exec tsc --noEmit` | 最新通过，0 错误 |
| `apps/gpuix` 中 `bun -e` 原生 runtime/clip-editor B smoke | `backend=ready`、`heldRestored=true`、`tapLatched=true`、`backendAccepted=true` |

早期 `9faa2e2` 的全应用测试曾有 10 项共享失败、4 处 KeyEvent 类型错误，已报告协调者且由 `593d771` 第一增量修复。未修改共享断言来回避失败。全套中的 2 项 todo 是既有项，不计为本切片已实现行为。本切片没有 Rust 源码修改；native 构建通过不等同于 cargo check/test 已运行。

## 实际变异检查

| 变异 | 命令与失败数 | 恢复 |
| --- | --- | --- |
| `rulerLabel` 把实际 denominator 固定为 4 | `bun test src/project/sections/arrangement/core/rulers/ruler.invariants.test.ts`，1 pass / 1 fail。五种拍号性质捕获 `710.2.2` 被错误显示为 `710.2.3` | 恢复原参数 |
| `adjacentMarker` 的 previous 比较从 `>=` 改成 `<=`，取最远而非最近定位点 | 同一命令，1 pass / 1 fail。性质捕获期望 61、实际 3 | 恢复原比较 |
| 去掉极小缩放的 Pattern 区域合并 | 前序密度变异实跑 1 fail，协调者另行独立复跑 1 fail | 已恢复，B1 合入 `09047c4` |
| B 分支移回 clip-editor 早返回之后 | `bun test src/project/sections/arrangement/timeline/keyboard/controller.test.ts -t 'clip-editor B'`，0 pass / 2 fail。持按绘制与轻按锁定都被错误委派 | 恢复，全套 614 pass / 0 fail |

前两项恢复后，重新执行 timeline 与 core/rulers 组合，55 pass / 0 fail。性质检查覆盖五种拍号的 1000 个位置、500 组无序定位点及 1200 组缩放/裁剪。

## 真实原生窗口

运行方式为 `bun --hot`，每次使用带 name 的 service。临时入口已删除，不把测试数据或焦点查询替代方案留在生产目录。工程内容由公开 projectActions 创建，经真实 native backend 接受；没有 mock backend、mock media 或另一份组件工程数据。

### 独立 Minimap

- `whenProjectBackendIdle()` 返回 true，AX 显示 `Backend: ready`。
- 点击 Play，AX 的 playing 从 false 变 true；点击 Pause 恢复 false。
- 点击选框外部，AX 的共享横条与状态文本同时从 scrollX 1800 更新到 6002，px/bar 保持 100。
- 双击 Minimap，AX 变为 scrollX 0、px/bar 6.219。
- 两条 MIDI/Pattern Clip 色带来自真实 Store 中的作者命令。当前原生引擎不合成 MIDI，此验证不声称这些 Clip 发声。
- 证据：[初始状态](native-minimap-before-2026-10-15.png)、[双击适配后](native-minimap-fit-2026-10-15.png)。

### 独立 Timeline

- 挂载真实 ArrangementTimeline、controller、WindowKeyboardProvider、AnimationFrameProvider、WindowPlatform、ControlEnvironment 与 PanelEnvironment。
- 截图观察音乐标尺逐编号明暗、细/粗网格、BPM 时间标尺、固定 Minimap、唯一音乐横条与 toolbar。
- 点击 Zoom in，AX 从 100 px/bar 变为 125 px/bar，中心锚点对应的 scrollX 变为 122。
- 打开 Grid 菜单，AX 包含 Adaptive、固定 16 Bars 到 1/256。选择 1/4 后，下拉与角落网格读数同时更新。
- 真实 `ctrl+1` 把 1/4 改成 1/8，`ctrl+2` 回到 1/4。无选择的 `ctrl+e` 不改该网格值。
- 证据：[标尺与网格](native-timeline-2026-10-15.png)、[网格菜单](native-grid-menu-2026-10-15.png)。
- 此临时验证从真实 renderer 树读取当前焦点，仅用于独立窗口。没有把整树查询做成生产焦点 API，也没有宣称验证 A3b 的最终共享焦点接口。

协调者消息 `msg_08ab439e20ba` 明确真实 TrackRows/LaneRow/Overlay 的组合验收归 app-shell。本切片的独立窗口没有用假轨道行替代这些组件。

### 租约内尺寸与数值状态

协调者批准 01:38–01:44 UTC 的桌面独占时段。01:43:36 前已结束输入并关闭窗口，已发送 `msg_9b3eb8182af9` 释放桌面。此入口使用 `platform/cursor.nativeCursorLock`，没有直接 napi import。

| 对象 | AX 实测 | 对应契约 |
| --- | --- | --- |
| 所有 toolbar 控件高度 | 13px，同一 y=250 | `--spacing-control-track=13` |
| Zoom out/in | 13×13px | iconOnly 使用同一 track 度量 |
| Snap→Grid、Grid→A、A→B、B→Zoom、两 Zoom 间、Save→Restore、MIDI→Octave、Octave→Velocity | 各 4px | `--spacing-control-track-gap=4` |
| Minimap | 1280×32px | `minimapMinHeight=32` |
| 唯一音乐横条 | 1280×10px | `--spacing-control-icon-slot=10` |
| Minimap 分隔条 | 1280×7px | `panelGap=7` |
| 音乐标尺 | 976×34px | `1280-controlsWidth304`，`17+17` |
| 时间标尺 | 976×18px | 同一音乐宽度，`TIME_RULER_HEIGHT=18` |
| Octave 4→5 | 前后均 61×13px | 内容样本固定宽度，没有值变化造成的宽度抖动 |

AX 记录 Snap on→off。Octave 经真实双击/Enter 进入 textfield，AX setValue 的完整值确认失败后先读取 AX，确认仍是旧值；随后原生 Cmd+A、键入 5、Enter，AX 返回 Octave 5。没有重复发送失败的文本写入。

截图包括[默认控件](native-controls-default-2026-10-15.png)、[编辑时画面](native-controls-edit-2026-10-15.png)、[控件局部](native-controls-detail-2026-10-15.png)。编辑态和提交态截图的 SHA-256 完全相同，均为 `aae34ad941e682622f2068a79124a37b787677088837791b9a122af69c85fb7b`，虽然 AX 已由 textfield 变为 Octave 5。删除了重复提交态图片。此结果只能证明 AX 与行为状态转换，不能证明像素已跟随背景输入更新。原因尚未判定，已列为视觉验收限制。

## 自审结果

Standards 与 Spec 分别由只读 `TimelineStandards`、`TimelineSpec` 审查。审查不是运行证据，测试、窗口与扫描结果单列。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| onScroll 与 onLayout 重复测量 | 必修 | 删除 onScroll 测量，仅 onLayout 更新尺寸 | `4f4c9bd`，ArrangementTimeline 现有 onLayout |
| Minimap 重复拖动阈值 | 必修 | 调用 B1 dragStarted | `4f4c9bd`，minimap/gesture.ts |
| 两套 fit-to-project 计算 | 必修 | MiniMap 只调用 controller.fitToProject | `4f4c9bd`，统一工程范围回归 |
| UI 拼音乐标签、排序邻近定位点 | 必修 | 经批准移入 B1 rulerLabel/adjacentMarker | `b481308`，性质与本轮两个变异 |
| reveal 没有消费者、verticalScroll 空出口 | 必修 | reveal 接入真实 editingClip 变化；删除无用 label | `4f4c9bd`，167→34 reveal 回归 |
| 公共接口与文档未登记 | 必修 | 登记 controller/view、ControlledScrollbar barrel、core 签名 | `68d41bc`，timeline README |
| 粗线追随标尺细分 tick | 必修 | Pattern 边界与 rulerTicks/gridPlan 分层 | `b481308`、`e4a618d`、`09047c4`，密度性质 |
| 控件 Enter/Backspace 同时操作定位点 | 必修 | 选择类 claim 仅在 timeline 焦点运行 | `4f4c9bd`，原生 Snap Enter 回归 |
| 假 consumed 参数没有实际消费信号 | 汇报仲裁 | 删除假参数；共享控件 wheel 截断交 A3b | 两轴已报告；本轮共享门禁仍失败，不宣称消费链已全部验收 |
| 对外键盘工厂可能产生第二 owner | 汇报仲裁 | 移除运行时公开出口，由 controller 唯一持有 | public-contract.test.ts 与模块 README |
| 标记、编辑器与线宽借用轨道头 token | 汇报仲裁 | 协调者批准独立语义度量，按 web 来源取值 | `d201316`、`d471442`，README 来源度量表 |
| Pattern 明暗是否跟随四小节标签跨度 | 汇报仲裁 | 协调者裁定正常逐小节、不可读时按既有 8px 合并 | `e4a618d`，协调者 `09047c4` 独立复跑 |
| 继承的 autoscroll/Follow 数字缺少名称 | 记录 | 保持 web 原行为，不为命名重构扩展本轮 diff | viewport/auto-scroll.ts、viewport/controller.ts |
| MIDI UI 范围与 adapter 夹取重复 | 记录 | UI 保留可编辑范围，adapter 保留数据边界 | toolbar/index.tsx、adapters/midi.ts |
| Minimap 展示框位置的简单派生重复 | 记录 | 保留局部绘制派生，无第二份可写状态 | minimap/index.tsx |
| 真实帧、失活、Input select-all 原先缺失 | 记录 | F1 已提供；本轮真实帧/失活端口组合实跑，select-all 有原生回归 | 独立 Timeline 记录与 MarkerEditor 测试 |
| 真实 TrackRows/LaneRow/Overlay 未到当前分支 | 汇报仲裁 | 协调者把跨切片组合验收归 app-shell | `msg_08ab439e20ba` |
| cursor 隐藏后仍受屏幕边缘限制 | 记录 | 与共享 DragPad 相同，未增加第二套原生机制 | CursorLockPort 当前只捕获、隐藏、恢复，不声称无限拖动 |
| 工具栏 MIDI 组不再使用 web 的 ml-auto 右对齐 | 记录 | 使用同一可横向滚动工具栏，功能与状态保留 | toolbar/index.tsx、native-timeline 截图 |
| 新 sections 分层规则 | 必修 | 临时入口已删，生产只收 CursorLockPort；README 登记 platform/cursor 注入 | `817b179` 同步后的 eslint/scan 0 hard、0 warn |

## 与 Live 对比表

本轮只读截图与 AX，没有点击、拖动或按键操作 Live。[当前标尺局部](live-ruler-readonly-2026-10-15.png) 来自真实 Live 窗口的放大截图。

| Live 观察 | 实现 | 结论 |
| --- | --- | --- |
| AX 拍号为 4/8，标尺可读到 3.1.2、3.2、3.2.2、3.3 | rulerLabel 按 16/denominator 计算，五种拍号性质通过 | 音乐位置规则一致；本轮独立 Timeline 截图默认 4/4，不冒充同拍号像素对照 |
| 当前 Arrangement 网格角标为 1/32，标签层同时显示拍与十六分位置 | gridPlan 与 rulerTicks 独立 | 分层方式一致，多档变档阈值未验证 |
| Live 顶部 overview 与音乐标尺独立，轨道区域在下方 | native Timeline 的独立 Minimap Panel 与同一音乐横条 | 结构一致；真实复合行滚动交 app-shell |
| Live 使用紧凑工具栏、弱标尺文字、低对比网格 | 原生 toolbar/标尺使用共享度量与 arrangement 色系 | 已有默认与菜单截图；没有做跨应用同缩放的精确像素对照 |
| 多级缩放、极端稀疏区域与 Minimap 光标手势需要操作 Live | 未操作用户 Live 工程 | 未验证，不把推导写成观察 |

## 视觉检查范围

| 检查项 | 已有证据 | 尚未验证 |
| --- | --- | --- |
| 间距 | 租约窗口的八组相邻 gap 实测 4px，与共享 token 相等 | toolbar 左边距 AX 为 1px、token 1.5px，取整原因尚未核实 |
| 居中 | 所有 toolbar 控件同 y、同高；Octave 4→5 前后宽61/高13一致 | 文字与图标的精确内部中心、光学对齐仍未量值 |
| 尺寸 | toolbar 高13，两个 Zoom 13×13，Minimap32/横条10/divider7/music34/time18，均匹配 token/B1 | 不再把首个临时布局的27px当作生产 Minimap 尺寸 |
| 紧凑感 | 原生与 Live 的默认截图均为紧凑工作站布局 | 同缩放并排量化，不能据此声称逐项等量 |
| 对齐与裁切 | Grid 菜单可读到 1/256，选择后两个读数同步 | 窄窗口与全部弹层方向；共享 ControlGroup/DropdownButton 已有失败，等待 owner 修复 |
| 颜色与状态 | 默认/菜单截图与 Snap、数值编辑的 AX 状态已取证 | 后台输入后的编辑/提交截图相同，不能宣称所有状态的像素验收通过；hover/pressed/disabled 未取证 |

## 未验证项与阻塞

- A3b 第一增量已解除 KeyEvent 类型与旧几何补偿失败。MenuTrigger Space/Enter、嵌套右键、DragPad wheel 祖先隔离、NumericPad fill/中线及最终焦点查询仍等待第二增量，不宣称这些路径已全部验收。
- 前台光标手势控制的人工确认超时，随后 control.state.active=false。没有绕过前台授权。隐藏光标的物理拖动、分隔条松手位置仍没有本轮 computer 证据；createTestRoot 手势回归与 cursor 生命周期断言已通过。
- 对比真实 Live 的多档缩放阈值与极小明暗合并尚未完成。保留只读对照计划，不改动用户 Live 工程。

## 进程清理

| Service | PID | 结束时长 | 结果 |
| --- | --- | --- | --- |
| `timeline-minimap-native-smoke` | 28212 | 43.9s | 未初始化窗口的首次尝试，已 kill |
| `timeline-minimap-window` | 29840 | 1m38s | 走带按钮验证后 kill |
| `timeline-minimap-navigation-smoke` | 40048 | 28.1s | 点击/双击与截图后 kill |
| `timeline-independent-native-smoke` | 48643 | 2m45s | 标尺、菜单与键盘验证后 kill |
| `timeline-leased-visual-smoke` | 46863 | 4m28s | 租约内尺寸与数值编辑验证后 kill，01:44 前释放桌面 |

实际运行 `ps -axo pid,etime,command`，再用 grep 工具对完整输出匹配用户指定的 `bun .*--hot|cargo run|gallery|demo`。结果为 `No matches found`，没有匹配残留。未启动或停止用户已有应用。

## 错题与已验证做法

### 外部 Store 更新需要提交 React

- 错：单独 `renderer.flush()` 后认定组件已跟随 Zustand/Scene 变化。
- 对：原生组件测试先 `flushSync` 提交 React，再 native flush 绘制。
- 因：外部订阅的 React 提交与 native 绘制不是同一时机。
- 证据：Minimap jitter、外部 Scene 与定位点编辑回归。

### 原生控件先处理，窗口键盘随后处理

- 错：靠窗口 owner 撤销 Button 已执行的 Space 或已消费数值控件 wheel。
- 对：共享控件在元素边界拦截自身输入，窗口 owner 保护文本/菜单并只消费已处理的全局键。
- 因：原生事件与 GPUI action 的执行顺序不能由事后的窗口回调逆转。
- 证据：原生 Snap Enter 不再同时触发定位点重命名；A3b 仍负责最终共享 Space/wheel 边界。

### Git 目录重命名不能改变层级意图

- 错：移动两个纯测试时，接受 Git 将整个 timeline 推断迁到 core/rulers。
- 对：逐路径核对 HEAD/MERGE_HEAD，恢复 25 个 UI 文件到 timeline，仅两个纯测试留在 core/rulers。
- 因：目录 rename heuristic 不能判断 UI 与纯计算的职责边界。
- 证据：`9faa2e2` 无未解决冲突，55 个组合测试通过。协调者已设置 merge.directoryRenames=false。

## 第二增量记录

- 已消费主干 `03c869e` 的 G1 修复，`cursor.capture(point)` 使用按下事件窗口坐标。额外发现 MiniMap UI 会把缺失坐标补零，已在输入边界删除补零。三项新增原生组件回归修前均失败，修后 timeline/core-rulers 60 pass、0 fail、461737 assertions。真实 native runtime 与 nativeCursorLock 的独立 smoke 接收三种不完整事件，保持 pxPerBar=100、scrollX=4000，backend=ready。
- F1 诊断样本见 `native-frame-stats-2026-10-15.json`。native frames 从7增长到39，callbacks从650增长到3607，active均为true。基准与编辑截图 SHA 分别为 `ef06e6f64ce71a73eaa82aad930632ab8dcf2901a4e6550efaad7ddd7c09c6dd`、`34e5b582c9f0f262d5d91b265f6d811bbbd8da60b58130e6cfe160d9a5fe3f10`。本轮未复现停帧，不据此修改业务。
- 协调者 `msg_b2ab15895104` 将 Octave 输入后 A 泄漏到 Automation 的验收归到 app-shell 的真实 focus() 注入。新增文本焦点回归覆盖 a、Cmd+A、数字均不被 timeline 消费，工作区与音乐位置保持不变。
- frame probe 已关闭，实际存活6m8s，清理晚于租约边界。之后验证了 Node child_process timeout 的命名 service 自动终止路径，1秒期限后退出124。后续窗口必须在启动时同时配置自动生命周期期限，不能仅靠事后时钟检查。
- hover/pressed、隐藏光标物理拖动及所有状态像素验收仍未完成，不因 AX 与计数通过而记为完成。
