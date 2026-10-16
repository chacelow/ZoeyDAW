# Browser

`BrowserPanel` 接收 `BrowserLabels`，包括应用注入的 `locale`、`formats` 和 `entries`。组合根负责国际化；面板不导入应用 i18n，也不创建第二个实例。

`useBrowser` 持有搜索、来源历史、类型筛选、展开、排序、收藏，以及每个来源上次选中的资源。初始类型、排序和收藏来自 `getPreference("browser")`；默认不选资源。筛选隐藏选中项时不删除记录，恢复筛选后恢复选择。来源切换重置类型，不清空搜索。搜索通过注入的 `normalizeSearch` 执行 Unicode NFKC 归一化和应用语言大小写转换；排序使用同一语言。

`BrowserPanelHandle.focusSearch()` 供组合根的 Cmd/Ctrl+F 使用，重新聚焦选中旧查询以便替换。树支持方向键、Home、End 和 Enter；Space 交给窗口走带命令。焦点和资源选择独立：有结果时，当前来源上次聚焦且仍可见的行（否则第一行）是唯一 tabIndex=0，树容器为 -1；Tab 和方向键只移动焦点，不自动选择资源，Enter 或点击才选择。筛选或来源切换不会自动选择，也不会抢走搜索框或来源导航的焦点。无结果时树容器为唯一树 Tab 入口，重置筛选命令仍可独立到达。其他行、拖拽源、展开按钮与收藏按钮不进入 Tab 链。方向键移动焦点后 Tab 直接离开树。导航 listbox 也只让当前来源进入 Tab 链。

搜索框 Escape 清空查询，等待结果提交后聚焦当前来源的有效 roving 行。有结果时不聚焦 tabIndex=-1 的树容器；只有清空查询后仍无结果才聚焦树。随后 Tab 继续前往 Browser 后面的控件，不回到窗口开头，也不选择资源。

`renderBody` 提供 navigation 和 results 插槽。默认 `BrowserSplitBody` 复用共享 Group、Panel 与 PanelDivider，导航宽度连续变化，分隔条可访问名称经 `BrowserLabels.resizeNavigation` 注入。外层 Browser 折叠时应保留组件挂载，让共享 Group 保存列表宽度和局部选择。

`catalog.ts` 只定义目录结构；应用的 `app/locales/browser-catalog.ts` 提供演示目录的显示元数据，经 `BrowserLabels.entries` 注入。37 个设备、75 个设备预设和 20 个独立资源的 132 个 ID 显式保留，不从翻译后的名称推导。名称和标签随应用语言切换，品牌及 `.wav`/`.mid` 文件基名不翻译；紫色集合为独立布尔元数据，收藏使用稳定 ID。界面明确标注演示数据，不读取本地文件、不生成假路径、不加载插件，也不接受资源放置。资源 Ghost 复用 `DragPreviewArea`。

行为回归见 `catalog.test.ts`（完整旧 ID 集、跨语言集合和文件基名）、`useBrowser.test.tsx`（真实 hook 的语言切换、搜索、选择与显示源注入）和 `app/i18n/display-formats.test.ts`（格式/解析/测量及创建名源跟随）。其中中文目录名称、标签和声像文字替换原来的英文显示，文本宽度因此随语言变化，不固定为英文像素宽度。
