# B2-timeline-minimap:顶部时间线标尺、Minimap、工具栏、视口与键盘

## Target

Worktree `gpuix-b2-timeline-minimap`。迁移 `MiniMap/**`(619 行)、`Timeline/{Toolbar,Viewport,useArrangementKeyboard,useMidiKeyboard,drawModeKey}`、`Grid/**`、`canvas/painters/{grid,rulers/*}`、`canvas/interactions/rulers/**` 的副作用壳、`canvas/interactions/{autoScroll,coordinates}`。纯计算调 B1 `arrangement/core`;视口状态走 A1 的 store。

## 拥有路径

`apps/gpuix/src/project/sections/arrangement/timeline/**`。

## 要点(产品规则,必须写成测试断言)

- 顶部标尺按编号的 **Pattern 区域**(1、2、3…)交替明暗,不是按细分线或每四个一组;Pattern 区域与细分线是两个概念。自标尺向下延伸的线属于 Pattern 1/2/3,其他网格线遵循 Ctrl+1/Ctrl+2 模式,不是单一固定网格。
- 网格分档与可见细分线**按真实 Ableton 观察**随缩放推导(以 Live 菜单实测为准):`Cmd/Ctrl+1` 缩窄网格、`Cmd/Ctrl+2` 加宽网格、`Cmd/Ctrl+3` 三连音网格、`Cmd/Ctrl+4` 吸附到网格、`Cmd/Ctrl+5` 固定网格;最小可见网格宽度与线距随缩放自适应,直到 1:16384 不变成均匀稠密;分档在 1/4 到 16/1 之间,最细可到 1/256。**`Cmd/Ctrl+E` 在 Live 里是『裁剪』(Split),不是网格操作**:有选中 Clip 时在插入点切开 Clip,无选中时不可用。网格细分不依赖指针位置,单按 Ctrl 不得产生不明指针行为。Ctrl+E 的验收归 clip-lane 切片(splitClips)。
- 标尺显示编号的音乐位置与按 BPM 缩放的真实时间;含标记位置与可选区段(循环区域)。
- Minimap 与标记共用**一条**横向滚动条(在 minimap 下方),不各自一条;竖向滚动轨道时 minimap 固定,轨道表头与其 Pattern 卡片作为整体一起滚。
- Minimap 手势:点击拖动时隐藏光标(原生光标锁,与 DragPad 同机制,**不用可见光标的直接拖动**);拖动全程 minimap 保持可见可拖,轻微抖动不会让它消失;**向下拖缩小、向上拖放大**(web 现状相反,是缺陷);缩放锚点取指针在选框内的水平位置(左/中/右),不是固定中心;左右边缘各自单侧缩放,另一端音乐位置固定;点击选框外部把视口定位到点击处,双击适配工程范围;主体横向平移不加阻尼、不依赖速度(`PAN_DRAG_SCALE` 保持)。纵向分隔条拖动调整音频轨 minimap 高度,松手后光标要与拖动方向一致而不是跳到无关位置。
- 滚轮:纵向滚轮只改 scrollY;横向或 Shift+纵向改 scrollX;Ctrl/Cmd+滚轮以指针处音乐位置为锚缩放;已被数值控件消费的滚轮不再滚动画布。
- 光标锁、隐藏/恢复、快捷键全局监听走 Rust 原生能力;**不得用 JS 定时器轮询模拟**。若需要新的原生能力先 ask。
