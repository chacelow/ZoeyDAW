# C2 统一配置调用迁移

## 交付状态与范围

C2 样式、布局和共享文案接口已实现，原 `merge_ready` 头 `a2104da0` 已由协调者合入主干 `b4047cac`。随后同步 C4 与 C3 最终来源，删除全部批准的暂态接线；本报告区分原样式迁移的零像素差证据与最终来源合入后的验证。

实际基线为 `a4a9d11c`。实现提交 `886841c7`，主干/K1 合并 `82b517bf`，C1 合并 `d3fa50f2`（输入 `1c84bd9a`），原生验收修复 `f7d4fbf9`，scanner 窄修 `06b9ffaa`。checkpoint 由协调者明确授权；每次直接提交均使用 `USER_CONFIRM_HASH`，ultracite 与 UI map hook 通过，未使用 `--no-verify`。没有 push。

原始路径为 `ui/**`、`app/**`、`sections/{footer,browser,transport,clip-edit}/**`。协调者追加授权了共享英文默认值删除、Gallery 必需 props 与宽度接线、TrackMixer 的单处 Pan props、删除死 Footer 圆角来源、完整受控颜色输入，以及 scanner 中央原生 Icon 宿主的精确路径修复。C1/K1/TD10 的其它改动为合入依赖，不是 C2 越界实现。

## 盘点组处置

| style-layout 组 | C2 处置与来源 |
| --- | --- |
| 1.1 | Panel 六项比例读取 `layout.project.panels`；删除 `app/project/layout-constraints.ts` |
| 1.3、1.5、1.6 | SettingsShell、presetGrid、Home 分别读取专用尺寸；不借轨道控制列宽 |
| 2.1–2.5 | Menu/Dropdown/Popover 的宽高、offset、collisionPadding 读取 design；显式 `0` 使用 `??` 保留 |
| 2.6–2.9 | DragPreview、Empty、Loading、Toast 的 gap/inset/radius/宽度读取专用来源 |
| 3.1–3.4 | Card/control border、separator、两种菜单 inset、focus ring 统一；outlineOffset 取同一 ring 宽度的负值 |
| 3.5–3.7 | 编辑器 divider/loop/selection、插入/marker/velocity、网格/inset 全部注入；MIDI note 复用 control border；纯 `notePaint` 接收 design/project |
| 3.8 | joined gap 读取 `tabs.footerJoinedGroupGap`；Footer 圆角被证明为死配置，经批准删除来源、override、无效回归和变异 |
| 4.3–4.5 | destructive、row hover、dialog backdrop 读取集中派生语义色 |
| 4.6–4.8 | 编辑器填充、琴键、力度配方统一；力度复用 `velocityNoteFill/velocityNoteBorder`，127 保持 MIDI 协议常量 |
| 4.9 | 成功通知读取独立 `colors.success`，不再读 chart2；真实红/绿 success 与蓝 chart2 的输入验证此差异 |
| 5.1、5.3、5.4、5.7–5.10 | disabled、drag source/preview、波形轴、MIDI loop、网格、数值 fill、不确定进度均读独立语义来源 |
| 6.1、6.2、6.4、6.5 | 字重、Icon stroke、device response stroke 读取主题；纯 iconMarkup 要求显式 stroke |
| 6.6 | 200×60 为 SVG 坐标域，保留 C 并共享 `DEVICE_DISPLAY_VIEWBOX`，不作为屏幕尺寸 |
| 7.6 | centerMarker inset/width 读取 design；其它 Arrangement 几何归 C3 |
| 8.1 | tabs duration/easing 读取 design，原生中间帧回归；reduced-motion 零时长保持语义常量 |
| 8.2、8.3 | ToastPolicy 经组合根注入；最终读取 C4 `usePreference("notifications")`，删除 UI 默认 policy |
| 8.4、8.5 | 语义 cursor 统一；原生事件状态转换与变异覆盖，OS 实际指针形状留前台验收 |

1.2 窗口默认归 C4；1.4、4.2 与 shared/theme 内部来源归 C1；Arrangement-only 位置与 8.6 归 C3。Transport 未发现对应裸样式组，未制造无必要改动。未删除历史盘点中的旧位置记录。

追加漏项也已统一：device drag opacity 独立于 disabled；columnResize 保持原 `col-resize`；preview pointer offset、tabs 默认宽、preedit caret、fade stroke、feedback 布局、确认弹窗/Home recent/Gallery 宽度均有独立来源。结构零值、固定验证视口、SVG 基准、MIDI127、epsilon、隐藏测量 opacity0、动画端点保留 C 并补理由。

共享文案接口改为调用方输入：Loading 的 label/logoAlt/progressValueText，Progress 的 aria-valuetext，SettingsShell close/navigation，LoadErrorScreen title/action labels，Pan 的 label/format/parse/widthSamples，纯文字 Toggle 的 ON/OFF labels，PanelShell 的可读名称/活动描述，CollapseDivider 的名称/像素 formatter，Toaster 的区域/关闭/加载文字。机器 id 不翻译，也不作为用户名称。

## 运行时颜色输入

协调者批准 `ThemeProvider.colors?: Theme["colors"]` 作为完整受控输入。实际类型包含全部派生语义角色，不能用基础 palette 类型冒充完整 context。传入后直接整体采用，不 partial merge、不改全局预设、不再派生；省略时保留原 preset/scheme/recipes 路径和缓存。用途在 Props JSDoc、主题 README 与配置契约中记录。

## 实际运行验证

用户最新要求完整 `pnpm verify:gpuix` 只在 GitHub Actions 上运行，因此本机未执行完整门禁；本轮仅运行相关轻量检查。C2 未修改 Rust 源码，未另跑 cargo check/test。

| 命令或入口 | 实际结果 |
| --- | --- |
| 初始化 `build.sh`、frozen install、native build、resolution | 开工时通过，无依赖新增；后续 renderer 身份仅校验已缓存产物，不重新构建 |
| `pnpm --dir apps/gpuix exec tsc --noEmit` | 通过；根目录误选 TypeScript6 的 baseUrl 报错未靠 ignoreDeprecations 静默，改用项目声明的5.9.3作用域 |
| 改动代码文件列表的 eslint | 最终99个文件，0 error/0 warning |
| 新增配置原生/纯绘制矩阵，8文件 | 删除死配置后151 pass；随后 success 关联 Toaster/Provider 三文件14 pass |
| `bun test src/ui src/app src/project/sections/{browser,clip-edit,footer,transport}` 加 Track Row/Gallery 相关用例 | 最终717 pass、0 fail，101文件，167839断言；包含新增配置回归 |
| `mutations-configuration.mjs` | 21/21 有效消费者失败 |
| `mutations-toast-configuration.mjs` | 12/12，含旧 chart2 和旧色 literal |
| `mutations-configuration-controls.mjs` | 70/70 |
| clip-edit `mutations-configuration.mjs` | 43/43；合计146个来源变异均被抓住 |
| 默认值审计 | 579个叶子、0差异；表由原脚本生成 |
| `node --test scripts/verification/review-scan.test.mjs` | 21/21；新中央 Icon 正反例先失败、窄修后通过 |
| `node scripts/verification/mutations-tooling-gates.mjs` | 5/5，包括移除和扩大中央宿主豁免，两者都被回归抓住 |
| `node scripts/gpuix-review-scan.mjs` | 75 source、17 test，0 HARD、3 WARN；处置见下表 |
| 自有命名后台 Gallery | PID88870，focused=false，AX窗口1050×808含chrome；21.7秒内关闭 |
| 进程清理命令 | `ps -axo pid,etime,command \| grep -E "bun .*--hot\|cargo run\|gallery\|demo"` 无输出；grep退出1表示无匹配，非遗留进程 |

预期的 route-render-failure、只读设置写入日志与 CoreAnalytics 诊断出现在测试输出中，测试退出成功，未作为产品失败压制或跳过。

## 严格像素证据与 renderer 归因

证据根目录：`/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/gpuix-c2-config-3VPNzN`。PNG/AX 保留在仓库外，不提交生成图片。

原 `before` 与 `repeat` 的12图字节一致。最终当前 renderer 的 `after` 相对开工旧 renderer 的 `before` 有3张各1个字边像素RGB±1、alpha相同，其余9张字节一致；未加容差，也未把非0说成0。

协调者批准创建自有 detached `a4a9d11c` 临时 worktree，链接同一当前 renderer/依赖，并复制同一个捕获入口。原代码复现完全相同的3处微差；`same-renderer-before` 与 C2 的 `final-after` 全部12张 PNG 字节相等、SHA一致。按批准判定归入 TD10/共享 renderer 基线变化，不是 C2 回归。原 `before` 未覆盖，临时 worktree 用完即删除。

| 组合                                                  | 比对结果 |
| ----------------------------------------------------- | -------- |
| Gallery en/zh × dark/light，共4张                     | 字节差0  |
| 真实后端 en-US/zh-CN × dark/light × audio/MIDI，共8张 | 字节差0  |

重跑入口：`bun apps/gpuix/src/app/verification/configuration-surfaces.mjs capture <外部目录>`，再 `compare <同renderer原代码目录> <迁移结果目录>`。工具隔离 HOME/XDG，真实后端通过 native-fixture preload，root 在 finally 卸载。

## UI 规范第13节

| 检查 | 证据与边界 |
| --- | --- |
| Gallery 与业务整体布局 | 少量完整4+8组合，不按按钮批量提交PNG；同renderer字节0差 |
| 跨区域对齐与居中 | 同屏默认0差；native bounds覆盖Panel/Home/preset/Toast等；奇数1px marker只允许最优半像素栅格对齐误差 |
| 间距与内边距 | 专用token与原生source变异；dropdown/context separator保留3/4，未强行统一默认 |
| 统一设计入口 | 每个新增来源有实际消费者native/pure-paint回归与146个literal/旧接线变异；无源码文本断言 |
| 尺寸与紧凑感 | 默认13/20控制档未变；Live原始AX量值见下表，不换算显示器scale |
| 深浅主题与中英文 | 全部4 Gallery与8业务组合覆盖 |
| 状态与键盘 | 相关717回归含K1融合后的Enter/Space/Tab/disabled/hover/selected；真实窗口前台逐状态未自称完成 |
| 拖动、滚轮、弹层与性能 | 原生事件、实际中间paint与geometry验证；OS cursor、前台帧耗时/性能留协调者串行验收 |

后台窗口被遮挡时只有AX chrome，没有业务出帧；不把这份AX当视觉或性能证据。离屏截图是本轮常规像素证据。

## 产品规则 → Live观察 → 实现 → 差异/未验证

本轮只读 Live，没有点击、播放、工程修改或桌面控制授权申请。

| 产品规则 | Live观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| 工作站紧凑控制行 | 速度slider原始bounds44×19，值140 | gpuix Transport20，普通控制13，默认像素未变 | 原始AX单位，不声明绝对像素相等 |
| 完整区域密度比较 | 完整走带group原始bounds1346×19 | 走带组合整体保留，未只量局部误当整体 | 窗口AX1463×1049；未换算scale |
| 配置变化不改用户工程 | 观察时只读，未发送输入 | ThemeProvider只读受控对象；纯几何引用注入，不改持久轨高 | 新主题API属本项目，不声称Live有同API |

AX与参考图在证据目录 `live-reference.*`、`live-before-delivery.ax.txt`；前台并排完整体验由协调者收尾。

## 自审结果

独立 `pstack-reviewer` 对 `git diff 886841c7^ 886841c7`、`git diff d3fa50f2` 和实际合入代码按 Standards/Spec 两轴只读审查，未执行验证或修改。原Spec唯一必修 success 消费者覆盖已补齐，并经同一 reviewer 复核关闭；后续三份 gate 改动也复核为无非预期绕过或越界。

最终独立 `pstack-reviewer` 对 `git diff gpuix-migration -- <13个最终接口相关路径>` 并对照 `a2104da0` 复核当前源码；格式、labels、C/L/R 兼容、meter 策略与完整受控配置均无新增 Standards/Spec finding。现存 CI geometry probe 缺 overlay 的仲裁项经协调者批准最小修复，reviewer 复核关闭，未弱化失败保护。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| success恢复chart2缺少消费者保护 | 必修 | 完整受控colors输入；红→绿/蓝chart2真实paint；两个旧接线变异 | 14相关测试、12Toast变异通过；review复核关闭 |
| Icon中央原生svg宿主被regex误报 | 汇报仲裁后必修 | 协调者批准精确单路径豁免，不改createElement躲规则；外部SVG/path保持HARD | 正反CLI回归21pass，移除/扩大豁免变异被抓住 |
| Footer圆角无可见效果 | 汇报仲裁后必修 | 删死来源/override/无效test/mutant/audit行；joined gap保留 | 原0→7图相同；极值40→200同SHA，协调者明确批准 |
| painted descendant遮挡drag根事件 | 汇报仲裁 | 仅fixture装饰child设pointerEvents none；生产行为不改，另切片记账 | 原生判别probe，协调者接受边界 |
| UI配置矩阵约850行 | 记录 | 声明式跨组件矩阵共享单一root清理owner，未越1000硬线；独立review接受内聚理由 | Standards无新增必修 |
| WARN Gallery height210 | 记录/C | 固定Gallery验证夹具，协调者明确批准保留 | 代码旁理由、默认图0差 |
| WARN DeviceDisplay width200/height60 | 记录/C | 固定SVG坐标域，与path/viewBox同源，不是屏幕尺寸 | DEVICE_DISPLAY_VIEWBOX与精确2/3转换说明 |
| WARN PanelGallery三处固定数值 | 记录/C | 面板几何验证夹具，非产品默认；补代码旁理由 | 原有Panel验证与相关范围通过 |
| 暂态来源最终收口 | 已批准集成 | 同步 C4/C3；全部临时 policy、panel 文案、像素与 pan formatter 已删除 | 下表列实际最终消费者 |
| 最终合并丢失 meter formatter 消费 | 必修 | `aria-valuetext` 读取注入 `formats.meter` | 注入两位小数原生读数先失败、修后通过；71相关用例通过 |
| CI geometry probe 缺少 resize overlay | 汇报仲裁后必修 | 协调者批准同一相对定位根补 `TrackResizeOverlay`，保留所有 resize 验收 | `PROBE_PASSES=1` 修前抛 Missing resize fixture，修后退出0；`initiallyHidden=true`、新send高度13/纵向差17、恢复后`finalSendHidden=true`；reviewer复核关闭 |
| 最终合入丢失 monitor enum 标签消费 | 必修 | 同步协调者指定 `5d16ff9f`；实际消费者 `TrackRouting` 读取 `monitorModes/monitorShortNames`，不改状态或 enum | 协调者合入复核报告 `formatting.test.tsx:86` 得到 `Monitor off 3 Audio` 而非注入 `MODE-OFF`；只读 reviewer 复核四行修复，Standards/Spec均0 finding |

## 最终集成与来源收口

合入 C4 `277ca73c` 与最终 `e13fd1da`，修复提交为 `78558c0f`、`2082c786`；再同步含 C3 `d3a13041` 的主干 `b19fd835`。保留主干面板 divider 不改色、AppShell 禁止文本拖选与采样率修复，不回退其它切片行为。

| 原暂态路径 | 最终消费者与状态 |
| --- | --- |
| `DEFAULT_TOAST_POLICY`、AppShell/Gallery读取 | UI 常量已删除；AppShell 读取 notifications 偏好，policy 更新不触发卸载 dismiss 清理；Gallery 读取最终默认来源 |
| ProjectPage临时panel英文 | `panel.browser/arrangement/footer/activeDescription` locale；机器 id 未变 |
| Footer `${pixels} pixels` | `labels.formats.accessiblePixels` |
| TrackMixer `formatPan/parsePan/PAN_WIDTH_SAMPLES` | 三项局部定义已删除；完整 TrackLabels 注入 `formats.pan(value, "control")`、`parsePan` 与 `widthSamples.pan`，保留 C/L/R 控件惯例 |
| TrackMixer 音量与 TrackMeter 无障碍读数 | 分别消费 `formats.db/parseDb/widthSamples.db` 与 `formats.meter`，不绕过注入的数值策略 |

C4 合入后真实后端相关 106 文件为 753 pass、0 fail、168791 断言；原生配置矩阵 152 pass。浏览器 locale 更新先提交 React 状态再 flush 原生布局；全宽 `ＷＡＲＭ ＷＡＶＥＳ` 回归发现中央搜索归一化缺少 NFKC，经协调者批准补入 `normalize("NFKC")`，未在浏览器消费者特判。

最终 C3/C4 接口组合后 `tsc --noEmit` 通过；5 个受影响 formatter、track row/meter 与受控 theme 文件共 71 pass、0 fail、439 断言。原生 meter 策略用例曾实际失败：注入两位小数仍得到写死的一位小数读数；消费者改读 `formats.meter` 后通过，未改断言或默认策略。

协调者对 `3e039f58` 的合入复核发现唯一 monitor 来源回归后，同步 `gpuix-migration` 的 `5d16ff9f`，修复实际 `TrackRouting` 消费者；`formatting.test.tsx` 单独运行 1 pass、7断言，tracks 全目录加 browser locale 回归为 65 pass、0 fail、8文件、337断言。随后项目作用域 `tsc --noEmit` 与 NFKC 来源变异通过；最终 scanner 仅剩本次差异 5 source、2 test，0 HARD、0 WARN。

monitor 修复后再次真实后端捕获 4 Gallery 与 8 业务组合，保存在 `monitor-integrated`；读取中文业务 AX 得到 `监听 输入/自动/关闭 MIDI fixture` 与 audio 对应按钮，确认描述来自本地化 enum 来源。可见 In/Auto/Off 短名仍由集中来源保持 Live 惯例，未改变 monitor enum、状态或动作。

最终真实后端 smoke 重新捕获 4 Gallery 与 8 业务组合，目录为证据根下 `final-integrated`。这是合入 C4 文案/格式来源后的 smoke，不把其与旧语言策略基线宣称为零差；原 C2 同 renderer 12 图严格零差结论仍见上节。最终 NFKC 变异通过：移除中央兼容归一化时真实 native 浏览器消费者回归失败，临时源码副本自动清理。入口必须由 `bun` 执行；误用 `node` 会令 runner 的 `process.execPath test` 尝试加载不存在的 `test` 模块，已改用正确命令，没有修改或跳过变异。

`3e039f58` 提交前的 `node scripts/gpuix-review-scan.mjs` 为 132 source、60 test、0 HARD、15 WARN。那次合并尚未提交时 scanner 提示多个 merge-base，采用 `c72383ac`；下面保留其逐项处置记录。同步 `5d16ff9f` 后的最终差异扫描为 0 HARD、0 WARN，见上节。

| WARN 文件 | 结论与处置 |
| --- | --- |
| `app/locales/browser-catalog.ts` | 663 行的集中本地化目录数据，C4 合入；记录，不为压行数拆第二份来源 |
| `app/verification/clip-edit/audio-render-cost.tsx` | 固定 1100×420 离屏负载夹具，记录/C，非产品尺寸 |
| `app/verification/clip-edit/consumer-probe.tsx` | 固定 1100×420 消费者验收视口，记录/C |
| `app/verification/clip-edit/demo/index.tsx` | 固定 1100×420 自有 demo 窗口，记录/C |
| `app/verification/footer/demo.tsx` | 固定 1280×760 组合验收窗口，记录/C |
| `app/verification/footer/measure.tsx` | 320 等值为不同面板测量夹具的 viewport，记录/C |
| `app/verification/footer/states.tsx` | 1800×120 等值为状态捕获 viewport，记录/C |
| `app/verification/lane/demo.tsx` | 固定 1280×800 自有 lane 窗口，记录/C |
| `app/verification/timeline/layout-smoke.tsx` | 固定 1280×40 离屏 timeline 夹具，记录/C |
| `app/verification/tracks/appearance-smoke.tsx` | 固定 760×720 轨道验收视口，记录/C |
| `app/verification/tracks/demo.tsx` | 固定 1120×780 自有轨道窗口，记录/C |
| `app/verification/tracks/render-cost.tsx` | 固定 1000×500 轨道负载视口，记录/C |
| `gallery/states.tsx` | 已有旁注说明 height210 为固定 Gallery 夹具，与轨道密度无关，原协调者批准的 C |
| `project/adapters/fixtures.ts` | C4 集中的 `TEST_TRACK_APPEARANCE` fixture 颜色，不是生产主题来源，记录/C |
| `project/defaults/template.ts` | `paddingBars: 16` 为 C4 统一的工程时间轴默认策略，非像素，regex 误报，记录 |

最终进程审计执行 `ps -axo pid,etime,command` 后匹配 `bun .*--hot|cargo run|gallery|demo`，匹配列表与本工作区匹配列表均为空；没有遗留验证窗口或后台进程。保留长期 lane 的 worktree、终端与分支，不做派发外清理。

## 错题

- 写来源但未接消费者，截图不会发现错误默认值。Toast inset初稿8与原表达式4×3=12不符，先纠正来源再迁移，未在使用处补常量。
- 居中且不受约束的内容、aspect-fit logo、1px细杆饱和outline不能证明参数没生效。改用真正约束/可观察的native fixture，禁止样式echo或放宽到不报错。
- clock前进前必须flush注册动画；只睡固定毫秒不等于采到中间帧。
- raw字符串替换grab会污染grabbing。复用已装TypeScript编译器AST按完整节点span替换，语法错误永不算杀死变异。[Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)。
- Orca check会重播最旧未ack批次，必须ack整个已处理delivery，否则新通知被挡住；不以重复轮询代替实际工作。
- 根目录pnpm exec可误选全局TypeScript6；按项目声明作用域运行5.9.3，未通过静默弃用选项掩盖工具链选择错误。
- C3/C4 合并时类型通过仍可能丢失数值策略消费者；注入两位小数的实际 meter 回归抓住了一位小数字面量，修消费者而不重新钉死默认文案。
- 诊断入口必须组合被取证的真实 overlay；只挂 TrackRows 却找 resize 节点，会在原 CI 故障后叠加误报，不能删失败保护来消音。
- 完整 labels 类型不保证每个 enum 消费者都已接通。最后聚焦用例漏掉 `tracks/formatting.test.tsx`，协调者合入复核抓住 monitor 的 aria 与可见短名仍读字面量；按实际调用链修 `TrackRouting`，不只盯着 `TrackMixer` 文件名。

## 已验证做法

- 先保留完整组合基线；共享renderer变化时用原SHA、同renderer、同入口的自有detached副本归因，严格0差，不加容差。
- 原生布局先flush、dispatchNativeEvents、再flush；状态由真实native事件触发，paint/geometry与恢复一起检查。
- 源变异只在临时源码副本执行，HOME/XDG与依赖链接隔离，结束清理，不stash当前工作区、不动其他Session。
- 只有完整colors对象才可整体替换Theme context；既不改全局预设，也不靠mock getter伪造消费者覆盖。
- 发现没有任何可观察效果的配置，先拿原生证据仲裁再删除，不扩大交互语义来保住覆盖数量。
