# B2 app-shell 阶段2装配

2026-10-15。全部本派发代码与接口 cutover 已完成，当前基线为 DesignTokens `c39162d`，已包含 F5、F3、F4c、editors IDs、lane resume 与 PeakColumns QuadBatch。root resume `e1b29b7`、ID-only Clip slot `a6a2650` 和所有合并均通过 hook；真实组合 UI 由协调者统一最终评审，以下明确保留工具未验证路径。

已提交 `888acd1 feat(app): 装配原生工程视图`，pre-commit 的 ultracite/lint-staged 通过，未绕过 hook。

最终共享工程 Card 调用切换为 `7c70de7`。HomePage 只保留布局 width，所有行为与完整验收通过，未新增图片提交。

独立 review 的只读输入修复为 `7381d81`，按活动需求订阅帧为 `f5e0a4f`。两个提交的 hook 均通过。

## 实现与 owner

| 内容 | 唯一 owner 与清理 |
| --- | --- |
| 工程数据、编辑事务与 native backend | 现有 stores/adapters。ProjectPage 取得一个 runtime lease，Transport Back 卸载工程视图并释放 |
| Arrangement scene、viewport 与 timeline keyboard | `project/composition.ts` 创建一个 TimelineController。ArrangementTimeline 注册窗口键盘；不另建 keyboard |
| Lane 手势 | 同一个 scene 的真实 LaneController。`markDrawModeGesture` 接 timeline keyboard 的 `markDrawGesture`，同步滚动使用 `timeline.setScroll` |
| TrackRows 与 LaneOverlay | `ArrangementPanel.tsx` 经 `renderLane` 放置真实 LaneRow，overlay 只挂一次 |
| 峰值、电平与走带 | adapters 的 `readProjectPeaks`、`readProjectTelemetry`、`readTransportBar`，使用同一工程会话 |
| Footer Clip slot | 直接消费 clip-edit 唯一 slot，显式解构并传入 clipId、trackId、close，不重传 clip/track 大对象，不声明平行类型或保留兼容层 |
| 文本焦点与模态 | AppInteractionProvider 的动态 lease。原生 Input/DragPad 编辑焦点和 app ModalDialog 生命周期写入，窗口快捷键读取 |
| 全局 Cmd/Ctrl+F | 组合根检查事件消费、ModalDialog 打开状态和 Browser handle 的实际折叠状态，再调用现有 `focusSearch()` |
| 帧、激活、光标与 reduced motion | NativeRoot 的同一个 renderer 和唯一帧 Provider。原生窗口激活、nativeCursorLock 通过现有 Provider 注入；Footer/Transport 读取 platform reduced-motion |

删除第一阶段 `usePlaybackKey`、`empty-slots` 和 `PENDING_BROWSER_COLUMNS`。Browser 最小列宽直接使用已合入共享 token。主题设置、43 项预设、语言切换和关闭确认保留第一阶段交互。

## 协调者批准的跨 owner 修改

| 文件 | 发现与修复 | 验证 |
| --- | --- | --- |
| `ui/controls/ControlEnvironment/index.tsx`、`Input/index.tsx`、`DragPad/DragPadNumber.tsx`、controls README | 增加可选 textFocus lease。真实 onFocus 获取，blur/unmount/退出编辑态释放；保留 ControlInfo，不读取输入内容、不轮询 | F5 合入后 Input 显式焦点、Input autoFocus、DragPad 编辑 autoFocus 和 readonly 全部通过 |
| `arrangement/tracks/TrackRows/index.tsx` | timeline 已扣 controlsWidth，tracks 再扣导致槽和 rails 错位。现在 viewport.width 是时间宽度，整行宽度加回 controlsWidth | 真实 TrackRows、LaneRow 的边界相等，rails 在 lane 末端；回归通过 |
| tracks demo、render-cost、Row interaction tests | 迁移已有 viewport 构造者，保持相同总窗口宽度 | 已纳入受影响套件 |
| `arrangement/timeline/controller.ts` | 唯一投影 owner 补充 session.automationParameters 投影 | 切换 pan/volume 后真实 automation geometry 切换，回归通过 |
| `arrangement/timeline/viewport/auto-scroll.ts`、controller 与 README | pointer 活动直接派生帧需求，start/update/stop 只在活动边界通知；controller 暴露稳定 demand 端口，root 不读 view 细项，tick 算法不变 | idle/播放/真实拖动/ruler start-stop 回归、四项变异、真实 native backend smoke 通过 |
| Arrangement 组合契约 | 明确 viewport.width 不含 controlsWidth | 与代码保持一致 |

本切片未自行修改 platform、vendor、shared/theme、Rust、依赖清单或旧 Web/Tauri。F5 与共享 vendor 由协调者合入、重建，本 worker 仅同步使用。

## 实跑验证

| 命令或场景 | 观察结果 |
| --- | --- |
| `pnpm --filter @zoeydaw/gpuix-prototype typecheck` | 最终基线通过，2.84 秒，见 `final-typecheck.txt` |
| `pnpm exec eslint apps/gpuix/src` | 最终基线通过，无输出，41.12 秒，见 `final-eslint.txt` |
| `bun test src/app --timeout 30000` | IDs 切换后 50 pass、0 fail、1390 assertions，14.93 秒，无过滤，包含 Clip 请求/切换和 native lease 路径，见 `app-tests-after-ids.txt` |
| `bun test --timeout 30000` | 最终 1146 pass、1 既有 todo、0 fail，176 文件、1104179 assertions，42.50 秒，无过滤，见 `final-bun.txt` |
| `bun apps/gpuix/src/app/verification/mutations.mjs` | 完整 app 基线先通过，最终 27 项变异全部被真实行为断言抓住，源码逐项恢复，68.77 秒，见 `final-mutations.txt` |
| 真实 native peaks smoke | 同一工程会话 open/apply 接受，48 kHz telemetry、输出延迟 284 帧，channel-major min/max 共 256 个 f32，范围 ±0.399993896484375；释放后 idle |
| 真实 native 帧需求 smoke | idle=false、native playing=true 时 demand=true、native playing=false 时 demand=false，最后释放到 idle；见 `frame-demand-native-smoke.txt` |
| 独立 review 回归 | 停止帧与只读输入修复前 4 fail，修复后 4 pass、28 assertions；另有四项专门变异均抓住，见 `review-failing-before.txt`、`review-passing-after.txt`、`review-mutations.txt` |
| root resume 首 present 回归 | 未接入时 2 fail，接入后 4 pass、26 assertions；实际 timeline follow 的 retained 与首个 painted 文本均立即为 200，idle 不留 resume 订阅。移除 flushSync、idle 强制订阅、断开 resume 三项变异全部抓住 |
| root resume 真实离屏 smoke | 实际 AppShell、NativeBackend 与离屏 GPUI。native bar=20.066934020833333，恢复前 scroll=0，pre-present retained 与 workspace 均为 905.0813746453334，实际 frames=11，卸载后 idle；只手动投递 resume host 事件，不宣称真实桌面恢复证据 |
| 最终 Home/Card/native 生命周期 smoke | 真实最近工程 Card 实测 width304、左右 inset12、gap4；原生 Enter 重开同一 project ID，返回首页后旧 backend 为 idle，再打开真实 native playback 后恢复首 present；最后卸载 idle，见 `final-native-smoke.txt` |
| `node scripts/gpuix-main/check.mjs --resolution` | F4c 同步后十一补丁与 app 的 native/React 解析验证通过，见 `renderer-resolution.txt` |
| `gpuix-review-scan` | 最终提交后扫描 31 source、7 tests，0 hard、4 warn，见 `review-scan.txt` |

第一轮完整 UI 组合用默认 5 秒期限，部分测试在本机负载下超时。协调者批准最终命令使用 `--timeout 30000`，没有更改行为断言，也不把期限加长称为性能修复。单独 Cmd+F 行为检查实测通过，3.78 秒。

永久组合回归覆盖真实 B 绘制后松键不锁偏好及不绘制对照、lane duplicate 一次/timeline A 一次/undo 一次、Input a 与 Cmd+A 后继续输入且模式不变、文本焦点 lease 释放、TrackRows 槽/rail 宽度、automation 参数投影。AppShell 回归通过真实 native 后端证明 Transport onBack 后旧 session 已 disposed，并覆盖 Cmd+F 的 modal、折叠及已消费事件守卫。

## 真实窗口证据与限制

协调者给出的绝对 UTC 范围为 08:23:00 至 08:43:00。所有启动、输入与退出均在该范围内。HOME 隔离为 `/tmp/zoeydaw-b2-native-2JqjeI`，原生 `userDirectories()` 确认 config/data/log 全部位于该临时 HOME，未修改用户配置或 Live 工程。

真实入口使用 `bun --hot --preload ./src/app/verification/native-fixture.ts src/main.tsx`。fixture 使用真实 NativeBackend 和 probe.wav，不模拟音频或 Provider。

| UI 规范第 13 节的组合验收 | 本次证据与结论 |
| --- | --- |
| Gallery 与业务整体布局 | 已运行真实 main 的首页与完整工程组合视图，保留 Transport、Browser、Arrangement、Footer 的空间关系；协调者待依赖合入后最终整体评审 |
| 跨区域对齐与居中 | 整页可复查连续标题栏/Header、轨道头和 lane；真实组合几何回归证明 lane/表头/rails 不重叠 |
| 间距与内边距 | Browser 外层 AX 315、内部导航 AX 90；布局 gap、panel padding 和 Browser 列宽直接引用已有共享 token |
| 统一设计入口 | 组合根未引入私有圆角、边框或间距值，未改 shared/theme；公共控件、Panel、MotionTabs 仍消费共享 token |
| 尺寸与紧凑感 | Search 原始 AX 为 258×13，窗口 1280×800，不自行换算 scale。本 Dispatch 未重新读取 Live；阶段1截图仅为既有参考 |
| 深浅与中英文 | `project-dark-en`、`project-light-en`、`project-light-zh`、`project-dark-zh` 整页截图，原分段主题与语言 RadioGroup 仍可切换 |
| 状态与键盘 | 真实离屏行为覆盖 B、A、Cmd+A、Space、modal/折叠守卫；物理键盘目标焦点无法证明，按工具未验证保留限制 |
| 拖动、滚轮、弹层与性能 | 真实设置弹层与主题/语言 AX 操作通过。Clip、Back、拖动、滚轮、实际帧耗时与节点数留给协调者统一组合评审，最后后台输入的精确失败已保留 |

已有截图仅保留在本地 `evidence/phase2/` 的 Git 忽略目录，不新增图片提交；AX、可重跑入口和简短结论保留在 Git。窗口表面保持标题栏/Header 连续、无新边框，红绿灯未修改，标题仍弱化。不能从未刷新的预览推导颜色缺陷；本次先获得实际已刷新的窗口后保存整页参考。

第一次 acquire 超时后未启动窗口，先 blocking ask。第二次获得实时批准后运行首页到工程主路径。窗口在 08:35:25 已不可访问，control 为 inactive；service 仍运行，日志没有 panic，无法据此判断窗口关闭原因。立即停止本人 service 并上报。最后一次窗口精确绑定 pid 86471，依协调者要求仅后台 AX/窗口操作，不再 acquire 或 takeover。AXPress 不支持 Clip 元素，改元素 click 后 provider 报 `BackgroundUnavailable: cannot establish the user's key window for background focus restoration`，没有升级前台。两个 service 都在 deadline 前停止。

进程清理命令 `ps -p 65119,86471 -o pid,etime,command` 仅返回表头，两个本人进程均不存在。日志见 `b2-main-native.txt`、`b2-native-final.txt` 和 `process-cleanup.txt`。

## Home 项目 Card cutover

| Before | After |
| --- | --- |
| `HomePage.tsx` 的最近工程 Card 使用 `size="sm"` | 选择共享同语义 `size="project"` |
| 实例覆盖左右 `gap*3` padding、`gap` 与 accent hover | 全部移除，由 `theme.design.cards.project` 拥有；实例 style 仅保留 `width: theme.project.controlsWidth` |

点击、原生键盘激活、内容与时间格式未修改。实际 native headless Card 边界及打开工程行为已验证；物理 hover/整体观感仍由协调者在组合视图评审。

## 产品规则与 Live 对照

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| 标题栏/Header 无缝，保留原红绿灯 | 本 Dispatch 未重新观察；已有阶段1截图 | 未修改原 chrome；四组窗口截图保留连续表面 | 缺本次并排测量 |
| 轨道头在右、lane 在左 | 依现组合契约和既有 tracks 证据 | 真实 TrackRows 与 LaneRow，时间宽度不重复扣表头 | 组合几何通过，未重新操作 Live |
| Space 唯一播放，Input 不触发 A/M/B | 本 Dispatch 未重新读取 Live 菜单 | timeline 唯一 owner，文本 lease 守卫 | 真实离屏回归通过，物理键盘受工具限制 |

## 自审结果

| 发现 | 分类 | 处置与证据 |
| --- | --- | --- |
| viewport.width 被重复扣 controlsWidth | 汇报仲裁后必修 | 协调者批准最小 tracks 修复，真实几何回归通过 |
| automation 参数漏投影 | 汇报仲裁后必修 | 协调者批准 timeline 唯一 owner 修复，pan/volume 回归通过 |
| textFocus 缺少公共端口 | 汇报仲裁后必修 | 协调者批准 A3 最小 lease 端口，Input 显式聚焦通过 |
| native autoFocus 不发 focus | 汇报仲裁后解除 | F5 修 vendor；未加 app ref/query/轮询补丁，真实 Input/DragPad autoFocus 回归及完整 app/变异全部通过 |
| ThemePresetGrid 独立挂载缺少 app modal owner | 必修 | 更新测试 Provider，单跑 2 pass |
| renderer 键盘路由/后台焦点恢复不可证明目标 | 汇报仲裁 | 停止并保留精确错误，真实键盘和 Clip/Back UI 不宣称通过 |
| ClipEditorSlot 大对象 props 性能风险 | 汇报仲裁后完成 | editors 的 ID-only 接口已同步，app 显式只传 clipId/trackId/close，类型检查及真实 app 50 项回归通过，无旧对象兼容路径 |
| scan main.tsx 的 1280×800 | 记录 | 既有窗口初始尺寸来自旧 tauri.conf.json，入口 render 前无 theme；未新增该值 |
| scan tracks/demo.tsx 的 1120×780 | 记录 | 既有验证窗口尺寸，非产品控件度量；本次只改 time-width 投影 |
| scan tracks/verification/render-cost.tsx 的 1000×500 | 记录 | 固定验证场景的时间视口尺寸，已将实际窗口改为 width 加 controlsWidth |
| scan verification/resume-smoke.tsx 的 1280×800 | 记录 | 固定离屏验收窗口，匹配真实入口初始尺寸，不是产品控件尺寸；未创建第二套 UI token |
| 独立模型审查 | 协调者处置 | 按本 Dispatch 仲裁，不用无法固定模型的 task reviewer。独立审查由协调者安排显式模型 worker 或本人执行 |
| 停止工程常驻 frame 订阅 | 必修 | 已改 playing/lane.dragActive/timeline autoScroll 的派生 external-store，start/stop 通知而不轮询。真实根 hook/控制器回归、四条变异与 native 后端 smoke 已证明 |
| readOnly Input 被当非文本 | 必修 | 真实原生 a/m 确实误改模式。现在仅 disabled 排除文本 lease；只读选择/复制仍归原生，回归通过 |
| Input 旧测试只断言回调次数与向窗口传播 | 必修 | 删除旧 incidental forwarding 断言，不重新固定传播数组；新 disabled 用实际受控文本值验证不可编辑，readonly 由真实组合模式/选择回归验证 |
| F3 resume 帧同步 | 必修已完成 | `useResumeFrame` 与普通帧使用同一 demand，在回调中显式 flushSync 同一 composition.tick；首 present 实际 UI、idle 释放、三项变异与真实后端离屏 smoke 已证明 |
| 既有 `project/model/grid.test.ts:66` 的 `it.todo` | 记录 | 唯一 todo 为 Ctrl/Cmd+1/2 hook 映射的旧占位，非本轮新增，未越过 model owner 删除；full Bun 0 fail，app 无 todo/过滤 |
| Home 最近工程 Card 的实例外观 | 必修已完成 | 已同步正式 c39162d，使用 size=project，实例只保留 width；实际 Card304/inset12/gap4 与原生打开同一工程 ID 的 smoke 通过，无第二套外观 |

## 错题

- 错：只按 native autoFocus 已改变焦点就假设 onFocus 事件已到达。真实 probe 显示 focused id 与 input 相等，但 focus 事件列表为空。根因交由 F5 修 renderer 的监听注册顺序，不在 app 查询 host 树补偿。
- 错：把窗口 helper 返回成功当作键盘已送到目标。AXFocused=false、空 Search 和 Orca Terminal input 证明不能这样判定。后续先验证真实字段焦点；BackgroundUnavailable 时停止，不继续敲键。
- 错：未提交时 review scan 的 0 hard 看似通过。脚本只检查 base...HEAD，必须提交后确认实际扫描文件数。
- 错：组合根用视图是否存在作为 frame demand，停止也持续请求帧。需求必须从 playing 与真实手势 owner 派生，活动边界通过稳定订阅通知，不另存可写需求镜像。
- 错：把 readOnly 等同于非文本焦点。真实 readonly Input 的 a/m 冒到窗口，改变了 Automation 与电脑键盘模式。只有 disabled 排除文本 lease，readonly 仍拥有文本选择与快捷键隔离。
- 错：长串工具操作间没及时读取第二轮静默通知。已在本会话验证 runner 增加命令前后消息检查，未处理通知先拒绝启动新验证；异步任务读取最终完成输出后才记录验收。

## 已验证做法

- 用同一个真实 timeline controller、lane controller 与 scene 做跨切片行为测试，不用回调次数代替用户行为。
- 文本和 modal 的 lease 使用独立 symbol token，重复释放不会清除其它有效 lease，也不会计数负数。
- 验证入口只安装 native fixture seed，生产入口保持 Main-only 默认，不把示例工程带进产品。
- 临时 HOME 经原生 userDirectories 核实后再运行真实 main，配置和快照写入不触碰用户目录。
- 本人 service 即刻停止；进程不存在和 service 日志分别取证，不把 process alive 误当 window alive。
