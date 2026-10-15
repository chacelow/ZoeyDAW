# T1 业务形状与间距 token 收敛

2026-10-16。分支 `chacelow/gpuix-t1-token-convergence`。实现提交：`ba8c01e`、`7a21985`。审查完整 diff：`git diff ba8c01e^ 7a21985`。

## 结论与边界

七处已知违规已处理，Home Card 保留 `size="project"`。没有改产品命令、数据 owner、ui 公共接口或 Rust。协调者明确批准新增唯一共享字段 `shape.indicatorRadius`、其 README 契约与一条圆形断言；批准扩展 ValueEditor、TrackMixer、DeviceCard 的间距/inset 归属。clip-edit 全部留给其 owner，demo 不在范围内，双边 inset 几何乘法获准保留。

真实 Settings/Gallery 后台窗口均已运行并取得 AX，Settings 的 Language AX press 后读回 `true`；**真实窗口视觉未验证（后台截图全黑）**。协调者已确认此项由合入后的统一桌面验收承担，不能把 AX 成功或离屏截图当作真实窗口视觉通过。

## 前 → 后

值为默认主题下的 authored metric；与原生光栅的像素舍入分开描述。

| 位置 | 前 → 后 | 入口及视觉差异 |
| --- | --- | --- |
| UnsavedCloseDialog 外壳 gap | 4×3=12 → 6 | `design.popover.gap`，三段更紧凑；操作行 gap 4→6 |
| UnsavedCloseDialog 外壳 inset | 4×4=16 → 8 | `design.popover.inset`；英文外壳实际 304×101→304×73，宽度与按钮高度保持 |
| UnsavedCloseDialog radius / border | gap=4→4 / 字面量1→1 | `design.popover.radius/borderWidth`；默认外形不变，入口不再耦合 gap |
| RouteErrorBoundary 详情 | inset 4×2=8→8，radius4→4，gap4→6 | popover family；实际详情框 273×50→273×52，标题/消息间隔增2 |
| Home 根容器 | gap12→7，padding16→7 | `spacing.cardGroupGap/rootInset`；根边缘收紧，Card 304宽、project变体不变 |
| Settings section / field | gap8→8 / gap4→6 | `settings.headerGap/itemGap`；section不变、字段内部间距增2 |
| Settings 分段轨道 radius | control-gap2→3 | `shape.controlRadius`；轻微圆角变化，控件尺寸与行为不变 |
| ThemePresetGrid swatch radius | control-gap2→3 | `shape.controlRadius`；选项 gap/padding4→6，均由 `settings.itemGap` 提供 |
| ThemePresetGrid 圆形徽标 | radius13→6.5（同为13×13的圆） | `shape.indicatorRadius`；保留圆形 Check，不改方圆 |
| ThemePresetGrid 徽标偏移 | 原为选项内 top/right8；现为色板内 top/right6 | 徽标移入 relative swatch，使用 `settings.itemGap`；不再被 Settings headerInset 移动 |
| NotFound | gap8→4 | `spacing.stackGap`；标题、说明、按钮更紧凑 |
| TimeRuler 刻度线到文字 | track-pad1.5×2=3 →4 | `spacing.stackGap`；文字右移1，不借 input.paddingInline |
| Automation ValueEditor | 相对点的水平偏移4×2=8→4 | `spacing.stackGap`；靠近点4；离屏改变stackGap+7，输入实际x205→212，尺寸98×11不变 |
| TrackMixer inset | gap4→controls.inset4 | `cards.controls.inset`；默认像素不变；高度仍扣双边inset |
| DeviceCard header inset / 折叠宽 | gap2→controls.inset4；13+2×2=17→13+4×2=21 | `cards.controls.inset`；折叠卡更宽4，头部边缘增2；同组按钮仍共享控件高度 |

`ModalDialog` 只拥有遮罩、定位与焦点陷阱，没有表面外壳，因此 UnsavedCloseDialog 保留业务内容壳，直接读取 popover token；没有重复添加第二个模态组件。

## 截图与复跑入口

在 `apps/gpuix`：

```sh
bun src/app/verification/design-surfaces.tsx /tmp/zoeydaw-t1-after
GPUIX_BACKGROUND=1 T1_SURFACE=settings T1_APPEARANCE=light bun --hot src/app/verification/design-surfaces.tsx
```

第二条必须作为带 name 的 service 启动，取证后立即 kill。可选 surface：home/settings/unsaved/error/not-found/rulers。fixture 只用真实生产组件；内存存储隔离验证数据，偏好 Store 是唯一主题 owner，已删除曾遮住它的内层固定 ThemeProvider。固定 host appearance 为 dark 是验证输入，不声称测试了原生跟随系统。

| 证据 | 内容 |
| --- | --- |
| `/tmp/zoeydaw-t1-before/` | 六表面×深浅×中英，24张PNG与原生元数据；业务修改前采集 |
| `/tmp/zoeydaw-t1-after/` | 相同24张PNG/JSON；审查修正后重截，浅色 Settings 正确选中 Light |
| `/tmp/zoeydaw-t1-comparison-en.png`、`/tmp/zoeydaw-t1-comparison-zh-CN.png` | 亲自查看的整页/区域前后对照，不是逐按钮状态图 |
| `/tmp/zoeydaw-t1-footer/` | 既有 states 入口16场景，含展开、bypass、折叠 DeviceCard；manifest errors=[] |
| `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/zoeydaw-tracks-76pcxB/` | 既有 appearance-smoke 入口，四套深浅/中英轨道组合；树全部释放 |
| `/tmp/zoeydaw-t1-editor/` | 临时真实 AutomationValueEditor smoke 的深浅截图与bounds.json；临时源已删除 |

初始 before 的浅色 Settings 有固定 ThemeProvider 遮蔽，模式选择仍为 Dark；该 fixture 缺陷不属于产品变化。after 已纠正，不能把这一选择差异归因于 token。初始 before 标尺 AX 使用英文标签；after 已改既有中文标签，标尺数值本身没有语言差异。

真实窗口证据：Settings `computer.observe` 截图 `/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/omp-computer-15a75f995703a56a.png`；AX Appearance e58 从true变false、Language e59从false变true。Gallery截图 `omp-computer-15a75fb74a83a56b.png`；AX含 Native composition gallery、两个toolbar、Gallery sections/status。两张截图全黑，只作为工具限制证据，不作为视觉通过证据。

## UI 规范第13节

| 检查 | 实测结果/限制 |
| --- | --- |
| Gallery 与业务整体布局 | 真实Gallery与Settings运行、AX成功，桌面视觉未验证；六表面整页离屏前后已亲自查看，footer/tracks补充组合已运行 |
| 跨区域对齐与居中 | Settings外框720×520，居中于1100×740；Unsaved宽304且中心不变；徽标完整位于swatch内；原生按钮尺寸回归未改变 |
| 间距与内边距 | 前后值见表；Unsaved实际高度101→73，Home根inset16→7；ruler仅文字偏移变化、不改刻度位置 |
| 统一设计入口 | 永久回归修改popover.inset+7，外壳高度+14、右侧inset+7、按钮尺寸不变；字面量变异失败；ValueEditor临时smoke也证明stackGap+7带来x+7 |
| 尺寸与紧凑感 | 未放大共享按钮；Home/Unsaved留白收紧；DeviceCard折叠宽21，实际截图中电源/折叠/拖动柄完整。Live只读参考见下表 |
| 深浅主题与中英文 | 六表面×两主题×两语言after均重截；Settings浅色正确Light选中，标尺AX复用中文labels；未声称原生系统切换已验证 |
| 状态与键盘 | Settings Language真实AX动作成功；ThemePresetGrid永久原生End/Home/Tab/Shift-Tab及wheel回归通过；圆形徽标radius=实测高度/2 |
| 拖动、滚轮、弹层与性能 | 原生wheel回归、footer16场景通过；全量真实后端smoke Home→工程→resume首帧，frames=21并released idle。此任务未改拖动/播放语义，未重新验收物理拖动或hover/pressed帧，不声称性能提升 |

## 产品规则 → Live观察 → 实现 → 差异/未验证

本次只迁移视觉入口，没有新命令或Live行为改写；对Live仅做只读AX与截图，没有改变工程内容、播放或视图。

| 产品规则 | Live观察 | 实现 | 差异/未验证 |
| --- | --- | --- | --- |
| DAW高密度，边框与小间隙表达层级 | 只读Live窗口1463×1049，Arrangement/轨道头/装置详情布局紧凑；AX含走带、Arrangement、轨道标题栏、装置详情 | Home/Unsaved收紧留白，轨道mixer保持默认4 inset，设备折叠卡复用controls inset | 未作跨显示器绝对px比例比较 |
| 标尺位置语义不变 | Live AX可见9/13/17/21/25标尺区 | 只改文字到tick的间隙3→4，tick坐标/时间格式/操作不改 | 未操作Live标尺，未重新测试缩放手势 |
| 首页/路由错误/NotFound/配色设置 | 当前Live窗口没有这些对应表面 | 对照项目既有共享popover/settings/card family | 不编造Live对应窗口；原生桌面整体视觉由协调者收尾 |

Live截图：`/var/folders/xy/r_fhmdcn0zncbb_tsm33cjfw0000gn/T/omp-computer-15a75f66e003a569.png`。AX观察参考：Arrangement e24、轨道标题栏e27、装置详情e44。

## 全仓grep复核

实际调用仓库grep工具（保留参数即复跑命令）：

```text
functions.grep({
  pattern: "borderRadius\\s*:\\s*(?:[2-9]\\d*|1\\d+|theme\\.(?:control|transportControl)\\[)|\\bgap\\s*\\*\\s*\\d|--spacing-[^\\n]*\\*\\s*\\d",
  path: "apps/gpuix/src/app/**/*.tsx;apps/gpuix/src/project/sections/**/*.tsx"
})
```

输出逐条分类如下，未隐藏其它owner或几何匹配；此结论不宣称全仓绝对零乘法。

| 输出位置 | 类别/处置 |
| --- | --- |
| ThemePresetGrid:23 control-track×2 | 豁免（尺寸几何）：色板高度为两行控件高度，不是gap/padding计算 |
| ArrangementTimeline:256 track-pad×2 | 豁免（几何）：status top跨过toolbar真实双边padding；toolbar自身就是该control inset，不是gap冒充 |
| tracks/demo:110,260 gap×2 | 协调者明确demo不在范围内 |
| clip-edit/audio/SourceMarker:63、midi/VelocityLane:47 | 协调者归剪辑编辑器owner处理，不越界 |
| clip-edit/pattern/PatternSteps:141 radius2 | 原规格明确排除 |
| DeviceCard:76 control-track + inset×2 | 豁免（几何）：折叠控件宽+双边design.cards.controls.inset；正则因同行control-track命中 |
| TrackMixer:62 inset×2（独立检查） | 豁免（几何）：真实内容高度扣双边design.cards.controls.inset |
| lane AutomationLayer radius（独立检查） | 点几何半径，不是字面量或control metric拼业务外壳 |

本owner范围内没有残留≥2字面量radius或直接control metric radius，也没有把spacing乘法用作视觉gap/padding；0圆角与1描边按规范保留。

## 验证

| 实际命令 | 结果 |
| --- | --- |
| `bash scripts/gpuix-main/build.sh && pnpm install --frozen-lockfile && pnpm native:build && node scripts/gpuix-main/check.mjs --resolution` | 通过；renderer十一补丁身份与单React/native解析通过 |
| `bun test --timeout 20000 src/app/window/UnsavedCloseDialog.test.tsx src/app/settings/ThemePresetGrid.test.tsx`（apps/gpuix） | 3 pass / 0 fail / 24 assertions；首次默认5秒上限在原生初始化时timeout，显式20秒后通过 |
| 字面量变异：UnsavedCloseDialog padding改8，运行单测 | 0 pass / 1 fail；expected height delta14，received0；恢复token后1pass/0fail |
| `pnpm exec tsc --noEmit`（apps/gpuix） | 0 errors |
| `bun src/app/verification/design-surfaces.tsx /tmp/zoeydaw-t1-after` | 审查修正后24 captures，exit0；错误页的受控throw被RouteErrorBoundary捕获，日志预期 |
| `bun src/project/sections/footer/verification/states.tsx /tmp/zoeydaw-t1-footer` | 16 states / errors=[] / exit0 |
| `bun src/project/sections/arrangement/tracks/verification/appearance-smoke.tsx` | 四套组合capture，retained trees全部释放，exit0 |
| 临时AutomationValueEditor token-delta smoke | 深浅均输入x205→212（stackGap+7），width98/height11不变，exit0；临时源已清理 |
| `pnpm verify:gpuix`（修正前、修正后各一次） | 最终1153 pass / 1既有todo / 0fail，179文件；tsc0 errors、eslint0warnings、真实后端smoke通过；末行verify:gpuix passed |
| `node scripts/gpuix-review-scan.mjs` | 12 source / 2 test，0 HARD / 2 WARN，逐条处置见自审表 |
| 两次实现提交的ultracite pre-commit | 均通过，未使用no-verify |

唯一todo是既有 `project/model/grid.test.ts:66`，非本轮新增，未越model所有权删除。没有Rust源码改动，未运行额外cargo check/test。

## 自审结果

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| fixture内层ThemeProvider遮蔽真实偏好owner | 必修 | 已删；在render前设置真实preference store；浅色重新截图 | 7a21985；reviewer复核关闭，Light实际选中 |
| TimeRuler借用input.paddingInline | 汇报仲裁 | ask获准改通用spacing.stackGap | 7a21985；reviewer复核关闭 |
| badge借用settings.headerInset | 汇报仲裁 | ask获准移入relative swatch，top/right使用itemGap | 7a21985；reviewer复核关闭 |
| ruler中文文件用英文AX标签 | 必修 | 改既有app locale labels | 7a21985；reviewer复核关闭 |
| scan WARN：design-surfaces六个raw px | 记录 | 固定1100×740、scene高度、zoom及controller边界是截图viewport/fixture输入，不是产品样式；保留以保证比较可重现 | scan0HARD/2WARN |
| scan WARN：design-tokens两处raw px | 记录 | token定义本来是默认值唯一owner，扫描整文件连既有defaults一起提示；没有在业务新写常量 | scan0HARD/2WARN |
| 原生后台截图全黑 | 汇报仲裁 | 协调者接受限制，统一真实桌面评审；未声称视觉通过 | 两个computer observe及协调者reply |
| expanded ValueEditor缺独立证据 | 记录已补 | 临时真实组件token-delta smoke与深浅PNG，源已清理 | /tmp/zoeydaw-t1-editor/bounds.json |

独立只读 `pstack-reviewer` 已读完整15文件diff、按Standards与Spec两轴审查；初审1必修/2仲裁，修正后复审全部关闭、无新增代码阻断。它没有跑检查；上表命令结果由本worker实际运行。

## 错题

- 错：为截图固定appearance又嵌套ThemeProvider，导致设置选中Dark但表面Light。对：验证组合也必须只有一个主题owner，用真实偏好Store设初始值。因：context遮蔽会让截图静态正确、交互证据错误。
- 错：只为了消除乘法就借input.paddingInline或settings.headerInset。对：先按语义归属选token，不能拿默认值相近代替family正确；需要仲裁就先ask。
- 错：临时ValueEditor smoke把testId输入节点的x直接当外壳authored left，误报x205而不是204。对：验证关心入口响应时比较同一原生节点的delta，实测stackGap+7带来x+7、尺寸稳定，避免混淆内层节点与组件外壳。

## 已验证做法

- 使用真实createTestRoot/captureScreenshot生成六业务表面的双主题/双语言组合证据，PNG放仓库外，JSON保存bounds与真实frame统计。
- 用真实对话框布局测试design入口，而非断言源码或style拷贝；字面量回退必须导致失败。
- 全仓grep先列匹配再按owner与几何分类，不为清零修改其它切片或把双边inset算术藏起来。
- 自己启动的后台Settings/Gallery拿到AX/截图后立即kill；全量验证用真实后端smoke，不留下开发窗口。

## 进程清理

实际运行：

```sh
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
```

输出为空（grep exit1表示没有匹配）。`t1-settings-proof`、`t1-gallery-proof` 已分别在取证后21.6秒、18.3秒关闭；没有残留服务。

## 合入状态

本报告随merge_ready交付；协调者合入后，本worker只读复核提交祖先与合入回执，再发worker_done。真实桌面视觉仍由协调者统一收尾，不把它描述为本worker已验证。
