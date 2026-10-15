# B2-tracks:轨道表头、Mixer、路由、电平表

## Target

Worktree `gpuix-b2-tracks`(新建,基于 `gpuix-migration`)。迁移 `apps/web/src/pages/project/sections/ArrangementPanel/TrackHeader/**`(约 863 行,含 Row、TrackMixer、TrackRouting、TrackMenu、TrackIdentity/NameInput/AutomationSelector、GroupRails)与 `canvas/TrackMeter.tsx`、`canvas/painters/meter*.ts` 的**表头侧**电平表。

## 拥有路径

`apps/gpuix/src/project/sections/arrangement/tracks/**`。`features/track-mixer/**` 是早期原型:有价值的部分(已验证的拖动/ToggleButton 行为)迁入后删除该目录,不留两份。

## 要点(产品规则)

- 每条轨道是一个整体组件:左(标题/输入输出)、中(车道占位槽,由 clip-lane 切片填充)、右(轨道操作条);点击轨道高亮轨道内部,不是右侧操作条,两者高亮独立。
- 轨道 resize 以共享内部控件高度为步长(不连续),向上拖过阈值折叠、向下展开;折叠高度与操作控件纵向内边距同步;悬停高度拖柄只显示 resize 光标,不显示卡片底部指示。
- 折叠/展开的 Channel、MIDI、Audio、Send Channel、Master 视图与 Ableton Live 的可见/隐藏内容和分隔线一致(以真实 Live 观察为准,不凭文字描述猜);折叠时不残留多余内容也不丢必要分隔线。
- 表头无整体内边距;路由区、Mixer 区各自整体加内边距,路由控件与顶部间距与左右相当。所有轨道 Mixer 控件同宽;没有录音键的轨道留空位,不撑宽启用键;Solo/录音随 Mixer 布局变宽。
- Send 通道控件按三分之一宽列排布,多出的通道先横向填满再换行。
- MIDI 输入轨与音频轨一样有主音量与左右声道调整。
- 电平表:加宽;0 dB 顶部线,左右声道中线;>0 dB 红色,以下黄到绿渐变;峰值保持条跟随峰值再缓慢下落。**0 dB 线与声道分隔线使用卡片背景 token,呈镂空而非对比描边**。电平数据取 C1 的真实遥测 `levels`(未接通时显示静音地板,不造模拟值)。
- 分组轨道:展开的组不预览子轨(子轨已单独可见);折叠组隐藏子轨,组自身显示类似 minimap 的汇总;组轨在视觉上连通(含折叠),外框向下包住子轨,围栏条层级在轨道边框之上,高度分隔条不得截断组轨围栏。
- 轨道分隔边框画在最外层复合轨道上,不在车道内各画上下边;相邻轨道边框自然叠加。轨道区域上方留间隙,不贴顶。
- 轨道标题与其下方填充区使用该轨道对应颜色;折叠的音频轨标题上有深色淡入淡出遮罩,展开后隐藏。
- 数值居中;度量/间距统一取 token。
