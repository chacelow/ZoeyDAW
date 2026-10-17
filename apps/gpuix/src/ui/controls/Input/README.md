# Input 与 InlineEdit

## 外观与尺寸

`Input` 使用同一原生编辑器，通过 `variant` 选择 `outline`（默认，完整边框）、`filled`（muted 底色，无边框）、`ghost` / `borderless`（同一无边框透明外观，hover/focus 才铺底色）或 `underline`（仅底边框）。所有变体支持 invalid、disabled、readOnly；invalid 在无边框变体使用 destructive 环，原生 focusVisible 显示焦点环。

`size` 为 `default`、`transport`、`small`：default/small 高度读取默认 control track，transport 直接读取 transport control track；small 使用 track-pad，其余使用 `design.input.paddingInline`。颜色、hover 混色、圆角与描边均由主题拥有。

`leading` / `trailing` 接收 React 内容并放进共享 IconSlot。搜索使用 `<Input leading={<Icon name="Search" />} clearable clearLabel={labels.clearSearch} />`，不另建 SearchInput。`clearable` 必须配调用方本地化的 `clearLabel`；X 清空时同时调用 `onValueChange("")` 与 `onChange`，随后焦点归还原生 input。readOnly 不显示清除操作，disabled 不允许清除。

## 只读与禁用

所有 Input 变体及 InlineEdit/DragPad 编辑框都用原生 `readOnly` 拒绝输入，不用 JS 按键拦截。只读保留原生选择/复制，`theme.caret="transparent"` 隐藏插入符；请求的 cursor 为 `design.cursors.default`。disabled 同时禁用 autoFocus、移出 Tab 顺序、移除 focusVisible 环，内部 input 设 `pointerEvents="none"`，wrapper 保留 disabled cursor；一个无事件处理器的透明 hit-opaque 层阻挡原生编辑器点击与选择。禁用控件不触发文字 hover tooltip。

当前固定 renderer 的 `input.rs` 仅支持 `readOnly`，不支持 disabled/editable；原生 TextEditorState 内部强制 IBeam，caret 绘制也不检查 read_only。因此只读的箭头 cursor 目前只能声明在样式中，实际内部指针仍受原生 IBeam 限制；caret 通过原生 theme 透明色隐藏。后续 renderer 补丁应让 read_only 不画 caret 且使用 Arrow，并新增 disabled（禁止聚焦、选择，使用 not-allowed）属性，从而删除禁用 hit 层。本轮不改 vendor。

`InlineEdit` 接受 `value/onCommit`，只在编辑期间保存草稿；静止时通过 TruncatedText 显示文字，点击、Enter 或 F2 挂载 ghost Input 并全选。Enter 提交、Escape 丢弃草稿且归还显示字段焦点；失焦提交但不抢走目标控件焦点。disabled/readOnly 不能开始编辑。已有 TrackNameInput、ClipNameEditor 与 MarkerNameInput 只迁移到 ghost 外观，保留各自工程事务、空名称过滤与 epoch 校验。

## 键盘契约

基于 gpuix `6a5c7c142ac32f9eb0caefe0121be995cfc18631`。`Input` 保留原生编辑 action 的优先级，不把编辑器已消费的按键补发到窗口。

| 按键 | 所有者与行为 | 本轮证据 |
| --- | --- | --- |
| 可打印字符和 Space | 可编辑 Input 接收文字，`stopTextShortcutPropagation` 阻止窗口播放与工程快捷键收到该事件。不调用 `preventDefault`，原生文字输入仍执行 | 输入 `abc`、Backspace、Space 后值为 `ab `，窗口未收到字符或 Space |
| Left、Right、Home、End、Backspace、Enter | 原生 Input action 移动插入点、删除或提交，事件不到 Input 的 JS `onKeyDown`，也不到窗口 | `abc` 经 Left 与 Backspace 变为 `ac`。Home、Right、字符插入和 End 后得到 `axbcy`，Enter 提交该值 |
| Cmd-Z、Ctrl-Z | 原生 Input 撤销文字，不触发工程撤销 | `ac` 经 Cmd-Z 恢复 `abc`，`ab` 经 Ctrl-Z 恢复 `abc`，窗口未收到撤销键 |
| Tab、Escape、Up、Down、Cmd-S、Ctrl-S | 单行 Input 没有消费这些原生 action，wrapper 也不消费，事件继续到窗口 | 原生测试逐键核对 Input 与窗口收到的 key |
| readOnly、disabled 下的可打印键 | 原生编辑器拒绝改值；readOnly 保留文本焦点 lease 和文字快捷键隔离，disabled 不取得 lease、不隔离 | 原生编辑器回归覆盖只读选择与解锁后的替换 |

原生绑定的完整范围见 [`input.rs:191–260`](https://github.com/remorses/gpuix/blob/6a5c7c142ac32f9eb0caefe0121be995cfc18631/packages/native/src/custom_elements/input.rs#L191-L260)：

- Enter、Shift-Enter、Backspace、Delete、Left、Right、Home、End 及对应的选择变体。
- Cmd 组合的行首、行尾、文档首尾与删除操作。
- macOS 的 Alt 单词移动与删除，其它平台使用 Ctrl。
- Cmd 或 Ctrl 的 A、C、X、Z、Shift-Z。V 是否绑定取决于原生 paste 配置。
- 多行编辑器还绑定 Up、Down 及其选择变体。

上表实测的单行按键之外，完整绑定列表只核对了固定版本源码。当前没有共享 Textarea 组件或 textarea 调用方，没有新增未使用的 API。

`onKeyDown` 消费者回调先执行，随后 wrapper 执行可打印键隔离。`onValueChange` 与 `onChange` 保留原生编辑结果。焦点外观使用原生 `focusVisible`，不持有 React 焦点状态或采样器。

回归入口：`bun test src/ui/controls/Input src/platform/keyboard`。变体、清除、行内提交/取消与只读行为见 `variants.test.tsx`；数值编辑框使用同一文字键隔离函数，见 `DragPad/DragPadNumber.test.tsx` 的播放快捷键回归。
