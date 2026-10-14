# Browser

`BrowserPanel` 接收 `BrowserLabels`。组合根负责国际化，不在面板里创建第二个 i18n 实例。

`useBrowser` 持有搜索、来源历史、类型筛选、展开、排序、收藏，以及每个来源上次选中的资源。默认不选资源。筛选隐藏选中项时不删除记录，恢复筛选后恢复选择。来源切换重置类型，不清空搜索。

`BrowserPanelHandle.focusSearch()` 供组合根的 Cmd/Ctrl+F 使用。树支持方向键、Home、End 和 Enter；Space 交给窗口走带命令。

`renderBody` 提供 navigation 和 results 插槽。默认 `BrowserSplitBody` 复用共享 Group、Panel 与 PanelDivider，导航宽度连续变化。外层 Browser 折叠时应保留组件挂载，让共享 Group 保存列表宽度和局部选择。

`catalog.ts` 是原型文档批准的只读演示目录，来自 Web `browserData.ts`。界面明确标注演示数据，不读取本地文件、不加载插件，也不接受资源放置。资源 Ghost 复用 `DragPreviewArea`。将来接真实素材库时替换 catalog 这一处。

列表复用 `ui/controls/ListRow`。实际窗口验证与 Live 对照见相邻 Footer 的交付报告和 `evidence/`。
