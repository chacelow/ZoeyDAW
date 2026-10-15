# B2 Footer Browser Transport 验证记录

## 范围

| Web 源 | 原生目标 | 行为 |
| --- | --- | --- |
| FooterPanel/index | footer/index | 单一互斥标签容器，设备固定高，Clip 填满宿主，编辑器槽以 Clip ID 定界 |
| FooterPanel/EffectChain | footer/EffectChain | 添加、删除、重排、旁通、折叠，单轨设备选择与键盘焦点 |
| EffectChain/DeviceCard | footer/EffectChain/DeviceCard | 共享命令菜单，正方形图标按钮，逐字竖排折叠标题 |
| EffectChain/ParameterControl | footer/EffectChain/ParameterControl | 共享 DragPad 与工程事务，locale 格式化及解析 |
| EffectChain/DeviceDisplay | footer/EffectChain/DeviceDisplay | 共享 d3 路径与 Shape，二次曲线精确转三次曲线 |
| FooterPanel/DeviceDivider | 共享 CollapseDivider | 固定高度的二值折叠，不争抢可调 Clip 面板空间 |
| BrowserPanel/browserData | browser/catalog | 明确标注的只读演示目录，不加载或放置资源 |
| BrowserPanel/useBrowser | browser/useBrowser | 来源历史、搜索、筛选、排序、收藏、分来源选择恢复 |
| BrowserPanel/BrowserNavigation | browser/BrowserNavigation | 连续裁切文字与固定图标，方向键导航 |
| BrowserPanel/index | browser/index | 资源树、展开、空结果重置、收藏、共享拖拽 Ghost |
| TransportBar | transport | 真实走带状态、编辑事务、Tap Tempo、拍号、模式、窄窗访问 |
| TransportBar/PerformanceStatus | transport/PerformanceStatus | 原生帧读取 C1 遥测，真实采样率、延迟和时间，不伪造 CPU 或缓冲 |
| StatusStrip/InfoChannel | status/index | 控件帮助优先于最新警告，视图开关与 Footer 共用状态 |

Clip 编辑器内容属于 B2-clip-editors，本切片只提供挂载槽。系统标题栏属于 app-shell，不以独立 demo 证明其连续表面。

## 状态与资源 owner

工程只在 project stores 与 adapters。Footer 显隐和标签归宿主；Clip 高度归宿主 Group。Browser 只持有导航和筛选 UI 状态，不持有第二份工程。设备编辑使用公开命令与 session-scoped 事务。

Space 的唯一生产 owner 是 Timeline keyboard。Transport 不保留自己的快捷键副本。验证入口使用 platform/keyboard 连接真实 Timeline owner，并提供每窗口唯一 frame provider、原生激活订阅和 platform/cursor。

## 实跑结果

命令未注明目录时从仓库根执行；`tsc`、`bun test` 与 verification 工具在 `apps/gpuix` 执行。

| 命令或路径 | 已观察结果 |
| --- | --- |
| pnpm install --offline | merge 最新主干后通过，固定自建 renderer 的八个补丁已验证 |
| pnpm native:build | 实际构建通过；G1/H1 导出变化后重新生成二进制与声明 |
| pnpm metrics:check | 加法合并度量后通过，双方增量均保留 |
| pnpm exec tsc --noEmit | 最终完整运行 0 错误 |
| pnpm exec eslint src/project/sections/{footer,browser,transport,status} | 0 错误、0 警告 |
| bun test src/project/sections/{footer,browser,transport,status} src/ui/controls/ScrollArea/index.test.tsx | 53 pass、0 fail，12 文件，54811 assertions |
| bun test | 1046 pass、1 todo、0 fail；168 文件，1103123 assertions |
| cargo check | 通过；workspace profile 配置警告是既有提示 |
| cargo test | 49 pass，4 suites |
| bun src/project/sections/footer/verification/mutations.mjs | 14 个实现变异命中；另 1 个数值子控件 fixture 负对照命中 |
| bun src/project/sections/footer/verification/states.tsx src/project/sections/footer/evidence/gpu-states | 16 个原生 GPU 状态，errors=[]；逐张放大检查 |
| node scripts/gpuix-review-scan.mjs | c08efec提交后：39 source、13 test，0 HARD、3 WARN；均为验证窗口/输入fixture的固定尺寸，处置见最终门禁 |
| bun --hot src/project/sections/footer/demo.tsx | 已打开真实窗口，多轮 AX 与截图；截图和 offscreen GPU 证据分开记录 |

唯一 todo 为既有 `project/model/grid.test.ts` 的 `Ctrl/Cmd+1/2 maps to adjustGrid through the Arrangement keyboard hook`，不属于本切片。全套日志包含 ErrorBoundary/设置失败测试的预期日志，不是失败测试。

## 变异检查

入口为 `bun src/project/sections/footer/verification/mutations.mjs`，恢复源码在 finally 中完成。基线先通过，再逐个破坏实现。

| 变异                          | 失败测试数 |
| ----------------------------- | ---------: |
| reorder-negative-destination  |          1 |
| metronome-paused-motion       |          1 |
| metronome-three-beat-cycle    |          2 |
| device-quadratic-control-sign |          1 |
| header-left-minimum           |          1 |
| header-fraction-bias          |          1 |
| bpm-fine-keyboard-step        |          1 |
| bpm-coarse-motion-step        |          1 |
| clip-host-fixed-height        |          1 |
| scroll-wheel-opt-in           |          1 |
| scroll-wheel-orientation      |          1 |
| scroll-wheel-double-x         |          1 |
| scroll-wheel-ctrl             |          1 |
| scroll-wheel-meta             |          1 |

`scroll-wheel-child-boundary` 是独立 fixture 负对照：在测试消费者上把数值子控件 `pointerEvents:auto` 改成 `none`，隔离回归失败 1；**不是 ScrollArea 的实现变异**。曾把父级 `pointerEvents:none` 当作变异，但显式 auto 的子控件仍可消费滚轮，是等价变异；已丢弃，不计入命中数。

## 真实窗口证据

`evidence/2026-10-15-final-ui-summary.json` 记录四种深浅与中英组合。每个窗口的 AX 都观察到 Backend ready，所有窗口在取证脚本 finally 中结束。

| 场景 | 证据 | 观察 |
| --- | --- | --- |
| 深色英文默认 | final-dark-en-default.png 与 ax.txt | 真实工程、设备链、Browser 与走带控件存在 |
| 浅色中文默认 | final-light-zh-default.png 与 ax.txt | 中文与浅色实际窗口 |
| 浅色英文默认 | final-light-en-default.png 与 ax.txt | 英文与浅色实际窗口 |
| 深色中文默认 | final-dark-zh-default.png 与 ax.txt | 中文与深色实际窗口 |
| 播放 | final-playing.png 与 ax.txt | AX press 后播放与位置来自 C1 |
| 引擎弹层 | final-engine-popup.png 与 ax.txt | 真实采样率和延迟，CPU/缓冲不可用 |
| 旁通与折叠 | final-devices-bypassed-folded.png 与 zoom.png | Utility 旁通，Filter 折叠，竖排标题 |
| Clip 宿主 | final-clip-host.png 与 ax.txt | 切换到 Clip 空态，不构造假编辑器 |
| 恢复设备与帧统计 | final-restored.png、final-service.log.txt | 恢复设备标签，实际 getDebugFrameOverlayStats 输出 |
| A3b接入后实际窗口 | 2026-10-15-post-a3b-readonly.png、ax.txt、json及两张zoom | 06:40:25 UTC只读截图；Record(on)、Engine48kHz、Backend ready；Add device文字完整；服务34秒内kill，无桌面输入 |

发现 Add device 原先借 Select 选项宽度，导致触发文字截断，已改为共享命令菜单。键盘选择回归通过；当前 `2026-10-15-native-measurements.json.footer.png` 中触发文字完整。此前实际窗口 final 系列不用于证明这项后续改动。

早期smoke图不替代final系列。05:00后一次指针步骤被期限守卫拒绝；后续wheel前后值未变、另一次InvalidCoordinateFrame，均保留失败证据，不宣称OS wheel成功。当前nativeSimulate行为与GPU状态已通过；OS drag/wheel工具限制另列。

## UI 第 13 节逐项状态

协调者允许共享 family 证据复用与原生 GPU 状态补证；实际 OS 指针路径因坐标工具失败获 tool-limited 豁免。不把豁免写成已完成的指针操作。

| 检查 | 状态与证据 |
| --- | --- |
| 每控件每状态放大截图 | `gpu-states/manifest.json` 对应 16 个独立状态 PNG 与 `-zoom.png`：BPM idle/hover/down/pre-edit/focused/edit、record active、Browser selected/favorite/expanded、device expanded/bypassed/folded、Clip empty、Status help/warning。其他共享 family 引用 controls/evidence；不声称逐实例全状态覆盖 |
| 间距同 token | 下方原生几何对照表；设备间隙2、Header按钮间隙4、Browser导航90来自各自共享 token。数据来自 native renderer，不冒充 OS AX 像素表 |
| 居中 | 宽窗 Header 几何与性质测试通过，奇数宽允许0.5px；BPM 3×截图及设备折叠文字3×截图已检查，没有文字尾部大空白或裁切 |
| 同组等高、图标正方形 | 原生 getElementBounds：play/stop/record 均20×20，分组均高20；共享 family 的实际窗口 AX 为补充 |
| 与 Live 同区紧凑感 | `2026-10-15-live-browser-native-comparison.png` 左Live历史zoom、右当前native；拼接不二次缩放，历史zoom系数不完整，不声明物理DPI归一化。AX行高约18px、native17px；原生过滤区比Live多一行 |
| 深浅与中英 | final-dark-en、final-light-en、final-dark-zh、final-light-zh 的真实窗口截图和 AX 均存在；后续状态 PNG 是深色英文，不替代四组合 |
| Tab、焦点、Space | 原生输入回归全绿；真实 Tab 从结果树选中行直接到后继控件，跳过收藏与拖拽源。MotionTabs Space 不切换标签；唯一 Timeline owner 控制播放。focused/pre-edit 放大图已检查 |
| 拖动、滚轮、弹层保持打开 | nativeSimulate 驱动20px BPM粗拖动120→125并undo、最大值wheel clamp、Header纵轮横移、数值子控件隔离；暂停弹层延迟5→10ms。共享实际指针证据为 controls/evidence/popup-adjustment.* 与 DragPad/evidence/press-anchor-restored-2026-10-15.*；本切片 OS wheel/drag 仍为工具限制未验证 |
| 性能与裁剪 | 实际窗口434帧日志与 native几何/帧/保留节点 JSON 分开。Browser滚动视口有界、保留节点1026→1026；不宣称虚拟化或屏外卸载。Timeline/Clip可见范围裁剪不在本切片 |

### 原生几何与 token

| 对象                   | 实测    | 来源                                               |
| ---------------------- | ------- | -------------------------------------------------- |
| Browser导航            | 90px    | theme.project.browserNavigationWidth               |
| Browser分隔条          | 7px     | 共享 PanelDivider                                  |
| Browser资源行          | 17px    | 默认 CONTROL_METRICS，含边框与内边距               |
| Header按钮             | 20×20px | theme.transportControl track                       |
| Header相邻中央按钮间隙 | 4px     | transportControl track-gap                         |
| Footer设备内容高       | 184px   | theme.project.footerDeviceHeight                   |
| 设备卡宽               | 256px   | theme.project.deviceCardWidth                      |
| 设备卡间距             | 2px     | 默认 control track-gap；x=2/260/518/776            |
| 单设备折叠卡宽         | 16px    | control track + 2×track-gap；见gpu-states manifest |

### 共享 family 证据边界

`ui/controls/evidence/forms.*` 证明 Button/MotionTabs 的 active/focus，不证明持续 pointer-down；当前 BPM pointer-down 单独由 GPU 状态图证明。`popup-adjustment.*` 证明共享弹层内 drag/wheel 后仍打开，不等于 Engine 弹层含有可调控件。`DragPad/evidence/press-anchor-restored-2026-10-15.*` 证明 G1 原生按下点还原。旧 DragPad `pre-edit.png/edit.png` 属历史实验，不作为最终证据。

## 与 Live 对照

Live 只读观察，未点击、拖动、输入、激活或修改工程。参照均为 `2026-10-15-live-reference-current.ax.txt`、同名 PNG/JSON、`live-browser-zoom.png` 和 `live-transport-zoom.png`。精确 `checkbox "播放"` 为 ref=e25/value0，不把 e21 跟随播放当作播放。Live 后来不可读，没有重启。

| 产品规则 | Live 实际观察与证据 | 原生实现 | 结论 |
| --- | --- | --- | --- |
| Footer共用面板与固定设备区 | 全窗口图同时有Clip、装置详情；AX e1943空装置区；早期测量高183 | 互斥标签、设备高184、二值Divider；Clip宿主可连续调高 | 互斥为批准差异；高度近似；设备外观未验证 |
| 普通Clip点击不自动打开编辑器 | 未在Live输入 | Footer只在受控clip标签挂载slot，普通选择不切标签；回归通过 | Live未验证 |
| Browser默认无资源选择、记忆恢复 | 只读截图不能证明首次进入或选择恢复 | 每来源独立选择，默认null，筛选恢复保留；回归通过 | Live未验证 |
| 侧栏分类与子列表固定宽度 | AX e64侧边栏、e1644收藏夹；截图可见左右两列 | 共享Group、Panel；折叠外层时结果宽度不跟缩 | 静态分类已观察；Live拖动未验证 |
| 左侧连续变窄到限位 | 未在Live拖分隔条 | 共享Panel裁切固定图标和文字，原生几何回归 | Live动态未验证 |
| 列表密度与统一项样式 | Live Browser图；早期AX行高18px、导航90px | 当前native行17px、导航90；同ListRow family | 同量级；并排图不作物理DPI证明 |
| 筛选指示与文字间距 | Live Content/Sample标题与菜单箭头可见 | 原生共享Button/ControlGroup gap；filter文字不贴指示 | 静态已观察；不是相同筛选模型 |
| 非中央控件不缩小 | Transport放大图里非中央和中央同量级 | 所有走带控件共享transport档20px | 外观同量级；未逐一量Live |
| 中央播放、录音、起点标准大小 | Play早期AX19×18；AX e25/e26/e28 | 原生20×20，未放大 | 有意度量差异 |
| BPM容纳三整数两小数、无尾空白 | JSON tempo43×18；AX e8=87.11283、截图87.11 | 最宽999.99原生样本测宽，BPM crop显示120.00紧凑居中 | 格式与静态布局已观察；不声明逐像素一致 |
| 图标只用于强相关、拍号居中斜杠 | Transport图；AX e11=4/e12=8 | 数值隐藏无关图标，ControlGroup slash，Icon来自共享包 | 静态斜杠已观察；图标集合有产品差异 |
| 节拍器每拍交替填充和摆动 | AX e13开启但停止；未播放Live | 接受C1位置的两侧填充和间距位移，reduced-motion停摆 | 产品批准差异；Live动态未验证 |
| 不显示内部ID | 全窗口标题无内部ID | 用户名称，不显示UUID | 静态一致 |
| Space只播放、不触发聚焦按钮 | 未在Live输入 | Timeline唯一owner；Button/Input/Menu/MotionTabs原生回归全绿 | Live未验证 |
| 高亮独立hover、默认开启 | 未在Live悬停或移开验证 | 共享控件active/selected独立于hover，GPU selected/record图 | Live未验证 |
| 弹层四向对齐、右箭头、项换行 | 未在Live打开菜单 | 共享Popup/DropdownMenu；族证据menus、popover | Live未验证；B2不另造弹层 |
| 可调弹层内部操作保持打开 | 未在Live操作 | 共享popup-adjustment实际drag/wheel证据；Engine只读 | Live未验证 |
| 图标正方形、数值稳定居中 | Play矩形19×18；BPM43×18 | 中央20×20、BPM原生稳定测宽，放大图 | 有意度量差异 |
| wheel仅悬停、不隐藏光标；drag原生还原 | 未在Live操作 | native输入wheel隔离、粗拖undo；G1实际锚点还原证据 | Live未验证；B2 OS指针工具限制 |
| Header/标题栏/Panel连续表面 | 全窗口图为连续灰表面 | 面板共同muted；系统标题栏归app-shell | 面板表面已检查；系统标题栏未验证 |
| 窄窗右向左溢出、横向滚动访问 | 未调整Live窗口 | 原生宽窄布局和纵轮横移回归；共享ScrollArea API | Live未验证 |
| 读数取真实走带时钟 | AX e22/e23/e24位置可读，Live停止 | C1真实采样clock、48kHz/输出延迟，实际窗口已播放 | 原生已跑；Live动态未验证 |

`2026-10-15-live-browser-native-comparison.png` 左Live历史zoom，右当前native renderer，拼接时不二次缩放。Live zoom的原始放大系数不完整，故此图只辅助外观比较；密度数值以已保存AX测量和原生bounds为依据，不把源像素1:1冒充物理DPI归一化。

设备卡片未对照Live，原因是该工程没有设备；不为取证新增设备。英文折叠名逐字竖排而非整体旋转，协调者已批准。Browser沿用Web只读演示目录，原型契约允许；资源加载、设备DSP、节拍器发声不由本切片伪造。

## 自审结果

| 发现 | 类别 | 处置或证据 |
| --- | --- | --- |
| 必需激活/动效输入为可选 | 必修 | 改为必需，删除无调用clipHeight |
| 性能读数依赖整体session重绘 | 必修 | 改native frame回调，暂停变化回归通过 |
| 展开AX名为符号、排序/资源名错误 | 必修 | 中英明确动作名与Name/Resources |
| 焦点没同步选中设备 | 必修 | onFocus选择；原生焦点与边框状态回归通过 |
| Clip编辑器串用状态 | 必修 | Fragment以Clip ID定界 |
| Header中央组偏左 | 必修 | 对齐Web grid列约束，性质与原生几何回归通过 |
| 重复Space owner | 汇报仲裁后必修 | 删除Transport副本，复用Timeline |
| Status借transport高度 | 汇报仲裁 | 已确认Web22.68并入主干，消费专用token |
| 系统reduced motion无源 | 汇报仲裁 | H1已提供原生读取/通知，demo接真值 |
| BPM拖动过慢 | 已修 | step=.01、dragStep=1；20px粗拖120→125、方向键120→120.01、undo回归通过 |
| Record active覆盖destructive | 已修 | 同步A3b层级；gpu-states/transport-record-active-zoom.png已检查红色图标、弱危险色底 |
| 资源树额外Tab入口 | 已修 | 共享源role/tabIndex接口已接入；选中行roving入口，真实native Tab退出回归通过 |
| 收藏点击可能选择行 | 记录，已证伪 | 原生指针回归通过，离开悬停收藏仍可见且行未选中 |
| trailing gap叠加 | 必修 | 删除额外margin，只保留共享gap |
| Add device文字截断 | 已修 | 共享命令菜单；键盘选择回归、最新实际窗口post-a3b-footer-add-device-zoom.png文字完整 |
| demo外框像素 | 记录 | 固定窗口取证分辨率，已批准 |
| measure viewport像素 | 记录 | 测试输入，不是产品控件尺寸 |
| Header重复wheel输入逻辑 | 已修 | 独立共享提交7c95b60，Header只声明wheelToHorizontal；5个守卫变异各失败1 |
| ClipEditorSlot重复类型 | 已修 | 删除Footer定义，引用clip-edit canonical类型，不保留重导出 |
| 暂停闭层仍跑帧 | 已修 | 原生frame fixture记录订阅0→开层1→闭层0，暂停延迟更新通过 |

## 错题与已验证做法

- 错：用 TestRenderer.flush 后立即读分栏，误把第一帧固有宽度412当作240px容器最终布局。对：先dispatchNativeEvents，再flush。因：flush只绘制，不分发onLayout。
- 错：把 getPaintedText 当作像素裁剪后的可见文字集合。对：用原生bounds验证滚动，截图验证实际裁切。因：该计数包含被clip的保留文字。
- 错：按名字子串取Live播放checkbox。对：用完整AX标签和ref，最终准确值0。只读错误没有改变工程。
- 对：所有真实窗口启动、取证、kill放同一eval的finally。期限到达先拒绝输入；不要把拒绝步骤写成完成。
- 对：共享缺口集中交协调者，保留失败回归，不在面板加第二套事件或兼容实现。
- 错：给所有程序聚焦的树行设tabIndex=-1，GPUI Tab会从最初入口重启。对：树容器和选中行使用互斥roving入口。因：原生焦点遍历需要当前行在Tab链；native Tab→后继控件回归先红后绿。
- 错：把dragStep只理解为拖动步长，保留旧滚轮小数期望。对：按共享契约区分键入step与拖动/滚轮dragStep，删除incidental期望，改clamp、undo和细键盘边界回归。

## 未完成项

实现与共享契约已接入，行为和全量检查已通过。未验证/不在本切片：B2实际OS wheel/drag与逐实例全状态（已获工具限制和family复用批准）、Live动态交互、Live设备外观、系统标题栏连续表面。Browser资源加载、设备DSP、节拍器发声由既有原型/引擎边界限制，UI明确说明，不算接通音频能力。最终只读窗口补图已完成；提交后扫描与进程清理记录在最终门禁节。

## 最终门禁与进程清理

共享滚动API独立提交 `7c95b60`。最终输入契约实现提交 `c08efec`；同步主干包含 `8ceeb41` 的verification分类修正，不把真实nativeSimulate验证入口误报为产品mock。产品代码的simulate禁令不变。

扫描3条WARN仅在 `footer/demo.tsx`、`verification/measure.tsx`、`verification/states.tsx`：固定OS窗口分辨率、测试viewport及确定性输入fixture。它们不是控件尺寸/间距，保留为验证输入，不制造theme token。实际原文见 `evidence/2026-10-15-final-review-scan.txt`。

最后一次完整 `tsc && bun test && mutations` 在上述实现提交前、最终源码上通过：1046 pass/1既有todo/0fail；14实现变异和1fixture负对照均命中。Ultracite预提交门禁通过，无no-verify。

| 数据来源                    | 帧数 | p99 ms | max ms | retained before→after |
| --------------------------- | ---: | -----: | -----: | --------------------- |
| 实际OS窗口final-service.log |  434 | 12.792 | 49.919 | 未采样                |
| 当前native Browser          |   24 |  9.116 | 32.049 | 1026→1026             |
| 当前native Transport        |   18 |  1.106 | 10.266 | 114→114               |
| 当前native Footer           |   17 |  1.852 |  7.543 | 195→195               |

采样不保证持续FPS；保留节点稳定不等于虚拟化。真实窗口与native测试renderer不可混写。

进程检查原文保存在 `evidence/2026-10-15-final-processes.txt`：

```text
ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"
53396 01:07       bun --hot src/project/sections/arrangement/lane/demo/index.tsx
```

**本worker启动的进程零残留**。上述lane进程属于协调者分配的下一位桌面租约，未停止，不声称全机零残留。最后B2服务 `b2-final-readonly-0638` / PID37866 在06:40:25 UTC取证后立即kill，存活34秒，随后已发送“桌面释放”。没有停止用户已有应用或其他worker服务。
