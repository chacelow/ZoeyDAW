# Tooling / docs 只读审查

范围：构建与 renderer 身份校验、verify、review scan、UI map、doc routes、编排脚本、ESLint 自定义规则及测试、CI、根 manifest、lint-staged、Husky，以及指定入口、架构、setup、研究报告、README、CHANGELOG。

本次只读取代码和文档，未构建、安装、运行测试或启动窗口。`git diff -- <本切片路径>` 没有输出。以下审查当前实现，不把历史测试记录当成本次验证结果。未重复报告 R1、S1、F6 与正在处理的 F7。

## Findings

| id | sev | location | problem | evidence | suggested fix |
| --- | --- | --- | --- | --- | --- |
| TD-01 | P1 | `.lintstagedrc.json:3`；`scripts/gpuix-ui-map.mjs:127-131` | 预提交地图读取整个工作树，却把结果加入当前提交。完全未暂存的 TSX 文件能污染另一文件的提交，使 CI 对已提交源码运行 `--check` 时失败。 | 脚本第 25-29 行递归读取所有源码的磁盘内容，`--stage` 无条件 `git add` 地图。`.husky/pre-commit:69` 使用默认 lint-staged；已安装实现 `node_modules/lint-staged/lib/runAll.js:93-94` 默认 `hideUnstaged = false`，只隐藏 partially-staged 文件的未暂存部分。触发：A.tsx 的 testId 改动已暂存，B.tsx 的 testId 改动完全未暂存。提交 A 时地图含 B 的新 id，但 B 不在提交中。 | 从本次 index 生成地图，或可靠隔离全部未暂存内容后生成。加“已暂存 A + 完全未暂存 B”的提交行为回归。 |
| TD-02 | P2 | `scripts/gpuix-main/check.mjs:20-35` | manifest 只校验入口子集，遗漏入口实际加载的编译产物。缺失或被修改的 renderer runtime 能通过身份门禁。 | 当前 `.gpuix-main/packages/native/dist/host.js:1-3` re-export `host-runtime.js`、`mutations.js`、`renderer-state.js`，但 `outputs` 不含前者和后者。vendor `.gitignore:4` 忽略 dist，源码 diff / untracked 检查也看不到其变化。删除 `dist/renderer-state.js` 后，check 的文件读取和 hash 不访问它，`require.resolve('@gpuix/native/host')` 也只定位入口，不加载依赖；真正 import host 才报缺模块。修改它同样不改变 manifest。 | 对 native/React 所需的 dist 文件集合统一记录并校验，覆盖内部 JS 与类型依赖；加 runtime 文件修改、删除的身份门禁回归。 |
| TD-03 | P2 | `docs/agents/setup.md:9`；`scripts/gpuix-main/build.sh:29-35,65-75` | setup 称共享 vendor 已构建时 build.sh 不会重建，实际每个新 worker 初始化都会争用构建锁并重新运行全部生成步骤。 | 文档写“只校验并生成本 checkout 的 `.gpuix-main` 链接，不会重建”。脚本每次先取得 `.build-lock`，即使 pending patches 为空，仍执行 `bun install`、`bunx napi build`、native `build:js`、React `build`。两个 worker 按 setup 同时初始化时，一个直接报 “Another gpuix build owns …” 并退出；已存在产物也被再次写入。 | 对通过完整 source/output manifest 校验的 vendor 提供真正的 link-only 路径，实际重建仍由唯一 owner 持锁执行；同步 setup。 |
| TD-04 | P2 | `scripts/gpuix-review-scan.mjs:72-77` | skipped-test 硬门禁漏掉 `describe.skip(...)`，整组断言可以被关闭，scan 和 Bun test 仍正常退出。 | `.skip` 分支只有 `\b(it | test)\.skip\(`，describe 仅出现在 only 与 xdescribe 分支。把一个 suite 的 `describe(...)`改成`describe.skip(...)` 不产生 HARD finding；跳过 suite 本身不会让 Bun 失败。读取的 ESLint RuleTester 测试也不覆盖 scan 的这条检测。 | 纳入 describe.skip，并覆盖 Bun 支持的禁用调用形式；加 suite 级禁用与正常 suite 的扫描回归。 |
| TD-05 | P2 | `tooling/eslint/gpuix-layers.js:231-234`；`apps/gpuix/tsconfig.json:2-18` | DOM/浏览器全局门禁对 app/** 与 main.tsx 不生效，与整个 gpuix 应用的无 DOM 硬规则相反。 | LAYERS 没有 app 或根入口；找不到 layer 就 `return {}`，连 RUNTIME_GLOBALS 检查也不注册。测试没有 app/main 的 DOM 负例。app 的独立 tsconfig 未设置排除 DOM 的 lib，TypeScript 默认 DOM 类型还允许 `window.innerWidth`、`document.title`，tsc 不会补上该门禁。`gpuix.md:33` 明确“没有 DOM、没有 CSS”。 | 所有非测试 gpuix 产品源码都检查禁止的全局，依赖方向约束仍按层区分；补 app/main 负例。 |
| TD-06 | P2 | `scripts/gpuix-ui-map.mjs:57-59`；`apps/gpuix/src/project/sections/arrangement/lane/ClipCard.tsx:33` | UI 地图遗漏主 Arrangement Clip 选择器，`--check` 仍认为地图最新。 | ClipCard 的 host 用 `testId={\`${card.ghost ? "clip-ghost" : "clip-source"}-${clip.id}\`}`。生成器取第一个插值前的前缀，得到空串后 `if (!prefix) continue`。当前地图没有 clip-source 或 clip-ghost；实际 `LaneRow/LaneRow.test.tsx:83,89-90` 用这些 id 找 Clip。此文件不是被排除的 harness。 | 解析静态条件前缀，输出两个稳定 selector 模式；或维护明确的动态模式登记入口。为这个真实表达式加地图回归。 |
| TD-07 | P2 | `docs/architecture/gpuix.md:35` | 必读架构硬规则仍要求 waveform 用竖线 div，与当前唯一 quad-batch 路径冲突，会把后续实现与 review 引回已淘汰方案。 | 原文“waveform 用裁剪后的竖线 div”；本文第 3 行还声明冲突优先级。实际 `shared/waveform/PeakColumns.tsx:1-4,56-64` 上传 Float32Array 后返回 QuadBatch，没有逐列 div。`docs/architecture/rendering.md:12` 和 `CHANGELOG.md:11` 已说明波形、网格、预览音符走批绘制。 | 改写硬规则，区分交互 host 与批绘制几何，明确复用共享 PeakColumns/QuadBatch，不恢复第二条路径。 |
| TD-08 | P2 | `scripts/check-commit-scope.mjs:88-94`；`.husky/commit-msg:6` | commit-msg 把 scope 和正文中的普通单词当成 Conventional Commit 类型，拒绝正常单职责提交。 | 对整个 subject 使用 `\b(feat | fix | … | test | build | …)\b`，不匹配 `type(scope):` 结构，也不用已算出的 withoutScope。`fix(build): restore renderer output validation` 命中 fix 与 scope build；`test: cover native build failure` 命中 test 与名词 build。两者都会因 typeHits >= 2 退出 1，但各只有一种类型和一个职责。 | 只识别真实类型标记，不扫描 scope/正文的普通单词；加这两个合法标题与真正多类型标题的回归。 |

## Checked, no issue

- verify 的 shell 失败传播：开启 `set -euo pipefail`；renderer/scan/smoke 的 `| tail` 不吞左侧失败；tsc 是独立语句，不在 errexit 豁免上下文；native build 和 Bun test 显式处理非零退出。未发现已执行步骤失败后仍打印最终通过的路径。
- 受控 patch-prefix：临时 Git index 从固定 revision 顺序重建各前缀；实际 diff 必须精确匹配。普通检查要求全序列，仅 pending 模式允许前缀。没有只靠名字或数量放行额外源码修改的问题。TD-02 是编译产物集合问题，不是源码身份问题。
- 构建锁正常路径：原子 mkdir；取得后才设清理 trap；第二个构建失败不会删第一个的锁。中断残留锁已有处理文档，未把有意的 fail-closed 行为单独报错。
- CI 静态链路：macOS runner 与 time/stat 的平台参数一致；CI 显式设置 vendor/target，CI=true 分支允许非 PSSD target。缓存放 workspace 外本身不是失效证据。PR 用 base SHA，fetch-depth 0 提供 ancestry；push 用 before SHA。默认 runtime_shaders 不调用 metal。Rust pin 与研究记录一致。未确认 hosted-CI 的具体断点，也未运行远程 workflow 或证明 hosted GPU/音频能力。
- doc routes 当前 required 的九份文档有现有入口链接；相对链接与支持的 backtick 路径按入口归一化。没有把它未承诺覆盖全部文档本身列成缺陷。
- ESLint 已实现边界：relative/@/ 层解析、metrics 例外规范化、static import/re-export/literal import/require、局部 document 的作用域区分；SVG 字符串/模板与深相对导入修复；timer allowlist、appearance override、spacing 和 radius。读取三份 RuleTester 测试，未运行。TD-05 单列 app/main 缺口。
- orchestration：读取 start-worker、health-check、coordinator-tick、listen 完整控制流。当前本机实际存在 `-orca-workspaces-zoeydaw-<worktree>` session 目录，不把该约定误报为当前路径错误。固定用户路径、run 和 terminal 是本地运行配置，未仅因不可移植报缺陷。没有执行脚本，避免创建终端、发送消息或杀等待进程。
- README 的产品入口、workspace 与原生包路径符合代码。CHANGELOG 的十二补丁与 config 一致。LESSONS 的旧 Web 路径明确标注已删除，研究报告开头区分历史命令与当前入口，未把历史引用当 dead executable。
- quad-batch/run.sh、verify-bordered.sh 与 background-frame analyse：像素验证 fail-fast；present analyse 有意同时处理 baseline 的 fresh=false，未把分析器当作必须失败的验收 gate。

## 结论

1 项 P1，7 项 P2，未确认 P0。优先修 TD-01，避免部分提交产生与源码不一致的强制校验产物；其次补齐 TD-02 的产物身份集合。其余是门禁漏报/误报、UI 地图缺项和直接影响后续工作的规范漂移。
