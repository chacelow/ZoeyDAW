# WindowKeyboard

应用组合根为每个 `render()` 创建一个 `createWindowKeyboard()` 实例。把 `keyboard.rootHandlers` 展开到 `render` 的根选项，并用 `WindowKeyboardProvider value={keyboard}` 包裹 section。接线示例在 `src/main.tsx`，后续 app-shell 替换入口时保留这两处。

section 通过 `useWindowKeyboard()` 取得同一实例，在 effect 中订阅并返回清理函数：

```tsx
const keyboard = useWindowKeyboard()
useEffect(
  () =>
    keyboard.subscribe("keyDown", event => {
      if (event.key !== "space" || event.isHeld) return
      event.preventDefault()
      togglePlayback()
    }),
  [keyboard, togglePlayback]
)
```

- `subscribe("keyDown" | "keyUp", listener)` 返回幂等取消函数。卸载 section 时取消订阅。
- 监听按注册顺序运行。`defaultPrevented` 为 true 时不再分发给后续订阅，避免同一键执行两个 section 命令。
- 原生事件先经过元素和祖先处理，再到窗口根。元素的 `stopPropagation()` 或 GPUI action 可以阻止事件到达窗口根。
- `WindowKeyEvent` 是 platform 拥有的最小结构类型。platform 不 import `@gpuix/*`，也不拥有 renderer 或全局键盘单例。
- `ui` 不 import 此模块。通用控件经 props 或它们的环境端口接收应用能力。

从仓库根运行 `bun --hot scripts/gpuix-main/probe.mjs`，向探针窗口发送 Space。日志应出现 `windowKeyDown`、`windowKeyUp`，AX 文本变为 `Window key: space`。验证后立即结束该进程。
