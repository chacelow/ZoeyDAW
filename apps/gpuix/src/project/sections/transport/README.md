# Transport

`TransportBar` 接收严格的 `TransportLabels`，工程数值、模式和播放状态只通过 project adapters 读写。所有走带控件使用共享 transport 档，不缩小非中央控件，也不放大播放、录制或回到起点按钮。

BPM、拍号、律动和位置复用共享 DragPad 事务。Tap Tempo 只使用真实点击间隔，不启动时钟。停止保留当前位置，连续两次停止回到起点；独立回到起点按钮直接定位到 1.1.1。

位置与节拍器动画消费 `session.position`。`PerformanceStatus` 读取 C1 接受的 sample clock 和 outputLatencyFrames，显示真实采样率、输出延迟及采样时间。没有 CPU 遥测时显示不可用，不复制 Web 的固定预览值。

`workspace.metronome` 是可保存、可撤销的 UI 开关。动画每拍交替侧，由接受的位置计算，不用 JS timer。暂停、关闭或 reduced motion 时停止摆动。开关尚未接到引擎发声，属后续引擎工作。

组合根在窗口 `onKeyDown` 中调用 `handleTransportKeyDown(event)`。Space 仅切换播放；重复按键不反复切换。输入框先消费文本输入，按钮自身不响应 Space。Cmd/Ctrl+F 由组合根调用 Browser 的 `focusSearch()`。

Header 使用一条横向 ScrollArea。每组不收缩，窄窗从右侧裁剪溢出，横向滚动仍可访问，不让控件互相覆盖。背景与 Footer、Browser 使用相同 muted 表面。
