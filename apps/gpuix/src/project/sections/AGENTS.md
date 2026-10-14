# apps/gpuix/src/project/sections

业务面板（Arrangement、Footer、Browser、Transport 等）。依赖只能向下：`sections → ui → shared`，可读 `project/model`、`project/stores`、`project/adapters`。

- 可见界面改动：先读 [gpuix UI 规范](../../../../../docs/architecture/gpuix-ui-standards.md)，交付按第 13 节逐条给证据；外观与交互以 Ableton Live 只读观察为准。
- 纯计算（命中、网格、缩放、fade、automation）调用 `arrangement/core`，不复制：[core README](arrangement/core/README.md)。
- 控件缺失或不够用先 ask，不在这里写第二套。
- Arrangement 的 `tracks`、`lane`、`timeline` 互不 import，只通过组合契约的 props/slot 组合，键盘按 owner 划分：[Arrangement 组合契约](../../../../../docs/architecture/gpuix-arrangement-composition.md)。
