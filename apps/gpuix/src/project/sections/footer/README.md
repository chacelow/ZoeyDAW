# Footer

`FooterPanel` 接收 `FooterLabels`、受控 `view` 和 `collapsed`。组合根持有标签与折叠状态，StatusStrip 消费同一份状态。

Affect Chain 与 Clip Edit 互斥，放在同一个底部面板。Affect Chain 高度取 `theme.project.footerDeviceHeight`，分隔条只折叠或展开，不自由改变高度。Clip Edit 的内容由 `renderClipEditor({ clip, track, close })` 注入，编辑器实现属于 B2-clip-editors。普通 Clip 选择不会切换标签或构造隐藏编辑器。关闭面板会卸载内容并取消未完成编辑。

轨道设备从 `useProjectState` 读取。添加、旁通、折叠、重排、删除和参数编辑走 `projectActions.updateTrack` 与 `useProjectEditGesture`，保留撤销、快照和过期编辑 token 检查。参数格式与解析遵循注入的 locale。

设备支持 Utility、Filter、Delay、Reverb。展示曲线是元数据投影，不是 DSP 遥测。引擎目前没有设备 DSP，界面保留范围说明。

标题拖动重排在释放时提交。Esc、失焦、轨道变化和 `subscribeWindowActive` 失活会取消。方向键切换设备焦点，Alt+方向键重排，Delete 删除，Enter 折叠或展开。组合根必须注入原生窗口激活订阅。

`demo.tsx` 是四面板的原生验证入口，使用真实 project runtime 与 Rust 引擎。没有第二份工程数据，也没有模拟走带时钟。独立 demo 不提供 Clip 编辑器；只验证未选 Clip 的空态，实际挂载由应用组合根完成。

`verification/mutations.mjs` 重跑重排与走带纯函数的变异检查。证据和验收记录随切片保存在本目录。
