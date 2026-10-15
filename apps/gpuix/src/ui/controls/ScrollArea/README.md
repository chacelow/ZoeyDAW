# ScrollArea

`orientation="horizontal" wheelToHorizontal` 将没有 deltaX 的纵向滚轮事件映射到原生横向偏移。默认关闭；纵向与 both 容器不使用该映射。Ctrl 或 Meta 组合滚轮保留给宿主命令。有原生 deltaX 时不重复处理，仍走原生滚动。

数值子控件以原生 `pointerEvents="auto"` 消费自己的滚轮，祖先不再平移。调用方只声明意图，不复制事件逻辑。

Tab 聚焦使用 `theme.colors.ring` 的 1px 内嵌 outline（offset −1），不占布局、不改变 scroll offset；区域自身关闭原生 keyboard focus dim。该设置不继承到子控件：每个子控件仍拥有自己的 focusVisible 与 keyboardFocusDim 策略，列表行不应因焦点落在滚动容器而压暗内容。

原生 GPU 回归解码截图像素，检查聚焦前后内容区不变、边缘出现 ring；同时保留现有滚轮与数值子控件回归。headless 帧不证明物理鼠标或键盘行为。

原生行为测试覆盖 opt-in/default/vertical、有 deltaX、Ctrl/Meta 和数值子控件隔离。验证命令：在 apps/gpuix 执行 `bun test src/ui/controls/ScrollArea/index.test.tsx`。

变异检查由 Footer 的统一验证工具运行，结果记录在 Footer/VERIFICATION.md，不在控件中保留测试用分支。
