# apps/gpuix

原生 DAW 前端（gpuix 渲染，无 DOM、无 CSS）。改动前按范围读：

- 任何改动：[gpuix 架构与切片契约](../../docs/architecture/gpuix.md)，含硬规则、目录与依赖方向、完成定义。
- 可见界面：[gpuix UI 规范](../../docs/architecture/gpuix-ui-standards.md)，交付逐条回答其第 13 节。
- 工程状态与后端：`src/project/stores/README.md`、`src/project/adapters/README.md`。
- 纯计算（场景、命中、网格、缩放）：`src/project/sections/arrangement/core/README.md`。
- 共享控件与面板：`src/ui/controls/README.md`、`src/ui/panels/README.md`。
- 原生能力缺口先查 `crates/native`；Rust 能做的不在 TS 里绕。
