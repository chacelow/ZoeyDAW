# L1 遗留产品删除验收

2026-10-16。本地实现提交 `886f4ca`、审查修复提交 `f3e6eff`。比较范围 `git diff --find-renames 886f4ca^ f3e6eff --`。没有 push、发布或触发远程 CI。

## 结果与边界

- gpuix 实际消费的 metrics、React-free i18n core/locales、logger 分别迁到 `shared/theme/metrics`、`platform/i18n`、`platform/log`。导入由 AST codemod 机械迁移，lane 两处只改 import。
- `apps/web`、`src-tauri`、`packages/**` 已删除。`git ls-files apps/web src-tauri packages | wc -l` 输出 `0`；`@zoeymind/` 在 `apps/gpuix` 内搜索无结果。
- `control-metrics.json` 直接导入，没有 CSS 生成物或漂移路径，删除 metrics 生成/check 命令。logger 只保留原 Node/native 分支，没有兼容 re-export。
- 经协调者批准，删除旧主题输入生成器与 Web token 映射；`ThemeColors` 直接声明字段，`presets.data.ts` 成为预设唯一数据源。没有改变预设值。
- 删除 Web/Tauri 根脚本、workspace 条目、ESLint 专属规则及测试、metal-fx patch。根目录及 gpuix 没有 CSS/SCSS/LESS 消费者，删除 Stylelint 配置与直接依赖、Tailwind formatter plugin、postcss-less/postcss-scss；Ultracite 与 ESLint 验收通过。

## 保持不变的快照

迁移前后分别导出 `JSON.stringify` 数据并计算 SHA-256；以下每项前后相同。metrics JSON 文件内容本身原样搬迁。日志固定 `Date.now=1700000000000`，覆盖五个级别、ANSI/JSON、prefix、多参数、脱敏与 sink；timestamps、Error/cause、过滤另由行为回归覆盖。

| 数据 | 前后相同的 SHA-256 |
| --- | --- |
| `CONTROL_METRICS`、`PROJECT_METRICS` | `ab03ab3daa935b6d722f719d4a2d467ef0999f95d0ee72f7aba7a213103bae42` |
| zh-CN、en-US core 完整资源 | `7f616abeebe1f5d93c70c6c9c94a75e89deef35d243c4eca960e09336fe8f606` |
| logger 输出与 sink 条目 | `b2252e75bb91354118bcf5b8926f2812b466e2138db7dd3c1f903056e1e83d35` |
| `PRESET_DATA`，另通过 `isDeepStrictEqual` | `5245d965f25707a6d018664bd3c558765d9a02222a122d2c15cd4fd4247618f7` |

## Lockfile 非删除变化

通过 `pnpm install --no-frozen-lockfile` 求解。语义比较原基线与最终 lockfile，新增 `packages` key 为 0，新增 `snapshots` key 为 0。除以下两条存活依赖边重新绑定外，存活 snapshot 的依赖版本未变；其余新增文本为已有块排序与删除直接消费者后的 `optional: true` 标记。

1. i18next 声明从旧 i18n 包搬到 gpuix，版本不变，协调者批准已有依赖转移：

```diff
# 删除 packages/i18n importer 中的声明
-      i18next:
-        specifier: ^24.2.3
-        version: 24.2.3(typescript@5.9.3)
# apps/gpuix importer
+      i18next:
+        specifier: ^24.2.3
+        version: 24.2.3(typescript@5.9.3)
```

2. 根 `vitest 4.1.10 → jsdom 30.0.1 peer` 仍消费 jsdom，已由 `pnpm why --recursive jsdom` 确认。两条目标版本都存在于原 lockfile，协调者准许 pnpm 默认去重：

```diff
# jsdom@30.0.1
-      '@csstools/css-syntax-patches-for-csstree': 1.1.8(css-tree@3.2.1)
+      '@csstools/css-syntax-patches-for-csstree': 1.1.15(css-tree@3.2.1)
# parse5@8.0.1
-      entities: 8.0.0
+      entities: 8.1.0
+    optional: true
```

3. 初次求解曾把 napi CLI 的 emnapi peer 从已有 1.9.2 去重为已有 1.11.2，协调者批准；删除样式工具后 pnpm 自动恢复原绑定，最终 diff 不再包含该变化。

复查命令 `git diff --histogram --unified=1 886f4ca^ f3e6eff -- pnpm-lock.yaml`。没有引入新库或新解析版本。

## 实际验证

| 命令或场景 | 结果 |
| --- | --- |
| worker 根目录 `pnpm verify:gpuix 886f4ca^` | 通过；tsc 0 errors，ESLint 0 warnings，80 architecture tests，1178 Bun pass、1 既有 todo、0 fail，UI map current |
| 同一 verify 的真实后端离屏 smoke | Home → project → resume first present 通过；nativePlaying=true，21 frames，结束 released idle |
| `cargo check --workspace`、`cargo test --workspace` | 通过，51 tests、4 suites |
| 迁回 logger/i18n 回归单独运行 | 9 pass、0 fail、28 assertions |
| redaction 变异 | 去掉 `key.toLowerCase()` 后 1 fail，`Password` 泄露被捕获；恢复原实现后最终全套通过 |
| `node scripts/check-doc-routes.mjs` | 9 required docs 全部链接且存在 |
| `node scripts/gpuix-review-scan.mjs 886f4ca^` | 48 source、12 test 文件，0 HARD、6 WARN，处置如下 |
| 两次本地提交 | Ultracite/lint-staged 门禁通过，未使用 no-verify |
| 干净 checkout | 本地 `git clone --no-local --single-branch` 建立无依赖临时 clone；按 setup 依次 build.sh → frozen install → native:build → verify:gpuix，全部通过，最终同为 1178 pass、80 architecture tests、0 HARD |

干净验收复用的是 setup 指定的固定 vendor 构建，不复制 worker 的 node_modules/native 产物。临时 clone、临时快照脚本及副本已清理。

## 原生窗口与 UI 第 13 节

`GPUIX_BACKGROUND=1 bun --hot src/main.tsx` 启动命名 service `l1-native-smoke`，pid 85035，窗口 `zoeydaw` 为 1280×800。AX 实测出现 Settings、Open、New project、Untitled project、Notifications，证明迁入模块能够在真实原生应用加载。截图位于系统临时目录 `omp-computer-15a799183cfe5203.png`，被遮挡后内容全黑，不能用于视觉声明；拿到证据立即关闭 service，总运行约 21 秒。没有操作用户工程或已有窗口。

| 第 13 节项             | 证据与限制                                                         |
| ---------------------- | ------------------------------------------------------------------ |
| Gallery 与业务整体布局 | 本切片不改可见布局，Home AX 已验证；未做前台 Gallery 视觉验收      |
| 跨区域对齐与居中       | 无布局改动；黑色截图不证明对齐，未额外声明                         |
| 间距与内边距           | metrics 导出与原 JSON 字节不变，未改实例样式；未做前台目测         |
| 统一设计入口           | 本地 JSON 为单一 metrics 源，预设深比较一致                        |
| 尺寸与紧凑感           | 窗口 AX 为既有 1280×800；Live 对比不适用于纯所有权迁移，未重测     |
| 深浅主题与中英文       | 完整双语资源、预设数据一致；行为套件通过，未做四种组合前台视觉验收 |
| 状态与键盘             | 未改事件或焦点行为；既有原生行为测试随全套运行                     |
| 拖动、滚轮、弹层与性能 | 未改相关路径；真实后端 resume smoke 通过，不将其当作完整性能测量   |

本切片没有新增或修改 Live 产品规则，故不执行 Live 行为重采样。产品规则为保持既有值与文案，证据是快照、原生加载和回归；前台视觉仍由协调者统一评审。

## 自审结果

独立 `pstack-reviewer` 审查 `886f4ca^..886f4ca`，按 Standards 与 Spec 两轴检查；修复后复核 `886f4ca..f3e6eff`，结论为无尚存必修项。审查只读，没有把 reviewer 当作验证执行者。

| 发现 | 类别 | 处置 | 证据 |
| --- | --- | --- | --- |
| README 仍指向旧产品 | 必修 | 中英文入口改为原生初始化链与当前 owner | `f3e6eff` |
| 删除了有效 logger/i18n 行为回归 | 必修 | 迁回有效断言，i18n 首次初始化独立进程隔离；不迁原 React provider 或空转 API 形状测试 | 9项回归、变异、最终全套 |
| scan 漏掉 rename 目标 | 必修 | AM 改 AMR | 最终扫描48个 source |
| Footer Info 文案 owner 错误 | 记录 | 修正为组合根 app locales 注入 | `project-panels.md` |
| lockfile 两条既有版本边去重 | 汇报仲裁 | 确认 root vitest 仍消费，协调者批准 | 上述 diff、pnpm why |
| ci.yml 仍引用已删除路径 | 汇报仲裁 | 协调者明确本切片不改 workflow，交用户决策 | `.github/workflows/ci.yml:34-41,53-54` |
| presets.data.ts 2333行 | 记录，scan WARN | 既有纯预设数据表，仅头部变化；不拆分为人为碎片，不把文件从1000行以下推到以上 | 预设 deep equal |
| design-surfaces 六处裸尺寸 | 记录，scan WARN | 既有验证视口，只有 import 迁移，无产品尺寸改动 | `886f4ca` |
| main.tsx 两处窗口尺寸 | 记录，scan WARN | 既有窗口初始尺寸，仅 import 迁移 | AX 1280×800 |
| log/colors.ts 颜色字面量 | 记录，scan WARN | 终端 ANSI 配色，不是 UI theme；保持原日志字节 | 日志 hash |
| log/formatter.ts 颜色字面量 | 记录，scan WARN | 原 Node 日志文本配色，不引入 platform→theme 反向依赖 | 日志 hash |
| log/logo.ts 颜色字面量 | 记录，scan WARN | 原控制台启动标识，不是可见 UI 色值 | 静态 native 分支对照 |
| ignore 配置有旧目录条目 | 记录 | 无运行消费者，不扩大改动 | reviewer 复核 |

## 文档处置

没有删除仍有契约价值的文档。

| 文件 | 决定 |
| --- | --- |
| `project-panels.md` | 保留并改写为真实 gpuix 面板、布局、控件、JSON 度量契约；删除 DOM/CSS/react-resizable-panels 指南 |
| `rendering.md` | 保留并改写为 timeline/tracks/lane/core、QuadBatch、PeakReader 与原生遥测；保留已有恢复验证证据 |
| `modules.md`、`coordination.md`、`setup.md`、`product-prototype.md` | 当前 owner、命令、范围更新为 gpuix-only |
| 根 `AGENTS.md`、中英文 README | 删除旧只读参考路由与不可用入口，保留现行开发约定 |
| `gpuix.md`、theme/app/adapters README | 经批准更新 metrics、i18n 与直接维护预设的 owner |
| `gpuix-controls-ecosystem.md`、`gpuix-main-build.md`、`gpuix-rendering-alternatives.md`、`gpuix-migration.md`、`gpuix-platform-toolchain.md` | 保留历史研究，标明旧源码路径已删除，当前操作转到 setup |
| `engine-backend.md`、`engine-playback-graph.md` | 保留原验收证据，旧 Tauri 重启命令注明历史范围 |
| `LESSONS.md` | 历史正文不改，仅5条“见”中6个旧路径增加“已删除” |

## 错题

- 错：只扫描 AM 文件，重定位被 Git 识别为 R 后不再检查。对：扫描 AMR，只读新路径。因：文件迁移不是未改动文件。
- 错：移动实现时丢弃原有效测试。对：迁回消费者可见断言，首次初始化单例用独立进程。因：已有应用测试不覆盖所有 logger/i18n 边界。
- 错：把 APFS worktree 副本当作无依赖 checkout。对：从本地仓库 `git clone --no-local`，不携带忽略产物。因：工具创建的 worktree 副本可包含依赖残留。

## 已验证做法

- 用运行时导出快照比较 values/copy/log output，不把注释、格式化或路径变化混入行为比对。
- JSON 直接导入消除了 CSS 生成一致性问题，不保留空的 metrics check。
- Lockfile 按 packages/snapshots/存活依赖边分别比较；普通行 diff 的排序噪声不能证明新增库。
- 后台原生窗口用 AX 证明加载，遮挡黑图明确标为未验证；立即关闭自己的 service。

## 未实现与外部限制

`.github/workflows/ci.yml` 仍指向 web 与 src-tauri，删除后在远端会失败，待用户决定删除旧 jobs 还是改为原生 CI。协调者明确本轮不改，未触发远端流程。本地构建、测试、lint 与验收链不依赖旧目录。

交付前进程清理命令 `ps -axo pid,etime,command | grep -E "bun .*--hot|cargo run|gallery|demo"` 无匹配输出，grep 退出码1。没有残留验证窗口或后台 service。

## Lockfile optional 元数据补充

删除直接消费者后，93 个已有 snapshot 从必需改为 `optional: true`，没有版本变化；包括 `jsdom@30.0.1`、`stylelint@17.16.0(typescript@5.9.3)` 及其可选依赖链。原 `packages` 表1243项，最终847项。已有 `@phosphor-icons/core@2.1.1` importer/package/snapshot 的文本位置变化仅为 pnpm 排序，不是新增。典型实际 diff：

```diff
   '@asamuzakjp/css-color@6.0.7':
     dependencies:
       lru-cache: 11.5.2
+    optional: true
```

这类标记与两条经批准的版本边重绑分别统计，没有用文本插入行数代替依赖新增数。
