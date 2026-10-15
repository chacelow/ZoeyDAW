# B2-tracks 验证与自审记录

## 验收边界

本报告区分已运行的证据、共享依赖阻塞与未验证项，不把源码存在当作实际行为通过。轨道切片使用真实 C1 后端；本切片不实现 MIDI 乐器、插件 DSP、Clip 编辑器或工程文件系统。`demo.tsx` 的车道内容是只读组合槽，用于轨道几何验收，不冒充 clip-lane 切片。

当前自有实现覆盖复合轨道、身份/路由/Mixer/菜单、分组框/围栏/折叠总览、步进高度、内部重排与真实遥测电平。F1 原生帧、激活和全选已接入，定时链与旧激活 singleton 已删除。A3b 的共享控件缺口仍独立列出；协调者要求保留失败回归，不允许切片自行绕过或放宽断言。

阶段1为协调者明确批准的分段集成交付，不是最终验收或 `worker_done`。本阶段保存可合入实现、原始失败输出与现有证据；A3b第一增量合入后再补齐视觉与受影响回归，发送第二次 `merge_ready`。

## 迁入清单

来源根目录：`apps/web/src/pages/project/sections/ArrangementPanel/`。目标相对本目录。

| 来源 | 目标/处理 |
| --- | --- |
| `TrackHeader/Row/index.tsx` | `Row/index.tsx`、`Row/useTrackResize.ts`、`Row/useTrackReorder.ts`；复合行由 `TrackRows/index.tsx` 组合和裁剪 |
| `TrackHeader/TrackMixer/index.tsx` | `TrackMixer/index.tsx`；共享数值/Toggle/Pan 控件和现有工程编辑事务 |
| `TrackHeader/TrackRouting/index.tsx` | `TrackRouting/index.tsx`；候选判定复用经批准新增的 `project/model/track-routing.ts` |
| `TrackHeader/TrackMenu/index.tsx` | `TrackMenu/index.tsx`；共用菜单与 `CONTENT_PALETTE`，颜色持久化 token |
| `TrackHeader/TrackIdentity/index.tsx` | `TrackIdentity/index.tsx` |
| `TrackHeader/TrackIdentity/NameInput/index.tsx` | `TrackIdentity/NameInput/index.tsx`；原生输入、提交/取消与键盘隔离 |
| `TrackHeader/TrackIdentity/AutomationSelector/index.tsx` | `TrackIdentity/AutomationSelector/index.tsx` |
| `TrackHeader/GroupRails/index.tsx` | `GroupRails/index.tsx`；外框与围栏由复合行拥有 |
| `canvas/TrackMeter.tsx`、`painters/meter.ts` | `meter/TrackMeter.tsx`、`meter/telemetry.tsx`、`meter/decay-driver.ts`；不迁 DOM/Canvas/ring-buffer |
| `painters/meter-peak.ts` | 已由 B1 拥有，直接复用，不复制 |
| `TrackHeader/Row/interaction.test.tsx` | `Row/interaction.test.tsx` 中仍有效的高度、内容容量、折叠、选择等回归；额外覆盖原生键盘、事务、裁剪、重排与颜色持久化 |
| 早期 `features/track-mixer/**` | 十个文件已删除；捕获生命周期、受控 Toggle、音量/Pan 外观复用 A3，不保留第二份 `Track[]` 或控件族 |

公共入口严格采用 `gpuix-arrangement-composition.md` 的 `TrackRows({ scene, viewport, focusedTrackId, onFocusTrack, telemetry, renderLane, labels })`。没有 tracks/lane/timeline 相互导入，没有新增可写工程或视口 owner。

## 与 Web 的明确差异和仲裁

- 车道在左，完整表头在右，以 Live 实测为准；原“左、中、右”口述不解释为把表头拆到车道两侧。
- MIDI 保留音量/Pan。Live 空 MIDI 轨无音频乐器时未显示这两项；协调者明确按产品规则把本视图视为带乐器的 MIDI 输出视图。实际 C1 MIDI 音源不由本切片实现，遥测仍可能静音。
- 菜单采用共享五色 `CONTENT_PALETTE`，不再私有维护原 Web 八项表；这是 c3ff2fa 的显式共享契约决定。
- 颜色字段存 `var(--chart-N)`，绘制时由共享 `contentFill`/`resolveContentColor` 解析；不把当前主题的 oklch 写进工程。
- 所有背景/墨色/Mixer/电平使用共享 Derived Arrangement 角色。先前切片添加的六个 base 字段及对应 wiring 测试已完全删除，没有兼容别名。
- 未亮电平底色保留 Web 的 `muted`；0 dB 与声道切口取同一表头 `arrangementSurfaceAlt`，不是对比描边。
- 折叠 Audio 的 fade 规则指 **Clip 标题**。协调者确认由 lane 的 `ClipFades` 结合 B1 元数据满足；已删除右侧 `TrackIdentity` 的无关静态渐暗装饰。
- 真实原生窗口尺寸可能被系统限位。测试曾请求 1200 高，实际只得到 1021；测试组合根改用 `useWindowSize` 的接受值，没有缩减折叠/边界行为断言。

## 已运行的验证

阶段1门禁基线为本分支 `8d34ed1`，已合入主干至 `7223d52`。以下区分早期验证与当前门禁，不把历史通过扩大为当前全套通过。

| 命令/场景 | 已观察结果 |
| --- | --- |
| `pnpm install --frozen-lockfile`（初始） | 成功，无新增切片依赖 |
| `pnpm install --no-frozen-lockfile`（同步固定主干） | 成功；未执行 `pnpm add`，保留单一 renderer/react 链接 |
| `node scripts/gpuix-main/check.mjs --resolution` | verified；app/renderer/reconciler/Zustand 解析到同一 React 19.2.4 与固定主干 host |
| `pnpm native:build` | 成功；真实 `@zoeydaw/native` 二进制已生成 |
| `pnpm exec tsc --noEmit`（初始 0.10 阶段） | 0 diagnostics；不是当前主干最终结论 |
| `bun test src/project/model/track-routing.test.ts src/project/model/project.test.ts`（索引重构后） | 17 pass，0 fail，185917 assertions |
| `bun test src/project/sections/arrangement/tracks/meter`（真实provider/hook/driver路径） | 6 pass，0 fail，40 assertions；无测试driver/now旁路 |
| 原生 height 键盘定向回归 | 3 个 resize 用例通过；Send 几何遇共享 bounds shim，保留失败 |
| 原生 name Space 隔离与 Tab 顺序 | 2 pass，7 assertions |
| 原生 Mixer wheel/drag/cancel/disabled self-send | 3 pass，10 assertions；模拟滚轮单位为 Pixels，16px 为共享一步 |
| 原生后代 Enter/独立选择/Tab | 3 pass，18 assertions；修复 Solo Enter 意外改变 row selection |
| 菜单选色/快照/切主题 | 1 pass，3 assertions；颜色 token 不变，身份实际渲染色改变 |
| 原生屏外父表头/可见子轨围栏、屏外裁剪、固定轨道超限 | 3 例通过；另有既存共享 Group bounds 断言 25 vs23 未放宽 |
| `node_modules/.bin/eslint --fix`（拥有范围及授权增量） | 零输出；深层导入自动改为 `@/`，自绘 SVG/字形已改共享 Icon |
| `node scripts/gpuix-review-scan.mjs`（当前基线） | 23 source、4 tests，0 HARD、2 WARN；仅demo与render-cost窗口尺寸字面量 |
| `pnpm exec tsc --noEmit`（apps/gpuix） | 退出2；4个共享UI `EventPayload`→`KeyEvent`错误，详见下表 |
| `bun test`（apps/gpuix） | 575 pass、2 todo、25 fail，741854 assertions；602 tests/103 files/174.38s，保留完整原始输出 |
| `pnpm exec eslint apps/gpuix/src/project/sections/arrangement/tracks` | 退出0，无输出 |
| `cargo check --workspace && cargo test --workspace` | 退出0；engine32、native8，共40 pass；仅既有非根package profile警告 |

### 阶段1门禁阻塞

| 观察 | 分类与后续 |
| --- | --- |
| `DragPreviewArea/index.tsx:131`、`Menu/index.tsx:271/536`、`Popover/index.tsx:117` 的4个TS2345 | 共享UI原生事件类型接缝；已向协调者汇报，不在tracks越界修复 |
| platform/controls共10个失败：Input Space、ControlGroup边界、Popover切换/锚点/clamp、Menu context/clamp、Select居中/fill | 阻塞：A3b；失败保留不跳过，不用tracks包装绕过 |
| tracks共8个几何失败：复合行宽1、折叠首行5、Send三列1、Group高度1 | 阻塞：A3b/readOuterBounds；例如folded Group实测25而断言23，Send误差1.667而限值1，未放宽 |
| tracks的focused-level Space、嵌套右键失败 | 阻塞：A3b；保持消费者回归 |
| 5个用例报告5000ms超时（含上述Space）：F2、Group拖动、focused-level Space、name Space、Tab | 未定位；不擅自提高timeout，不把全套失败都归因A3b；已汇报协调者 |
| Solo Enter的菜单存在断言在全套失败，早期定向用例通过 | 当前全套失败如实保留；可能存在浮层/超时后的隔离影响仅为推测，尚未定位 |
| 全套2个todo | 既存于`project/model/grid.test.ts:66`和`ui/controls/DragPad/DragPadNumber.test.tsx:146`；本切片没有新增/跳过测试 |

原始输出：`evidence/2026-10-15-stage1-bun-test.txt`、`evidence/2026-10-15-stage1-cargo.txt`。阶段1未通过全量类型/测试门禁，不能称“全绿”。

### 变异检查

| 变异 | 观察到的失败数 | 恢复 |
| --- | --: | --- |
| 索引判定把“目标是后代”改为允许 | 1 | 已恢复，纯路由套件 3 pass、185854 assertions |
| 索引判定把输出环路改为允许 | 1 | 已恢复，同上 |
| 菜单把 token 写入改成解析后 literal | 1 | 已恢复，选色/快照/切主题回归通过 |
| 禁用生产 `useAnimationFrame` 订阅 | 2 | 已恢复，meter套件6pass40assertions |

固定种子路由性质生成 200 棵、每棵 17 条轨道的分组树：候选与 authored route 接受集合一致，输入未被修改。候选索引不再在每个目标路径里反复 `tracks.find`。独立纯函数场景：2002 条轨、2001 个合法目标，200 次投影 41.38ms；没有测旧版，不报提速倍数。

## 原生窗口与进程生命周期

所有 `bun --hot` 均用命名 service 启动，每批证据后立刻 kill，没有保留窗口继续写代码。

| service | 已观察/处理 |
| --- | --- |
| `b2-tracks-initial` | demo seed 的 MIDI velocity 曾错误使用0..1；真实边界拒绝 snapshot，修成整数89；失败 watcher 35.9s 即 kill |
| `b2-tracks-initial-fixed` | 实际 AX/默认截图；发现复合行被 ContextMenu 内层缩成内容宽；47.8s kill |
| `b2-tracks-layout-fixed` | 修复后真实截图/zoom：车道左、表头右；18.3s kill |
| `b2-tracks-real-meter` | 真实 AX 按钮 Stopped→Playing；真实 telemetry 与 overload；1m55s kill，音频随进程停止 |
| `b2-tracks-production-meter-proof` | 当前默认生产provider/hook/driver：AX Stopped→Playing→Stopped；电平仍floor、截图黑，未锁屏；1m25s kill，未宣称信号/衰减通过 |

真实 C1 证据：`evidence/2026-10-15-real-meter-playing.ax.txt` 显示 Audio L−23.0/R−27.0、Group L−26.0/R−28.5、Return L−38.0/R−45.0 dBFS；`real-meter-overload.ax.txt` 显示真实 Clip gain24 后 Audio L+1.0/R−1.8，Main 保持低输出。没有合成电平。

早期显示布局变化曾导致黑图和 `InvalidCoordinateFrame`，不是锁屏。F1 同步后的 `b2-tracks-f1-states` 已取得清晰当前图：dark/en、dark/zh、light/zh、light/en 各一张完整图和zoom，另有Solo激活、Group折叠AX/图。`final-*-default` 指默认布局，后三种主题语言图保留了先前激活的Audio Solo，AX明确为on，不能当作所有按钮默认态。每张有同名`.ax.txt`，服务3m22s即kill。菜单、编辑、系统拖动/滚轮与最终bounds按协调者要求等A3b增量后再申请，不沿用已结束的输入时段。

当前生产帧smoke证据：`production-frame-smoke.ax.txt`、`production-frame-smoke-black.png`。capture/input/AX均granted，`screenLocked=false`、`displayAsleep=false`；raise自己窗口后仍黑。只能证明窗口和走带命令响应，不能证明本次真实信号、颜色或停后peak视觉。旧C1遥测证据不替代本次结果。

阶段1已实跑 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"`：stdout为空，退出1，没有匹配进程。原始记录见 `evidence/2026-10-15-stage1-process-cleanup.txt`；这是本次检查时的状态，不承诺后续其他worker启动情况。

## 与 Live 对比表

只读观察 `Live`，未由本 worker 发送点击/拖动/按键、未激活 Live。当前窗口1920×918，capture从1920×918缩至1280×612。表内为原始 AX 单位，不自行换算点/像素。协调者完整标题列99 + 路由/Mixer193 =292；worker outline row95未含4个外围单位，原始记录见 `live-geometry.json`。本项目100+74+130=304，约宽4%，不扩大共享宽度。

| 产品规则 | Live 事实/证据 | 本实现与结论 |
| --- | --- | --- |
| 复合行的区域顺序与密度 | `live-current-zoom.png`：车道左，颜色标题、路由、Mixer右；完整宽292 AX | 同顺序，304共享单位；原始布局截图已观察；当前角色颜色仍需新图 |
| 轨道/操作条高亮独立 | 本 worker 未在 Live 输入验证 | 自有 selection surface 原生回归通过；Live 一致性未验证 |
| resize步进、折叠阈值、光标 | Live 未执行拖动 | 复用共享布局步长，native回归；Live交互未验证 |
| 展开 Audio 内容 | Live AX 输入/通道/监听/输出/激活/Solo/arm/volume/pan/send | 已迁移容量规则；源表/原生行为回归；逐状态视觉未完整验证 |
| MIDI音量/Pan | Live 空 MIDI AX 无这两项 | 按协调者产品决定保留；明确差异，非已接通乐器声明 |
| Group展开/折叠内容 | Live Group AX输出、开关、Solo、音量/Pan/send，无arm | 预留不可交互arm槽，真实后代总览；折叠Live未输入验证 |
| Return/Main内容 | Live当前zoom：Return A/S/Post；Main独立两输出/两级别/Pan，无arm/Solo | 实现同类规则；全部折叠状态Live未验证 |
| 表头独立padding与数值列 | Live routing69×14/15，enable46×15，Solo/arm22×15，volume/pan46×14，send31×14 | token高度13、gap4、routing区域74；共享fill/hideIcon仍待A3b，不宣称无裁切 |
| Send横向三列再换行 | Live只观察一条Send宽31 | native三列容量/守恒断言存在，Shared bounds迁移未过；Live多Send换行未验证 |
| 电平0dB/声道切口、渐变与峰值 | 提供的Live帧未出现可采样输出条，仅输入指示器 | 使用共享角色和B1峰值；真实AX信号已证明；Live色值/线宽/hold视觉未验证 |
| 组框连通、围栏在上、分隔不截断 | Live当前zoom可见组色条；未观察所有折叠/嵌套状态 | 复合行唯一边框、active ancestry框、rails最后画；原生边界回归；Live全部状态未验证 |
| 作者颜色与填充 | Live标题及填充同一作者色 | canonical token + shared contentFill，切主题原生回归通过 |
| 折叠Audio标题fade | Web/B1证据定位为Clip标题；协调者已确认lane绘制 | 删除Identity额外装饰；Clip fade归lane，非本切片虚构遮罩 |
| Space仅播放、Tab与焦点 | Live未按键取证 | owned input/Tab/Enter通过；共享Space策略尚待A3b，不称一致 |
| wheel、隐藏/恢复光标、弹层调整 | Live未输入验证 | 真实backend按钮路径已操作；native组件事务测试通过；本轮完整系统拖动/hover证据待取 |
| 分割条/侧栏/Header溢出 | 不属于本轨道切片 | 依赖panels/timeline/app-shell；未擅自实现另一套 |

## UI规范第13节证据矩阵

| 检查 | 当前证据和限制 |
| --- | --- |
| 每控件每状态放大图 | 四主题语言、Solo、Group已有图；菜单/编辑/hover/pressed/focus逐控件证据：阻塞：A3b，未验证 |
| 同类间距统一token | 源统一gap4、control13、区域padding4；最终逐控件AX bounds：阻塞：A3b，未验证 |
| 数值/文字/图标居中 | 历史zoom已有；路由/Send fill与hideIcon裁切：阻塞：A3b，未验证 |
| 同组等高、图标方形 | fold/palette按13×13，record遵循Mixer扩展；最终bounds：阻塞：A3b，未验证 |
| Live同区域紧凑感 | `2026-10-15-native-live-side-by-side.png`；raw AX292 vs304，约宽4%；不把截图缩放像素误当原始单位 |
| 深/浅与中/英 | `final-dark-en-default`、`final-dark-zh-default`、`final-light-zh-default`、`final-light-en-default`各有真实图/zoom/AX；后三者Solo保持on，非全默认状态 |
| Tab/焦点环/Space | 早期native定向与正反Enter守卫通过；当前全套含Space与超时失败，最终系统验收：阻塞：A3b，未验证 |
| drag/wheel/popup | 早期事务/取消/self-send通过；菜单/编辑/系统拖动/滚轮及最终bounds：阻塞：A3b，未验证 |
| 可见裁剪性能 | pre-main20/2000均6行、6lane、683节点、30native帧；main最终统计未运行 |

## 自审结果与分类

完整 `TrackDualAxisReview2` 与增量 `TrackDeltaReview3` 的必修均已处理。`TrackFinalReview4` 已独立覆盖2c947eb、ad1a01a、8d34ed1：Standards/Spec均无新增必修，确认真实provider/hook/driver测试路径、直接F1 timestamp、正反focus守卫及cursor TS端口。审查没有运行验证；运行结果以上述真实门禁为准。

| 审查 | 固定代码范围 | 已覆盖提交 |
| --- | --- | --- |
| TrackDualAxisReview2 | `git diff 95d49fe...66f4783` | 17个自有提交，含轨道源迁移、原型删除、经批准的共享路由迁移与主题收敛 |
| TrackDeltaReview3 | `git diff 66f4783...33d2849 -- apps/gpuix/src/project/sections/arrangement/tracks` | fb178d7、2bcdeee、10740d4、33d2849 |
| TrackFinalReview4 | `git diff 33d2849...8d34ed1 -- apps/gpuix/src/project/sections/arrangement/tracks` | 2c947eb、ad1a01a、8d34ed1 |

| 发现 | 类别 | 处置/证据 |
| --- | --- | --- |
| 路由候选重复线性查找 | 必修 | 单次RoutingIndex与UI memo；性质/2个索引变异/真实函数smoke已验证 |
| inline Reader重置peak | 必修 | committed ref，provider统一driver；失败前undefined，修复后meter6通过 |
| 后代Enter改变row选择 | 必修 | 删除外层选择handler；失败前4-midi→3-audio，修复后3例18断言 |
| Group外框重复全表扫描 | 必修→已修 | 单次memo row/ancestry末行索引，绘制只查Map；三项native边界11断言通过 |
| 生产帧桥无测试覆盖 | 必修→已修 | 删除可选driver/now及重复FrameSource；默认provider/hook/driver6pass40assert，禁用订阅变异2fail |
| palette literal及私有tint | 汇报仲裁→已定 | c3ff2fa canonical helper；token/snapshot/theme测试与literal mutation验证 |
| 切片自加theme字段 | 汇报仲裁→已定 | 8895ac8共享Derived角色，全部重复base字段及wiring测试删除 |
| Identity静态fade装饰 | 汇报仲裁→已定 | 原Web/B1链路证据，删除22行；lane按真实Clip metadata负责 |
| raw window尺寸2处 | 记录/已批准 | demo外框1120/verification1000，不是控件尺寸；scan WARN保留说明 |
| UI峰值JS timer | 汇报仲裁→已替换 | F1 `useAnimationFrame`与真实renderer source已接；timer代码和旧singleton完全删除，离屏测试用受控帧源 |
| readOuterBounds、Space、fill/hideIcon、bipolar实际宽度、嵌套右键 | 汇报仲裁 | A3b已接单；不覆写内部、不放宽、不skip，报告保留失败 |
| 最终纠正双轴复核 | 已返回，无新增必修 | TrackFinalReview4覆盖三个最终提交；不把源码审查当视觉或全套门禁通过 |
| driver活动条件的冗余`listeners.size > 0` | 记录 | 不影响行为；不为风格再改生产路径 |
| 受控帧源同步、生产源microtask | 记录 | 排队/session失效由platform测试负责，tracks不另造调度器 |
| Ctrl与lane Shift/identity Cmd对称分支未逐项测试 | 记录 | 当前已覆盖native正反守卫、Cmd移除与Shift范围；不增重复路径用例 |

## 未实现/未验证事项

- **阻塞：A3b，未验证**：Send/路由fill、hideIcon裁切、readOuterBounds几何、Space、嵌套右键及菜单/编辑/系统拖动/滚轮/最终bounds。失败测试全部启用，不宣称“已无裁切/已键盘全通”。
- F1 已接原生帧和激活，NameInput已opt-in `selectAllOnFocus`。真实四主题语言窗口能启动；默认生产帧路径meter6例40断言，F2自动全选/输入Space/Tab三例8断言通过。真实播放停后peak视觉尚未补齐，不把旧timer阶段AX扩大到新路径。
- 四主题语言与Solo/Group已有清晰图，逐控件完整状态仍缺证据；当前生产帧窗口再次黑图且电平floor，真实信号与停后peak视觉未验证，未定位根因。
- 当前类型4错、全套25失败/2todo已保留；切片lint、scan和Rust通过。5个超时及Solo菜单断言未定位，已汇报，不归入已完成。

## 错题与已验证做法（LESSONS格式）

### 原生窗口请求尺寸不是实际可点击范围

- 错：用请求的1200px视口定位固定轨，主机实际只接受1021px，点击落在窗口外，却误判为折叠失效。
- 对：组合根/测试均读取`useWindowSize`接受值；保持折叠内容和边界断言不变。
- 证：native size记录、Return/Main折叠恢复6例72断言；非缩短测试路径。

### ContextMenu容器会影响复合行宽度

- 错：将完整轨道放进默认intrinsic floating容器，车道宽0/内容宽360。
- 对：复用现有ContextMenu的full-size column/stretch入口，不造新的wrapper控件。
- 证：失败前360→修复后1000，真实历史截图和宽度回归。

### 状态生命周期不能由回调引用决定

- 错：把TelemetryReader放进会重置peak的订阅依赖，父组件inline回调重建就丢hold。
- 对：committed ref保持最新reader；track/backend决定生命周期。生产driver只接F1 timestamp，测试走同一provider/hook路径，不注入替代driver或clock。
- 证：原生peakmarker失败前undefined；修复后6例40断言，禁用生产帧订阅变异失败2例。

### 颜色解析不能写回作者数据

- 错：把当前主题oklch保存到track.color。
- 对：只保存canonical token，绘制时用共享resolver/fill。
- 证：菜单/快照/换主题保持token且填色变化，literal-write变异失败。

### 展示归属先追真实模型

- 错：把Clip fade口述误放到右侧TrackIdentity，静态装饰无法表达Clip元数据。
- 对：查Web painter→B1 clip geometry→lane ClipFades，删除多余层并由协调者统一归属。
- 证：WebIdentity无fade；B1 collapsed bodyHeight0用title高度画mask，handles隐藏。
