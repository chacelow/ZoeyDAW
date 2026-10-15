# ScrollArea

`orientation="horizontal" wheelToHorizontal` 将没有 deltaX 的纵向滚轮事件映射到原生横向偏移。默认关闭；纵向与 both 容器不使用该映射。Ctrl 或 Meta 组合滚轮保留给宿主命令。有原生 deltaX 时不重复处理，仍走原生滚动。

数值子控件以原生 `pointerEvents="auto"` 消费自己的滚轮，祖先不再平移。调用方只声明意图，不复制事件逻辑。

原生行为测试覆盖 opt-in/default/vertical、有 deltaX、Ctrl/Meta 和数值子控件隔离。验证命令：在 apps/gpuix 执行 `bun test src/ui/controls/ScrollArea/index.test.tsx`。

变异检查由 Footer 的统一验证工具运行，结果记录在 Footer/VERIFICATION.md，不在控件中保留测试用分支。
