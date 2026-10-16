# C 系列：统一配置迁移

契约：`docs/architecture/configuration.md`（必读）。盘点：`docs/reviews/2026-10-16-hardcode/{style-layout,text,behavior}.md`，每组都有 ID、全部位置、A/B/C 归类和建议归属。你只做分给你的那一节；跨路径改动先 ask。

公共要求：

- 盘点里分给你的每个 A/B 组都要处理：A 组改成读取已有来源；B 组在契约指定的来源里新建条目再改调用处。C 组不动，但在代码旁补一句为什么是常量（如果还没有）。不能处理的组在报告里逐条说明原因。
- 默认值保持现有数值，迁移前后界面和行为不变。用现有离屏截图入口对比迁移前后像素（`createTestRoot` 或各切片 verification 入口），关键组合截图字节或像素差为 0；有意的差异必须说明。
- 每个新来源条目至少有一个“改了来源，使用处跟着变”的回归（例如改 theme/layout/defaults 的某值后组件尺寸或行为随之改变），并做变异（使用处改回字面量时回归失败）。不写测源码文本的测试。
- 删除旧的局部常量与重复定义，不留兼容层。
- 交付前 `pnpm verify:gpuix`；先 merge_ready，复核合入后再 worker_done。

## C1：主题与布局来源（先做，其它切片依赖它）

拥有路径：`apps/gpuix/src/shared/theme/**`、`apps/gpuix/src/project/layout/**`、`docs/architecture/configuration.md`。

1. ThemeProvider 支持运行时覆盖 `design`、`layout`、`control`、`transportControl`、`project` 全部分组（完整对象受控传入，不做 partial 合并），删除绕过 context 直接读 JSON 的路径（`project/layout/track.ts` 等改为接收注入的几何）。
2. 新建 `layout` 分组：承接盘点 style-layout 第 1 类（面板与窗口约束）和第 7 类（编排/MIDI 几何与密度）中归到 layout 的条目；新建 theme 条目承接第 3、4、5、6、8 类（线宽、混色配方、透明度状态、字体字重、动效）。
3. 只建来源和 provider 能力，把 `shared/theme` 内部的字面量迁过去；业务调用处由 C2–C4 改。先发 merge_ready 让我合入，其它切片基于它。

## C2：样式与布局调用处

拥有路径：`apps/gpuix/src/ui/**`、`apps/gpuix/src/app/**`、`apps/gpuix/src/project/sections/{footer,browser,transport,clip-edit}/**`。等 C1 合入后同步主干再开始改调用处（之前可以先读盘点、写回归）。

盘点 style-layout 中位置落在你路径里的全部 A/B 组。

## C3：编排区样式布局与行为默认

拥有路径：`apps/gpuix/src/project/sections/arrangement/**`。同样等 C1 合入后改调用处。

盘点 style-layout 中落在 arrangement 的组，以及 behavior 第 2 类（网格与缩放）、第 3 类（手势、滚动、命中）、第 4 类（电平范围与衰减）里落在 arrangement 的组。行为默认值放 `project/defaults`（编辑策略）；与 C4 共用的文件先 ask。

## C4：文案与工程默认值

拥有路径：`apps/gpuix/src/app/locales/**`、`apps/gpuix/src/app/i18n/**`、`apps/gpuix/src/project/{model,stores,adapters}/**`、新建 `apps/gpuix/src/project/defaults/**`、`apps/gpuix/src/platform/settings/**`、`crates/native/src/settings.rs`。

1. 盘点 text 的全部 A/B 组：快照错误、默认工程名、轨道/标记/复制/fallback 名称、PanelShell id 暴露、单位与数值/时间格式。共享组件（`ui/**`）里的英文默认文案删除改由调用方注入：`ui/**` 不在你的路径，列出确切改动 ask，我批给你或转给 C2。
2. 盘点 behavior 第 1 类（工程/轨道/工作区初值）、第 5–8 类：建 `project/defaults` 工程模板（document/workspace/session/scene 的初值只有一份，消除 `core/scene.ts` 与 stores 的重复），用户可调的偏好进 settings。settings 的 Rust/TS 类型共用一份 schema（选一种生成方式，在报告里说明），加版本号与迁移。
3. Rust 侧（`crates/engine`、`crates/native/src/engine.rs`）的设备默认值与遥测周期按盘点归类：设备默认进 settings，协议常量保持并注释。

## C5：门禁

拥有路径：`scripts/gpuix-review-scan.mjs`、`tooling/eslint/**`。在 C2–C4 都合入后做：按契约“门禁”一节增加颜色字面量、样式数值字面量、JSX/aria 英文字面量的 HARD 规则，附正反例回归与变异；全仓应为 0 HARD，残留的报出来由协调者分派。
