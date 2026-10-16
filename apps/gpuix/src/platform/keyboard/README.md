# WindowKeyboard

应用组合根为每个 `render()` 创建一个 `createWindowKeyboard()` 实例。把 `keyboard.rootHandlers` 展开到 `render` 的根选项，并用 `WindowKeyboardProvider value={keyboard}` 包裹 section。接线示例在 `src/main.tsx`，后续 app-shell 替换入口时保留这两处。

section 通过 `useWindowKeyboard()` 取得同一实例，在 effect 中订阅并返回清理函数。项目窗口命令由 timeline keyboard 唯一执行，订阅者用 `consumeKey(event, owner.down(event) ? "handled" : "pass")` 统一消费，不另写快捷键条件链。

## 命令与 keymap

- `CommandId`：稳定命令 id 的字面量联合；`COMMAND_IDS` 可枚举所有命令。
- `createCommandRegistry(handlers)`：为每个 id 注册 `commands.${id}` 的双语标题 key 与返回 `handled | pass` 的 handler。handler 的业务状态和资源仍归原 owner。
- `DEFAULT_BINDINGS` / `DEFAULT_KEYMAP`：唯一默认数据与已检测冲突的 map；`COMPUTER_NOTE_KEYS` 给持续 MIDI 音符命令提供半音参数。
- `createKeymap(bindings)`：每行 `{ keys, command, context }`。`Mod` 匹配 Ctrl 或 Cmd（包含同时按下），`Shift?` 允许有或无 Shift，其它修饰键必须完全匹配。
- `KeyboardContext`：互斥 `focus`（text/menu/control/timeline/clip-editor），加 `computerKeyboard`、`browserSearch` 两个当前谓词。context 条目未声明的谓词不限制；同键修饰键与上下文有交集即构造失败，不依赖绑定行顺序。
- `keymap.resolve(event, context)`：返回 `CommandId | undefined`，已 defaultPrevented 的按键不解析。
- `keymap.formatKeys(command)`：从同一份绑定格式化既有提示或菜单快捷键；没有绑定时返回空文字，不造虚假快捷键。
- `consumeKey(event, result)` / `CommandResult`：来自无依赖 `shared/keyboard` 叶子，platform 重导出，ui 直接 import shared。handled 同时阻止默认和传播，pass 不改变事件。文本 shortcut isolation 不属于命令，仍保留原生默认输入。

不包含用户文件读取、命令面板或 renderer 级焦点身份。未来分别以 `createKeymap`、注册表的命令定义、composition 的上下文输入为入口。

- `subscribe("keyDown" | "keyUp", listener)` 返回幂等取消函数。卸载 section 时取消订阅。
- 监听按注册顺序运行。`defaultPrevented` 为 true 时不再分发给后续订阅，避免同一键执行两个 section 命令。
- 原生事件先经过元素和祖先处理，再到窗口根。元素的 `stopPropagation()` 或 GPUI action 可以阻止事件到达窗口根。
- 窗口回调不是 capture，不能阻止已经运行的元素 handler。DAW Button 自身不得用 Space 激活或吞掉它；输入组件应对可打印键停止冒泡。`preventDefault()` 可以取消随后执行的 Tab 默认导航，但不能撤销 Button 已执行的操作。
- `WindowKeyEvent` 是 platform 拥有的最小结构类型。platform 不 import `@gpuix/*`，也不拥有 renderer 或全局键盘单例。
- `ui` 不 import 此模块。通用控件经 props 或它们的环境端口接收应用能力。

从仓库根运行 `bun --hot scripts/gpuix-main/probe.mjs`，向探针窗口发送 Space。日志应出现 `windowKeyDown`、`windowKeyUp`，AX 文本变为 `Window key: space`。验证后立即结束该进程。

`keyboard-native.test.tsx` 在真实 `createTestRoot` 中挂载共享 `Button` 与 `Input`，用 `nativeSimulateKeystrokes` 检查 Button 聚焦时 Space 不改变激活状态且到达窗口订阅，Input 聚焦时 Space 不到达窗口订阅。测试直接锁住控件与窗口之间的事件契约，不在 WindowKeyboard 中替控件屏蔽键盘事件。

K1 行为回归：`bun test apps/gpuix/src/platform/keyboard`。在 `apps/gpuix` 执行 `bun src/platform/keyboard/mutations.mjs`：六个变异分别破坏冲突检测、上下文匹配、默认消费、菜单快捷键展示，以及 Popover/Menu 的 slotted Button 激活顺序，测试必须失败。
