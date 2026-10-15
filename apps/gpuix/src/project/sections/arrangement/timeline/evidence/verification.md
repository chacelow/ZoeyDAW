# B2 timeline/minimap 补验收

2026-10-15，`chacelow/gpuix-b2-timeline-followup`。消费 `21dace3` 的唯一生产组合根与十一补丁 renderer；实现提交 `1d0ad8e`、`c201494`、`eafddbf`，自审增量 `9d415cf`、`a4bb549`。本轮只补既有 timeline 的证据与绘制路径，不重建工程、键盘或后端 owner。物理输入与共享 Divider 色态仍有明确限制，不能称为全部视觉验收通过。

## 本轮结果

- Minimap 选框现在复用共享 scrollbar 默认/hover/pressed 色层；pressed 在有效按下、抖动、离开边界与拖动期间保持，释放或取消恢复 hover/default。手势控制器通知呈现阶段，不复制 viewport 或增加原生监听。
- 网格线与音乐标尺的 Pattern 背景切换到共享 `useQuadBatch` 命令式上传。几何仍由 B1 产生，typed array 不进入 React props/state。32 组原生 PNG 与旧 div oracle 字节完全相同。
- A3b 的 MenuTrigger、嵌套右键、DragPad wheel 隔离、NumericPad fill/中线、最终文本焦点 lease 已由真实原生回归覆盖；12 个内存变异全部使行为断言失败，不修改共享源码。自审补强后还修复epoch取消首提交残留pressed：取消移到layout effect，原生首帧PNG与settled一致。
- toolbar padding=1.5px、gap=4px 本来就是共享 control metrics，无实例覆盖。协调者明确保留，不改用含义不同的 `theme.design.spacing.toolbarGap.default=2`。Minimap 边框改读 `theme.design.shape.controlBorderWidth`。
- 真正的 `src/main.tsx` 已运行，TrackRows、LaneRow、LaneOverlay 与 timeline 使用同一真实 native session。没有新增第二个验证组合根。

## 迁入清单与保留行为

源根为只读的 `apps/web/src/pages/project/sections/ArrangementPanel/`；目标均相对 `arrangement/timeline/`。原切片已合入，本轮不再次迁移。

| 来源 | 目标 | owner / 行为 |
| --- | --- | --- |
| `MiniMap/index.tsx`、`OverviewCanvas/index.tsx` | `minimap/index.tsx` | 原生 overview、Clip 色带、标记、位置、视口框；Return/Main 不进入 overview |
| `MiniMap/useMinimapGesture.ts` | `minimap/gesture.ts` | 相对手势、原生光标端口、单侧缩放、抖动、epoch、取消 |
| `Timeline/Toolbar/index.tsx` | `toolbar/index.tsx` | 共享控件消费真实 store，单一可横向访问工具栏 |
| `Timeline/Viewport/useTimelineViewport.ts` | `viewport/controller.ts` | workspace 唯一 scroll/zoom，夹取、滚轮、Follow、reveal |
| `Timeline/useArrangementKeyboard.ts`、`useMidiKeyboard.ts`、`drawModeKey.ts` | `keyboard/controller.ts` | 唯一窗口键盘 owner，文本/菜单保护、B、MIDI、历史 |
| `Grid/**`、`canvas/painters/grid.ts` | `grid/index.tsx` | B1 几何投影，经共享 quad 批绘制 |
| `canvas/painters/rulers/*` | `rulers/index.tsx` | 编号区域、音乐位置、BPM 时间、标记、循环 |
| `canvas/interactions/rulers/**` | `rulers/{controller,Menu,MarkerEditor}` | 预览/提交/取消、一次历史、原生菜单/Input |
| `canvas/interactions/{autoScroll,coordinates}` | `viewport/{auto-scroll,coordinates}.ts` | 原生帧驱动、接受后的同步视口坐标 |
| `Timeline/TimelineCanvas.tsx` 的组合职责 | `controller.ts`、`ArrangementTimeline/index.tsx` | 唯一 Scene 投影、slot、固定 Minimap 与唯一音乐横条 |

与 web 的既有差异保持：Minimap 下拖缩小、上拖放大，修正 web 反向缺陷；PAN_DRAG_SCALE 不加阻尼或速度；Ctrl/Cmd+E 归 lane Split，不是网格操作；音乐位置尊重真实拍号分母；不可读的小节区域按既有 8px 密度约束合并。多档 Live 阈值和极端合并仍未实测。Ctrl/Cmd+3 与 +5 仍未实现，README 如实声明，本轮没有擅自增加语义。

## 实跑门禁

| 命令 / 路径 | 本轮结果 |
| --- | --- |
| 根 `bash scripts/gpuix-main/build.sh` | 固定 SHA 和十一补丁验证，复用共享构建，生成本 worktree 链接 |
| 根 `pnpm install --frozen-lockfile` | 通过，未新增依赖 |
| 根 `pnpm native:build` | 通过，真实 native 二进制 |
| 根 `node scripts/gpuix-main/check.mjs --resolution` | patched native/host/React 同源通过 |
| `apps/gpuix` 的 `pnpm exec tsc --noEmit` | 通过，0 错误 |
| 根 `pnpm exec eslint apps/gpuix/src/project/sections/arrangement/timeline` | 通过，0 输出 |
| `apps/gpuix` 的 `bun test --timeout 30000` | 最终 **1150 pass、1 既有 todo、0 fail，1151 tests / 178 files，1104224 assertions** |
| `bun test src/project/sections/arrangement/timeline` | 最终53 pass、0 fail，9 files / 569 assertions |
| A3b 五类原生文件与新 Minimap 状态首轮基线 | 35 pass、0 fail，6 files / 199 assertions；后续store/epoch增强纳入最终timeline与全套 |
| `bun test src/app/project/composition.test.tsx -t 'DragPad native text focus protects'` | 1 pass、7 filtered、0 fail，7 assertions；直接断言 `interaction.isTextFocused()` 与 timeline 模式保护/释放 |
| `bun src/project/sections/arrangement/timeline/verification/mutations.ts` | 最终下表12项均加载成功且产生实际expect断言失败 |
| `bun src/project/sections/arrangement/timeline/verification/layout-smoke.tsx` | 真实 native toolbar/text/svg bounds 与 token 输出 |
| 根 `node scripts/gpuix-review-scan.mjs` | 最终7 source / 3 test files，**0 HARD、1 WARN**；layout-smoke的2个验证视口尺寸字面量，逐条处置见自审表 |
| 本地提交 pre-commit `ultracite fix` | 五次代码/验证入口提交均通过，没有 `--no-verify` |

未修改 Rust 源码，因此本轮没有运行 cargo check/test，不将 native build 冒充 cargo 测试。全套包含 app 的故意 route-render-failure error-boundary 输出和系统 CoreAnalytics 提示，最终测试计数为 0 fail。

## A3b 行为与实际变异

变异经 Bun onLoad 在内存替换精确一次的共享源码片段，退出即丢弃；不写 ui/platform/app 源文件。runner 同时要求出现 applied 标记、非零退出与实际失败测试数，编译错误或零匹配不能冒充成功变异。

| 路径 | 有效基线断言 | 变异 | 失败数 |
| --- | --- | --- | --- |
| MenuTrigger Space/Enter | `Menu/interaction.test.tsx` 的 `trigger Space reaches window after Escape`；Enter 打开、Esc 还焦点、Space 不开菜单且到达窗口 | 加入 Space 激活分支 | 2 |
| 嵌套原生右键 | `Menu/pointer.test.tsx` 的 `nested numeric pad preserves its value and opens the context menu on right click` | 禁用 onContextMenu | 1 |
| DragPad wheel 祖先隔离 | `DragPadNumber.test.tsx` 的 `wheel over a pad changes its consumer without scrolling its ancestor` | 将命中 pointerEvents auto 改 none | 1 |
| NumericPad fill | `variants.test.tsx` 的 `uses actual … shell width before and during editing` | 使用估计 width 而非真实 innerWidth | 2 |
| NumericPad 中线 | 同一组真实窄容器与编辑转换几何 | 用估计 width 定位中线 | 4 |
| 原生编辑器焦点 | `Space stays inside the numeric editor instead of reaching playback shortcuts`，直接读取 getFocusedElementId | 删除编辑器 autoFocus | 1 |
| 最终 app 文本焦点查询 | `DragPad native text focus protects a, Cmd+A and grid shortcuts until blur/unmount` | `useTextFocusBinding(false)`，断开文本 lease | 1 |
| Minimap pressed 优先级 | `overview pressed color survives leaving its bounds and cancellation restores hover` | pressed 回落到 hover 色 | 1 |
| Minimap epoch取消 | 同一视觉回归经真实hydrateProject触发epoch变化，验证隐藏光标和色态恢复 | 去掉epoch依赖 | 1 |
| Minimap取消首present | 同一回归立即检查色态及首帧PNG与settled相同 | layout effect退回旧passive effect | 1 |
| Grid持续上传 | 同一Grid实例经历scroll/zoom/height变化，PNG逐帧对照已释放的独立div oracle | 粗细线上传effect只执行一次 | 4 |
| Pattern持续上传 | 同一持久实例的背景变化 | Pattern上传effect只执行一次 | 4 |

先前 B1 音乐位置、邻近标记与区域密度的性质/变异属于已合入历史证据，本轮没有越界改动 core 或重新声称新增性质算法。

## 批绘制收益与像素证据

`grid/parity.test.tsx`：深/浅主题 × 高度34/200 × 缩放6.25/100/800/131072 × scrollX=0/400.375，共32组，native PNG字节完全相同。先生成并释放div oracle，再在同一个持续挂载的Grid实例中重验scroll/zoom/height更新；没有靠逐帧重挂载掩盖上传停止。`div-reference.test-helper.tsx`仅供oracle测试，生产没有导入，也没有兼容开关或旧API。

| px/bar | scrollX     | 原 div retained 节点 | 当前批绘制 retained 节点 |
| ------ | ----------- | -------------------- | ------------------------ |
| 6.25   | 0           | 130                  | 5                        |
| 6.25   | 400.375     | 65                   | 5                        |
| 100    | 0 / 400.375 | 38                   | 5                        |
| 800    | 0 / 400.375 | 28                   | 5                        |
| 131072 | 0 / 400.375 | 40                   | 5                        |

四个批叶子分别拥有两档 Pattern 背景与粗/细网格材质；这是一条共享 quad 绘制路径，不是混用逐线 div。音乐标尺只复用两档 Pattern 批背景，编号文字保留原生 text 布局。额外离屏实跑 TimeRuler：1200宽、scrollX400.375，在6.25/100/800/131072 px/bar分别只有3/12/15/18个短tick，总节点10/37/46/55；文本仍须布局，批化至多减少2–17个短线叶子，没有实测帧耗时收益，因此本轮保留这条低且有界的路径，不为它另拆投影/上传流程。没有宣称时间标尺已全部批量化。PNG验证只覆盖默认offscreen scale=1，不冒充其它显示器scale实测。节点数不是帧耗时，本轮未取得真实窗口帧耗时。

## 真实组合窗口与输入边界

协调者批准14:44:47–14:54:47 UTC；出现 BackgroundUnavailable 后提前结束桌面时段，不再开 Gallery 或第二个窗口。

- 真实入口：`bun --hot --preload ./src/app/verification/native-fixture.ts src/main.tsx`，`ZOEYDAW_ROUTE=/project/timeline-followup`。HOME 与 B2_EVIDENCE_DIR 隔离到 `/tmp/zoeydaw-timeline-followup-20261015/`，不写用户工程或配置。
- 命名 service `timeline-followup-main-1445`，wrapper PID98147、Bun PID98239，启动时设置240秒进程生命周期上限。直接 project 路由出现完整 Arrangement，窗口未 focused；协调者提到的 Home→项目后台不重绘问题本轮**未复现**，没有复测 Home 切换，不判断是否属于 F3。
- 真实 native session 的 telemetry 为48kHz、outputLatencyFrames=284；读取 probe.wav 获得 channel-major 的256个 peak值，范围 ±0.399993896484375。证据 `/tmp/zoeydaw-timeline-followup-20261015/evidence/native-backend.json`。没有播放验收声明。
- 整页截图 `/tmp/zoeydaw-timeline-followup-20261015/evidence/main-default.png`，AX `/tmp/zoeydaw-timeline-followup-20261015/evidence/main-default.ax.txt`。保留 Transport、Browser、Arrangement、Footer 空间关系；Browser 示例目录不属于本轮接通功能。
- 第一次 Zoom in 的 AX `el.press()` 返回：`BackgroundUnavailable: cannot establish the user's key window for background focus restoration; retry with takeover:true or use ax actions`。复读仍是64 px/bar，未将失败当成功；没有 retry/takeover/acquire。
- 失败后只读截图 `/tmp/zoeydaw-timeline-followup-20261015/evidence/main-after-failed-input.png`；立即 kill，精确结束 **14:46:30.222 UTC**，存活1m11s。没有以该释放后截图冒充 hover/held pressed/拖动证据。

### 当前 AX 与内部居中量值

AX bounds 是原始窗口/桌面单位，本轮不自行换算显示器 scale。

| 对象 | 当前实测 / 来源 | 结论 |
| --- | --- | --- |
| Overview | AX e199：940×32，原点971,214 | 高32匹配 minimapMinHeight；固定上方区域 |
| Divider | AX e201：940×7，原点971,256 | 匹配共享 panelGap7 |
| Snap | AX e175：27×13，原点972,199 | overview/toolbar左缘971，Snap inset1；高13匹配 control metrics |
| Snap 文字 | AX e176：23×15，原点974,198 | 控件中心985.5,205.5；文字中心985.5,205.5，差0 |
| Zoom in | AX e185：13×13，原点1118,199 | iconOnly方形 |
| Zoom icon 内部 | layout-smoke：控件130,2,13,13；svg131,3,10,10 | x/y中心差−0.5，来自像素吸附；不局部加padding补偿 |
| Octave 图标+文字组合 | layout-smoke：壳425,2,61,13；svg427,3,10,10；text439,1,44,15 | 合成内容水平中心455 vs壳455.5，差−0.5；文字垂直中心8.5与壳一致 |

1.5px→1px 的根因已核实：固定 vendor `.gpuix-main/zed/crates/gpui/src/taffy.rs:270–335` 明确 pre-layout authored padding/gap 先按设备像素吸附，midpoint toward zero；`:345–373` 再吸附绝对边缘。native getElementBounds 的同一实测也是1px，所以不是 AX 精度截断。不改共享token，也不在业务实例塞0.5px补偿。

## UI 规范第13节逐项结论

| 检查 | 本轮证据与结论 | 限制 |
| --- | --- | --- |
| Gallery 与业务整体布局 | 真正 main 的完整组合截图，跨区域空间关系保留 | 本轮未开 Gallery；BackgroundUnavailable 后协调者明确结束时段，既有Gallery证据不是本轮重验 |
| 跨区域对齐与居中 | 同屏标题/toolbar/轨道/底部面板；Snap AX中心差0；Zoom与数值组合原生bounds差≤0.5 | 光学字形居中与全部语言字形未逐像素复核 |
| 间距与内边距 | AX左inset1与GPUI取整源一致；同类控件用control.track-gap4、track-pad1.5 | 不把design.toolbarGap2误当同一语义 |
| 统一设计入口 | 无实例圆角/padding/gap修补；边框来自theme.design，密度来自control metrics；颜色来自theme.colors | Divider色态归共享owner仲裁，不在timeline补第二套 |
| 尺寸与紧凑感 | 13高控件、13×13图标、32高overview、7高divider；整页没有新增网页卡片式留白 | Live同区域同缩放密度对照未验证 |
| 深浅主题与中英文 | grid深浅主题32组原生PNG等价；既有labels注入不变 | 真实main本轮仅深色英文；其它组合未重验 |
| 状态与键盘 | 原生回归证明Menu Space/Enter、编辑焦点与lease、Minimap默认→hover→pressed→离开→释放/取消优先级 | toolbar/Minimap hover未验证（BackgroundUnavailable，需前台物理输入）；held pressed截图未验证，不拿active或释放后截图代替 |
| 拖动、滚轮、弹层与性能 | 原生回归覆盖Minimap隐藏/恢复生命周期、divider连续delta/取消、wheel祖先隔离、菜单右键；批绘制节点130→5 | 物理Minimap拖动、divider松手位置与真实窗口帧耗时未验证 |

## 与 Live 对比表

只使用前轮已提交的只读截图 `live-ruler-readonly-2026-10-15.png` 与历史AX观察；本轮首次 `computer.window({app:'Live'})` 未找到窗口，协调者要求不启动/操作。后续未重取Live观察，不能将代码推导或原生测试写成Live一致。

| 产品规则 | Live 已观察证据 | 当前实现 | 结论 |
| --- | --- | --- | --- |
| 音乐位置尊重拍号分母 | 历史AX4/8，标尺3.1.2、3.2、3.2.2、3.3 | B1 rulerLabel按16/denominator | 历史规则对照一致；本轮无同拍号像素重验 |
| Pattern编号区域与细分独立 | 历史1/32网格角标，标签层有拍/十六分位置 | PatternRegions、gridPlan、rulerTicks独立；批绘制不改几何 | 分层方式沿用；多档阈值未验证 |
| Cmd/Ctrl+1..5与E | 已提交LESSONS的Live菜单实测：1窄、2宽、3三连音、4吸附、5固定，E裁剪 | 1/2/4保留；E归lane；3/5未实现 | 不声称3/5等价 |
| 顶部overview固定，唯一音乐横条 | 历史只读截图中overview与标尺独立 | main使用固定Minimap，下面一条ControlledScrollbar | 结构已观察；物理滚动完整对照未验证 |
| 紧凑工具栏、弱标尺文字、低对比网格 | 历史截图 | 共享tokens与arrangement色系，32组PNG等价旧绘制 | 本轮真实Live密度比较未验证 |
| 隐藏光标、锚点、边缘缩放与divider松手 | 历史未操作用户Live | 原生光标端口与B1手势；共享divider | 未验证，不用后台automation替代物理验收 |

## 未验证项与共享仲裁

| 残项 | 当前事实 / 对应回归 | 处置 |
| --- | --- | --- |
| toolbar与Minimap hover | **未验证（BackgroundUnavailable，需前台物理输入）**；Minimap原生回归 `overview pressed color survives leaving its bounds and cancellation restores hover` | 协调者决定本轮不代操作，停止桌面 |
| held pressed 像素 | 工具不能跨调用保留mouseDown；原生状态断言已覆盖优先级 | 保持未验证，不用释放后截图冒充 |
| 隐藏光标Minimap物理拖动 | **未验证（BackgroundUnavailable，需前台物理输入）**；`Minimap survives a jitter and continues hidden-cursor dragging through store renders` | 原生测试不等于物理指针验收 |
| Divider物理拖动/松手位置 | **未验证（BackgroundUnavailable，需前台物理输入）**；`a 7px divider captures beyond its hitbox and keeps a continuous pixel delta`、`focus loss cancels and directional keys adjust the focused divider` | 已有行为回归不证明OS松手位置 |
| Divider hover/pressed | **未验证（共享Separator缺色态，协调者统一修）**；`ui/panels/Separator/index.tsx:73–80`只有card背景，无hover/pressed | 协调者接受共享仲裁并安排共享入口修复，timeline不加实例覆盖 |
| Gallery、浅色中文业务整页 | 时段提前结束，本轮没有打开 | 原有Gallery与主干phase2证据不冒充本轮复验 |
| Live缩放阈值/极端区域合并 | 本轮无新Live观察 | 不修改原语义 |
| Ctrl/Cmd+3、+5 | 未实现 | README保持声明；实现前仍须Live菜单实测与ask |

## 自审结果

独立只读 `TimelineFollowupReview` 按 Standards/Spec 两轴审查：初审无实现必修，Standards发现2处测试盲区、Spec记录1项已接受仲裁与1项scale证据边界。完整diff命令为 `git diff 21dace3 HEAD -- apps/gpuix/src/project/sections/arrangement/timeline`，后续增量用 `git diff -- apps/gpuix/src/project/sections/arrangement/timeline`；提交列表可用 `git log --oneline 21dace3..HEAD`复查。两处盲区均已补强，其中epoch检查实际捕获首提交色态错误，按必修修复。

增量只读复审通过：持续上传、真实store色态、实际epoch取消与呈现前复位均已覆盖，无新增必修风险；多scale/host-origin及已接受的物理交互限制继续保留。审查不代替本表的实跑结果。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| Minimap没有hover/pressed呈现层 | 必修 | 协调者批准后复用共享scrollbar三态，保持手势全程pressed | visual-state原生回归与pressed→hover变异1fail |
| grid逐区域/逐线挂载 | 必修 | 统一quad批路径，B1计算不变，旧div仅留测试oracle | 32组PNG相同、130→5节点 |
| toolbar1.5px与AX1px差异 | 记录 | 根因是GPUI设备像素吸附，不做业务补偿 | vendor taffy.rs与真实bounds |
| toolbar.metrics与design.toolbarGap语义不同 | 汇报仲裁 | 协调者明确保留正确control metrics，不新增共享字段 | 本轮ask答复 |
| 共享Divider无hover/pressed色层 | 汇报仲裁 | 协调者统一安排共享owner，不私造timeline覆盖 | Separator:73–80；本轮ask答复 |
| 跨slice验证组合根会重复生产装配 | 汇报仲裁 | 不新增；同步21dace3，直接运行main/native-fixture | 真实组合截图与native session peaks |
| BackgroundUnavailable | 记录 | 失败后读回未Zoom，立即kill；未升级前台权限 | 14:46:30.222 UTC service退出 |
| 扫描px-literal：layout-smoke的2个width1280视口尺寸 | 记录 | 仅离屏测量入口的验证窗口与controller测量尺寸，不是控件密度/内边距；保留，不新增产品token | 最终扫描0 HARD/1 WARN；生产toolbar与grid均无该警告 |
| 初次PNG测试未覆盖持续上传 | 记录 | 已补强：持久Grid实例更新scroll/zoom/height；独立oracle先预生成释放，防并存root干扰；两项停止上传变异均4fail | 最终32组PNG相同，grid-upload-scroll/region-upload-scroll |
| 视觉状态与真实store提交各自测试，未联动 | 记录 | 已补强：既有真实store拖动补pressed色断言，新视觉回归接workspace/actions与hydrateProject | timeline53 pass/569 assertions |
| epoch取消后光标恢复但首提交仍pressed | 必修 | 将epoch取消移到useLayoutEffect，不放宽首提交断言 | 修前1fail；修后通过；旧passive时序变异1fail；native首帧PNG=settled |

## 进程清理

唯一自启service `timeline-followup-main-1445`，带240秒自动终止上限；取证/失败后即时kill，存活1m11s，PID98147/98239均结束。没有停止用户应用或其它worker服务。

实际执行 `ps -axo pid,etime,command`，对完整输出使用grep工具匹配请求的正则 `bun .*--hot|cargo run|gallery|demo`，结果：

```text
No matches found
```

这与请求的 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"` 检查同一完整进程集合；不用被匹配命令自身造成假残留。

## 错题

### 不把AX失败或释放帧写成状态验收

- 错：后台AX press报错后继续输入，或拿释放后的整页截图声称hover/pressed已验证。
- 对：先读取真实状态，再停止自启service并ask；held pressed与物理光标独立标未验证。
- 因：后台焦点恢复与真实物理指针不是同一能力，操作可能部分投递，自动化接受不等于产品行为。
- 证据：本轮Zoom仍64px/bar，BackgroundUnavailable原文，service即时关闭。

### 取消的副作用完成不等于首帧视觉已复位

- 错：只断言cursor恢复，就认定phase呈现也同步；passive effect中setPhase可晚于本次React提交。
- 对：epoch取消在已有latest更新之后的layout effect执行，同时检查hidden、色态和native首帧PNG。
- 因：外部store提交、passive effect和原生绘制是不同阶段。
- 证据：新增真实hydrate回归修前1fail（hidden已false但色仍pressed），修后53pass；退回旧时序变异1fail。

### 像素oracle要先释放，再验证持续实例

- 错：只逐帧重挂载Grid，或并存两个TestRoot后认为持续上传已覆盖；停止上传变异曾仍4pass。
- 对：先预生成并释放div oracle，再用唯一Grid root连续更新scroll/zoom/height，比每一帧native PNG。
- 因：前者不经过后续上传；并存绘制上下文的具体干扰根因本轮未继续追踪，隔离后实际变异已给出有效信号。
- 证据：粗细线与Pattern停止上传变异各4fail，恢复后32组PNG相同。

## 已验证做法

### 先对照native绘制oracle，再切换批路径

- 对：B1输出同一几何，以原div作为仅测试oracle，深浅主题/分数滚动/极端缩放逐组比原生PNG；成功后生产只留quad路径。
- 因：节点减少不能证明颜色、透明度、裁剪与半像素线等价。
- 证据：32组PNG字节相同，典型130→5节点。

### 先追取整owner，不给业务实例加补偿

- 对：同查token、native bounds、AX bounds与GPUI taffy吸附规则。
- 因：1.5px中点向零舍入是共享渲染器规则，局部加0.5会引入另一套密度并影响其它scale。
- 证据：native/AX均inset1，Snap文字与壳中心完全相同，图标/数值组合中心差≤0.5。
