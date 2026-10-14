# WindowKeyboard

应用组合根为每个 `render()` 创建一个 `createWindowKeyboard()` 实例。把 `keyboard.rootHandlers` 展开到 `render` 的根选项，并用 `WindowKeyboardProvider value={keyboard}` 包裹 section。接线示例在 `src/main.tsx`，后续 app-shell 替换入口时保留这两处。

section 通过 `useWindowKeyboard()` 取得同一实例，在 effect 中订阅并返回清理函数：

```tsx
const keyboard = useWindowKeyboard()
useEffect(
  () =>
    keyboard.subscribe("keyDown", event => {
      if (event.key !== "space" || event.isHeld || isTextOrMenuFocused()) return
      event.preventDefault()
      togglePlayback()
    }),
  [keyboard, togglePlayback, isTextOrMenuFocused]
)
```

`isTextOrMenuFocused` 与 `togglePlayback` 由 section 自身的焦点端口和业务命令提供，不是 WindowKeyboard 导出。输入框或菜单聚焦时，窗口订阅者必须先排除相应快捷键。

- `subscribe("keyDown" | "keyUp", listener)` 返回幂等取消函数。卸载 section 时取消订阅。
- 监听按注册顺序运行。`defaultPrevented` 为 true 时不再分发给后续订阅，避免同一键执行两个 section 命令。
- 原生事件先经过元素和祖先处理，再到窗口根。元素的 `stopPropagation()` 或 GPUI action 可以阻止事件到达窗口根。
- 窗口回调不是 capture，不能阻止已经运行的元素 handler。DAW Button 自身不得用 Space 激活或吞掉它；输入组件应对可打印键停止冒泡。`preventDefault()` 可以取消随后执行的 Tab 默认导航，但不能撤销 Button 已执行的操作。
- `WindowKeyEvent` 是 platform 拥有的最小结构类型。platform 不 import `@gpuix/*`，也不拥有 renderer 或全局键盘单例。
- `ui` 不 import 此模块。通用控件经 props 或它们的环境端口接收应用能力。

从仓库根运行 `bun --hot scripts/gpuix-main/probe.mjs`，向探针窗口发送 Space。日志应出现 `windowKeyDown`、`windowKeyUp`，AX 文本变为 `Window key: space`。验证后立即结束该进程。

`keyboard-native.test.tsx` 在真实 `createTestRoot` 中挂载共享 `Button` 与 `Input`，用 `nativeSimulateKeystrokes` 检查 Button 聚焦时 Space 不改变激活状态且到达窗口订阅，Input 聚焦时 Space 不到达窗口订阅。测试直接锁住控件与窗口之间的事件契约，不在 WindowKeyboard 中替控件屏蔽键盘事件。
