# Footer

`FooterPanel` 接收 `FooterLabels`、内容类型 `view`、`onClose` 和窗口激活订阅。它只渲染内容并填满宿主，不再拥有折叠分隔条、固定高度或视图切换控件。

应用分别注册 `clipEditor` 与 `devices` 两个 Dock panel，默认在 Arrangement 下方同一 Tab 组中。激活、隐藏、关闭、自由调高与移组都由 DockLayout 管理；StatusStrip 只保留整体编辑区显隐按钮，不重复渲染 Clip Edit/Affect Chain 切换。Clip Edit 由 `renderClipEditor({ clipId, trackId, close })` 注入；只传身份，编辑器通过 adapter 读取唯一工程 owner，不把包含 notes 的 Clip/Track 大对象穿过 React props。普通 Clip 选择不会切换 Dock Tab；显式编辑请求激活 Clip Edit，关闭请求隐藏 Clip Edit。

移动、切换 Tab、最大化和隐藏保留面板内容的 React 身份；Dock 的关闭操作移除内容。Clip Edit 与 Affect Chain 都填满当前 Dock host 的可用高度。

轨道设备从 `useProjectState` 读取。添加、旁通、折叠、重排、删除和参数编辑走 `projectActions.updateTrack` 与 `useProjectEditGesture`，保留撤销、快照和过期编辑 token 检查。参数格式与解析遵循注入的 locale。

设备支持 Utility、Filter、Delay、Reverb。展示曲线是元数据投影，不是 DSP 遥测。引擎目前没有设备 DSP，界面保留范围说明。

曲线通过共享 `segmentsPath`、`polylinePath`、`cubicPath` 与 `Shape` 绘制，不手写 SVG。Filter 与 Reverb 的二次曲线精确转换为三次曲线，性质测试检查转换前后的几何一致。折叠标题采用原生逐字竖排并居中，英文不做整体旋转，原因是主干没有 rotate 或 writingMode。

标题拖动重排在释放时提交。Esc、失焦、轨道变化和 `subscribeWindowActive` 失活会取消。方向键切换设备焦点，Alt+方向键重排，Delete 删除，Enter 折叠或展开。组合根必须注入原生窗口激活订阅。

窗口激活订阅是必需输入，不提供静默降级。编辑器槽复用 `@/project/sections/clip-edit` 导出的 `ClipEditorSlot`，Footer 不定义或重导出副本。槽以 Clip ID 定界生命周期，切换 Clip 会卸载旧编辑器，防止局部选择和视口状态串用。

`app/verification/footer/demo.tsx` 是四面板的原生验证入口，使用真实 project runtime 与 Rust 引擎。没有第二份工程数据，也没有模拟走带时钟。
