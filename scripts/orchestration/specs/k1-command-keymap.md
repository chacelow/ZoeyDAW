# K1：命令注册表、声明式 keymap 与默认消费

## 依据

`docs/reviews/2026-10-16-zed-compare/README.md` 与 `input.md` 的第一优先项。现状（已查证）：

- 窗口快捷键写死在 `apps/gpuix/src/project/sections/arrangement/timeline/keyboard/controller.ts` 的 if 分支里（约 20 个键：Cmd+S、Space、B、Cmd+Z/Shift+Cmd+Z、Cmd+1/2/4、Escape、Home、M、A、Z/X/C/V、左右方向键、电脑 MIDI 音符键）。目标靠 `app/project/composition.ts` 用 text lease、keystrokeId 和 if 顺序推断。
- 共享控件处理过的键要各自 preventDefault/stopPropagation，漏一处就冒泡到窗口 owner。2026-10-16 审查的 UPA-05/06/07、ARR-04 都是这类问题。
- 菜单项和提示里的快捷键文字是独立字符串，和实际绑定没有关系。

Zed 的做法（具名 action、声明式 keymap、上下文谓词、action 默认消费）不能直接用 Rust API 迁移；本切片在 TS 里做等价的最小层，不重建原生焦点系统。

## 范围

拥有路径：`apps/gpuix/src/platform/keyboard/**`（新增命令与 keymap 层）、`apps/gpuix/src/project/sections/arrangement/timeline/keyboard/**`、`apps/gpuix/src/app/project/composition.ts`、`docs/architecture/gpuix-arrangement-composition.md` 的键盘一节。共享控件的键处理（`ui/controls/**`）只在第 3 项范围内改，其它 section 不改。

1. **命令注册表**：`CommandId`（字符串字面量联合类型，例如 `project.save`、`transport.togglePlay`、`edit.undo`），每个命令有标题的 i18n key 和处理函数。处理函数返回 `handled | pass`。
2. **声明式 keymap**：一份数据（TS 常量，后续可换 JSON），每条绑定是 `{ keys, command, context }`。`context` 是小的谓词集合（例如 `text`、`menu`、`clip-editor`、`timeline`、`computerKeyboard`），从 composition 已有的焦点判断算出，不再用 if 顺序表达优先级。同一个键在不同上下文绑定不同命令时，由 keymap 的上下文条件决定，冲突在注册时检测并抛错（带回归）。
3. **默认消费**：窗口 owner 和共享控件的键处理统一经过一个 helper：命令返回 `handled` 时自动 preventDefault + stopPropagation；只有返回 `pass` 才继续冒泡。Space 在工具栏/Transport 按钮上的现有规则（不吞 Space，播放由窗口 owner 执行）保持不变，见 `LESSONS.md` 与组合契约。
4. **迁移**：把 `timeline/keyboard/controller.ts` 里的全部现有快捷键迁成 keymap 条目，删除 if 分支，不留双路径。按住 B 临时绘制、电脑 MIDI noteOn/noteOff、epoch 变化释放这些有状态的行为保留在原 owner 里，作为命令的处理函数实现。
5. **快捷键文字**：菜单和提示里显示的快捷键从 keymap 读取（`formatKeys(command)`），删除重复的字符串。只改已有显示快捷键的地方，不新增命令面板（那是后续项）。

不做：用户可编辑 keymap 文件、命令面板、renderer 级焦点身份。报告里写清楚这几项的后续入口。

## 验收

- 行为不变：现有键盘相关测试全部通过，不改断言；ARR-04、UPA-05/06/07 的回归和变异照样全部被抓。
- 新回归：keymap 冲突检测；同一键在 text/menu/clip-editor/timeline 上下文分别解析到正确命令或放行；命令返回 handled 时事件不再到达窗口（用真实 window keyboard 组合断言）；菜单显示的快捷键随 keymap 改变而改变。每项一个变异。
- 删除检查：`timeline/keyboard/controller.ts` 里不再有 `key === "…"` 形式的快捷键分支（有状态行为的内部键除外，报告里逐条说明）。
- 组合契约文档更新键盘 owner 一节，描述命令、keymap、上下文与默认消费。
- `pnpm verify:gpuix` 通过；先发 merge_ready，复核合入后再发 worker_done。前台真实键盘输入验收写进报告，由协调者统一做。
