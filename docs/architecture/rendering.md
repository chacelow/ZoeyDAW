# 编排渲染与交互

适用范围为 Web 编排交互和原生音频数据的显示投影。Gallery 明确注入模拟后端，桌面工程从原生运行时读取真实输入、播放与录音数据。

## 当前职责

- React DOM 管理 Header、Browser、轨道控制列、菜单、输入框和 Clip 编辑器。
- `Timeline/TimelineCanvas.tsx` 组装主编排画布和独立播放头画布。画布大小等于可见视口，不随工程长度分配巨大纹理。
- `canvas/scene.ts` 保存只读工程引用、视口、选择和手势预览。工程源数据仍由 project adapter 持有。手势预览不是第二份工程，也不进入快照。
- `canvas/scheduler.ts` 合并一帧内的绘制请求。缩放和滚动改变视口，不重建每个 Clip 的 DOM 节点。
- MiniMap 用独立画布绘制缩略内容，用一个 DOM 选框显示可见区。手势控制器在组件生命周期内只安装一次监听器。
- 轨道电平使用独立小画布，读取已确认的原生轨道输出或所选物理输入通道。Off 待命输入用灰色 Ghost 电平，实际音频仍由原生监听规则决定。录制卡片通过已有主画布绘制 writer-fed 缩略图，最多每声道 512 个真实 min/max bins，不用电平生成假波形。
- 路由和 Device 前后级复用 `components/ProjectMeter`，直接从当前 MeterStore 读取真实 endpoint；设备电平不复用轨道输出。`ProjectPage` 在工程生命周期内把单一 MeterSession tick 注册到共享 scheduler 的 clock 阶段，Arrangement 关闭不终止 Device 电平。隐藏、stalled 和错误状态通知消费者清除旧值，隐藏时停止连续调度，恢复时唤醒。原生 WebView 实际显示与吞吐尚未验收。
- 通用 meter、轨道 Canvas 与路由菜单共享低电平绿、中高电平黄、接近 0 dB 红橙的警示层次，0 dB 以上保留红色过载区。渐变按完整量程固定，当前值只裁剪可见填充，不随柱高重新缩放。Off Ghost 继续使用灰色。
- `Timeline/Toolbar`、`Timeline/Viewport`、`Timeline/TrackHeaderViewport` 和 `Timeline/useCanvasPainters.ts` 分别负责工具栏、视口、轨道标题和绘制生命周期。入口不处理每种手势的业务逻辑。
- `canvas/interactions/controller.ts` 统一拥有事件监听、指针身份、捕获、点击阈值、取消与边缘滚动。Clip、标尺和 Automation 模块只返回手势与命令，不各自安装全局指针监听器。

## 一个坐标系

所有时间位置以从 1 开始的小节编号表达。横坐标由 `(bar - 1) * pxPerBar - scrollX` 得到。

`canvas/layout.ts` 给出轨道标题、Clip、命中测试和自动化共享的行位置。普通轨道使用同一个 `scrollY`；return 和 main 固定在底部时间标尺上方。MiniMap 和标尺不参与垂直轨道滚动。

普通纵向滚轮只改 `scrollY`。横向滚轮和 Shift 加纵向滚轮改 `scrollX`。Ctrl 或 Cmd 加滚轮以指针处的音乐位置为锚点缩放。已由数值控件消费的滚轮不再滚动编排。

`model/grid.ts` 保存自适应密度或固定网格偏好，并按缩放与拍号纯计算有效网格。自适应有最大宽度、宽、中、窄、最小宽度五档，最细可达 `1/16384`；Ctrl/Cmd+1、+2 只调整档次，不移动视口。细分线、四格、十六格、拍与小节线使用不同权重，Clip 内外共用同一原点与有效格宽。明暗底色仍按编号小节交替，不等于网格密度。快照版本 2 保存模式与偏好，不保存随缩放派生的格值；旧版本的显式格值在读取边界迁移为固定模式。

轨道标题在可见行前后各保留一个垂直视口的挂载缓冲，并保留当前焦点行；远处轨道仍保留完整工程数据。窗口横向导航不卸载轨道标题。波形请求在水平和垂直各方向预取一个视口，按源零点对齐的固定块复用；同源导航保留在途请求与已完成缓存。每个源另保留不超过 4096 bins 的真实概览，在缺少细节的区间绘制粗包络，细节到达后按原算法绘制，不伪造 PCM 或采样点。隐藏光标不被当作主题变化，不因此重新解析全页颜色。普通卡片操作不打开底部编辑器；显式打开临时编辑器时才预留空间，不覆盖底部固定轨道。

Canvas 尺寸变化在 `ResizeObserver` 内完成 backing-store 更新与同步重绘；CSS 宽高由容器的 `size-full` 拥有，不写旧像素 CSS 尺寸，避免溢出滚动条反过来改变被观察容器。正文、播放头和电平表不把已清空的 backing store 留给下一次 RAF；像素尺寸未改变时不重新写入 `width`、`height`。正常状态更新仍由共享 scheduler 合并。

时间线正文、空白轨道和时间范围选择使用默认箭头；Clip 标题悬停显示抓手，调整边缘、淡变和实际拖动保留专用指针。点击正文或空白轨道建立独立的 `session.insertionPoint`，在对应可见轨道内绘制短线和标尺标记，播放中也保留。插入标记按 1200ms 三角波在主题 primary 与较亮颜色之间往返混色，不闪灭；仅可见时持续刷新 overlay。空格从该位置播放，再次空格停止，插入点不随长播放线推进。贯穿轨道的长播放线只在播放时绘制，不依赖可能滞后的遥测 playing 标志。

轨道正文和空白处在 pointer-down 即同步设置 `session.insertionPoint` 与 scene playback 投影，先清除旧时间选区并显示新位置，不等待点击阈值、拖动或 pointer-up。React playback 投影在 layout effect 同步，避免首帧仍画旧位置；Esc 恢复手势前插入点。

“文件和装置”提示占据最后普通轨道与固定 Return/Main 之间的可见空白区，按该区间上下居中，不按最小 drop-zone 高度定位。正文仍是创建轨道的放置区域，点击按下即同步插入点。

`session.selectedTrackIds` 表达活动轨道，`trackSelectionSurface` 区分音轨区域与右侧表头的焦点。点击音轨、Clip 或自动化 lane 只高亮行并清除右侧身份区高亮，不改变路由和混音区域的样式。点击右侧表头时，只有名称身份区使用选中色，操作控件保持原样；不绘制选中边框、阴影或整卡遮罩。两种反馈不能只靠轨道 ID 同时开启。行色在网格之后绘制并裁剪到可见边界，表头选择不移动插入点。展开、收起和 Group 摘要保留同一活动身份及焦点来源。

## MiniMap 手势

- 主体横向拖动平移；向下拖动缩小选框并放大时间线，向上相反。缩放锚点取按下位置在选框宽度中的比例，左、中、右位置分别保留对应的音乐位置，不统一围绕中心缩放。
- 主体横向平移使用 `PAN_DRAG_SCALE = 0.25`，相同拖动距离对应原先四分之一的平移量。不增加阻尼或速度依赖，垂直缩放与边缘拉伸继续使用原有换算。
- 左右边缘分别单侧拉伸，固定另一端的音乐位置。不是围绕中心同时移动两边。
- 点击选框外部将视口定位到点击处；双击适配工程范围。
- 超过点击阈值后隐藏光标。浏览器使用 Pointer Lock；Tauri 复用 `shared/native/cursor.ts` 和已授予的光标定位权限，把光标保持在按下位置。
- 手势更新按动画帧合并；松手先提交最后一次位移，再释放锁定。Esc、失焦、取消和卸载恢复开始时的视口。
- 原生松手先等待未完成的归位调用，再恢复按下位置，完成后才解除隐藏。恢复尚未完成时不接受下一次拖动，避免旧调用覆盖新手势。参数重渲染不销毁活动手势。
- 手动平移或缩放暂时挂起播放跟随，停止操作两秒后恢复跟随。
- MiniMap 占满编排面板宽度，包括右侧轨道操作区上方；不显示 `px/bar` 和 `bars` 调试区。总览保留 Group、空轨道和折叠分组的子轨道行，不加入 Return 和 Main。Clip 用实色占据所属缩略行，行之间有分隔线，Locator 和走带位置共享小节坐标。
- MiniMap 下方复用共享 `PanelDivider` 调整总览高度，范围为 32 至 90px；下方时间线保留至少 160px。时间线中的 Group 只在折叠时绘制子轨道摘要，展开时子轨道单独显示。

这些交互以已打开的 Ableton Live 实测行为为参考。颜色跟随本项目主题，DOM 控件尺寸复用现有 token；不复制 Live 的配色或全局样式。

### 共享颜色与间距

MiniMap 复用共享 UI 颜色，不维护局部调色板。`--overlay` 为前景色的 10% 透明态，用于 MiniMap 视口；音频淡变使用独立的 `--arrangement-fade-mask`。Canvas 通过 `canvas/tokens.ts` 解析变量，主题切换及样式表热更新都刷新缓存并重绘。

MiniMap 行线、时间线网格及音轨边框共用 `--arrangement-line`。暗色主题使用共享 `--muted` 暗灰色，避免半透明白色边框提亮底色；亮色主题继续使用共享 `--border`。网格粗细层级由现有线宽和透明度区分，Pattern 正文背景和网格密度保持不变。

`paintTimeGrid` 同时绘制时间线背景和 Audio、MIDI、Pattern 正文上的网格。主线与 `numberedRulerPlan` 的编号位置共用缩放阈值，其他线只来自当前 Ctrl+1、Ctrl+2 网格单元，不额外叠加固定拍线。正文覆盖层使用共享深色网格 token，细线为 22% 不透明度，编号主线为 40%；标题保持实色，正文选中及 hover 都保留网格。

外层音轨卡片不添加 Padding 或列间 Gap。`pages/project/layout` 从公共 `@zoeymind/ui/metrics` 派生 `TRACK_LAYOUT`，Timeline 用同一配置映射 scoped CSS。名称、Routing、Mixer 的 Padding、纵向间距、监听与 Send 网格共享规格；折叠高度、标题高度、拖动步长和行容量也由它派生。度量配置源是 UI `controls/metrics/control-metrics.json`，CSS 由命令生成并检查漂移，不在领域 model 或各视图复制默认数字。

操作区总宽度和名称/Routing 列宽来自同一 `PROJECT_METRICS` 配置，`layout` 导出的 `CONTROLS_WIDTH` 统一提供给 Header、Canvas 和视口计算；剩余列宽给 Mixer。Group 的录音准备位置保留非交互空槽，不让启用按钮占用，其启用按钮与 Audio、MIDI 等宽。

Mixer 的首行使用四列网格，启用按钮跨两列，与下方音量控件的半宽对齐；Solo 和录音准备各占一列，Group 空槽同样占一列。Send 使用三列网格，按 Return 顺序横排并换行。`trackControlRows` 先扣除上下边框与 Padding，再按控件高度和 Gap 计算真实容量；Mixer 不再额外减掉一行。Send 容量为 `(rows - 2) * 3`。统一 4px 间距后，70px 高度容纳三行，74px 才容纳四行；Routing 依原优先级逐步显示输入与通道，不缩小 Gap 或裁切控件。

共享数值控件的常态、预编辑态和输入框均居中显示。单击只进入高亮预编辑态，不显示文本光标或输入框；键入才开始编辑，双击复位仍可用。顶部录制使用纯实心圆图标，轨道录音准备使用居中的 CSS 圆点，直径为图标槽的四分之三。方形图标按钮不额外添加横向 Padding。组件库的 Number、Bar、Bipolar 和 Toggle 示例统一使用默认共享尺寸，不单独缩小 Number；宽度仍按数值范围或标签测量并保持稳定，项目轨道中的紧凑尺寸不变。

共享 DAW 控件使用配置中的 default 规格，Transport 在自身范围内使用 transport 规格，中央播放、停止、录制按钮不例外。两种规格由同一度量数据生成，保留当前尺寸差异。Transport 不额外覆盖组件库和轨道，控件无边框、宽度按格式化样本稳定测量；窄窗口保持横向滚动。

项目的 Space 在 window capture 阶段统一切换播放，keydown 与 keyup 均阻止控件原生激活，长按只切换一次。被聚焦的按钮、slider 或 menuitem 在 Space keydown 时释放焦点，避免浏览器残留按压和 focus-visible 样式；文字输入、IME、修饰键组合及 Enter 保留自己的行为。

Follow 通过已有共享 rAF scheduler 读取 `readTransportBar()`，不新建播放时钟。播放线到可见时间 Canvas 的中线后，每帧调整 `workspace.scrollX`，使内容连续向左滚动。计算宽度排除 304px 操作栏；停播、关闭 Follow 或手动平移暂停期间不追踪，回跳和滚动边界受原有限制。

`useDragValue` 按累计纵向距离线性调节，默认 `pxPerStep` 为 1，大范围控件仍使用已有 `sensitivity`。Shift 保留十分之一精调速率，滚轮独立于拖动。达到上下限后重置距离锚点，不积累超限距离，反向拖动立即生效。光标隐藏与释放后的原位恢复保持不变。

轨道电平条宽度为 13px，显示 −60 至 +6 dBFS。左右声道中线和 0 dB 横线均以所在 Mixer 卡片的 `--arrangement-ruler` 背景色不透明绘制，形成切开的效果。0 dB 下方为绿至黄渐变，上方为红色过载区，颜色复用 `--arrangement-meter-*`。MIDI 和 Audio 共用主音量、声像及发送控件；折叠后都隐藏详细调节。

每个 `TrackMeter` 独立持有左右峰值，持续或更高的电平刷新 600ms 保持期，之后按 24 dB/s 下落，不低于当前电平。停止后即使 telemetry revision 不变，共享 scheduler 仍推进峰值衰减，静默后停止重绘。峰值与渐变缓存不进入工程状态或快照。

## Clip 与 Pattern

标题区负责移动和修饰键复制，正文负责时间范围选择。只有标题栏左右边缘负责修剪与重新延长源窗口，并显示左右边缘光标；正文两侧不命中 resize，保留音频淡变长度与曲线锚点。悬停外框也限于标题高度。预览与命中共用几何，轨道种类兼容策略复用 `acceptsClip`。

`canvas/clip-geometry.ts` 统一给出标题、正文、淡变曲线和端点位置。Clip 标题是不透明实色，下半部正文透明混合轨道颜色并透出网格层级。MIDI 显示实际音高与长度，音高范围按 Clip 源窗口计算，不因横向滚动重排。Pattern 将布尔步进显示为无音高短标记，不生成虚构音高。普通轨道折叠后只保留实色标题，填满轨道边框内侧，不绘制正文或隐藏的曲线命中区域。

Audio、MIDI 和 Pattern 共用卡片选中态。展开时，正文使用 `--arrangement-clip-selected` 的 90% 不透明度浅蓝色填充，标题保留原色，网格和内容继续可见。选中时不绘制高亮边框，包括悬停时；取消选中恢复原正文底色。收起后没有正文，选中色只作用于剩余标题条。选择来源仍为 `session.selectedClipIds`，不改变轨道选择或时间范围选择。

点击、双击和创建卡片不展开临时详情。Cmd/Ctrl+R 和重命名菜单使用卡片内的 `NameEditor`。原 Audio、MIDI、Pattern 编辑器只通过明确标注的临时菜单入口打开，不作为正式卡片 UI。

淡变使用一条穿过中点的平滑单调增益曲线，以自适应三次 Bézier 段近似绘制。两端切线水平，内部各段切线连续，避免移动中点时出现折角或突然变成横线。SVG 编辑器与 Canvas 共用 `fadeBezierSegments`。只有 hover 展开的 Audio Clip 正文才显示曲线、方形峰值和圆形中点；标题 hover 不显示，包括标题两端的 resize 区域。非 hover 及折叠状态仅保留 50% 的主题深色遮罩，折叠时限于标题，展开时限于正文。静音端点不能独立拖动。

圆形中点可上下左右拖动，上下各保留正文高度的 10%，左右各保留淡变区间的 10%，手势还保留至少 7px 的水平间距。指针位移按实际正文尺寸换算，到达边界后不累计超限位移，反向立即响应。`fadeInCurvePosition` 和 `fadeOutCurvePosition` 保存水平比例，缺省值为 0.5；快照边界校验 0.1 至 0.9。一次手势只提交一个可撤销事务。

`fadeInOffsetBars` 和 `fadeOutOffsetBars` 从当前 Clip 左右边缘向内计量。拉伸时，对应静音端点与顶部峰值共同跟随该边缘，并受不重叠区间约束。`model/fades.ts` 供快照、剪贴板、分割和预览复用。这些元数据不代表已连接淡变 DSP。

Group 不能拥有 Clip。`model/track-groups.ts` 投影祖先色带和完整叶子轨道摘要。折叠 Group 同时收起自身行并隐藏后代，保留紧凑摘要和首行开关、独奏、电平表，不保留展开的音量、声像或详细路由。嵌套色带、身份区颜色和外层轨道分割线保持连接。

移动时原卡片保留但不激活，`scene.clipDrag` 保存源轨道与选中 IDs。Ghost 标题保留轨道或 Clip 色并用 50% 不透明度绘制，正文不填背景、不重绘网格，仅显示半透明波形或音符；不套选中态正文填色。松开后落点卡片恢复正常激活态。无效目标保留最后兼容候选，不清空预览。移动、resize、Fade、Loop 和 Locator 的拖动持续发布有效预览，松开、失焦或捕获中断保留最后有效位置，Esc 及组件销毁取消。鼠标松开时纳入最后指针坐标，文档通过 layout effect 同步到 Canvas，避免提交时闪回。相邻卡片的右边界在所有内容绘制后覆盖 1 CSS px 分隔线，宽度不随音乐缩放变化，不缩短卡片几何或改变波形比例。

Automation 模式保留标题拖动，正文继续编辑自动化。`model/clip-automation.ts` 为预览和提交移动每个选中 Clip 的 `[startBar, startBar + lengthBars)` 内全部自动化点，重叠选区只移动一次。跨轨道按 parameter 匹配 lane，移动保留点 ID、value 和 curve，复制生成新 ID，同位置冲突由移入的点覆盖。卡片和点共享左边界限制及一个撤销事务。

点击标题将播放插入点设为卡片起点，移动或左右缩放完成后仍取卡片左端；正文点击按鼠标位置设置插入点。Space 从该插入点开始模拟播放，不因标题内点击的水平偏移改变起点。

`paintClipAlignment` 独立绘制中性的 1px 对齐辅助线，不读取或更新 Transport 播放状态。移动时标在 Ghost 左端，缩放时由 `scene.clipResize` 的 `edge` 决定标在当前左边缘或右边缘。辅助线跨越轨道区域，用于比较其他 Clip 的位置，松开或取消后消失；正在播放的游标仍按真实模拟播放位置单独绘制。

`sourceOffsetBars` 保留修剪后的源相位。MIDI 预览按工程拍号和源偏移裁切音符；Pattern 的卡片和编辑器共用 `model/pattern-window.ts`，保留自由修剪留下的部分步进，不把源偏移四舍五入。编辑器修改一个源循环，而不是为 Clip 的每次重复复制一组按钮。缩小时按可见像素聚合 Pattern 活动，绘制工作量不随隐藏的重复步数增长。

Audio 左扩实时夹紧在源起点 `sourceOffsetBars = 0`，继续向左拖动仍保留边界值，松开提交相同窗口。MIDI 和 Pattern 保留可循环的负源相位。原生兼容读取已有带符号音频窗口，但新 Audio resize 不生成负源偏移。时间选区按所选轨道与半开区间操作；Delete/剪切只移除相交片段，粘贴保留选区前后静音、跨轨空白与完整时长，并在一次事务中覆盖目的区间。

Clip 剪贴板保留源窗口和相对轨道、小节偏移，粘贴生成独立 ID。外部数据先经过版本与形状校验；普通文本不会回退到旧的 Clip 缓存。MIDI 编辑器独立处理音符绘制、擦除、选择、剪贴板与键盘命令。撤销音符编辑不关闭仍然存在的 Clip 编辑器。

全局普通文案不响应浏览器原生文字选中。`input`、`textarea` 和可编辑 `contenteditable` 区域保留选字与编辑；Canvas 自有 Clip、时间范围和音符选区不受此 CSS 策略影响。

录制预览由原生 take、track 和稳定 Clip ID 识别，独立于 authored document。停止后保留未发布录音的缩略图；正式 Clip 进入 scene 后，缺少波形缓存时继续绘制原录制预览，缓存到达才由正式绘制接管。关闭或替换工程清除旧会话预览。多轨原生回归覆盖真实 writer PCM、缩略图和停止前后身份，物理麦克风与桌面交互需要单独实测。

## 标尺与自动化输入

Locator、Loop 和 Clip 使用区分类型的 `targetSelection`。点击由统一 controller 确定所属模块；旧模块释放自己的预览和目标，不覆盖新模块设置的目标。Automation 模式不把编辑命令继续传给旧 Clip 选区。

标记拖动与 Loop 两端拖动使用音乐坐标，横向自动滚动后继续重算预览。Loop 主体拖动保持长度；点击主体选择其跨度。Locator 双击从该位置启动模拟播放，方向键移动选中的 Locator，重命名使用 Cmd/Ctrl+R 或菜单。

自动化拆为命中几何、点、线段、绘制、框选、剪贴板命令和数值编辑模块。点、线段与绘制手势通过 adapter 发布临时工程投影，Canvas 与后端消费同一有效结果，释放后一次提交，Esc 取消。Alt 修改线段曲率，绘制补齐跨过的网格单元。相同插值函数用于绘制和模拟电平，空 lane 与首尾区间均显示真实的持续值。

轻按 B 修改持久绘制偏好。按住 B 使用 session 临时 override，松开恢复，手势撤销历史不夹带临时工具状态。数值输入和重命名覆盖层保留焦点，StrictMode effect 重放不会清除编辑目标。

`A` 切换轨道内容与自动化。自动化模式弱化卡片底色并降低音符、波形的不透明度，隐藏淡变曲线与控件；预览函数保留调用方透明度，不自行重置。自动化曲线和命中范围避开卡片标题，普通折叠轨道不显示自动化曲线或目标。`M` 仍切换电脑 MIDI 键盘，不占用作编辑模式。

## 主题与高频数据边界

画布读取已解析的 CSS 主题 token。轨道颜色可引用 `var(--chart-N)`；绘制前解析，不把 CSS 变量字符串直接传给 Canvas 2D。切换主题或更新根样式后重绘。

颜色读取在主题变化时使用一个临时 DOM 探针解析 CSS 颜色，随后移除。Canvas 不直接接收 `light-dark()`，因为它可能拒绝该值并保留先前的填充色；解析后的墨色与 DOM 标题保持一致。卡片、轨道身份区和祖先色带复用局部 paper/tint token，保留工程中的原始颜色数据，不修改全局主题或侧栏调色板。

播放头、电平、Follow 与模拟录制读取同一 project runtime。`@zoeydaw/project-core/backend` 定义后端 port，`@zoeydaw/project-runtime` 按实例拥有工程编辑、确认和生命周期，构造与导入不启动引擎。编辑 token 与 Canvas 使用独立的 `session.editEpoch`，不能用可能为空的 backend sessionId 代替；离线也可编辑与取消。包内 `backend/connection/` 串行发送完整状态，将协议校验、显示插值与状态协调分开。app 注入 native backend，测试与 Gallery 显式注入 mock；`audio/project-telemetry.ts` 把遥测投影到本地 Float64 播放位置与 Float32 电平槽，不是原生共享内存协议。源与混音/自动化元数据进入后端 DTO，名称、颜色、视口和波形缓存不进入。接入契约见 [Project state adapter](../../apps/web/src/pages/project/adapters/README.md)。

共享 scheduler 每帧按 `clock → update → paint` 执行，注册先后不决定数据依赖。telemetry 先更新本地播放槽，Follow 用该帧同一位置同步 scene viewport，再向现有 workspace 发布 scrollX，最后正文与播放线一起绘制。不能让 Follow 等下一次 React commit 后才更新 Canvas 坐标，否则高缩放会放大一帧错位。

Arrangement 原生遥测在播放时读取 playback context 的 pending seek 或 `getAudibleTimelineTime()`，保留图延迟补偿；停止时读取 transport 的精确位置。不能用 `TransportControl::getPosition()` 的 UI timer 缓存作为播放时钟，该缓存在 seek 后有 200ms 更新抑制。前端等待当前 control generation 的首帧时保留 runtime 请求位置，不写回第 1 小节，也不伪造引擎已播放。

BPM 修改保留 Edit、播放上下文与处理器，由 Tracktion 在音频块边界按上一块拍点采用新 tempo，不执行 stop/seek/play。依赖 BPM 的 Clip 时间、Warp、淡变和自动化同步更新。遥测使用已处理的 sync point 推导当时速度，并结合 audible timeline 保留图延迟补偿，不能用尚未采用的新 BPM 解释旧秒数。停止时按新 tempo 换算精确音乐位置。

Warp Clip 启用 Tracktion auto-tempo，并用源 BPM 配置源拍点映射。BPM 更新不写固定 `speedRatio`，也不在 1× 处切换拉伸器类型，实时读取器保留源相位与处理状态。`re-pitch` 使用原生 SoundTouch rate 加独立 authored pitch；该实例固定处理顺序并保留抗混叠滤波，避免速度跨过 1× 时交换缓冲造成 click。

显示插值接到较慢的新时钟时，从此前显示位置连续交接，以新速度的一半收敛已超前的距离；真实帧保持原值，误差归零后恢复实际速度。控制代际变化、停止和真实循环回绕立即采用新位置，不保留连续性偏移。插值仍限于最后真实观测后的 250ms。

`audio/playhead-projection.ts` 只保存同帧播放头位置、播放状态和 revision，不包含 meter 或 SharedArrayBuffer。原生 meter 经 graph-owned mailbox、唯一 Rust Hub、window-bound binary pull 到 MeterStore，轨头、路由和 Device 直接消费同一快照。该链路已通过真实设备与二进制消费者 smoke；WKWebView 的实际交互、吞吐和全链路延迟尚未验收。

Canvas 2D 是当前渲染实现，不保证任意工程规模的帧率。性能验收必须说明轨道数、Clip 数、视口、拖拽场景和实测帧间隔；小型空场景的结果不能代表几百轨工程。是否需要 WebGL 或 Worker，应由真实场景测量决定，而不是仅凭技术名称承诺。

## 参考证据与边界

本轮通过 [REA](https://github.com/morluto/rea) 检查本机 Ableton Live 应用包及 Info.plist，并读取已安装主题中的 Clip、Waveform 和混合因子角色。实际 AX 说明确认 `A` 是自动化切换、`M` 是电脑 MIDI 键盘、`Cmd+M` 是 Live 的 MIDI 映射。Group 连接样式有运行窗口截图；淡变与折叠 Group 的补充图来自 [Arrangement View 手册](https://www.ableton.com/en/manual/arrangement-view/#audio-clip-fades-and-crossfades) 和 [Group Tracks 手册](https://www.ableton.com/en/manual/mixing/#group-tracks)。

当前没有 Hopper、Ghidra 或 IDA，未反编译 Live 原生实现。前台控制确认未取得，不能把未成功切换的原生折叠、缩放和拖动状态说成实测。当前实现依据已观察的 UI、资源角色和官方说明独立构建，不宣称像素完全一致或完整 Live 行为等价。
