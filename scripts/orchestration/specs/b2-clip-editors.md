# B2-clip-editors:底部 Clip Edit(MIDI 钢琴卷帘 / 音频编辑 / Pattern)

## Target

Worktree `gpuix-b2-clip-editors`。迁移 `ArrangementPanel/Clip/Detail/**`(约 2506 行:MidiEditor 含 useMidiEditor/useMidiViewport、AudioEditor 含 Waveform/Parameters/SourceMarker/MusicalNumber、PatternSteps、PatternEditor、MidiNote、NameInput)。

## 拥有路径

`apps/gpuix/src/project/sections/clip-edit/**`(与 arrangement 平级,因为它属于底部 Footer 面板而非主画布)。

## 要点

- Footer 底部面板的两个标签(Affect Chain / Clip Edit)共享同一面板但属性不同;Clip Edit 根据 Clip 内容**只选一个**编辑器:音频→Audio Edit,MIDI→钢琴卷帘,不同时显示两种。编辑只在此面板进行,不在点击弹层里。
- MIDI 钢琴卷帘:音符增删改选、移动、缩放、量化、力度;滚动/缩放视口;键盘操作;与 A1 `midi-notes`/`midi-editing` 模型对齐。音符绘制与命中用可见范围裁剪,不为屏外音符建节点。
- 音频编辑:波形取 C1 峰值接口(按可见范围+像素宽度);SourceMarker、参数(增益、淡入淡出、偏移)用 `ui/controls` 的数值控件,数值控件宽度稳定、内容居中。
- 键盘:所有编辑快捷键走窗口键盘事件(gpuix `onKeyDown`),Space 只控制播放。
- 拖动调整数值遵循 DragPad 机制(隐藏光标、相对位移、结束回按下点);悬停滚轮可微调且不隐藏光标。
