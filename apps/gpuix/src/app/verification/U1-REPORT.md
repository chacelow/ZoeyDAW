# U1 用户交互缺陷

## 范围与当前状态

- U1-1：删除 Footer 顶部重复的 Affect Chain / Clip Edit 切换，唯一切换入口为 StatusStrip；提交 `260e80d9`。
- U1-2：协调者要求暂停 Minimap 改动，等待用户决定 Live 式相对位移交互；未改 Minimap 或共享 DragPad。
- U1-3：B（尺寸变化重复 reveal）与 shell 折叠循环已修复，提交 `0cc88423`；附带共享 solver 精度修复经协调者批准，提交 `f70d9c2b`。A（异步布局收敛）已复现并由协调者明确接走到 renderer 切片，不能宣称闪动已彻底修复。

## 根因与修法

### Footer 重复切换

Footer 的 MotionTabs 与 StatusStrip 两个按钮控制相同的 shell 视图。Footer 改为按受控 `view` 直接渲染内容，保持折叠卸载、设备固定高、Clip 填满宿主、Clip ID 生命周期；内容暴露本地化 `role=group`，无孤立 tabpanel。

删除无用途的 `onViewChange`、`reducedMotion` props，迁移组合根、demo、测试和验证入口。删除失去消费者的 footerJoinedGroupGap 像素测试，不改共享 MotionTabs、StatusStrip 实现或 DragPad。

### Clip Panel 折叠反馈循环

真实 AppShell smoke 第二次 `status-clip` Enter 后 Footer 内容仍存在；真实 ProjectSections 组合在 Panel `onResize` → shell state → layout effect imperative collapse/expand 的循环中触发 Maximum update depth。协调者批准扩展 app/project 修复范围。

将显式命令与 resize 报告分离：命令只驱动一次 Panel handle，`reportClipCollapsed` 只发布接受后的尺寸，不再通过 effect 把报告变成下一次命令。真实后端 smoke 已验证 Clip → 收起 → Devices → Shift-Tab → Clip；额外多轮循环发现的共享 solver 精度缺陷亦已获授权修复。

独立审查发现旧闭包预测可能与 reducer 批处理队列失配；真实 Panel 回归确认收起态同批双 toggle 错误展开。协调者批准单 `flushSync` 原子顺序：读 `currentState.current` 最新已提交快照 → reduce next → handle 一次 → dispatch 同一 action，返回前同步完成 resize 报告；不持有第二份独立可写状态。layout effect 的 clipEditorRequest 用明确 open 布尔驱动 handle 后 dispatch，不调用 flushSync。按最初建议先 dispatch 再读 ref 的方案亦实测失败：旧几何报告覆盖折叠意图；现已删除，并以顺序变异证明不可恢复。提交 `c51b0ece`。

### Arrangement 尺寸与 reveal

逐轮 `renderer.flush()` 后、`dispatchNativeEvents()` 前采集 native bounds、Scene viewport、scrollY 与 PNG。Arrangement/Grid 元素 ID 未变，排除卸载重挂。

切到 Clip 的 `panel/layout/scene.height` 实测为 `316/464/464 → 437/246/464 → 437/367/246 → 437/367/367`。A 是 Group 测量与子布局事件分轮到达，非重挂；仅在现有 timeline onLayout 内同步 measure 无法修掉首个旧 viewport 绘制边界。

B 的单测修复前：仅把 bodyHeight 从 320 改为 160，scrollY 从 0 跳到 163。移除 height 作为 reveal 触发条件，仅编辑目标变更 reveal；首次非零测量仍可 reveal 待定位目标，尺寸变化继续 clamp。修复后同一单测 scrollY=0，真实后端展开/折叠逐轮 scrollY=0。

共享 solver 反例：`computeLayout([440.17336956521734, 288.8266304347827], total=729, clip min=20%, max=60%, collapsed=0, delta=288.8266304347827)` 原返回 `[583.2,145.8]`，拒绝收起。区间相交严格比较拒绝约 1e-13 的浮点端点差；协调者批准只将相交判定改为文件既有 `1e-6` 容差，不扩展 Panel API。回归先红后绿，结果精确为 `[729,0]`，reflow 后继续为 0；恢复严格比较的变异命中。

### A 的原始帧证据与交接

最终原始 JSON 为证据目录下 `final/layout-rounds.json`；逐轮 PNG 按 `<stage>-<round>.png` 命名。40 轮中 native ID 始终为 panel=1397、grid=1370，所有轮次 scrollY=0；`atomicLayout=false`，以下中间轮次仍保留，不隐藏失败。每个 PNG 对应 JSON 的同名 stage/round；round 0–7 全部保留，表中省略的尾部轮次均已收敛。

| 阶段/轮次 | Arrangement 外框高 | timeline-layout 高 | Scene viewport 高 | PNG 摘要 |
| --- | --: | --: | --: | --- |
| editing/0 | 316 | 464 | 464 | 新外框，旧布局和旧 viewport |
| editing/1 | 437 | 246 | 464 | Group 第二次分配，viewport 尚未更新 |
| editing/2 | 437 | 367 | 246 | 子布局已变，viewport 仍滞后一轮 |
| editing/3–7 | 437 | 367 | 367 | 稳态完整内容 |
| clip-collapse/0 | 736 | 367 | 367 | Footer 已卸载，外框变大 |
| clip-collapse/1 | 736 | 666 | 367 | 子布局变大，旧 viewport |
| clip-collapse/2–7 | 736 | 666 | 666 | 稳态；Footer 不存在 |
| clip-expand/0 | 440 | 666 | 666 | 新外框、旧 viewport |
| clip-expand/1 | 440 | 370 | 666 | 子布局变小、旧 viewport |
| clip-expand/2–7 | 440 | 370 | 370 | 稳态 |
| footer-toggle/0 | 736 | 370 | 370 | 分数高度后的收起成功 |
| footer-toggle/1 | 736 | 666 | 370 | 子布局变大、旧 viewport |
| footer-toggle/2–7 | 736 | 666 | 666 | 稳态，Footer 不存在 |

另有 initial/0 的 layout464/scene0 首次测量差。协调者回复明确：A 是 renderer 绘制边界问题，另开切片处理；U1 不加业务轮询、零尺寸忽略或 key 强刷。

## 验证记录

| 命令/场景 | 实际结果 |
| --- | --- |
| `bash scripts/gpuix-main/build.sh`、`pnpm install --frozen-lockfile`、`pnpm native:build`、`node scripts/gpuix-main/check.mjs --resolution` | 成功，复用固定 renderer 构建，native release 构建通过 |
| Footer/index、Footer/configuration-native、Status/index 三文件 `bun test` | 16 pass / 0 fail |
| `bun test src/project/sections/arrangement/timeline/timeline.test.tsx` | 10 pass / 0 fail；新增高度-only回归先红后绿 |
| `bun test src/app/project/useProjectShell.test.tsx` | 1 pass / 0 fail，5 assertions；真实 Panel/Group 单次收起及同批双 toggle 均验证最终高度0/内容卸载 |
| `pnpm exec tsc --noEmit` | 已通过 |
| 所有本轮改动 TS/TSX/MJS 范围 eslint | 0 错误、0 警告 |
| `bun src/app/verification/mutations-u1.mjs` | 6/6 非等价变异命中：孤立 tabpanel、collapse→expand、重复 reveal、严格区间比较、ref→闭包快照、dispatch-first旧顺序；隔离副本，不改工作树 |
| `bun test src/ui/panels` | 39 pass / 0 fail，4128 assertions |
| Footer/Status/Timeline/Shell 与 panels 合并范围测试 | 66 pass / 0 fail，4223 assertions，10 files |
| `B2_EVIDENCE_DIR=<外部目录> bun src/app/verification/u1-footer.tsx <外部目录>` | 真实 native 后端；唯一切换、Clip/收起/Devices/Shift-Tab/Clip 通过 |
| `B2_EVIDENCE_DIR=<外部目录> bun src/app/verification/u1-layout.tsx <外部目录>` | 最终单独重跑24.73秒完成40轮；稳定 IDs、scrollY=0、Footer反复切换/卸载通过；atomicLayout=false。此前与Footer smoke连跑的60秒截止曾超时，未把超时算通过 |
| `GPUIX_BACKGROUND=1 bun --hot -e 'import "./src/main.tsx"; console.log("U1 window started")'` | 真实窗口 pid7204；AX 含 Settings/Open/New project；focused=false；20.9 秒内立即关闭 |
| `B2_EVIDENCE_DIR=<外部目录> bun --preload ./src/app/verification/native-fixture.ts src/app/verification/r1c-surfaces.tsx <外部目录>/surfaces` | 8 个真实后端组合：中英×深浅×MIDI/Audio；已读取四主题/语言代表完整图，无重复顶部切换 |

证据目录：`/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/zoeydaw-u1.hrLIAw0Tc7`。包含 Footer PNG、AX JSON、逐轮 PNG/JSON、真实后台窗口 AX；不提交生成截图。

## 产品规则 → Live 观察 → 实现 → 差异/未验证

Live 仅只读 AX 和窗口截图，未点击、拖动、改变播放或工程内容。窗口 `104465`（Live，无标题，1463×1049）；AX 播放=0、跟随播放=1、录制=0。

| 产品规则 | Live 观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 底部只一套 Clip/Devices 切换 | 截图底部细节区为 Clip；AX e245 Clip 细节、e338 状态；无第二组本产品式顶部切换 | 删除 Footer MotionTabs，状态栏唯一入口 | 本产品标签命名/布置不与 Live 逐像素等同 |
| Minimap 松手光标跟随移动后位置 | 只观察顶部 overview 框，未做指针手势 | 暂未修改 | 等待协调者产品决定；物理光标待前台验收 |
| Footer 变化不重定位 Arrangement | 当前 Live Arrangement 与 Clip 编辑器同时可见 | B 只在编辑目标变化 reveal | 未在 Live 展开折叠；A 尚未修复，不能宣称闪动完成 |

## UI 规范第 13 节

| 检查 | 证据与限制 |
| --- | --- |
| Gallery 与业务整体布局 | `footer-clip.png` 是完整真实后端组合，不是逐按钮截图；Gallery 未新增外观，前台整体由协调者验收 |
| 跨区域对齐与居中 | 保留既有 Footer 内容与 Status 控件，没有新加局部对齐补偿；完整图无重复标签行；前台待验收 |
| 间距与内边距 | 删除 tabs 行及其专属 gap，不新增裸尺寸或局部 spacing |
| 统一设计入口 | 复用既有 Footer/Status/Panel/EffectChain，设备高仍取 theme.project.footerDeviceHeight |
| 尺寸与紧凑感 | 设备固定高与 Clip 宿主高度回归通过；Live 参考只读截图；未作物理 DPI 等同比较 |
| 深浅主题与中英文 | `final/surfaces` 八个完整业务 PNG/AX JSON；已查看 en-US-dark-audio、en-US-light-midi、zh-CN-dark-audio、zh-CN-light-midi；均只有底部一组切换，前台整体仍待协调者验收 |
| 状态与键盘 | 原生 Enter 切换/再次收起、Shift-Tab Devices→Clip 通过；不改共享 Space 规则 |
| 拖动、滚轮、弹层与性能 | 未改这些共享行为；Minimap 待产品决定/前台验收；逐轮 native 帧证据不冒充真实前台耗时 |

## 自审结果

`node scripts/gpuix-review-scan.mjs`：11 source、6 test，0 HARD、5 WARN。独立 Standards/Spec reviewer 已审固定 diff `git diff 10cc0d98^2...f70d9c2b .`：Spec 0 findings；Standards 0 硬违规、1 个批处理风险。该风险已真实复现、获协调者仲裁并修复；两位 reviewer 追加只读复核 `git diff f70d9c2b..c51b0ece .` 均通过，Standards 原 P2 已关闭、Spec 无新增发现。审查未冒充独立跑测试。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| A：viewport 落后外框的异步绘制轮次 | 汇报仲裁 | 协调者已明确接走到 renderer 切片；U1 保留原始逐帧数据，不宣称修复 | `final/layout-rounds.json` 和表中 PNG |
| Panel solver 分数端点拒绝 collapse | 汇报仲裁→必修 | 协调者授权最小容差修复；已先红后绿并捕获严格比较变异 | `f70d9c2b`、panels 39 pass、最终变异6/6 |
| px-literal：verification/footer/demo.tsx（2） | 记录 | 既有验证窗口固定尺寸，非产品 token；本轮只删 Footer 废弃 props | scan WARN |
| px-literal：verification/footer/measure.tsx（6） | 记录 | 既有离屏测量 fixture 尺寸，保留可比性 | scan WARN |
| px-literal：verification/footer/states.tsx（8） | 记录 | 既有状态组合 viewport 尺寸，不进入产品代码 | scan WARN |
| px-literal：verification/u1-footer.tsx（2） | 记录 | 新增离屏 1280×800 fixture，配置契约允许测试夹具尺寸 | scan WARN |
| px-literal：verification/u1-layout.tsx（2） | 记录 | 新增逐帧离屏 1280×800 fixture，非产品尺寸 | scan WARN |
| command 的闭包旧 state 在同批两次 toggle 时失配 | 汇报仲裁→必修 | 真实回归先红后绿；协调者批准单flush原子顺序，保留ref→闭包与dispatch-first两个非等价变异 | `c51b0ece`、Shell5 assertions、最终变异6/6 |
| 最终独立 Standards/Spec 复核 | 记录 | 双轴通过，原P2关闭；没有未处置的U1必修项 | `U1StandardsReview`、`U1SpecReview` 对 `f70d9c2b..c51b0ece` 的只读复核 |

## 错题

- 错：只用受控 Footer+Status 测试判断整页收起正确。
- 对：必须接真实 ProjectLayout/Panel/Group；原生 fixture 实测抓到 onResize 反馈循环与 solver 分数端点缺陷。
- 因：受控宿主省略了 Panel 几何与 imperative handle 生命周期。

## 已验证做法

- 逐轮 flush 后、下一轮布局事件前同时记录 Scene/bounds/scrollY 与稳定 native ID，能区分尺寸落后、重复 reveal 与重挂。
- 显式 Panel 命令和 accepted resize 报告分流，避免 state→effect→imperative→onResize 反馈循环。
- 高度-only 回归先红后绿，并恢复错误 reveal 谓词做非等价变异，证明测试捕获用户可见纵跳。

## 未验证与剩余

Minimap 产品方案由协调者明确暂停；A 同绘制边界修复由协调者另开 renderer 切片；物理光标、Gallery 与真实前台整体验收待协调者。未运行本地完整 verify:gpuix、打包或 CI；未改 Rust 源码，因此不声称做本轮 crate check/test。

## 进程清理

真实后台窗口 `u1-background-smoke` 在只读 AX 后已关闭，存活 20.9 秒。最后运行 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"`：输出为空、退出码 1（无匹配），没有本 worker 残留 demo/gallery/bun --hot/cargo run。
