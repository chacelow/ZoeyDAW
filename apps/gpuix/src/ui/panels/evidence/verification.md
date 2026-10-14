# A4 面板验收报告

2026-10-14。分支 `gpuix-a4-ui-panels`。仅新增 `apps/gpuix/src/ui/panels/**`，没有修改 theme、controls、project、crates 或依赖配置。

已按协调者要求 fast-forward 合并 `gpuix-migration` 到 `bcf85b7`，阅读更新后的 LESSONS 与 gpuix 架构规则。功能提交：

- `d51bf84`：约束布局求解器与纯函数测试。
- `79ef9ab`：原生组件、注入环境、画廊、组件测试与契约文档。

## 交付

公共入口包含 `Group`、`Panel`、`Separator`、`PanelShell`、`PanelDivider`、`CollapseDivider`、`PanelEnvironmentProvider` 及对应 props/句柄类型。组件契约见 [README](../README.md)。

纯函数覆盖像素/百分比混合、数值零、min/max、窗口缩放重排、固定面板、折叠阈值、反向拖回、非零 collapsedSize、相邻优先分配、邻居无法接纳折叠跳变与总尺寸守恒。原生组件测试覆盖捕获、方向键、Esc、元素焦点变化、命令式恢复、窗口信号注入、采样与拖动隔离，以及隐藏分隔条后的捕获结束。

## 实跑命令

除特别标明外，在 `apps/gpuix` 运行。

| 命令 | 结果 |
| --- | --- |
| 根目录 `pnpm install --frozen-lockfile --offline` | 通过，没有新增依赖 |
| 根目录 `pnpm native:build` | 通过，合并共享分支后再次构建 release 二进制 |
| `pnpm exec tsc --noEmit` | 通过 |
| `bun test src/ui/panels` | 29 pass，0 fail，2687 assertions |
| `bun test` | 60 pass，0 fail，2745 assertions，共 5 个测试文件 |
| 根目录 `cargo check` | 通过 |
| 根目录 `cargo test` | engine 21 pass，native 0 tests，doc-tests 0 tests；无失败 |
| 根目录 `pnpm exec ultracite fix apps/gpuix/src/ui/panels` | 通过 |
| 两次功能提交的原始 pre-commit | USER_CONFIRM_HASH 校验与 lint-staged 的 ultracite fix 均通过，没有 --no-verify |
| `bun --hot src/ui/panels/gallery.tsx` | 真实原生窗口、OS 事件、AX 与截图验证通过 |

Cargo 仍报告既有的 non-root profile 被忽略 warning。上述 Rust 结果来自已合并的共享分支，不是本切片新增 Rust 能力的证明。

## 真实窗口结果

拖动使用 computer foreground capture 或 `evidence/os-drag.swift` 的真实 CGEventPost，不使用 TestRenderer 来代替 OS 验收。Swift 工具记录窗口内真实 AX 状态。

| 场景 | 观察结果 |
| --- | --- |
| Browser 连续拖动 | 275px → 335px，拖动 delta 60px，跨出 7px 命中区仍跟踪 |
| Browser 方向键 | 275px → 285px → 275px |
| Browser 命令式折叠/展开 | 275px → 0px → 275px |
| Esc 取消 | Browser 275px → 365px 预览 → 275px，松手未重新应用预览 |
| Device 超过半高阈值 | 160px → 0px，OS 拖动 90px，固定展开高为 160px |
| Device 反向拖回 | 160px → 0px 预览 → 160px，松手保持 160px |
| Clip 展开和调整 | 0px → 160px → 220px，Device 的实际 AX 高度始终为 160px |
| Clip 折叠隐藏分隔条 | 160px → 0px，等待后仍为 0px；再次展开到 160px 后可拖到 220px |
| 真实窗口缩小/放大 | 外窗宽 1120px → 820px → 1120px，Browser 275px → 200px → 275px，无残留旧宽 |

截图保存在同目录的 `default.png`、`browser-resized.png`、`browser-collapsed.png`、`device-collapsed.png`、`clip-expanded.png`、`clip-resized.png`、`window-small.png`。最终隐藏分隔条回归在新启动的命名服务中实测，`clip-resized.png` 记录 Clip 220px、Device 160px。

## 明确未接入的能力

真实窗口失活到 Finder 后的回滚尚未接入独立画廊。gpuix 0.10.0 没有应用激活信号，onBlur 也未覆盖该路径；实际诊断中 Browser 435px → 525px 预览，切换到 Finder 后仍为 525px，不能把它称为通过。

协调者已把原生 `isApplicationActive()` 与共享订阅交给 A2。本切片按其确定的接口提供 `PanelEnvironmentProvider`，应用组合根注入 `subscribeWindowActive`。ui 不 import platform。假的外部窗口信号测试已证明失活回滚幂等、重复通知不二次回滚、之后的旧指针事件不再修改尺寸。真实原生订阅与组合根接线后的 Finder 端到端验证，由协调者后续集成，不在调整后的 A4 验收范围。

没有实现完整 react-resizable-panels API、DOM/CSS、docking 或业务 ProjectLayout 迁移；本切片只提供明确要求的子集与结构骨架画廊。

## 错题

### 0.10.0 没有 onLayout

- 错：依据主干能力描述直接使用 onLayout。
- 对：当前所有容器测量收敛到 `useElementSize`，升级后只替换这一处。
- 因：发布版 HostProps 与 EVENT_PROPS 没有该事件，主干才有 `.changeset/on-layout.md`。
- 见：`useElementSize.ts`；已得到协调者确认。

### onBlur 不代表完整焦点取消

- 错：只绑定 div 的 onBlur，认定窗口失活和 focusElement 都已覆盖。
- 对：元素焦点用 getFocusedElementId 检查，窗口失活由应用根注入原生订阅。
- 因：TestRenderer 中 getter 已改变但没有 blur 事件，真实 Finder 切换也没有回滚。
- 见：`useDividerDrag.ts`、`PanelEnvironment/index.tsx` 与窗口信号回归测试。

### 折叠导致分隔条消失会误触发取消

- 错：捕获节点隐藏后仍等待 mouseUp，焦点兜底把它当作取消并恢复展开尺寸。
- 对：分隔条隐藏/禁用时提交预览并完成手势；卸载也完成捕获清理。
- 因：节点消失后不再收到原生松手，旧焦点检查会恢复按下快照。
- 见：`a divider hidden by collapse finishes capture without reopening its panel`。修复前期望 0px 实得 160px，修复后通过；最终真实窗口也验证 160px → 0px 并可重新展开调整。

### 可见分隔条改变总高会缩放像素 Clip

- 错：所有面板都按新总高同比例重排。
- 对：数值 defaultSize 面板保留当前像素尺寸，百分比面板分配剩余空间。
- 因：Clip 展开后 7px 分隔条出现，最初 160px 被缩成 157px。
- 见：`reflowLayout` 与 pixel reservation 测试；画廊现为 160px，实际继续拖动到 220px。

### 原生 text 的多个文本子节点会分行

- 错：在 text 内混用多个字符串片段与插值，认为它们会像 DOM 文本一样连成一行。
- 对：状态标签使用一个完整 template string。
- 因：首次原生截图中状态栏与 Device 提示分成多行，压缩了布局空间。
- 见：`PanelGallery/index.tsx` 与最终截图。

### macOS 大小写不敏感的模块解析

- 错：入口 `gallery.tsx` 与组件目录 `Gallery` 并存，入口 import `./Gallery`。
- 对：组件目录改为 `PanelGallery`。
- 因：TypeScript 把该 import 解析回 gallery.tsx，报告大小写冲突和未导出符号。
- 见：当前 `gallery.tsx` 与 `PanelGallery/index.tsx`。

### 原生验证进程必须及时关闭

- 错：最初长时间保留 HMR 窗口，继续做实现和测试。
- 对：最终一轮使用 `a4-panels-final-smoke` 命名服务，收集回归截图后立即关闭。
- 因：常驻窗口占用宿主 GPU/内存，初次旧进程 PID 73882 由协调者清理。
- 见：最终 PID 9603 的服务已停止，持续 1m37s；desktop session 也已释放。

## 已验证做法

- 用两侧可行位移区间的交集选择一次 transfer，避免独立 clamp 导致丢像素或折叠挤破邻居 minimum。
- 同一节点接收 down/move/up，保存按下快照并按累计位移计算，原生越界拖动与采样隔离测试均通过。
- 固定 Device 在可调 Group 外组装。实际 Clip 从 160px 调到 220px 后，Device 的 AX 高度仍是 160px。
- Swift OS 驱动先核实窗口名和 PID，再通过 AX 将目标窗口置前。它直接读取预览和松手后的状态，能区分真实回滚与从未命中的假通过。

## 进程清理

实际运行 `ps -axo pid,etime,command` 并按请求的 `bun .*--hot|cargo run|gallery|demo` 正则过滤。下面只保留实际 bun/cargo runtime 行，排除了 Orca CLI 参数里引用 gallery 的误命中，不把调度参数写入公开仓库：

```text
95355       11:32 bun --hot src/ui/controls/gallery.tsx
A4 remaining: 0
```

这条 controls 进程属于其他切片，没有停止它。本切片没有残留 gallery/demo，命名服务已退出。
