# Input 键盘契约

基于 gpuix `6a5c7c142ac32f9eb0caefe0121be995cfc18631`。`Input` 保留原生编辑 action 的优先级，不把编辑器已消费的按键补发到窗口。

| 按键 | 所有者与行为 | 本轮证据 |
| --- | --- | --- |
| 可打印字符和 Space | 可编辑 Input 接收文字，`stopTextShortcutPropagation` 阻止窗口播放与工程快捷键收到该事件。不调用 `preventDefault`，原生文字输入仍执行 | 输入 `abc`、Backspace、Space 后值为 `ab `，窗口未收到字符或 Space |
| Left、Right、Home、End、Backspace、Enter | 原生 Input action 移动插入点、删除或提交，事件不到 Input 的 JS `onKeyDown`，也不到窗口 | `abc` 经 Left 与 Backspace 变为 `ac`。Home、Right、字符插入和 End 后得到 `axbcy`，Enter 提交该值 |
| Cmd-Z、Ctrl-Z | 原生 Input 撤销文字，不触发工程撤销 | `ac` 经 Cmd-Z 恢复 `abc`，`ab` 经 Ctrl-Z 恢复 `abc`，窗口未收到撤销键 |
| Tab、Escape、Up、Down、Cmd-S、Ctrl-S | 单行 Input 没有消费这些原生 action，wrapper 也不消费，事件继续到窗口 | 原生测试逐键核对 Input 与窗口收到的 key |
| readOnly、disabled 下的可打印键 | wrapper 不宣称正在编辑，不消费文字键。原生编辑器拒绝改值 | 强制聚焦测试中输入 `a space`，值不变，事件到达窗口 |

原生绑定的完整范围见 [`input.rs:191–260`](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/src/custom_elements/input.rs#L191-L260)：

- Enter、Shift-Enter、Backspace、Delete、Left、Right、Home、End 及对应的选择变体。
- Cmd 组合的行首、行尾、文档首尾与删除操作。
- macOS 的 Alt 单词移动与删除，其它平台使用 Ctrl。
- Cmd 或 Ctrl 的 A、C、X、Z、Shift-Z。V 是否绑定取决于原生 paste 配置。
- 多行编辑器还绑定 Up、Down 及其选择变体。

上表实测的单行按键之外，完整绑定列表只核对了固定版本源码。当前没有共享 Textarea 组件或 textarea 调用方，没有新增未使用的 API。

`onKeyDown` 消费者回调先执行，随后 wrapper 执行可打印键隔离。`onValueChange` 与 `onChange` 保留原生编辑结果。焦点外观使用原生 `focusVisible`，不持有 React 焦点状态或采样器。

回归入口：`bun test src/ui/controls/Input src/platform/keyboard`。数值编辑框使用同一文字键隔离函数，见 `DragPad/DragPadNumber.test.tsx` 的播放快捷键回归。
