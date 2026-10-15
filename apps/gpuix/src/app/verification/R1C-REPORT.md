# R1c 验证报告

2026-10-16。基线 `51cfb9e`。分支 `chacelow/gpuix-r1c-ui-app`。规格为 `scripts/orchestration/specs/r1-review-fixes.md` 的 R1c。

## 实现与回归

| 项目 | 实现 | 失败证据与通过证据 |
| --- | --- | --- |
| 1 方向键 owner | `navigateSelection` 找到有效目标后消费事件；Separator 只消费实际处理的 resize 方向键。事件类型改为 `KeyEvent`。 | 组合回归修前从 `8.1.1` seek 到 `8.2.1`；修后切页与 resize 都不 seek，Space 仍改变播放状态。分别还原两个消费分支，各有 1 个回归失败。 |
| 2 通用滚动 | MIDI toolbar 使用水平 `ScrollArea wheelToHorizontal`；AudioParameters 使用命名的纵向 ScrollArea。领域视口 owner 未改。 | 修前纵向滚轮不移动 MIDI toolbar，Audio 不是 region；修后原生滚轮横向移动，Audio 暴露注入名称的 region。两个变异各失败 1 个回归。 |
| 3 列表行度量 | `listRowChrome` 由 ListRow、Select、Menu 共用。trigger 继续使用 default 或 transport，popup 使用统一紧凑行。删除旧 menu 行 token。 | transport popup 密度变异与独立 Menu padding 变异各失败 1 个几何回归。默认和 transport trigger 实际打开列表后，对照 Browser 使用的 ListRow。 |
| 4 Browser roving focus | 按来源保存当前焦点，与资源选择分离。有结果时当前有效行或第一行是唯一 Tab 入口，容器为 -1；空结果由容器承接。Enter 或点击选择资源。 | 原生 Tab、方向键、Home、筛选、恢复和来源切换回归通过。还原容器入口、selection 驱动入口、箭头隐式选择、Home 跳过聚焦分别失败 1、3、1、1 个回归。 |
| 5 名称与状态 | Button、PianoKeys、PatternSteps 删除英文 on/off 后缀，保留 aria-pressed。Browser 注入中英文 splitter 名称。Separator 不再提供英文默认名称，值为语言中性的数值文本。 | 名称稳定与真实业务状态回归通过。五个名称变异均失败，Browser 名称变异在中英文各失败一次。真实 AX toggle 状态映射依赖 F6，由协调者集中验收。 |
| 6 数值字体 | `theme.design.typography.numberFontFamily` 统一测量、display 和 input，默认 Menlo。 | 使用 Helvetica 的原生测宽及编辑宽度稳定回归通过。三处分别恢复 Menlo，各失败 1 个回归。 |
| 7 删除尺寸别名 | 删除 NumericPad 的 variant，仅保留 size。源码消费者使用 size；类型约束禁止 variant 回归。 | 恢复 variant 属性使 `number-font.test.tsx` 的类型约束失败。 |

恢复缺陷的变异同时提供已委派项目的修前红灯证据。所有 mutation runner 在 finally 中恢复源文件，不保留变异。

### 协调者授权的附加根因修复

工程组合采集首次触发 `Fixed panels exceed the available size`。协调者在主干复现，观测 total=57，而没有 maxSize 的 timeline panel 被解析为 min=max=160，误判成固定面板。

`ResolvedConstraints.fixed` 只在作者显式声明同单位的 minSize、maxSize 且解析后 max <= min 时成立。像素 minimum 与百分比 maximum 混用时保持弹性。fitLayout 和 reflowLayout 不再用夹取后的 min===max 推断固定。像素 defaultSize 的暂时保留约束和 CollapseDivider 的构造一起迁移，无兼容默认字段。固定预算确实超出 viewport 时仍抛 RangeError。

`sizes.test.ts` 首轮修前 2 个测试均在 RangeError 失败。独立审查又发现混合单位边界，新增回归修前也在 RangeError 失败，协调者裁定按同单位声明识别 fixed。最终 layout 目录 25 pass，4064 assertions。恢复旧 fit 判定使 3 个测试失败，删除单位判定使混合单位回归失败。工程采集输出 8 个有效组合，逐张采集前检查 project-layout 和对应 editor 存在，不把错误边界截图当证据。

## 提交

| 提交      | 内容                                                   |
| --------- | ------------------------------------------------------ |
| `d25c898` | 消费已处理方向键，加入窗口组合回归与变异               |
| `c5853b6` | Clip 使用共享 ScrollArea                               |
| `a553717` | 共用 popup 行 chrome，删除旧行 token                   |
| `a937d14` | Browser 焦点与选择分离，注入内部 splitter 名称         |
| `6fa72c4` | 移除英文状态名称，Separator 数值文本，补 KeyEvent 类型 |
| `14d7957` | 数值字体主题 token                                     |
| `32f79a8` | 删除 variant 尺寸别名及类型变异                        |
| `96f158f` | Fold 回归改为实际折叠行为，不依赖旧标签后缀            |
| `2ff9471` | 修复固定面板误判，加入组合采集入口                     |
| `a300ab4` | 修复独立审查发现的 Footer demo splitter 名称遗漏       |
| `7e335a2` | 按协调者裁定，混合单位 Panel bounds 保持弹性           |

`src/gallery/design-preview.ts` 的旧 menu 行 token 覆盖删除超出原始 R1c owner。协调者明确授权此精确清理，Gallery 没有其他改动。附加 Panel 根因修复及 CollapseDivider 两行约束迁移也经过协调者授权。

## 实际运行的验证

| 命令 | 结果 |
| --- | --- |
| `bash scripts/gpuix-main/build.sh` | 本 worktree 的 renderer link 与既有补丁构建通过 |
| `pnpm install --frozen-lockfile` | 通过 |
| `pnpm native:build` | 通过；未修改 Rust |
| `pnpm verify:gpuix` | 通过，最终行 `verify:gpuix passed` |
| verify 内 `tsc --noEmit` | 0 errors |
| verify 内 eslint | 0 warnings |
| verify 内 architecture regressions | 80 pass |
| verify 内 bun test | 1213 pass，1 个基线 todo，0 fail，194 files |
| verify 内 UI map | current，9 entries，3 routes，223 testIds |
| verify 内真实 backend smoke | Home → project → resume first present 通过，released idle |
| `node scripts/gpuix-review-scan.mjs` | 0 HARD，2 WARN，21 source files，12 test files |
| `bun src/app/verification/mutations.mjs R1c` | 3 mutations caught |
| `bun src/project/sections/clip-edit/verification/mutations.mjs R1c` | 2 mutations caught |
| `bun src/project/sections/browser/verification/mutations-r1c.mjs` | 8 mutations caught |
| `bun src/ui/verification/mutations-r1c.mjs` | 7 行为变异与 1 类型变异 caught |
| `bun src/gallery/verification/evidence.tsx /tmp/zoeydaw-r1c-gallery-evidence` | errors=[]，6 overviews |
| `B2_EVIDENCE_DIR=/tmp/zoeydaw-r1c-project-evidence bun --preload ./src/app/verification/native-fixture.ts src/app/verification/r1c-surfaces.tsx /tmp/zoeydaw-r1c-project-evidence` | combinations=8，无 stderr，真实 native backend |

上述 bun 命令从 `apps/gpuix` 运行。第一次 verify 发现 pressed-families 的旧 Fold(off) 查找。该测试现在检查 release 前 key71 仍在、release 后 key71 被折叠，保留原有 pressed 几何断言。修复后全量 verify 通过，没有重置行为预期。

## UI 规范第 13 节

真实前台视觉和 F6 依赖的 AX 状态由协调者集中验收。协调者明确不给本 worker 前台桌面时段，要求保留离屏证据后发 merge_ready。

| 检查 | 本轮证据与边界 |
| --- | --- |
| Gallery 与业务整体布局 | Gallery 6 张组合 overview；工程 8 张中英文、深浅、MIDI/Audio 组合截图，均在仓库外。真实前台评审由协调者集中验收。 |
| 跨区域对齐与居中 | 离屏 `default--dark--en.png`、`en-US-dark-midi.png`、`zh-CN-light-audio.png` 已读取检查；未把离屏截图称为前台桌面证明。 |
| 间距与内边距 | density 回归对照共享 ListRow 与实际 popup bounds；Gallery evidence 的度量检查 errors=[]。 |
| 统一设计入口 | Select、Menu、Browser 共用 listRowChrome；数值三处共用 typography token；已删除独立 menu 行度量。 |
| 尺寸与紧凑感 | default/transport trigger 保留各自尺寸，popup 不跟随放大。Live 浏览器与走带已只读观察；精确跨应用尺寸对照由协调者集中验收。 |
| 深浅主题与中英文 | Gallery 4 个默认组合及 2 个设计变体，工程 8 个组合。前台复核由协调者集中验收。 |
| 状态与键盘 | 原生测试覆盖切页、resize、Space、Browser Tab、筛选与资源选择、稳定名称、业务 toggle 状态。真实 AX toggle 映射依赖 F6。 |
| 拖动、滚轮、弹层与性能 | 原生滚轮与 popup 几何回归通过，既有 Clip 交互回归通过。没有新增实际帧耗时测量，不声称性能提升。真实前台操作由协调者集中验收。 |

真实窗口执行过 `GPUIX_BACKGROUND=1 ZOEYDAW_ROUTE=/library bun --hot src/main.tsx`，service 名 `r1c-gallery`，pid56466，窗口134360。AX 读到 Settings/Back，截图黑屏，不能证明 Gallery 布局。service 在观察后立即关闭，存活14秒。截图路径为 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/omp-computer-15a7a6509748d9de.png`。

Footer demo 的实际 AX 还复现了独立审查的缺名称问题。修前为 `splitter`，修后英文为 `splitter "Resize Browser"`、中文为 `splitter "调整浏览器宽度"`。分别使用 `r1c-footer-label`、`r1c-footer-label-after`、`r1c-footer-label-zh` 三个短时 service，每次取证后立即关闭，存活18、17、14秒。Footer demo 是直接启动入口，未为单个标签抽出额外薄包装或写源码文本断言。

### 产品规则与 Live 对照

Live 窗口104465，标题“无标题”，AX 与窗口截图只读观察，无工程修改。

| 产品规则 | Live 观察 | 实现 | 差异或未验证 |
| --- | --- | --- | --- |
| 状态不混入名称 | 中文走带 AX checkbox“跟随播放”值1、“播放”值0；名称无英文状态后缀 | Button 等保留翻译名称，状态走 aria-pressed | Native AX 映射待 F6 后集中验收 |
| 浏览器复合导航 | Live 暴露“浏览器侧边栏”outline 和结果 outline，资源为 row | Browser 单一 Tab 入口，方向键 roving focus，明确选择独立 | 未操作 Live 的资源导航，不声称每个选择时机与 Live 一致 |
| 工作站密度 | 走带、浏览器在同一窗口呈现紧凑行 | popup 行统一 default 度量，transport trigger 独立 | 未做跨显示器像素换算，前台视觉由协调者集中验收 |

## 自审结果

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| r1c-surfaces 的 width1280、height800 与 Footer demo 既有 viewport 尺寸被 px-literal 报告 | 记录 | 两项均为验证窗口输入尺寸，不是业务控件度量；Footer 的尺寸未修改 | scan 0 HARD，2 WARN |
| renderer 丢弃 aria-pressed/checked | 汇报仲裁 | 协调者已派 F6，禁止英文 suffix fallback；集中复验真实 AX | Orca reply 指定 F6 `ctx_b915a0d37556` |
| Gallery 残留已废弃 row token overrides | 汇报仲裁 | 精确授权后删除 | 协调者 reply 授权只删对应覆盖 |
| 小 viewport 把弹性 min 误判固定，组合页面错误边界 | 必修，协调者授权追加 | required fixed 字段来自声明，迁移构造点；保留真正固定预算错误 | 新测试修前2 fail，最终 layout25 pass，旧 fit 变异3 fail，组合8张通过 |
| 独立 Standards 发现 Footer demo 的 PanelDivider 缺名称 | 必修 | 组合边界注入中英文名称，不恢复共享英文 fallback | 实际 AX 修前无名称，修后 Resize Browser / 调整浏览器宽度；`a300ab4` |
| 独立 Spec 发现百分比 max 与像素 min 冲突仍误判固定 | 汇报仲裁 | 协调者裁定同单位声明才可 fixed；已补混合单位回归与单位变异 | 修前1 fail，修后25 layout pass，单位变异1 fail；`7e335a2` |
| 独立 Standards 与 Spec 审查 | 已完成并关闭发现 | `pstack-reviewer` 审 `git diff 51cfb9e..2ff9471 -- apps/gpuix/src`，9 个提交、41 个文件；再只读复核 `git diff 2ff9471..7e335a2` | agent `R1cIndependentReview` 确认两条 finding 关闭，增量无新发现 |

## 错题

- 错：原生回归把组件 aria-pressed 当作 retained customProps 可读状态。当前 renderer 会丢弃该属性，不能用改断言字段伪装 AX 已支持。
- 对：名称回归和真实业务状态分别验证；原生 AX 缺口交给 renderer owner，F6 后集中复验。
- 错：使用 resolve 后的 min===max 判断固定 panel。viewport 小于弹性 min 时，默认 max 被夹取成 min，错误边界阻断整个工程页面。
- 对：在约束解析时保留声明的 fixed 信息，不从后续数值相等反推作者意图。
- 错：数值字体测宽回归只 flush paint、不 dispatchNativeEvents，测量 owner 还停留在估值。
- 对：完整派发原生 onLayout 后比较同字体 reference 宽度，并在编辑态保持外壳宽度。

## 已验证做法

- 组合根键盘回归能抓住局部导航与 timeline 双 owner，修前位置从8.1.1到8.2.1，修后保持原位。
- 恢复缺陷的变异用原生行为断言失败，不用源码文本或编译错误冒充运行时红灯。类型 API 删除另用 compiler 约束证明。
- 截图入口在保存前检查业务组件存在，避免 RouteErrorBoundary 吞掉异常后仍输出“成功采集”。
- 共享行 chrome 同时约束 Select、Menu、Browser，transport trigger 的独立高度不传染 popup。

## 进程清理

`r1c-gallery` 已立即停止。其余验证命令均为有限进程，原生截图 root 在 finally 中 unmount。

运行 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"` 的输出为 `(no output)`，退出码1，无匹配残留。

## 交付边界

没有改 Rust、没有新增依赖、没有 push。AudioWaveform 拆分不在本规格。真实前台视觉、AX toggle state 与 F6 依赖由协调者集中验收，不能据本报告称为已完成桌面验收。
