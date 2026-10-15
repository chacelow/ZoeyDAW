# B2-clip-lane:主编排画布的 Clip/Pattern/Automation 车道渲染与手势

## Target

Worktree `gpuix-b2-clip-lane`。迁移 `canvas/painters/{clip,clip-fades,clip-previews,group,automation,playhead}.ts`、`canvas/interactions/**` 的**副作用壳**(controller、clip/{index,move,resize,NameEditor}、automation/{commands,ValueEditor,preview}、project-preview)、`canvas/ContextMenu/**`、`Timeline/{TimelineCanvas,useCanvasPainters,TrackHeaderViewport}`。纯计算一律调 B1 的 `arrangement/core`。

## 拥有路径

`apps/gpuix/src/project/sections/arrangement/lane/**`。`features/clip-render/**`、`features/waveform-automation/**` 是早期原型,有价值的(已验证的拖动/裁剪/波形实现)迁入后删除,不留两份。

## 渲染(性能是硬指标)

- 用 gpuix 原生元素 + **可见范围裁剪**,不得为不可见 Clip 挂载节点(早期原型已验证;Canvas 2D 兼容不作要求)。波形用 C1 的峰值接口按可见范围+像素宽度取,不传整段 PCM。
- 实测:200 条轨道 × 每轨 50 个 Clip 时滚动与缩放无明显掉帧,报告里给 `getDebugFrameOverlayStats` 的帧数/耗时;不得为了通过而降低内容。

## 要点(产品规则)

- 网格线与拖放落点对齐同一份网格(尤其 1/4);Clip/Pattern 卡片不遮挡网格,Ctrl+1/2 网格线在 Pattern 标题下方明显可见,悬停时略淡可见;音频轨网格线用共享深灰,不得出现亮线。
- Clip 标题条为实心,透明只在卡片下半;折叠态颜色填充分段、只在第一行。
- Pattern 卡片 Ghost 起点对齐线标记**左起点**(移动或缩放任一边都是它,不是尾部),只对齐 Clip 不对齐播放;拖动期间 Ghost 显示 active,原对象在松手后恢复。拖动 Pattern 或点击标题把播放位置设为卡片起点;点击内容内部则把光标放到点击处。
- 折叠的 Pattern 隐藏 Bézier 曲线;展开时只在悬停下方音频区域(不是标题)显示曲线。
- 音频 fade:底部锚点不可独立拖动,只有顶部锚点自由拖;中间 Bézier 锚点避开上下左右四个极值;三个锚点间平滑圆润过渡,不得压成水平条;缩放任一端时顶部与底部锚点同时跟随;起点锚点有可见过渡,颜色与交互样式对齐 Ableton Live 观察。位置变更实时应用,释放或拖到极端位置不重置。
- Automation 模式(A)下拖动卡片,该位置的全部 Automation 内容一起移动;拖动 Automation 映射时高亮所有可作为目标的组件。
- 拖动 Pattern/Clip 时保持抓手光标,悬停文字不得切成文本选择光标。点击 Pattern/Clip 不打开别的面板。M 键切换轨道编辑模式。
- 时间线使用默认箭头(不是十字);点击高亮所选位置,Space 从该处播放;只在播放期间显示长播放光标。跟随模式:播放头到画布中心附近开始滚动,播放头停在中心、轨道在下方移动。
