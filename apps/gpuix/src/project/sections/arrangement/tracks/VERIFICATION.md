# B2-tracks 验证与自审记录

## 验收边界

本报告区分已运行的证据、共享依赖阻塞与未验证项，不把源码存在当作实际行为通过。轨道切片使用真实 C1 后端；本切片不实现 MIDI 乐器、插件 DSP、Clip 编辑器或工程文件系统。`demo.tsx` 的车道内容是只读组合槽，用于轨道几何验收，不冒充 clip-lane 切片。

当前实现覆盖复合轨道、身份/路由/Mixer/菜单、分组框/围栏/折叠总览、步进高度、内部重排与真实遥测电平。补验收基线为 `21dace3`；F2嵌套副键与F3恢复首帧已由共享能力及授权的 `meter/telemetry.tsx` 接通，不增加本地事件包装。

下文「阶段1」命令和截图是历史证据，不代表当前门禁。当前补验收结果见文末；A3b已合入，不再列为阻塞。

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

当前阶段1源码为 `b1cdfc7`，已合入A3b第一增量 `593d771`。首轮 `8d34ed1` 的失败输出保留作定位记录，不再代表当前门禁；下面列出实际执行结果及修复归属。

| 命令/场景 | 已观察结果 |
| --- | --- |
| `pnpm install --frozen-lockfile`（初始） | 成功，无新增切片依赖 |
| `pnpm install --no-frozen-lockfile`（同步固定主干） | 成功；未执行 `pnpm add`，保留单一 renderer/react 链接 |
| `node scripts/gpuix-main/check.mjs --resolution` | verified；app/renderer/reconciler/Zustand 解析到同一 React 19.2.4 与固定主干 host |
| `pnpm native:build` | 成功；真实 `@zoeydaw/native` 二进制已生成 |
| `pnpm exec tsc --noEmit`（初始 0.10 阶段） | 0 diagnostics；不是当前主干最终结论 |
| `bun test src/project/model/track-routing.test.ts src/project/model/project.test.ts`（索引重构后） | 17 pass，0 fail，185917 assertions |
| `bun test src/project/sections/arrangement/tracks/meter`（真实provider/hook/driver路径） | 6 pass，0 fail，40 assertions；无测试driver/now旁路 |
| 原生 height 键盘定向回归 | 3个resize通过；8项几何断言在删除本切片旧shim后8pass/87assert，未放宽 |
| 原生 name Space 隔离与 Tab 顺序 | 2 pass，7 assertions |
| 原生 Mixer wheel/drag/cancel/disabled self-send | 3 pass，10 assertions；模拟滚轮单位为 Pixels，16px 为共享一步 |
| 原生后代 Enter/独立选择/Tab | 3 pass，18 assertions；修复 Solo Enter 意外改变 row selection |
| 菜单选色/快照/切主题 | 1 pass，3 assertions；颜色 token 不变，身份实际渲染色改变 |
| 原生屏外父表头/可见子轨围栏、屏外裁剪、固定轨道超限 | 3例通过；Group的25 vs23误差是旧测试shim重复补偿，已修正 |
| `node_modules/.bin/eslint --fix`（拥有范围及授权增量） | 零输出；深层导入自动改为 `@/`，自绘 SVG/字形已改共享 Icon |
| `node scripts/gpuix-review-scan.mjs`（当前基线） | 23 source、5 tests，0 HARD、2 WARN；仅demo与render-cost窗口尺寸字面量 |
| `pnpm exec tsc --noEmit`（A3b第一增量后） | 退出0，无诊断；自有类型与共享KeyEvent问题均已清除 |
| `bun test`（当前阶段1源码） | 609 pass、2 todo、1 fail，753836 assertions；612 tests/104 files/42.38s，唯一失败为已仲裁的嵌套标题副键点击 |
| `pnpm exec eslint apps/gpuix/src/project/sections/arrangement/tracks` | 退出0，无输出 |
| `cargo check --workspace && cargo test --workspace` | 退出0；engine32、native8，共40 pass；仅既有非根package profile警告 |

### 当前原生裁剪与帧统计

实跑 `bun src/project/sections/arrangement/tracks/verification/render-cost.tsx`，退出0。脚本卸载后逐项断言retained为0，并断言两组保留节点相同。原始数据：`evidence/2026-10-15-first-increment-render-cost.json`。单次采样，不推断大工程更快或稳定帧率。

| 源轨道数 | 挂载行 | 车道槽 | 保留节点 | 原生帧 | p90 ms | p99 ms | max ms |
| -------: | -----: | -----: | -------: | -----: | -----: | -----: | -----: |
|       20 |      6 |      6 |      660 |     30 | 11.738 | 13.362 | 13.695 |
|     2000 |      6 |      6 |      660 |     30 |  7.603 |  9.181 |  9.658 |

### 阶段1剩余阻塞与首轮问题处置

| 观察 | 分类与后续 |
| --- | --- |
| 首轮4个共享UI `EventPayload`→`KeyEvent`错误 | A3b第一增量已修，本分支合入后tsc退出0 |
| 首轮platform/controls的10个失败 | A3b第一增量已修，本分支全套不再报告这些失败 |
| tracks首轮8个几何失败：复合行宽1、折叠首行5、Send三列1、Group高度1 | 本切片必修，先前误归A3b。协调者实测定位为0.10 `readOuterBounds`重复补偿；测试helper已切原生bounds，8pass/87assert，不改断言 |
| 嵌套标题副键点击打不开track菜单 | 历史失败已由F2共享原生事件修复；补验收原生回归通过，旧mouseDown变异失败1项 |
| 首轮5个5000ms超时：F2、Group拖动、focused-level Space、name Space、Tab | 后续完整运行不再报告超时；未提高timeout、跳过或放宽断言，未推断根因 |
| focused-level Space及Solo Enter祖先菜单断言 | A3b第一增量后当前消费者路径已通过；不扩大为全部共享键盘策略已验证 |
| 全套2个todo | 既存于`project/model/grid.test.ts:66`和`ui/controls/DragPad/DragPadNumber.test.tsx:146`；本切片没有新增/跳过测试 |

阶段1历史输出为 `evidence/2026-10-15-first-increment-full-test.txt`；首轮输出保留在 `stage1-bun-test.txt`，中间门禁在 `native-bounds-full-test.txt`，Rust输出在 `stage1-cargo.txt`。当前结果以文末补验收为准。

### 变异检查

| 变异 | 观察到的失败数 | 恢复 |
| --- | --: | --- |
| 索引判定把“目标是后代”改为允许 | 1 | 已恢复，纯路由套件 3 pass、185854 assertions |
| 索引判定把输出环路改为允许 | 1 | 已恢复，同上 |
| 菜单把 token 写入改成解析后 literal | 1 | 已恢复，选色/快照/切主题回归通过 |
| 禁用生产 `useAnimationFrame` 订阅 | 2 | 已恢复，meter套件6pass40assertions |
| 产品reorder恢复0.10 `readOuterBounds` | 1 | 已恢复原生bounds；强化后的两侧落点均非原始顺序，2pass/2assert |

固定种子路由性质生成 200 棵、每棵 17 条轨道的分组树：候选与 authored route 接受集合一致，输入未被修改。候选索引不再在每个目标路径里反复 `tracks.find`。独立纯函数场景：2002 条轨、2001 个合法目标，200 次投影 41.38ms；没有测旧版，不报提速倍数。

## 原生窗口与进程生命周期

所有 `bun --hot` 均用命名service启动。早期各批证据后立即kill；G1时段因交互式前台授权等待超时，关闭晚于终点78.440秒，已如实报告并关闭/撤权，不能称全部按时清理。

| service | 已观察/处理 |
| --- | --- |
| `b2-tracks-initial` | demo seed 的 MIDI velocity 曾错误使用0..1；真实边界拒绝 snapshot，修成整数89；失败 watcher 35.9s 即 kill |
| `b2-tracks-initial-fixed` | 实际 AX/默认截图；发现复合行被 ContextMenu 内层缩成内容宽；47.8s kill |
| `b2-tracks-layout-fixed` | 修复后真实截图/zoom：车道左、表头右；18.3s kill |
| `b2-tracks-real-meter` | 真实 AX 按钮 Stopped→Playing；真实 telemetry 与 overload；1m55s kill，音频随进程停止 |
| `b2-tracks-production-meter-proof` | 当前默认生产provider/hook/driver：AX Stopped→Playing→Stopped；电平仍floor、截图黑，未锁屏；1m25s kill，未宣称信号/衰减通过 |
| `b2-tracks-g1-signal-proof` | 真实信号清晰图、40px拖动与G1原生读回；02:33:07.662启动，02:44:18.440退出；kill晚78.440秒，时限验收失败，peak视觉未完成 |

真实 C1 证据：`evidence/2026-10-15-real-meter-playing.ax.txt` 显示 Audio L−23.0/R−27.0、Group L−26.0/R−28.5、Return L−38.0/R−45.0 dBFS；`real-meter-overload.ax.txt` 显示真实 Clip gain24 后 Audio L+1.0/R−1.8，Main 保持低输出。没有合成电平。

早期显示布局变化曾导致黑图和 `InvalidCoordinateFrame`，不是锁屏。`b2-tracks-f1-states` 在A3b第一增量前取得四主题语言、Solo激活和Group折叠的清晰图/zoom/AX，3m22s即kill。文件名`final-*-default`仅表示当时的默认布局，不代表当前consumer验收；后三种主题语言保留了Audio Solo on。新fill/hideIcon及菜单/编辑/系统拖动/滚轮/最终bounds必须重新取证，不沿用已结束的输入时段。

此前生产帧smoke证据：`production-frame-smoke.ax.txt`、`production-frame-smoke-black.png`，当时只能证明命令响应。后续G1时段已得到真实信号清晰图，但仍未完成停后peak，见文末增量补验。

demo有真实音频源：`track-demo-audio`为Audio Clip，samplePath指向`crates/engine/spikes/assets/probe.wav`，循环1→2，初始Audio −12dB、Main −36dB。后续日志证明后台仍有真实levels，不能把初始黑图/floor归为没有音频源。

阶段1已实跑 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"`：stdout为空，退出1，没有匹配进程。原始记录见 `evidence/2026-10-15-stage1-process-cleanup.txt`；这是本次检查时的状态，不承诺后续其他worker启动情况。

## 与 Live 对比表

历史观察窗口1920×918，完整标题列99 + 路由/Mixer193 =292 AX单位（`live-geometry.json`）。本轮在协调者批准的UTC时段只读观察已运行Live，未点击/输入/激活：当前窗口1463×1049，截图缩至1250×896，路径 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/omp-computer-15a75264ba1dfdad.png`。当前AX与bounds在 `/tmp/zoeydaw-tracks-followup/live-current.ax.txt`、`live-bounds.json`；原始AX单位不换算为截图像素。窗口/显示器变化，旧292宽与新值不作直接百分比结论。

| 产品规则 | Live 事实/证据 | 本实现与结论 |
| --- | --- | --- |
| 复合行的区域顺序与密度 | `live-current-zoom.png`：车道左，颜色标题、路由、Mixer右；完整宽292 AX | 同顺序，304共享单位；原始布局截图已观察；当前角色颜色仍需新图 |
| 轨道/操作条高亮独立 | 本 worker 未在 Live 输入验证 | 自有 selection surface 原生回归通过；Live 一致性未验证 |
| resize步进、折叠阈值、光标 | Live 未执行拖动 | 复用共享布局步长，native回归；Live交互未验证 |
| 展开 Audio 内容 | 本轮AX e1540–e1554：输入/通道/监听/输出/激活/Solo/arm/volume/pan/send | 原生窗口e62–e101与相同可见内容一致；系统逐状态视觉未完整验证 |
| MIDI音量/Pan | 本轮AX e1555–e1566仍无音量/Pan（No Output） | 按协调者产品决定保留；明确差异，非已接通乐器声明 |
| Group展开/折叠内容 | 历史Group输出/开关/Solo/音量/Pan/send无arm；本轮sidechain折叠，未操作 | 预留不可交互arm槽；折叠手势/完整展开对照未验证（禁止Live输入） |
| Return/Main内容 | 本轮AX e1567–e1581：Return开关/Solo/Post；Main两输出/音量/Cue/Pan，无arm/Solo；截图两行当前折叠 | 同类控件规则一致；全部折叠/展开状态未验证（未操作Live） |
| 表头独立padding与数值列 | 本轮Live routing72×15、enable48×15、Solo/arm23×15、volume/pan48×15（live-bounds.json） | 我们高度13、routing66、enable47、Solo26、arm24；同量级但非完全相同，不宣称像素一致 |
| Send横向三列再换行 | 本轮Live只观察一条Send32×15 | 我们真实AX三列32/33/32×13、gap4，第四个换行；原生容量/守恒通过；Live多Send未验证 |
| 电平0dB/声道切口、渐变与峰值 | 提供的Live帧未出现可采样输出条，仅输入指示器 | 使用共享角色和B1峰值；真实AX信号已证明；Live色值/线宽/hold视觉未验证 |
| 组框连通、围栏在上、分隔不截断 | Live当前zoom可见组色条；未观察所有折叠/嵌套状态 | 复合行唯一边框、active ancestry框、rails最后画；原生边界回归；Live全部状态未验证 |
| 作者颜色与填充 | Live标题及填充同一作者色 | canonical token + shared contentFill，切主题原生回归通过 |
| 折叠Audio标题fade | Web/B1证据定位为Clip标题；协调者已确认lane绘制 | 删除Identity额外装饰；Clip fade归lane，非本切片虚构遮罩 |
| Space仅播放、Tab与焦点 | Live未按键取证 | 当前原生消费者input/Tab/Enter/Space回归通过；Live交互一致性未验证（禁止输入） |
| wheel、隐藏/恢复光标、弹层调整 | Live未输入验证 | native事务/取消回归通过；系统drag/wheel/focus未验证（黑图且不接管前台）；嵌套标题右键菜单已实际打开 |
| 分割条/侧栏/Header溢出 | 不属于本轨道切片 | 依赖panels/timeline/app-shell；未擅自实现另一套 |

## UI规范第13节证据矩阵

| 检查 | 当前证据和限制 |
| --- | --- |
| 每控件每状态放大图 | 按新版第13节采用少量组合overview，不批量逐按钮截图；当前补验收见文末 |
| 同类间距统一token | 源统一共享control/project度量；当前组合bounds与限制见文末 |
| 数值/文字/图标居中 | Select fill/hideIcon与NumericPad共享实现已入主干；当前组合截图见文末 |
| 同组等高、图标方形 | fold/palette取共享尺寸，record随Mixer扩展；当前组合bounds见文末 |
| Live同区域紧凑感 | `2026-10-15-native-live-side-by-side.png`；raw AX292 vs304，约宽4%；不把截图缩放像素误当原始单位 |
| 深/浅与中/英 | 当前四种组合离屏完整截图已生成；真实窗口Light切换AX验证通过；系统窗口截图全黑，不把离屏图扩大为系统呈现已通过 |
| Tab/焦点环/Space | 当前原生消费者回归通过且无超时；系统焦点环/Space逐状态取证未完成，不扩大为共享全路径通过 |
| drag/wheel/popup | 共享能力已合入；原生消费者回归通过，系统输入取证及限制见文末 |
| 可见裁剪性能 | 当前主干已实跑，见“当前原生裁剪与帧统计”及原始JSON；卸载后节点归零断言通过 |

## 自审结果与分类

完整 `TrackDualAxisReview2` 与增量 `TrackDeltaReview3` 的必修均已处理。`TrackFinalReview4` 已独立覆盖2c947eb、ad1a01a、8d34ed1：Standards/Spec均无新增必修，确认真实provider/hook/driver测试路径、直接F1 timestamp、正反focus守卫及cursor TS端口。审查没有运行验证；运行结果以上述真实门禁为准。

| 审查 | 固定代码范围 | 已覆盖提交 |
| --- | --- | --- |
| TrackDualAxisReview2 | `git diff 95d49fe...66f4783` | 17个自有提交，含轨道源迁移、原型删除、经批准的共享路由迁移与主题收敛 |
| TrackDeltaReview3 | `git diff 66f4783...33d2849 -- apps/gpuix/src/project/sections/arrangement/tracks` | fb178d7、2bcdeee、10740d4、33d2849 |
| TrackFinalReview4 | `git diff 33d2849...8d34ed1 -- apps/gpuix/src/project/sections/arrangement/tracks` | 2c947eb、ad1a01a、8d34ed1 |
| TrackFinalReview4 后续复核 | `git diff 21f3a26...b1cdfc7 -- apps/gpuix/src/project/sections/arrangement/tracks`及固定工作区增量 | bb4c17e、5ab43d2、b1cdfc7；native bounds、强化边界回归、七处fill、hideIcon/Cue图标与GPUI滚轮迁移均已覆盖 |

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
| 测试/产品使用0.10 bounds shim | 必修→已修 | bb4c17e与后续类型修正直接使用原生getElementBounds；8项几何转绿；合成边框容器行间±1px回归2pass，改回shim变异1fail |
| A3b第一增量消费 | 已修/已接 | 七处Select fill，普通level/send/pan hideIcon，Cue保留Headphones；原生output实际内宽断言通过 |
| 最终纠正及consumer双轴复核 | 已返回，无新增必修/仲裁 | TrackFinalReview4多次固定增量复核覆盖当前三个后续提交；视觉与运行结果由本报告单列 |
| G1 demo真实读回增量 | 代码复核无必修 | TrackFinalReview4已审ad3a63d的观测顺序/边界；长行格式由hook修正，实际GUI证明另列 |
| 观测增量触发no-tests | 已仲裁并清零 | 038ed87删除临时readback/stdout包装，仅保留证据/报告，旧入口不是现存功能；提交后扫描0source/0tests、0HARD/0WARN，未改扫描或添加转发测试 |
| 清理代码与文档一致性 | 独立复核无发现 | TrackFinalReview4确认仅保留原Frame stats显示、直接注入nativeCursorLock；README/报告均已说明历史入口删除 |
| driver活动条件的冗余`listeners.size > 0` | 记录 | 不影响行为；不为风格再改生产路径 |
| 受控帧源同步、生产源microtask | 记录 | 排队/session失效由platform测试负责，tracks不另造调度器 |
| Ctrl与lane Shift/identity Cmd对称分支未逐项测试 | 记录 | 当前已覆盖native正反守卫、Cmd移除与Shift范围；不增重复路径用例 |
| 边界−1顺序不变，不能区分空target | 记录→已强化 | 拖动源改为第三条轨，边界两侧都产生非原始顺序；2pass，shim变异1fail |
| hook合成边框场景被误称生产几何修复 | 描述仲裁→已更正 | 当前TrackRows无border/padding，产品几何不变；README区分hook合约与8项测试helper修正 |
| Cue/全部fill分支缺consumer接线断言 | 记录 | 不加wiring/svg存在性测试；实际图标和状态留到真实窗口逐项取证，未验证 |

## 未实现/未验证事项

- F2嵌套副键已通过现存消费者行为回归；内存恢复旧mouseDown/button判断后失败1项，没有修改共享文件。
- F3已通过授权的 `meter/telemetry.tsx` 消费 `useResumeFrame` 并 `flushSync`；首帧最新值及停止后恢复释放frame demand回归通过，禁用恢复advance变异失败1项。
- 停止后peak回归覆盖600ms保持、1600/2000ms逐渐下降、4000ms到地板且释放帧订阅；将订阅错误限定为playing变异失败1项。
- 需要新Live操作的条目均为「未验证（Live未运行）」；按协调者指示不启动、不操作Live。当前系统输入证据与限制见文末，不把离屏测试扩大为系统输入验证。

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

### 渲染器升级后删除旧bounds补偿

- 错：继续用0.10的`readOuterBounds`读已包含border/padding的主干bounds，并把8个几何失败误归共享控件。
- 对：产品和测试都读唯一原生`getElementBounds`；用主干`legacy-bounds-shim`扫描阻止复发。
- 证：8项几何8pass/87assert；合成边框容器行间±1px回归2pass，恢复旧shim的变异1fail。当前无边框生产容器的几何并未改变。

## 增量补验：G1 与真实信号

窗口基于`7d25915`与当时的临时demo读回诊断。采证时Frame stats打印真实accepted telemetry/renderer统计，组合根在原生restore后、工具恢复用户原指针前读回坐标；这些readback/stdout诊断现已按协调者裁决删除，旧入口不是现存功能。只保留原始证据与报告。后续已同步H2等主干，以下图片不冒称H2最终视觉。

| 场景 | 实际结果 | 证据 |
| --- | --- | --- |
| 真实WAV播放 | 清晰窗口图；Audio AX L−22.0/R−48.7dB，Group L−25.0/R−41.6，Return L−37.0/R−40.5；Main音量仍−36dB | `evidence/2026-10-15-g1-slot-playing.png`与同名`.ax.txt` |
| G1快拖，无额外停留 | Audio −12.0→−11.0；上拖40px，anchor和原生restore后读回均(1418,353)，误差0pt | `evidence/2026-10-15-g1-slot-events.json`的`cursor-restored`、`evidence/2026-10-15-g1-slot-drag.ax.txt`；对应截图为black，不用它宣称完整拖动视觉 |
| Clip gain24 | frames834/sequence10529的accepted `levels.main`为L−38.0157/R−40.9905dB，同批AX Main仍为L−60/R−60；某随机轨道L+2.0308dB未额外映射，不宣称红区视觉通过 | `evidence/2026-10-15-g1-slot-events.json`、`evidence/2026-10-15-g1-slot-overload-stale.png`与同名AX |
| 停后peak | 未完成，不宣称通过 | 后续另排前台时段 |

关键图前后renderer统计与后台数据已交协调者，完整六列表见[`后台帧记录`](evidence/2026-10-15-background-frames.md)。原生key/main、occlusion与frame callback次数都未采，Window图清晰不等于桌面可见。当前数据不能区分“失活但可见”与“被遮挡”，不能用renderer帧数代替callback计数。

### G1 增量已运行检查

- `pnpm native:build`成功，release构建完成。
- `pnpm exec tsc --noEmit && bun test src/platform/cursor/cursor.test.ts src/ui/controls/DragPad/cursor-port.test.tsx src/project/sections/arrangement/tracks`在apps/gpuix运行：tsc0，49pass/1已仲裁嵌套右键失败，50tests/6files。
- `cargo check --workspace && cargo test --workspace`：退出0，45pass。
- 独立CLI调用新platform adapter：`pressAnchorWithoutWindow:null`、`cursorReadable:true`，没有移动/隐藏光标。
- demo诊断增量在当前主干执行`pnpm --filter @zoeydaw/gpuix-prototype typecheck`和切片eslint均退出0。曾误在根目录调用裸tsc，仅打印CLI帮助，未将它计为类型通过。
- 合入4036109相关主干后，`pnpm exec tsc --noEmit && bun test src/ui/controls/DragPad/DragPadNumber.test.tsx src/ui/controls/DragPad/variants.test.tsx src/project/sections/arrangement/tracks`：tsc0，65pass/1已仲裁嵌套右键失败，66tests/6files。
- ad3a63d的临时诊断曾触发1source/0tests、1HARD `no-tests`、1WARN。按协调者裁决，038ed87提交删除后重新扫描：0source/0tests、0HARD/0WARN；这是净代码已恢复主干、仅剩证据/报告差异的结果，不是给未提交诊断套用空扫描，也没有门禁例外。
- 删除临时诊断后，apps/gpuix内再次执行`pnpm exec tsc --noEmit && bun src/project/sections/arrangement/tracks/verification/render-cost.tsx`退出0；原生裁剪仍为6行/6车道槽，两组保留节点一致，卸载归零断言通过。此结果不代替未完成的真实peak视觉。

### 时段约束未通过

授权02:33–02:43 UTC，服务02:33:07.662启动、02:44:18.440退出，晚78.440秒。末尾调用`computer.control.acquire`在宿主等待人工确认120秒后超时；随后立即kill、release并发“桌面释放”。原始时间在`evidence/2026-10-15-g1-slot-summary.json`，没有改写为按时完成。

协调者已要求：以后需要前台时提前ask，不在时段内申请交互式control.acquire。停后peak留到下次；本批只交部分证据，不发送第二次最终merge_ready或worker_done。

后续`computer.control.state()`为`active:false`。进程检查只剩其他切片的`88423 10:13 bun --hot src/project/sections/clip-edit/demo/index.tsx`，未停止它，不声称全机零匹配。自己的tracks service已退出；原始清理输出见`evidence/2026-10-15-g1-slot-cleanup.txt`。

## 2026-10-15 F2/F3/A3b补验收

基线 `21dace3`，没有重写已合入实现。删除 Identity Button、Mixer/Monitor Toggle、NameInput 的局部 padding/border/radius 覆盖，让共享 chrome/Input 与 `theme.design` 拥有外观；保留列宽、轨道色和布局。新停止回归走生产 provider/hook/driver 和已有确定性 frame source，不增加时钟或第二份工程数据。

### 当前门禁

| 命令（除注明外在apps/gpuix） | 实际结果 |
| --- | --- |
| 根目录初始化：build.sh → frozen install → native:build → check.mjs --resolution | 全部成功，十一补丁 verified，未新增依赖 |
| `pnpm exec tsc --noEmit && bun test`（最终） | 退出0；1147 pass、1既有todo、0 fail，1104186 assertions，176 files，40.05s |
| `bun test src/project/sections/arrangement/tracks` | 49 pass、0 fail、264 assertions；后续一次short trager超时5000ms，定向重跑1pass/7assert且最终全套通过，未放宽timeout |
| `bun test src/project/sections/arrangement/tracks/meter` | 9 pass、0 fail、57 assertions |
| 根目录 `cargo check --workspace && cargo test --workspace` | 退出0；51 pass/4 suites；既有非根profile警告 |
| `bun src/project/sections/arrangement/tracks/verification/appearance-smoke.tsx` | 四种主题语言组合截图；每次卸载retained tree为0 |

### 可重跑变异

在apps/gpuix运行 `TRACKS_MUTATION=<id> bun test --preload ./src/project/sections/arrangement/tracks/verification/mutation-preload.ts <test> -t '<name>'`。preload只修改内存中的onLoad源码，检查替换唯一性，不写共享文件；`git status --short apps/gpuix/src/ui/controls/Menu/trigger.tsx`为空。

| id | test与name | 实测失败数 |
| --- | --- | --: |
| context-mousedown | tracks/Row/interaction.test.tsx；secondary click | 1：嵌套标题菜单未打开，选色目标不存在 |
| stop-freezes-peak | tracks/meter/TrackMeter.test.tsx；stopping playback preserves | 1：停止后帧订阅0而非1，无法继续衰减 |
| resume-stale | tracks/meter/TrackMeter.test.tsx；first resume commits | 1：首个恢复帧仍floor而非最新−38/−41dB |

表中test路径前缀均为 `src/project/sections/arrangement/`。正常实现的对应回归全部通过；没有保留失败标记。

### UI第13节当前证据

协调者批准桌面时段14:55:30–15:05:30 UTC；所有输入只在自启窗口，无acquire/takeover。AX与生成图在 `/tmp/zoeydaw-tracks-followup/`。真实窗口截图 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/omp-computer-15a75185751dfdab.png` 全黑，不能作为视觉通过证据。协调者已明确接受以下边界，系统视觉与输入缺口归收尾串行整体验收。

| 第13节检查 | 本轮证据／限制 |
| --- | --- |
| Gallery与业务整体布局 | `dark-en-US.png`、`dark-zh-CN.png`、`light-en-US.png`、`light-zh-CN.png`为完整TrackRows组合离屏图，不是逐按钮截图；lane为只读文字槽，不冒充clip-lane接通 |
| 跨区域对齐与居中 | native-bounds.json真实AX：fold13×13；title68×13；routing66×13；volume48×13、pan53×13。离屏overview检查文字/数值居中；系统呈现全黑，仍未验证 |
| 间距与内边距 | 真实AX monitor横向gap4，路由纵向gap4，Send列gap4；共享control/project度量，不加实例补偿 |
| 统一设计入口 | 删除四处组件族局部零padding/border/radius；改用共享Button/Toggle/Input已有chrome，圆角/边框来自theme.design；无共享文件改动 |
| 尺寸与紧凑感 | native-bounds.json：同组高13，fold13×13，Send三列32/33/32；Live本轮高15、send32，紧凑同量级，非像素一致 |
| 深浅主题与中英文 | 四种组合离屏图已重新生成；真实Light AX press后变为Dark标签，主题切换实际发生；系统主题视觉未验证（全黑） |
| 状态与键盘 | 实际Solo AX press off→on；现存原生Tab/Space/Enter/编辑/disabled/取消回归通过；系统focus/hover/pressed未验证（不接管前台） |
| 拖动/滚轮/弹层/性能 | 嵌套标题AX右键实际打开Rename/颜色菜单，menu.ax.txt；系统drag/wheel未验证（黑图、不接管前台），原生事务回归通过；本轮未重复性能采样，历史数据不扩大为当前性能结论 |

低音量播放尝试前AX确认Main−36dB，但 `computer.run` 10秒超时，未得到播放/停止返回证据，立刻kill服务；不宣称真实播放或停后peak截图通过。停止peak由确定性生产hook回归证明：600ms保持、1600/2000ms逐渐下降、4000ms到地板并释放订阅。Live本轮只读截图/AX补齐可观察内容，手势、播放峰值及多Send行为仍未验证，未操作用户工程。

### 补验收自审结果

| 发现 | 类别 | 处置/证据 |
| --- | --- | --- |
| F2/F3已由主干修复，旧报告仍称阻塞 | 必修 | 删除过时阻塞与保留失败描述；复用共享事件/useResumeFrame，3个内存变异各失败1项 |
| 停止后平滑下降缺显式状态转换回归 | 必修 | 新增停止行为回归，包含hold/中间位置/floor/释放；playing限定变异失败 |
| 业务控件局部外观覆盖 | 必修 | Identity/Mixer/Monitor/NameInput恢复共享chrome/Input；消费者回归与当前组合图 |
| 窗口黑图及播放run超时 | 汇报仲裁→已接受证据边界 | 协调者批准离屏四组合+原生回归交付；系统drag/wheel/focus/播放停止/peak窗口图继续未验证 |
| 独立TracksFollowupReview两轴 | 记录 | 对照gpuix代码质量底线及Spec，已审新增回归、preload、appearance入口及Identity/Mixer delta，0必修/0仲裁；不把静态审查称运行验证 |

### 错题

- 错：将黑色系统截图当成界面视觉通过，或把一次10秒超时当成播放/停止成功。
- 对：AX证明语义/量值，离屏图证明可重复组合绘制；系统呈现与输入限制单独汇报仲裁，超时即停止自有service，不升级前台。
- 证：真实Light/Solo/菜单AX与黑图并存；协调者接受明确未验证边界。

### 已验证做法

- 用Bun onLoad做共享源码内存变异：不写共享文件，目标漂移直接失败，消费者行为测试验证真实缺陷。
- 停止回归不要只看最终floor：先检查hold，再检查两个下降中间态，最后检查frame demand释放；冻结与瞬时归零都能被捕获。
