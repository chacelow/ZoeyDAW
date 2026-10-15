# B2-footer-browser-transport:Footer(Affect Chain)、Browser、Transport、StatusStrip

## Target

Worktree `gpuix-b2-footer-browser-transport`。迁移 `sections/FooterPanel/**`(737 行:EffectChain、DeviceCard、DeviceDivider、ParameterControl、DeviceDisplay、edit-devices)、`BrowserPanel/**`(885 行)、`TransportBar/**`(459 行)、`StatusStrip/**`(119 行)。`Clip Edit` 标签的内容由 B2-clip-editors 提供,你只提供 Footer 标签与面板容器、并留出可挂载的槽。

## 拥有路径

`apps/gpuix/src/project/sections/{footer,browser,transport,status}/**`。

## 要点(产品规则)

- Footer:标签切换 Affect Chain 与 Clip Edit,共用一个底部面板;Affect Chain **高度固定**,垂直拖动只折叠/展开,不自由改变高度。
- Browser/侧栏:子列表可以没有选中项,默认不选,但保留并恢复用户上一次选择;最左侧栏折叠时子列表保持固定宽度,不一起缩;左侧栏宽度连续变窄到限位,不是瞬时切换。所有列表(下拉列表、Browser 列表)遵循同一套项高、容器、卡片样式。筛选控件的激活指示与文字之间留间隙。
- Transport/Header:非中央控件不缩成三分之二(被否决);BPM 控件宽度刚好容纳三位整数加两位小数及小数点,无尾部空白;图标仅在强相关或消歧时使用;拍/小节之间用居中的斜杠而非分隔线,按各组含义选分隔符;播放时节拍器图标每拍左右摆动一次、交替填充侧;不在标题旁显示 ID;窗口变窄时区块不重叠,溢出自右向左隐藏并可横向滚动;Header 与标题栏与 Panel 同背景连成一个连续表面。
- 播放/录音/回到起点三个中央按钮保持标准控件尺寸,不放大。Space 控制播放且不触发已聚焦按钮。
- 数值/走带位置/时间读数取 C1 的真实遥测 clock,不造模拟时钟。
