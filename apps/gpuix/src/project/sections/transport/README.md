# Transport

`TransportBar` 接收严格的 `TransportLabels`，工程数值、模式和播放状态只通过 project adapters 读写。所有走带控件使用共享 transport 档，不缩小非中央控件，也不放大播放、录制或回到起点按钮。

BPM、拍号、律动和位置复用共享 DragPad 事务。BPM 的 `step=0.01` 用于键入与方向键精度，`dragStep=1` 用于拖动与滚轮的粗调整。Tap Tempo 只使用真实点击间隔，不启动时钟。停止保留当前位置，连续两次停止回到起点；独立回到起点按钮直接定位到 1.1.1。

数值、单位、采样时长与测宽样本由应用 locale 创建的 `labels.formats` 注入，section 不依赖 app。BPM、拍号、律动与位置 reset 读取 `PROJECT_TEMPLATE`；停止连击窗口、Tap 过期窗口与采样数量读取当前 `transport` 偏好。`tappedTempo` 的纯函数默认参数来自纯 `PREFERENCE_DEFAULTS`，测试可以传不同策略覆盖真实计算。

`index.test.tsx` 覆盖模板 BPM override 后双击 reset 与 Undo、不同停止连击窗口；`PerformanceStatus/index.test.tsx` 覆盖替换 locale formatter 后真实 telemetry 的采样率、延迟与时长输出。C4 变异与编辑器共用 `bun src/project/sections/clip-edit/verification/mutations.mjs C4`。

位置与节拍器动画消费 `session.position`。`PerformanceStatus` 读取 C1 接受的 sample clock 和 outputLatencyFrames，显示真实采样率、输出延迟及采样时间。没有 CPU 遥测时显示不可用，不复制 Web 的固定预览值。

性能弹层只显示注入的 `labels.enginePhases[phase]`，标签类型从 `ProjectRuntimeStatus["phase"]` 派生并用 `Record` 穷尽；中英文组合根与 demo 均提供全部五种状态，不向用户显示协议值。`PerformanceStatus/localization.test.tsx` 覆盖所有状态；在 `apps/gpuix` 执行 `bun src/project/sections/transport/verification/mutations.mjs` 可证明恢复原始 phase 会失败。

性能读数由 `useAnimationFrame` 回调读取接受的遥测快照；只在播放中，或弹层打开且已有 Main 遥测时订阅。停止且弹层关闭不订阅帧；闭层仅采样率改变才重绘，开层刷新延迟与采样时间。离散播放状态和遥测存在性变化负责更新快照，没有 JS 定时器。`reducedMotion` 必须由组合根提供。

`workspace.metronome` 是可保存、可撤销的 UI 开关。动画每拍交替侧，由接受的位置计算，不用 JS timer。暂停、关闭或 reduced motion 时停止摆动。开关尚未接到引擎发声，属后续引擎工作。

节拍器复用共享 Phosphor `Metronome` 图标，两侧 `Circle` 按接受的拍子交替填充，整体位置按共享间距 token 左右偏移，不旋转摆针。所有按钮图标复用 `Icon`；播放、录制、节拍器的 pressed 状态通过共享 Button 的受控接口暴露。

Space 的唯一生产 owner 是 Timeline keyboard。组合根通过 `platform/keyboard` 连接 `createTimelineController().keyboard`，绘制开关注入同一 owner 的 `latchDraw`；Transport 不注册或复制窗口快捷键。Cmd/Ctrl+F 的已消费、对话框和 Browser 折叠守卫归组合根，Browser 只暴露 `focusSearch()` 命令。

Header 使用一条横向 ScrollArea，并声明 `wheelToHorizontal`，不复制输入映射。每组不收缩，窄窗从右侧裁剪溢出，横向滚动仍可访问，不让控件互相覆盖。数值子控件消费自己的滚轮。背景与 Footer、Browser 使用相同 muted 表面。
