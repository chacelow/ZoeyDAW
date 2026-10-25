# 错题与门禁候选

开工先扫本文；只记录可核实的故障、原因与对应实现，不把一次性偏好写成永久规则。2026-10-14 从既有项目规范整理，日期不是原故障发生时间。

## Panel active 外沿被裁切

- 错：用外沿 ring、box-shadow 或 outline 做 active。
- 对：保持外壳尺寸，只换现有边框颜色。具体宽度由共享度量配置决定，不在错题本固定另一份数字。
- 因：Resizable Panel/Group 内置 overflow 会裁掉外沿，产生部分边框残影。
- 见：[工作区外观契约](docs/architecture/project-panels.md)。旧 PanelShell 已由无卡片外壳的 Dockview 工作区替换。

## defaultSize 的单位

- 错：把 `defaultSize={18}` 当作百分比。
- 对：数值表达像素，百分比使用字符串。
- 因：react-resizable-panels v4 的尺寸 API 与早期写法不同。
- 见：`apps/web/src/pages/project/ProjectLayout.tsx`。

## 只改 CSS 不等于修改 Canvas 几何

- 错：覆写控件 CSS 高度后，认定轨道 resize、标题与命中范围也已同步。
- 对：从同一度量配置派生 CSS 和 JS 布局，检查两端的实际结果。
- 因：轨道几何过去来自 JS 常量，独立 CSS 覆写不能更新它；2026-10-14 页面探针确认共享控件与 scoped 轨道变体会分别响应。
- 见：`packages/ui/src/controls/metrics/`、`apps/web/src/pages/project/layout/`。

## 导入接口不应启动工程后端

- 错：在模块末尾 openBackend，导致首页导入 facade 就创建会话。
- 对：构造/配置只建立数据与 owner，运行视图显式取得 lease，最后释放时清理资源。
- 因：隐藏副作用把页面是否显示与后端生命周期分离，妨碍实例隔离和原生接入。
- 见：`packages/project-runtime/src/runtime/`。

## 2026-10-14 底部视图的布局与输入回归

- 旧 resizable Panel 布局中，展开 Clip 会优先挤掉 Device。切换 Dockview 后，独立底部 Device 通过 group constraints 固定内容高度，侧置、合并和最大化时解除限制。约束作用于 group API，不是 panel API。契约见 [底部布局](docs/architecture/project-panels.md)。
- MIDI fit 若在旧行高 DOM 上写 scrollTop，下一次 commit 会把音符移出可见区域。`useMidiViewport` 等新行高提交后再定位，并关闭浏览器滚动锚定；可见范围与源窗口切换由同目录测试覆盖。
- Clip 祖先无条件停止 keydown 会吞掉共享数值控件的预编辑输入；力度和琴键还曾吞掉项目 Undo。现在只拦截已消费的命令，输入框保留原生撤销。Clip Detail 与 MIDI 交互测试覆盖预编辑、控制焦点撤销、全局音符松键和拖动中撤销不消耗前一条历史。
- Audio Start/End 最初按 Live 的 Source 裁剪字段实现，实测却是独立播放标记：拖动不改变编排 Clip 的 startBar/lengthBars/sourceOffsetBars。已改为 audioSettings 内的 startMarkerBars/endMarkerBars，与 Loop Position/Length 和源边界三者互不影响。
- 音乐位置格式化对极小的十六分音符分量直接插值 Number，JS 对小于 1e-6 的数会转成科学计数法（如 `2e-8`），生成的字符串跳出 `\d+(?:\.\d+)?` 解析正则，往返直接变 NaN。改为用 `toFixed` 字符串裁剪尾随 0，不经过 Number→String 再转换。

## 2026-10-21 Arrangement 不能用模式开关代替对象状态

- Live 实测循环关闭时 brace 仍可点击并选择全轨范围。LoopRegion.enabled 只决定是否循环播放，不决定 brace 是否绘制、命中或可编辑；Group、折叠子轨、Return/Main 都属于全轨时间选择。
- 三连音是独立网格偏好，绘制与吸附必须共享投影；快捷键受 Arrangement 焦点约束，不能在 Browser 搜索或 Clip 编辑器中改全局网格。
- 当前 MIDI 设备模型只有音频效果器，没有 instrument；MIDI-only 轨不能因为类型字段有 volumeDb/pan 就显示音频 mixer。未来加入真实 instrument 时由其信号能力扩展此条件。

## 2026-10-21 参考 Dock 交互不能由框架默认代替

- 错：把 Dockview 的左右 bottom edge 接上便称为参考交互完成，遗漏 rail 起始/末端分组、split/overlay 模式、收起条件、关闭与隐藏的状态区别，还用文字 bottom Tab 代替方形图标。
- 对：以参考源码的状态模型、命中几何和实际事件分支作为契约，直接移植纯逻辑，只适配 Web 渲染与输入。文档与源码不一致时先核对源码，例如 rail 末端实际是模式菜单，不凭描述新增 pin 按钮。
- 验收应覆盖同一面板在三侧两端迁移、overlay 外点/Escape、split 保持展开、拖动取消和内容状态保留；仅断言能 move left/right 不证明一致。
- 条件 className 使用现有 `cn()`，不把前导空格放进模板分支。当前格式化器会裁掉分支字符串的前导空格，使 `project-workspace-content` 与 `project-arrangement` 拼成一个类名，实测 host 只剩 28px、Canvas 高度归零。验收在格式化之后读取真实尺寸。

## 2026-10-21 旧 Dockview 实现的生命周期故障

- 错：把 API 绑定只放在 `onReady`，并用 DOM 是否连接决定 detach。热更新或 React controller 替换后，Dockview 子实例保留且不重放 ready，新 owner 却没有 API，原生窗口中开关全关而旧布局仍占空间。
- 对：初始化与绑定分离，effect 对每个 owner 绑定保留 API 并清理 outgoing 监听，attach 不重置已有布局。真实替换 owner 回归检查同 API、同面板、Browser 搜索与焦点保留，以及三个开关改变实际 edge visibility。
- `addPanel` 的下方方向是 `below`，`moveTo` 必须指定目标 group 才处理 position。使用实际分组树和页面拖拽验证位置，不测试 API 调用回声。
- pointer backend 不消费 Escape。工作区只在实际 dock 拖动期间捕获 Escape 并取消该 pointer，避免继续冒泡关闭 Clip；回归覆盖取消后布局与详情面板保持。
- 三侧停靠条必须使用真实 edge group，不以空间位置猜测的中央 split 冒充；区域开关归窗口标题栏，底部 Clip/Devices 由停靠 Tab 负责。edge active-change 先于 panel visibility 更新，可见性从组 activePanel 和展开态派生。
- `clear()` 保留 edge 注册，重复重置需先移除再建立；中央恢复必须显式传 grid 方向，省略 position 会落到当前 active edge。真实 API 回归和三侧 pointer drop 覆盖这两条边界。
- 标题栏区域开关对应整条 edge visibility；Tab 点击对应内容 collapse/expand，二者不可混用。空右 rail 不展开空白抽屉。分割线同时验收可见细线与真实拖动尺寸，不以 aria 状态或截图有边框代替。
- 轨道横缝不能逐行画完整外框。Canvas 相邻矩形的 bottom/top 在实际像素采样中连续占两行，DOM 全边框也同样叠成 2px；横缝由单侧底边负责。主题边界引用 `--border`，先与编辑区 `--background` 一起验收，不用深色 `--muted` 冒充分隔色。Footer 上边界由 StatusStrip 自己拥有。

## 2026-10-21 Gallery 不能只补演示数量

- 错：只读组合 Gallery 入口，把通用分类网格当作组件库完成；遗漏独立 track、lane、clip-edit 入口，meters、旋钮、轨道类型和编辑器联动没有覆盖。
- 对：按组件族注册左侧 Tab、实际变体、适用状态及 N/A；真实 DAW 组件使用隔离演示工程。标题、颜色、所选对象和编辑器类型按同一数据 owner 验收，不用静态仿制卡片。
- 状态清单不是默认说明墙。页面展示组件和短状态操作，详细清单折叠；可用状态与已经实测的状态分开，不把没有拖动或过载锁存接口的 meter 写成支持。
- 见：`pages/library/catalog.ts`、`state-profiles.ts`、`pages/project/gallery/` 和对应交互回归。

## 2026-10-22 设备列表刷新不能丢播放状态

- 错：原生 smoke 只跑短于首次设备刷新的时长，或通过轮询自动重播掩盖停止。
- 因：锁定 Tracktion 的设备列表重载先 `clearNodes()` 停 PlayHead，随后只异步 `restartPlayback()`；Transport timer 在重建前把正在播放的状态也停掉。真实 E2x2 回调仍活跃，音频位置却在约 3.893 秒停住。
- 对：设备刷新事件内同步重建 context，仅恢复刷新前正在播放的状态。实现保存在 `src-tauri/native/tracktion-source/modules/tracktion_engine/playback/tracktion_DeviceManager.cpp`；`device_smoke.cpp` 通过内存虚拟 MIDI 添加、移除触发同一刷新路径，等待真实回调并验证 Transport 和 PlayHead 都继续播放。
- 捕获不能跳过 `rc.isPlaying == false` 的缓冲，否则末尾只剩停止前的声音。停止验收要求实际新增的 post-fence samples、gate 执行计数和全零尾段同时成立，不把旧 WAV 尾段当作停止结果。

## 2026-10-22 Browser 目录不是分页音频表

- 错：把已添加文件夹递归打平成音频列表，再用上一页、下一页承担大目录浏览；把源 BPM 输入和同步模式放在试听前。
- 对：左侧位置列表末尾添加文件夹，右侧保留目录、缩进及展开折叠；大目录使用原生可见树窗口和前端虚拟滚动，不暴露数据分页。搜索保留匹配项祖先，空目录仍是目录。
- 试听始终原速原调，独立 Preview Edit 绕过工程 Master。自动试听只控制选中即播；关闭后仍显示波形，波形点击定位并开始播放。BPM 分析只发生在素材拖入编排时，未知节拍明确保留原速，不能用工程 BPM 伪造检测结果。
- 见 `BrowserTree.tsx`、`BrowserPreview.tsx`、`browser_catalog/` 与真实声卡 `device_smoke.cpp` 的 Main 静音、试听独立输出断言。

## 2026-10-22 MIDI 力度单位导致工程打开失败

- 错：前端初始 `midiVelocity` 为 100、音符力度为 0–127，原生解码却按 0–1 校验；native fixture 使用 0.8，掩盖真实工程 open 被拒绝。
- 对：传输 DTO 和工程数据都保留 0–127，只有实际乐器 API 需要时才在该边界转换。原生回归覆盖控制力度和音符力度的 0、1、100、127 及越界拒绝，默认协议 fixture 使用真实的 100。
- 通信错误先取原生异常；本次实际错误是 `Number out of range: midiVelocity`，不是 IPC 断线。见 `native/playback/playback_model.cpp` 与 `playback_tests.cpp`。

## 2026-10-23 SVG 连通轮廓不能逐件描边

- 错：用各自带描边的圆、箭杆、手指或短线拼接连通图形，接点会出现双线、内部横线；虚线 square 端帽还会吃掉短间隙。
- 对：手工还原时，连通主体先写成一个闭合外轮廓，只保留原图明确的内部细节；深色 halo 跟随整个外轮廓。独立虚线段使用清晰间隙与闭合短矩形。检查实际尺寸和放大对照，不能以 XML 合法或导出成功代替视觉验收。
- 16px 光标直接在16单位坐标内设计，先看真实尺寸的实心面积与负空间，不把48px细节图缩小后当作完成；成对方向用同一轮廓镜像或旋转。见 `zoeydaw-cursors/vector/design.py` 与实际16px Gallery。

## 2026-10-23 修改音频库前先验证已有扩展 API

- 错：发现 LevelMeasurer 含锁后，直接增加每轨 graph factory，未验证现有输出 hook、节点遍历和依赖能否组成 observer；还将整个 vendor 目录大小当作所需源码量。
- 对：先沿真实 callback/prepare/message-thread 路径区分成本，再比较现有 API。隔离 observer 使用已有 Node/PluginNode API，在真实 Edit 图的 2 workers、sharing/pooling 四种组合与正常/mute/solo/stopped/fence 五种状态下通过 Release 和 ASan/UBSan 验证。此证据支持缩小 factory 改动，不证明所有拓扑和性能目标已达成。
- 边界：prepare 完成不等于 graph post 或 audio adoption；legacy master meter 即使无 client 仍先加锁，须独立处理。录音索引优先复用 AbstractFifo；Reverb 参数缺口和 Delay 扩容条件须准确描述，不用“都实时不安全”替代源码证据。
- 见 [meter API 复核](docs/research/cookbook-meter-references.md#2026-10-23-现有-api-复核) 与 [原子 API 复核](docs/research/cookbook-atomic-references.md#2026-10-23-现有-api-优先复核)。

- 2026-10-23 补充：先用未修改上游验证普通编辑，再判断是否需要修改引擎。`877e39c` 原版离线图测试中，同一 Edit/Clip/fader 的移动与裁剪保持120块连续输出；这不等于 Web/声卡闭环验收。曾提前扩展的严格事务播放器和参数绑定已撤回；“普通编辑不中断”与“任意准备/回滚异常下旧输出完全不变”不是同一保证。

## 2026-10-23 试听进度不能读取延迟更新的 UI transport 缓存

- 错：把 `TransportControl::getPosition()` 当作实时 playhead。该接口返回缓存 position，定位后 200ms 内 timer 不更新它；替换试听后约85ms的观察因此始终为0，即使设备 callback 和播放图仍在运行。
- 对：播放中读取 `EditPlaybackContext::getPendingPositionChange()` 或真实 `getPosition()`，停止时才使用 transport 的确认位置。复用现有 API，不累加 timer 假进度。真实设备原断言观察替换后从0.032s推进到0.07467s；音频采集、后续生命周期断言仍独立验收。
- generation fence 只负责音频即时静音，message-thread owner 还必须停止已过期的预览 transport。`previewPlaying=false` 的派生布尔不等于旧 transport 已停止，不能绕过 capture_write 的 stopped 检查。

## 2026-10-23 混响 reset 必须清除全部扩散延迟

- Signalsmith Basics 固定版本的 `ReverbSTFX::reset()` 遗漏 `delay4`，导致 bypass 或显式 reset 后残留旧尾音。补齐该调用，保留源码与许可，改动登记在 vendor 的 `source-lock.json`。
- `builtin_device_tests.h` 用脉冲后 reset/bypass 再输入静音验证全部历史清零；循环跨界不等同显式 seek，必须保留尾音。参数修改只更新 DSP 目标，不重新初始化实例。

## 2026-10-23 MIDI beat 与 offset 的原生单位不同

- 3/8 回归发现，给 MIDI note beat 再乘 `4/denominator` 会把事件与循环时长减半。锁定 Tracktion 的 MIDI 事件使用拍号 beat，循环长度使用 `loopBars * numerator`。
- `TrackItem::getOffsetInBeats()` 则使用默认 `getBeatsPerSecondAt()`。适配层按该 getter 的速率编码 authored offset，不能直接套音频 Clip 的秒偏移。`control_tests.h::testAuthoredMidiClip` 检查实际下游事件时间、循环和裁剪偏移。

## 2026-10-23 静音断言必须区分场景与有效源窗口

- `device_smoke.cpp` 的共用静音检查曾把 Clip mute、删除、End marker 等失败全部标成 Main mute。检查现在携带场景名、帧范围和峰值，避免将错误归因到不相关的路由。
- End marker 为 `0.0001 bar` 不代表空窗口。循环经过起点仍可能播放数个采样，不能断言整个捕获区间静音。静音用例把 source offset 放到 End marker 之后；取消后验证原输出恢复，不放宽静音阈值。

## 2026-10-23 波形必须按可分辨程度选形状，不能只有一套

- 错：把缓存 bin 的 max/min 交替连成一条 zigzag，或凭视觉判断所有缩放只用同一种 stroke；全局选最细缓存还会让未覆盖区域消失。
- 对：2026-10-24 沿 `LAudioClipContentView` 实际绘制链核对。`samplesPerPixel > 1` 时按 `floor(log2(s))` 选源零点对齐的二进制峰值层，并让相邻 bin 的位置和 min/max 向合并层过渡；近景用 65-tap Lanczos32 多相插值，至少 8px/sample 才显示原始采样点。上下轮廓闭合后外扩半像素，一次填充，不能用 zigzag 或独立柱条替代。
- 请求显式包含 `framesPerBin`；近景前后补足插值支撑，缺缓存与源外零填充分开处理。编排只分配可见切片位图，Browser 与编辑区共用单一请求 owner，避免 native generation 互相取消。
- 见 `signed-waveform.ts`、`waveform-interpolation.ts`、`waveform-polygon.ts` 与对应回归。静态原生算法证据不等于已证明 SVG/Canvas 和 Live 图形后端逐像素一致。
- 2026-10-24 最大缩放空白：波形 path 先由像素压缩到小节坐标，再由根 SVG 放大；WebKit 会跳过极小 scale，Chromium 不会。独立 WKWebView 对照中，同一轮廓普通缩放有 63680 个深色像素，最大缩放为 0。波形根 SVG 改用像素 viewBox，音乐坐标仅用于嵌套标尺和标记；验收必须包含 WebKit 实际栅格结果，不能只查 path 非空。

## 2026-10-24 MiniMap 拖动必须验证坐标投影

- 错：先把概览指针像素直接加到时间线，再把 Clip Detail 的 `AZoomScrollBar` 公式移植到 Arrangement；两次都用自己写的测试当作参考一致的证据，用户实测驳回方向和细节。
- 对：先从具体界面装配追到事件接收者和模型。本次真实链为 `AScrollerView → LScrollBarXView → AXBackgroundView → LArrangerScrollable`。普通框内横拖按内容像素推进，修饰键框平移按剩余距离映射，两者倍率不同。显示框的 12px 是内部宽度，还包含左右各 2px。
- 原生结束路径只清手势与锚点，不恢复 press-time viewport；不要凭惯例加入回滚。总览范围来自 song length 与 visible end，不能用固定 128 小节代替。
- 参考输入规则用实际函数和 ABI 指令核对，前端通过真实鼠标场景与状态投影验收。单元测试、Ghidra 分析完成、键盘缩放和静态截图都不能单独证明完整交互一致。

## 2026-10-24 组件职责与 React 提交边界

- 错：波形取数、测量、指针交互和绘制继续堆在单组件，未在增长时执行已有职责评估；render 中修改范围 ref，让被放弃的 render 污染后续视图。
- 对：保留单一 owner，按独立职责拆出局部 hook 和视图；跨 render 保留的可变记忆只在 commit 更新。Suspense 回归中旧范围为 140，正确提交范围为 135。React Doctor 的 300 行提示是检查入口，不是运行故障证明；剩余间接 cleanup 误报必须追到真实释放路径。
- 见 [模块契约](docs/architecture/modules.md#状态与生命周期验收)、`useSongExtent.test.tsx` 和共享 UI 的 `test:shared` 回归。

## 2026-10-24 播放线不能混用新时钟与旧视口

- 错：Arrangement 遥测读取 Tracktion UI 位置缓存，seek 后的 200ms 抑制被当成真实播放位置；Follow 在绘制后更新视口，缩放会放大这一帧错位。telemetry admission 缺帧时还曾写回第 1 小节。
- 对：播放用 pending seek 或已补偿延迟的 audible timeline，停止用精确 transport position。共享 scheduler 按 clock、update、paint 排序，Follow 与 painter 使用同帧采样。原生 hosted graph 回归不 pump UI timer，验证音频推进时遥测也推进；8,000 px/bar 的生产 renderer 场景中 Follow 横向抖动从 80.4px 降为 0px，不把 Gallery mock 测量当作 WKWebView 帧率保证。
- 见 `transport_clock_tests.h`、`scheduler.test.ts` 与 [渲染边界](docs/architecture/rendering.md#主题与高频数据边界)。

## 2026-10-24 可见报错要追到实际 producer

- ResizeObserver 的 selected element 不是通知源证据。实测 `useCanvasPainters` 写旧像素 CSS 宽高会移除滚动条，让自己的 host 在回调内增宽/增高 11px；改为容器 CSS 尺寸加独立 backing store，保留同步重绘，不隐藏错误。
- “后端通信失败”曾来自负源偏移被原生拒绝，以及前端允许非二次幂拍号分母。保留原生异常上下文，拍号控件、setter、reducer、快照与 native 接受同一集合。2026-10-24 用户更正 Audio resize 交互：左扩到源起点即夹紧，不再由新拖动生成负偏移；原生兼容读取已有带符号窗口。标题命中、实时夹紧、释放保留和 Undo 由 `hit-test.test.ts`、`clip-edits.test.ts` 与 `overwrite.test.ts` 覆盖。
- 原生 lock 的 ACK 不代表底层 OS 成功。按 owner/token 隔离 acquiring、locked、releasing 和 released，覆盖早释放、失焦与卸载；实际屏幕边缘拖动与松手恢复仍需运行验收。
- 见 `useCanvasPainters.test.tsx`、`cursor.test.ts`、native protocol/PCM 回归及 [渲染契约](docs/architecture/rendering.md)。

## 2026-10-24 录音启动必须使用当前时间原点

- 错：停止状态从第 2 小节 seek 到第 1 小节后，直接在旧 playback context 上启动录音。Tracktion 首输入回调按旧 stream 起点计算补偿，三轨各插入约 96000 帧静音，耗尽有界 writer 队列。
- 对：仅停止状态进入录音前释放旧 context，再绑定输入并从当前请求位置启动。已有播放中的 punch-in 保留当前 context。`recording_tests.h` 覆盖后退、前进启动、播放中启录，以及相同或不同输入的三轨逐帧 PCM。
- Hosted 测试设备复用 input/output buffer，后执行的设备观察回调会读到已覆盖的输出。物理索引计量测试显式将原始 PCM 送入既有 InputMeter；这不等于真实 CoreAudio 麦克风链路已验收。
- 录音结果按 UUID map 遍历，不保证时间顺序。回归按启录时获得的 `recordingId` 找 take，不能按数组末项推测最新录音；前向 seek 与 punch-in 的精确 PCM 场景连续十次验证身份匹配。

## 2026-10-25 自定义设备描述必须读取实际声道配置

- 错：启用 Tracktion 自定义 `describeWaveDevices` 后，仍以 XML 布局控制输入启用。该路径先采用自定义描述并返回，XML 的启用标志被忽略；硬编码关闭输入导致界面可选但录音报 `No armed audio track has an enabled input`。追加而未清空描述还会产生重复输入。
- 对：自定义描述直接使用确认的 mono/stereo 配置，替换旧描述，失败回滚恢复旧布局。停止状态打开工程恢复已保存输入，不请求新权限、不启动播放。原生回归覆盖启用、禁用、上下文重建和真实 PCM；无权限仍可打开工程并显示设备原因。
- 缺失 `inputChannel` 的旧轨道必须在显示与 backend projection 使用同一默认值，重新选源保存启用声道；不能让界面显示 `1` 却发送 `null`。

## 2026-10-25 电平消费代际与资源释放

- 兴趣集合变化也会使在途快照失效；只改 registry、隐藏代际不足以阻止旧订阅帧重新显示。保持一个 invoke 在途，等待旧请求完成后再拉最新值。回归见 `meter-pull.test.ts`。
- Store 的 stale 通知可能触发失败的绘制订阅者。先释放 Store 订阅再停止 Pull，保证卸载仍会关闭 native stream；错误采纳路径保留原始及通知异常，继续通知健康消费者。回归见 `meter-store.test.ts`、`meter-session.test.ts`。
- 2026-10-26 更新：sample clock 探针属于 graph/device 和可见性代际，换图废弃旧校准。levels v2 在无图时保留明确的 registry，经同一 stream 发送 Stopped 或 Unavailable；只有 sample clock probe 返回 null，不清空 Hub 或暂停停止位置。BPM 保留 Edit。endpoint 和 transport 兴趣独立，无两种兴趣时 scheduler 休眠；绘制预算取实际 DOM/Canvas 耗时。契约见 [实时同步设计](docs/research/realtime-sync-design.md)。

## 2026-10-25 BPM 更新不能复制旧秒数

- 播放中 120→180 BPM 曾把第 5.04 小节变成第 7 小节。替换 Edit 时复制了旧秒数，还读取滞后的 Transport UI 缓存；新 BPM 再把该秒数解释成另一音乐位置。
- BPM 直接更新保留的 Edit tempo，由音频块边界保留拍点并采用新速度；不为改速 stop/seek/play。遥测必须用已处理 sync point 的时间和拍点解释 audible clock，不能把新 BPM 与旧块秒数混用。`transport_clock_tests.h` 覆盖逐块不回退与实际拍点推进，`clip_continuity_tests.h` 覆盖连续 BPM preview 的实际 PCM。
- 前端旧速度外推可能略领先下一帧真实位置，直接替换会单帧回缩。显示交接保留该微小差值，再随真实速度收敛；seek 和循环回绕立即执行，原始时钟不改写。回归见 `backend/connection.test.ts`。
- 恒定 DC 输出只能发现静音，无法发现重采样相位跳变。连续正弦回归覆盖 BPM 上下拖过 1× 及连续升速。Warp 改用按拍点实时 reader 保留拉伸状态；`re-pitch` 固定 SoundTouch 和 RateTransposer 的处理顺序，避免跨 1× 时转移内部缓冲。已有源循环与移调音高回归同时保留。

## 2026-10-25 Windows 排除端口导致开发服务无法绑定

- 用户启动报 `listen EACCES: permission denied ::1:5173`，本机没有进程监听该端口，但 IPv4 与 IPv6 的排除范围均包含 5147–5246。不能把 EACCES 当作普通占用，也不能只改 IPv4 地址。
- 按用户指定的 7xxx 范围将 Vite 与 Tauri 开发地址同步为 7173，保留 strictPort。实际 Vite 配置解析后，localhost 绑定到 `::1:7173` 成功，IPv4 与 IPv6 单独绑定也通过。桌面启动仍由用户执行。见 [setup](docs/agents/setup.md)。

重复出现的机械问题优先升级为 lint、类型或行为测试；升级后让本文链接权威规则，不复制第二套实现参数。当前具体门禁和运行命令见 [setup](docs/agents/setup.md)。
