# Browser

`BrowserPanel` 接收 `BrowserLabels`。组合根负责国际化，不在面板里创建第二个 i18n 实例。

`useBrowser` 持有搜索、来源历史、类型筛选、展开、排序、收藏，以及每个来源上次选中的资源。默认不选资源。筛选隐藏选中项时不删除记录，恢复筛选后恢复选择。来源切换重置类型，不清空搜索。

`BrowserPanelHandle.focusSearch()` 供组合根的 Cmd/Ctrl+F 使用，重新聚焦选中旧查询以便替换。树支持方向键、Home、End 和 Enter；Space 交给窗口走带命令。焦点和资源选择独立：有结果时，当前来源上次聚焦且仍可见的行（否则第一行）是唯一 tabIndex=0，树容器为 -1；Tab 和方向键只移动焦点，不自动选择资源，Enter 或点击才选择。筛选或来源切换不会自动选择，也不会抢走搜索框或来源导航的焦点。无结果时树容器为唯一树 Tab 入口，重置筛选命令仍可独立到达。其他行、拖拽源、展开按钮与收藏按钮不进入 Tab 链。方向键移动焦点后 Tab 直接离开树。导航 listbox 也只让当前来源进入 Tab 链。

搜索框 Escape 清空查询，等待结果提交后聚焦当前来源的有效 roving 行。有结果时不聚焦 tabIndex=-1 的树容器；只有清空查询后仍无结果才聚焦树。随后 Tab 继续前往 Browser 后面的控件，不回到窗口开头，也不选择资源。

SEC-04 原生键盘回归位于 `index.test.tsx` 的 `search Escape restores the committed roving row and Tab proceeds to the next sibling`，覆盖有匹配和无匹配查询的 Escape 恢复。运行 `bun test src/project/sections/browser/index.test.tsx --timeout 30000`；恢复错误树焦点的变异运行 `bun src/project/sections/browser/verification/mutations-r1c.mjs SEC04`，均从 `apps/gpuix` 执行。

`renderBody` 提供 navigation 和 results 插槽。默认 `BrowserSplitBody` 复用共享 Group、Panel 与 PanelDivider，导航宽度连续变化，分隔条可访问名称经 `BrowserLabels.resizeNavigation` 注入。外层 Browser 折叠时应保留组件挂载，让共享 Group 保存列表宽度和局部选择。

`catalog.ts` 是原型文档批准的只读演示目录，来自 Web `browserData.ts`。界面明确标注演示数据，不读取本地文件、不加载插件，也不接受资源放置。资源 Ghost 复用 `DragPreviewArea`。将来接真实素材库时替换 catalog 这一处。

列表复用 `ui/controls/ListRow`。实际窗口验证与 Live 对照见相邻 Footer 的交付报告和 `evidence/`。
