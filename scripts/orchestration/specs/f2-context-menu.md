# F2:原生 onContextMenu(越过交互后代,只通知最近的作用域)

## 问题(已查证)

在嵌套的交互后代上右键,不会打开祖先的 ContextMenu。A3b 写了真实失败测试:Button 的 onMouseDown 收到 button=2,Context 的 onOpenChange 仍是 [];嵌套 NumericPad 同样打不开。主干基线唯一的失败测试 `secondary click on an interactive title opens its track context menu`(tracks)也是这个原因。

根因在 GPUI(vendor `zed/crates/gpui/src/window.rs` 869-905,以及 1090-1107 的 hit_test):

- 交互后代的 hitbox 是 `BlockMouseExceptScroll`(Button)或 `BlockMouse`(数值控件 auto),祖先 hitbox 因此 `is_hovered() == false`。
- gpuix 的 onMouseDown/onAuxClick 都用 `hitbox.is_hovered` 判定(`div.rs` 146-160 等),祖先永远收不到。
- `onMouseDownOutside` 要求点在父 bounds 之外,不能代替。

UI 层不能复制转发、伪造事件,也不能关掉后代的指针拦截。

## 目标

renderer 新增宿主 prop `onContextMenu(event)`:

- 触发条件:鼠标右键按下;macOS 上 ctrl+左键也算(先查 GPUI 是否已把它归一化成右键,有就沿用,不重复处理)。
- 命中:用元素 bounds 是否包含事件位置判定,不用 `is_hovered`。所以交互后代上的右键也能到达祖先。
- **只通知最近的一个**声明了 onContextMenu 的祖先(包含该点的最深元素),不广播给所有祖先。
- 不改变现有 onMouseDown、onClick、hover、滚动的语义;后代原有的右键 onMouseDown 照常收到。
- 被弹层或其它遮挡(例如 anchored 浮层盖住)的元素不应收到。查清 GPUI 用什么判断遮挡(content mask、层级),给出方案。
- payload 带窗口坐标 x/y(与 mouse 事件同源)、modifiers 和 keystroke 无关字段;JS 侧类型写进 `@gpuix/react` 的 HostProps。

## 停点

先读 vendor 的 `packages/native/src/renderer.rs`(mouse 事件注册约在 5700 行附近,有 BlockMouse 注释)和 GPUI 的 dispatch 顺序(capture 阶段从根到叶还是反过来),写方案后用 `orca orchestration ask` 汇报:实现位置、如何保证只命中最近一个、遮挡的处理、补丁大小。等 reply 再实现。

## 实现与构建

- 新补丁 `scripts/gpuix-main/patches/context-menu.patch`,登记进 `config.json`,接在已有补丁之后(H1 也在加补丁,合入顺序由协调者排定)。
- 用独立的 vendor 根构建与测试(`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f2-gpuix`),不碰共享 vendor;共享 vendor 由协调者在合入时重建。
- 消费方接入:`ui/controls` 的 ContextMenu 触发器改用 onContextMenu。这部分由 A3b 做,你只交付原生能力和类型;在你的分支里用一个最小测试组件证明行为。

## 验收

- GPUI 层的 `gpui::test`:嵌套 Button(BlockMouseExceptScroll)和 BlockMouse 后代上右键,祖先 onContextMenu 触发一次;两层祖先都声明时只有内层触发;左键不触发;bounds 外不触发;被浮层遮挡时不触发。每项做变异。
- TS 侧用 TestRenderer 的 `nativeSimulateClick(x, y, 2)` 复现 A3b 的失败场景并转绿。
- 文档:`docs/research/gpuix-main-build.md` 补丁清单;准备上游 PR 草稿(像 F1 那样)。
- 按 `common.md` 自审,发 merge_ready。
