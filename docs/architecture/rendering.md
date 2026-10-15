# 编排渲染与交互

适用于 `apps/gpuix` 的原生 Arrangement。旧 React DOM、Canvas 2D 与 Tauri 渲染路径已删除。模块接口与键盘归属以 [Arrangement 组合契约](gpuix-arrangement-composition.md) 为准；本文说明绘制、坐标、交互与高频数据边界。

## 当前职责

- `apps/gpuix/src/app/project` 装配工程、timeline、tracks、lane 与平台能力，不建立第二份工程状态。
- `project/sections/arrangement/core` 接受工程与显式手势数据，返回几何、命中或编辑投影；不读取节点、不注册输入、不提交事务。具体接口见 [core](../../apps/gpuix/src/project/sections/arrangement/core/README.md)。
- `timeline` 是视口、工程到 SceneStore 的投影与窗口键盘的唯一 owner。标尺、MiniMap、lane 与 tracks 消费同一视口。
- `tracks` 组合完整 TrackRow，拥有轨道放置、外边框、分组围栏、行裁剪与屏外卸载。屏外只保留有焦点行的表头，不保留车道内容。
- `lane` 提供每行 Clip/Pattern/Automation、单次挂载的 LaneOverlay 与跨行手势 controller。它不拥有视口、轨道外边框或工程副本，接口见 [lane](../../apps/gpuix/src/project/sections/arrangement/lane/README.md)。
- Clip 交互外壳使用裁剪后的原生 host 元素；网格、预览音符与波形列通过 `useQuadBatch` 原生批绘制，fade 与 Automation 曲线复用共享向量 Shape。不恢复 Canvas 兼容层或 DOM overlay。

## 一个坐标系与度量来源

工程时间以从 1 开始的小节编号表达。横坐标统一为 `(bar - 1) * pxPerBar - scrollX`。Clip 展示几何使用行内坐标，轨道行承担垂直滚动位移；手势指针使用共享画布坐标。

`project/layout` 与 core 几何统一轨道标题、Clip、命中测试、自动化、resize 与行容量。普通轨道共用 `scrollY`，Return 与 Main 固定在底部；MiniMap 和标尺不参与轨道垂直滚动。领域时间范围与吸附继续归 `project/model`。

普通纵向滚轮改 `scrollY`，横向滚轮和 Shift 加纵向滚轮改 `scrollX`。Ctrl/Cmd 加滚轮以指针处音乐位置缩放。已被数值控件消费的滚轮不再滚动编排。

`model/grid` 保存自适应或固定网格偏好，缩放与拍号决定有效网格；Ctrl/Cmd+1、+2 调整密度，不移动视口。行网格、Clip 内网格与吸附共用原点和 gridPlan，不额外叠加另一份固定拍线。交替区域、小节主线与标尺文字分别消费 core 的投影，不把文字稀疏程度当成网格密度。

共享几何源为 `shared/theme/metrics/control-metrics.json`，消费者经 `useTheme()` 使用；轨道布局层是直接导入度量配置的例外。形状、边框和语义间距由 `Theme.design` 持有。颜色由 `shared/theme` 解析，不添加 DOM 颜色探针、CSS 变量缓存或局部调色板。主题切换不改工程中的 Clip/Track 原始颜色。

## 视口、MiniMap 与播放

MiniMap 主体横向拖动平移，左右边缘单侧拉伸并固定另一端的音乐位置。主体垂直拖动使用 core 的实际方向：下拖减小 `pxPerBar`，上拖增大；锚点取按下位置在视口选区内的比例，不统一固定中心。点击选区外定位，双击适配工程范围。

手势阈值、捕获、相对移动、光标隐藏与原位恢复走原生输入及平台注入端口。Esc、失焦、取消与卸载释放对应资源，不使用浏览器 Pointer Lock 或旧 Tauri 光标桥。视口更新同步返回已接受的值，自动滚动重算当前手势时不读取旧投影。

Follow 读取同一工程播放位置，播放头到可见区域中线后移动视口；停播、关闭 Follow 或手动平移暂停期间不追踪。不新建模拟播放时钟。长播放线仅在播放时显示，停止时保留所选轨道的插入点与标尺标记。

窗口键盘由 timeline 拥有。Space 播放/停止、长按不重复切换；普通按钮和 Clip 的 Space 传播给播放 owner，文字输入、IME 与已被弹层消费的命令保留各自行为。不套用旧 Web 的 window capture 顺序，原生事件规则见 [UI 规范](gpuix-ui-standards.md)。

## Clip、预览与自动化

Clip 标题负责移动和修饰键复制，正文负责时间范围选择；左右边缘负责修剪与源窗口延长。点击标题将插入点设到 Clip 左起点，正文点击按音乐位置设置。普通选择、创建与重命名不自动打开底部编辑器，显式编辑请求才打开 Clip View。

标题实心，正文透明并保留网格。折叠普通轨道只显示标题，不保留正文或隐藏曲线命中区。选择仍来自工程会话，轨道活动来源与表头焦点分别表达，不用一个轨道 ID 同时打开两种高亮。

预览和命中共用 core 几何，Clip 兼容策略复用 model。移动、修剪、fade 与自动化通过公开 adapter 发布临时工程投影，再提交单个可撤销事务；取消丢弃预览。手势清理、窗口中断与提交策略由对应 controller 的明确状态转换决定，不各自安装第二套全局监听。

音频 fade 保留共享 Bézier 几何与常驻遮罩，显式曲线和锚点只在展开音频 Clip 正文悬停时出现。当前锚点是已批准的 5px 空心方点与菱形，不恢复旧 Web 实心圆点。修剪保留源相位与 fade 相对边缘的语义；播放 Start/End 标记是独立元数据，不改变编排 Clip 的位置、长度与源偏移。

MIDI 显示真实音高与源窗口内的音符，Pattern 显示无音高步进，不生成虚构音高；重复窗口按可见范围投影，不随隐藏重复数增加绘制工作。Clip 剪贴板保留源窗口和相对位置，生成独立 ID；外部文本在边界校验，无关文本不复活旧缓存。

Automation 的点、曲线、命中、框选与编辑使用同一工程投影。移动 Clip 时，相关区间的自动化随共享 model 投影移动；复制生成新 ID，同位置冲突与撤销规则不由渲染器另写。`A` 切换自动化，`M` 保留电脑 MIDI 键盘，B 的持久绘制偏好与按住临时覆盖分别由既有会话模型持有。

## 真实音频与高频数据边界

工程、编辑事务、撤销与后端生命周期归 [stores](../../apps/gpuix/src/project/stores/README.md) 和 [adapters](../../apps/gpuix/src/project/adapters/README.md)。播放头、电平与 Follow 消费同一 runtime 遥测，不维护模拟 ring-buffer 或第二份可写工程。导入模块不启动后端，显示工程时取得 runtime lease，最后释放时清理。

波形由当前工程会话的只读 PeakReader 提供，TS 不接收 PCM、不计算源峰值、不使用合成峰值后备。返回数组按声道、像素、min/max 排列，渲染器直接索引，不转置或复制。lane 在 Clip 主体上使用 `arrangementClipInk`，clip-edit 在编辑器背景上使用 Clip 派生色，两种语境不互换。

原生 frame 与恢复订阅驱动播放显示，停止且无剩余动画时释放订阅。电平 hold/decay 属于显示状态，不进入工程或快照。恢复首 presentation 的准确边界见下一节，不以最终收敛截图替代。

原生批绘制不保证任意工程规模的帧率。性能验收必须说明轨道数、Clip 数、视口、交互场景和实测帧间隔；空场景、离屏吞吐与历史截图不等于当前大型工程的真实桌面体验。实际验证状态与已知限制保留在各模块证据文档，不把接口存在称为完整验收。

## gpuix 原生窗口的播放可见性

2026-10-15 的原生测量与恢复契约。表中数值保留当时的实测范围，不代表当前整应用性能复验。窗口激活与窗口可见是两个独立状态；`isVisible` 不能替代 `NSWindowOcclusionState.Visible`。

| 播放中窗口状态 | 实测 callback Hz | 单核进程 CPU | 策略 |
| --- | --: | --: | --- |
| 前台可见 | 60.003 | 15.526% | 显示帧驱动 |
| 失活但仍可见 | 21.792 | 8.989% | 保留 GPUI 的失活节流，电平、播放头、时钟继续更新 |
| 完全遮挡 | 0 | 4.136% | 允许停止显示帧，遥测继续接收 |
| 最小化 | 0 | 3.450% | 允许停止显示帧，遥测继续接收 |

前台与失活可见各取状态稳定后的至少 12 秒，其余为至少 5 秒稳定采样；最小化另有 8.764 秒停帧补证。CPU 来自进程 user+system 增量，含 Bun、真实静音 Main 引擎、hot reload 与采样，不是 GPU 利用率，也不代表大型工程成本。不同桌面时段的单次对比不能隔离补丁开销。GPUI 的失活最小帧间隔为 33333µs，量化和派发时机会使实测频率低于名义 30Hz；不为追求后台 60Hz 取消这一节流。

表中桌面数据对应 F3 key-order 恢复状态机版本、F4 接合之前；F4 接合后的 retained geometry 首绘以 headless GPUI 回归验证，未重新宣称测过接合后的桌面 CPU。无恢复订阅者时跳过周期可见性采样，注册时仍显式建立最新 baseline。

恢复规则：从遮挡、最小化或失活恢复后的首次 presentation 必须包含同步恢复回调执行时 JS 已收到的最新遥测；音频线程尚未交付的样本不计入这个相等性边界。不能把恢复后 250ms 的截图、第一条普通 frame 回调或最终收敛当成首次 presentation 的证明。普通帧回调继续异步投递，避免重入 GPUI；不使用 JS 定时器补帧。停止播放且没有剩余动画时不再请求帧。

同步恢复通道独立于普通帧：`subscribeResume` / `useResumeFrame` 的消费者以 `flushSync` 提交 retained tree；安全的批次写入包括 `applyBatch` 和 F4 `setQuads`，不在该同步回调中借用或读取 GPUI。原生代码在回调结束后通过当前 `window/cx` 应用失效；仅同步改树还不够，GPUI 在 dirty 为 false 时可直接 presentation 旧 scene 而不进入 `Window::draw`。不强制 draw 的 GPUI 回归及其失效分支变异覆盖这一门控。

AppKit 的 key-window prepaint 可以早于 occlusion Visible 位更新；`Occluded → BecomingVisible → Visible` 允许 key 先到时立即恢复，且不会在随后的可见通知重复派发。纯遮挡恢复不依赖 key 信号。轨道电平的恢复需求为 `playing || active`：停止播放后仍在 hold/decay 的动画也要同步追上，动画耗尽后释放两种帧订阅。

基线五次最小化恢复均实际呈现旧序号；最终最小化恢复 5/5、保持失活的纯遮挡恢复 5/5，首 presentation 的 scene sequence 均等于回调时最新已交付 sequence。原始记录与修复前后 CPU 对比见 [F3 测量报告](../../scripts/gpuix-main/evidence/f3/measurement-2026-10-15.md)。完全遮挡可以完整复现 tracks 的冻结症状，但原 tracks 记录缺少同步窗口状态，因此是「可复现、未证实」，不是对原场景的追认。
