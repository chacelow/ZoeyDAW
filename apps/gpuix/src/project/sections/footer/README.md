# Footer

`FooterPanel` 接收 `FooterLabels`、受控 `view` 和 `collapsed`。组合根持有标签与折叠状态，StatusStrip 消费同一份状态。

Affect Chain 与 Clip Edit 互斥，放在同一个底部面板。Affect Chain 高度取 `theme.project.footerDeviceHeight`，分隔条只折叠或展开，不自由改变高度。Clip Edit 的内容由 `renderClipEditor({ clip, track, close })` 注入，编辑器实现属于 B2-clip-editors。普通 Clip 选择不会切换标签或构造隐藏编辑器。关闭面板会卸载内容并取消未完成编辑。

Clip Edit 默认填满宿主 Panel，也可接收宿主测得的 `clipHeight`。可调高度由组合根的垂直 Group、Panel 与 PanelDivider 持有，Footer 不再给 Clip Edit 添加固定高度的二值分隔条。`demo.tsx` 按这一接口组合宿主，切换到 Clip Edit 后可连续调整高度。

轨道设备从 `useProjectState` 读取。添加、旁通、折叠、重排、删除和参数编辑走 `projectActions.updateTrack` 与 `useProjectEditGesture`，保留撤销、快照和过期编辑 token 检查。参数格式与解析遵循注入的 locale。

设备支持 Utility、Filter、Delay、Reverb。展示曲线是元数据投影，不是 DSP 遥测。引擎目前没有设备 DSP，界面保留范围说明。

曲线通过共享 `segmentsPath`、`polylinePath`、`cubicPath` 与 `Shape` 绘制，不手写 SVG。Filter 与 Reverb 的二次曲线精确转换为三次曲线，性质测试检查转换前后的几何一致。折叠标题采用原生逐字竖排并居中，英文不做整体旋转，原因是主干没有 rotate 或 writingMode。协调者已批准这一差异。Live 当前工程没有设备，设备卡外观只对照共享控件。

标题拖动重排在释放时提交。Esc、失焦、轨道变化和 `subscribeWindowActive` 失活会取消。方向键切换设备焦点，Alt+方向键重排，Delete 删除，Enter 折叠或展开。组合根必须注入原生窗口激活订阅。

`demo.tsx` 是四面板的原生验证入口，使用真实 project runtime 与 Rust 引擎。没有第二份工程数据，也没有模拟走带时钟。独立 demo 不创建 Clip；真实编辑器由应用组合根注入。意外出现 Clip 会使验证入口报错，不用占位编辑器冒充集成。

`verification/mutations.mjs` 重跑重排、走带和设备曲线纯函数的变异检查。`verification/measure.tsx` 记录原生测试渲染器的几何、保留节点和 draw 统计，读取前显式分发 onLayout 队列。真实窗口截图与测试渲染器数据分开记录。
