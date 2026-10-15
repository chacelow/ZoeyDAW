# F6：原生 aria-pressed / aria-checked

## 问题（已查证）

R1c 要把共享控件里硬编码英文的 on/off 名称（Button 的 on/off 后缀、PianoKeys、PatternSteps）改成用状态属性表达。但当前 renderer 不支持这两个状态：

- `packages/native/src/accessibility.rs` 只把 `aria-expanded`、`aria-selected` 映射到 GPUI，`aria-pressed`、`aria-checked` 被忽略。
- `packages/native/js/host.ts` 的 HostProps 和 `js/mutations.ts` 的属性白名单里也没有这两个。
- GPUI 自己已有 `aria_toggled(accesskit::Toggled)`（`zed/crates/gpui/src/elements/div.rs` 约 1381 行），只是没有接出来。

R1c 的诊断：活动 Button 的 AX 只有 role Button 和 label，没有 checked/value。

## 目标

renderer 新增两个宿主 prop，语义与 React DOM 一致：

- `aria-pressed?: boolean | "mixed"`、`aria-checked?: boolean | "mixed"`，映射到 `aria_toggled(Toggled::True/False/Mixed)`。
- 两个都给时以 `aria-checked` 为准（写进注释和测试），不新增其它 aria 属性。
- 字符串 `"true"`/`"false"` 是否接受，按现有 `bool_prop` 的处理方式保持一致，不另起一套解析。
- JS 侧类型写进 HostProps，白名单同步，属性被删除时状态清空（不残留上一次的值）。

## 实现与构建

- 新补丁 `scripts/gpuix-main/patches/aria-toggled.patch`，登记进 `config.json`，接在 `resume-frame.patch` 之后。
- 用独立的 vendor 根构建与测试（`GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f6-gpuix`），不碰共享 vendor；共享 vendor 由协调者在合入时重建。
- 不改 `apps/gpuix` 的业务控件。消费方接入由 R1c 做；你在分支里只放一个最小测试组件或测试来证明行为。

## 验收

- Rust 单测：true/false/"mixed"、两个都给时的优先级、未设置时没有 toggled、属性删除后状态清空。每项做变异。
- 真实 AX：后台窗口（`GPUIX_BACKGROUND=1`）里一个 role=button 带 `aria-pressed` 的元素和一个 role=checkbox 带 `aria-checked` 的元素，用 `computer` 读 AX，报告 macOS 实际暴露的属性（AXValue 或其它），切换后再读一次。截图/AX 原文放证据目录。如果 macOS 侧 AccessKit 对 Button 不暴露 toggled，照实报告，并给出可选做法（例如是否需要 role=switch / checkbox），不要自己改业务 role。
- 文档：`docs/research/gpuix-main-build.md` 补丁清单加一行。
- 按 `common.md` 自审，跑 `pnpm verify:gpuix`（用你的 vendor 根），发 merge_ready。
