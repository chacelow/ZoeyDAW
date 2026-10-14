# 错题与门禁候选

开工先扫本文；只记录可核实的故障、原因与对应实现，不把一次性偏好写成永久规则。2026-10-14 从既有项目规范整理，日期不是原故障发生时间。

## Panel active 外沿被裁切

- 错：用外沿 ring、box-shadow 或 outline 做 active。
- 对：保持外壳尺寸，只换现有边框颜色。具体宽度由共享度量配置决定，不在错题本固定另一份数字。
- 因：Resizable Panel/Group 内置 overflow 会裁掉外沿，产生部分边框残影。
- 见：`apps/web/src/components/panels/PanelShell/index.tsx`、[Panel 契约](docs/architecture/project-panels.md)。

## defaultSize 的单位

- 错：把 `defaultSize={18}` 当作百分比。
- 对：数值表达像素，百分比使用字符串。
- 因：react-resizable-panels v4 的尺寸 API 与早期写法不同。
- 见：`apps/web/src/pages/project/ProjectLayout.tsx`。

## 只改 CSS 不等于修改 Canvas 几何

- 错：覆写控件 CSS 高度后，认定轨道 resize、标题与命中范围也已同步。
- 对：从同一度量配置派生 CSS 和 JS 布局，检查两端的实际结果。
- 因：轨道几何过去来自 JS 常量，独立 CSS 覆写不能更新它；2026-10-14 页面探针确认共享控件与 scoped 轨道变体会分别响应。
- 见：`packages/ui/src/controls/metrics/`、`apps/web/src/pages/project/layout/`。

## 导入接口不应启动工程后端

- 错：在模块末尾 openBackend，导致首页导入 facade 就创建会话。
- 对：构造/配置只建立数据与 owner，运行视图显式取得 lease，最后释放时清理资源。
- 因：隐藏副作用把页面是否显示与后端生命周期分离，妨碍实例隔离和原生接入。
- 见：`apps/web/src/pages/project/adapters/runtime/`。

## 2026-10-14 底部视图的布局与输入回归

- 三个相邻 resizable Panel 中展开 Clip 会优先挤掉 Device。固定 Device 已移到 Group 外，连续 resize 只管理主区域与 Clip；二值 DeviceDivider 不争抢相邻 Panel。契约见 [底部布局](docs/architecture/project-panels.md)。
- MIDI fit 若在旧行高 DOM 上写 scrollTop，下一次 commit 会把音符移出可见区域。`useMidiViewport` 等新行高提交后再定位，并关闭浏览器滚动锚定；可见范围与源窗口切换由同目录测试覆盖。
- Clip 祖先无条件停止 keydown 会吞掉共享数值控件的预编辑输入；力度和琴键还曾吞掉项目 Undo。现在只拦截已消费的命令，输入框保留原生撤销。Clip Detail 与 MIDI 交互测试覆盖预编辑、控制焦点撤销、全局音符松键和拖动中撤销不消耗前一条历史。
- Audio Start/End 最初按 Live 的 Source 裁剪字段实现，实测却是独立播放标记：拖动不改变编排 Clip 的 startBar/lengthBars/sourceOffsetBars。已改为 audioSettings 内的 startMarkerBars/endMarkerBars，与 Loop Position/Length 和源边界三者互不影响。
- 音乐位置格式化对极小的十六分音符分量直接插值 Number，JS 对小于 1e-6 的数会转成科学计数法（如 `2e-8`），生成的字符串跳出 `\d+(?:\.\d+)?` 解析正则，往返直接变 NaN。改为用 `toFixed` 字符串裁剪尾随 0，不经过 Number→String 再转换。

重复出现的机械问题优先升级为 lint、类型或行为测试；升级后让本文链接权威规则，不复制第二套实现参数。当前具体门禁和运行命令见 [setup](docs/agents/setup.md)。
