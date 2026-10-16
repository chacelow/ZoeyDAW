# K1：命令注册表、声明式 keymap 与默认消费

2026-10-16。基线 `d0db74c`；实现提交 `5c7c5164`、`bb5971e1`，独立审查修复 `ae7987a8`；按协调者指令同步主干 TD-10 的 merge 提交 `83d227de`。不新增依赖、Rust 改动、用户 keymap 文件、命令面板或 renderer 焦点身份。K1 最终差异入口为 `git diff gpuix-migration...HEAD`；主干同步内容不作为 K1 自行修改。

## 实现与边界

- `platform/keyboard/commands.ts`：21 个 `CommandId`，每个具备真实双语 `commands.${id}` 标题 key 和返回 `handled | pass` 的 handler；业务仍调用原有 `projectActions`。
- `default-keymap.ts`：唯一窗口绑定数据；`createKeymap` 对键、修饰键和上下文交集进行构造时冲突检测，不按行顺序覆盖。`Mod` 保留 Cmd/Ctrl 双平台行为，`Shift?` 明示原快捷键允许 Shift 的范围。
- 上下文来自组合根已有 text/modal lease、同次 `keystrokeId`、workspace 电脑 MIDI 状态及 Browser 展开能力。保存、播放、B 在 Clip Editor 非文本区的例外由数据决定。Cmd/Ctrl+F 已迁入同一窗口命令 owner，组合根先行订阅只记录 keystrokeId。
- `shared/keyboard.consumeKey` 是无依赖叶子：handled 同时 preventDefault 与 stopPropagation，pass 不改事件；platform 重导出，ui 直接消费 shared。共享控件的实际激活、导航、调整、取消均使用它；文本输入的 shortcut isolation 仍只停止传播。Menu Tab 保留原生焦点前进，Toolbar/Transport 按钮仍不响应或吞掉 Space。
- B 临时绘制、轻按锁定、MIDI noteOn/noteOff、电脑键盘关闭、失活、editEpoch 和 dispose 释放仍在同一个 timeline keyboard owner。B 松键按按下时保存的键身份释放，修饰键或焦点中途变化不漏释放。
- 原 `keyboard/controller.ts` 中的保存、Space、B、撤销/重做、网格、Escape、Home、M、A、Z/X/C/V、方向键和全部电脑 MIDI 音符键已迁移；没有保留快捷键 if 双路径。`key === "…"` / `key !== "…"` 删除检查为 0；唯一键身份比较是 `draw?.key === key`，属于持续手势资源释放，不是快捷键声明。
- lane/rulers 的选区、剪贴板、定位点和手势命令保留其既有 owner；timeline 局部命令先交它们认领，项目级保存/播放/B 不进入该链。未改其它 section 的键盘逻辑。
- 生产菜单没有已传入的独立 shortcut 字符串消费者；未凭空加菜单项。已有 timeline A/B 文字及中英文 Clip Editor `Draw · B`（含 demo）改从 `formatKeys` 派生；原生 DropdownButton 回归证明菜单插槽随 keymap 从 F6 改成 F7。
- 独立审查发现 slotted Button 的 Enter 被 Trigger 提前消费会跳过子按钮回调；协调者批准将 Popover/Menu Trigger 命令移到既有父容器的冒泡阶段，由 context 注册唯一 handler。Button 先完整激活再消费；普通 Trigger 未消费时由父层处理。没有新增 wrapper、定时器或组件类型特判。DropdownButton 的生产 API 没有 asChild/套 Button 的 trigger 路径，不受此问题影响。

协调者已批准的最小扩展：shared/keyboard 叶子和精确 lint 边界、timeline 订阅/toolbar/README、CollapseDivider、双语命令资源、三个既有变异入口的锚点维护、Clip Editor 四处既有提示。未改共享 theme、native 公共导出或架构方向。

## 实跑验证

| 命令 / 场景 | 结果 |
| --- | --- |
| `bash scripts/gpuix-main/build.sh`、`pnpm install --frozen-lockfile`、`pnpm native:build`、renderer `--resolution` | 通过；复用已校验 renderer，单一 native/React；无依赖清单改动 |
| 原 keyboard/composition/UPA 定向基线 | 42 pass；迁移前既有断言保留 |
| timeline/platform/composition/UPA 迁移检查 | 103 pass |
| `bun test src/ui/controls src/ui/panels/CollapseDivider src/platform/keyboard src/project/sections/arrangement/timeline/keyboard src/app/project/composition.test.tsx` | 215 pass，0 fail |
| 最终 `bunx tsc --noEmit` 与 keyboard/composition/UPA 定向回归 | 0 类型错误；52 pass，0 fail |
| `pnpm exec vitest run tooling/eslint/gpuix-layers.test.js` | 56 pass；platform/ui 可用 keyboard 叶子，叶子反向依赖及 platform→theme 仍被禁止 |
| 真实 i18next lookup smoke | 中英文各 21 个 command title 全部解析，不回退为 key |
| `bun src/platform/keyboard/mutations.mjs` | 6/6 caught：原冲突、上下文、消费、显示四项，加 Popover/Menu 提前消费两个变异，各 1 个行为失败 |
| `bun src/ui/verification/mutations-r2.mjs` | 7/7 caught；UPA-05/06/07 分别 2/5/1 个行为失败 |
| `bun src/project/sections/arrangement/timeline/verification/mutations.ts` | 25/25 caught；ARR-04 Clip Editor 保存 2 个行为失败 |
| `bun src/app/verification/mutations.mjs` | 30/30 caught；包括 modal/折叠 Browser、文本 lease、重复窗口 owner、held B；原文件已恢复 |
| `node scripts/gpuix-review-scan.mjs` | 0 HARD，1 WARN（SettingsShell 既有 720×520，键盘修改未增加尺寸值） |
| 根目录最终 `pnpm verify:gpuix` | **通过**；1322 pass、1 既有 todo、0 fail；架构 97 pass、CLI 81 pass，离屏 bounds/scale 检查通过，UI map current；真实后端 Home→工程→resume 首 present smoke 通过并释放 idle |
| slot 原生修前回归 | 0 pass / 2 fail；两个 family 的子 Button activations 均为 []，而非 [true] |
| slot 修后 platform/controls/divider/UPA 回归 | 214 pass，0 fail，tsc 通过；子 onClick/onActiveChange 与浮层开关恰好一次，窗口不再收到，Menu Up→Escape→Enter 恢复首项 |
| renderer 相容同步 | 修后门禁曾因共享 vendor ordered patch-series mismatch 阻断；按协调者指令 merge gpuix-migration 后 `build.sh` 只建立已验证产物链接、不重建/取锁；最终全套门禁通过 |

未修改 Rust 源码，因此未额外运行 cargo check/test；已通过的一轮完整门禁实际重建并使用真实 native 二进制。原有测试没有修改断言；新增两个 keymap 测试、一个原生消费测试、一个原生菜单显示测试、一个 held B 修饰键变化回归及两个 slotted activation family 回归。

## 变异锚点迁移

| 原变异 | 旧锚点 → 新锚点 | 缺陷语义与结果 |
| --- | --- | --- |
| UPA-05 Menu Home | preventDefault/stopPropagation 双行 → `consumeKey(event, "handled")` | 删除消费后 Home 再次到窗口；2 fail |
| UPA-06 CollapseDivider | preventDefault/stopPropagation 双行 → `consumeKey(event, "handled")` | 删除消费后 divider 键再到窗口；5 fail |
| UPA-07 DragPad Escape | 活动 guard 后双行消费 → guard 后 consumeKey | 删除消费后取消继续关闭 Clip Editor；1 fail |
| ARR-04 Clip Editor Save | 保存 if 的 `target !== "clip-editor"` → save 绑定 context 从 project 改为 arrangement | Clip Editor 保存重新丢失；2 fail |
| App RadioGroup 箭头 | 双行消费 → consumeKey | 箭头重新影响窗口；1 fail |
| App modal / Browser 折叠 | 组合根 `isModalOpen()` / `browserCollapsed()` guard | 仍作为 context 输入存在，锚点无需改；各 1 fail |

## 原生运行与证据

证据目录：`/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/zoeydaw-k1-qFTim0`，PNG 不提交。

可重跑：在 `apps/gpuix` 执行 `B2_EVIDENCE_DIR=<隔离证据目录> bun src/app/verification/r2-ui-smoke.tsx`。它使用 `createTestRoot`、真实 native backend 和 `captureScreenshot`，验证 divider Home 不 rewind、Menu Home 不 rewind、BPM Escape 回滚且 Clip Editor 保持打开、失活回滚、真实 telemetry 与卸载释放；本次全部通过。

- `project-en-US-dark.png`、`project-en-US-light.png`、`project-zh-CN-dark.png`、`project-zh-CN-light.png`：四种业务组合全图均实际查看；已有 A/B 与 Draw · B 文字保持原样。
- `gallery.png`：同屏控件、菜单、表单、面板和项目卡片组合已查看，未改视觉 token 或实例布局。
- `project.ax.json`：离屏业务 AX。
- 真实后台窗口：命名 service `k1-keymap-gallery`，`GPUIX_BACKGROUND=1 bun --hot src/gallery/controls.tsx`。启动记录 background=true、真实 renderer constructor identity matched；只读 AX 观察到窗口 `zoeydaw composition Gallery`。后台未出完整内容帧，不宣称前台视觉已验收；观察后立即 kill，存活约 10 秒。
- 清理：执行 `ps -axo pid,etime,command`，以 `bun .*--hot|cargo run|gallery|demo` 过滤；输出 `[]`，零匹配。`process-cleanup.txt` 保存空匹配结果。未启动或停止用户服务，未申请桌面控制。

## UI 规范第 13 节

| 检查 | 证据 / 限制 |
| --- | --- |
| Gallery 与业务整体布局 | gallery.png 与四张 project 全图；只替换键盘接线及既有文字数据源，不加界面 |
| 跨区域对齐与居中 | 同屏 toolbar、卡片、面板与 Clip Editor 已查看；未改几何，A/B/Draw · B 默认内容不变 |
| 间距与内边距 | 未改 gap/padding；沿用共享控件 token，无业务实例补偿 |
| 统一设计入口 | 无新样式入口；消费 helper 位于共享键盘叶子，视觉仍由原组件/theme 拥有 |
| 尺寸与紧凑感 | 业务组合密度保持；本轮未做 Live 同区域尺寸量测，不声称新的密度一致性结论 |
| 深浅主题与中英文 | 四张业务组合全图均复核；Gallery 本轮为 dark/en |
| 状态与键盘 | 原生真实 keystrokes、Menu、DragPad、Divider、Button Space、上下文、Clip Editor 保存、消费/放行回归及变异均通过；物理键盘由协调者前台串行验收 |
| 拖动、滚轮、弹层与性能 | 既有原生 DragPad rollback/失活、菜单、timeline 变异通过；前台实际帧耗时与硬件输入未测，交协调者收尾 |

## 产品规则 → Live 观察 → 实现 → 差异 / 未验证

Live 仅通过 computer 的只读菜单观察，未修改用户工程或发送快捷键。

| 产品规则 | Live 观察 | 实现 | 差异 / 未验证 |
| --- | --- | --- | --- |
| 全局保存 | 文件菜单 Save Live Set=Cmd+S，Save As=Shift+Cmd+S | 原有 snapshot Save 在 Clip Editor 非文本区生效 | 保留原有 Shift+Cmd+S 同样保存 snapshot；没有新增 Save As |
| 撤销 / 重做 | 编辑菜单 Cmd+Z / Shift+Cmd+Z | 原快捷键映射保持 | 未对用户 Live 触发撤销；Clip Editor 局部 undo 仍归自身 |
| 网格 | 选项菜单 Cmd+1/2/4=缩窄/加宽/吸附；还存在 +3/+5 | 仅迁移已有 +1/+2/+4 | +3/+5 仍未实现，不扩产品范围 |
| 绘制 / 电脑 MIDI | 选项菜单 B / M | B held owner 与 M/音符/八度/力度保持 | 未在 Live 演奏或绘制，不宣称演奏手势实测一致 |
| Space | 回放菜单 Space=播放，Shift+Space=继续播放，Alt+Space=从插入点 | 原有 Space/Shift+Space 都 togglePlay；Toolbar 不吞 | 本次只迁移行为；Live 继续播放/Alt+Space 语义未新增 |
| Split | 当前音符编辑菜单 Cmd+E=在网格上切割音符 | Arrangement 选 Clip 仍交 lane split，无选择消费不改 grid | 未在 Live 执行会修改工程的 Split |

## 自审结果

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| platform 引用 shared/keyboard 被旧规则误分类为 shared/theme | 汇报仲裁 → 已批准修复 | 增加精确无依赖 leaf，禁止反向依赖，不放宽 platform→theme | 协调者批准；layers 56 pass，全架构 97 pass |
| UPA/ARR 变异旧字符串锚点失效 | 汇报仲裁 → 已批准修复 | 仅迁移等价缺陷锚点，保留断言与变异语义 | 上表与 7/25/30 caught |
| 截图发现 Clip Editor 中点格式 Draw · B 未被首次搜索找到 | 汇报仲裁 → 已批准修复 | 生产与 demo 中英文四处从 formatKeys 派生 | 四种业务组合全图；原文字不变 |
| SettingsShell 既有 width720/height520 | 记录 | 不在键盘切片顺手改视觉 token；本轮只改消费边界 | scan 0 HARD/1 WARN；未增加尺寸值 |
| Spec 独立审查 | 记录 | 无缺失、越界或错误实现发现 | pstack-reviewer `KeyboardSpec`，对 `git diff d0db74c...HEAD` 静态审查 |
| slotted Button Enter 被 Trigger 提前消费 | 汇报仲裁 → 已批准修复 | Popover/Menu 父容器后置路由；修前 2 fail，修后回调恰好一次，两个变异 caught | ae7987a8；独立 reviewer 复核关闭 P2 |
| Standards 独立审查 | 记录 | 无剩余规范发现；原 pstack reviewer 同时审过追加修复，replacement reviewer 复核关闭唯一 P2 | `KeyboardStandards` 与 `KeyboardStandardsRetry` 只读结论 |
| renderer ordered patch-series mismatch | 汇报仲裁 → 已解决 | 按协调者指令同步主干 TD-10（83d227de），只建立链接，不修改共享产物 | build.sh link-only；最终 verify:gpuix passed |

独立 Standards/Spec 审查、修复复核及相容同步后的完整门禁均已完成；尚不表示协调者已前台验收或已合入。

## 错题

- 错：仅搜 shortcut、Cmd 和键符号会漏掉 `Draw · B`；对：用实际组合截图交叉核对提示，再定位所有 locale/demo 来源；本轮已补齐四处。
- 错：把 keyUp 再按当前修饰键解析，会让按住 B 后按 Cmd 再松 B 漏释放；对：持续资源按 keyDown 时的键身份释放，焦点/修饰键变化不改变归属；新增回归通过。
- 错：仅验证 WindowKeyboard subscriber 未收到，不能证明元素已经 stopPropagation，因为 defaultPrevented 也会让 bus 跳过订阅；对：原生测试同时观察实际窗口 phase 和用户可见状态，缺 stopPropagation 的变异必须失败。
- 错：Trigger 在 asChild 的子 Button 完成 activate 前消费 Enter，导致调用方 onClick/onActiveChange 消失；对：在已有父容器后置执行 Trigger 命令，先让子元素完整处理；两个 native family 修前失败、修后通过并有变异。
- 错：祖先键事件的 elementId 被当成原始 target；对：原生 probe 实测 child=2、parent=3、父 handler elementId=3、focused=2，使用现有 renderer focused element id 路由 Trigger，不重建焦点树。

## 已验证做法

- 用有限上下文与修饰键交集在 keymap 构造时拒绝冲突；反转绑定顺序不改变解析结果。
- 保留文本原生 default 与命令默认消费的边界；不要为统一 helper 阻止文字输入或 Menu Tab。
- 真实 `nativeSimulateKeystrokes` 配合窗口组合观察，能抓到已处理键冒泡；菜单实际 F6→F7 文字与解析同改，能抓到展示复制。
- 既有 ARR/UPA 变异跟随 owner 数据迁移而不是删掉；同一用户可见缺陷恢复后仍被原断言抓住。

## 未实现项与后续入口

用户可编辑 keymap 文件、命令面板、renderer 级焦点身份均按规格不做：后续分别接 `createKeymap`、注册表 `commands`、composition context 输入。没有新增用户配置 watcher、重试、遥测、焦点系统或占位功能。仅剩协调者前台真实键盘/视觉/帧性能验收及复核合入；worker 不自行前台抢焦点、不 push。
