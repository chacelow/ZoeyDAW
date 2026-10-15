# D1 renderer-integration:把应用依赖切到固定主干自建的 gpuix

## Target

Worktree `gpuix-d1-renderer-integration`(子 worktree,基线 `gpuix-migration`)。

## 背景

`docs/architecture/gpuix.md` 的「渲染器版本决策」已采纳:固定 `remorses/gpuix` `6a5c7c142ac32f9eb0caefe0121be995cfc18631` 自建,构建入口 `scripts/gpuix-main/build.sh`,报告 `docs/research/gpuix-main-build.md`。目前 `apps/gpuix/package.json` 仍是 npm `@gpuix/native@0.10.0` / `@gpuix/react@0.10.0`。B2 的时间线/Clip 车道/键盘等切片依赖主干才有的能力(窗口级根键盘事件 `onKeyDown`/`onKeyUp`、`onLayout`、`getElementsAt`、`registerFont`、关闭拦截 PoC)。本切片完成**依赖切换**,让后续切片都在同一个渲染器上开发。

## Change

1. 阅读 A6 报告「消费者兼容」与「自建的持续成本」两节,采用其已验证的接法(消费者副本把 `@gpuix/native`、`@gpuix/react` 链接到 vendor 包,`react` 同样链接避免两份 React)。
2. 在仓库内落成**可复现且单一 owner**的方案:`@gpuix/react` 内部仍 import `@gpuix/native`,所以必须统一包解析(pnpm `overrides`/`link:`/workspace 包二选一,选最小且可复现的),不能出现两份独立 renderer。选择及理由写进 `docs/research/gpuix-main-build.md` 末尾「集成」一节。
3. 构建产物放在 `/Volumes/PSSD/code/_vendor` 之外**不**进仓库;仓库里只存:固定 SHA、构建脚本、解析配置、THIRD_PARTY_NOTICES(保留上游 Apache-2.0 许可与 notice)。`pnpm install --frozen-lockfile` 在干净 checkout 上必须有明确的前置步骤文档(先跑 `scripts/gpuix-main/build.sh`),并在缺失产物时给出清晰报错而不是难懂的模块缺失。
4. 清除旧的补偿:`ui/panels` 与既有代码里为缺 `onLayout` 写的测量采样(A4)改为 `onLayout` 事件;A3 还没合入,**不要碰 `ui/controls`**。每处替换后该处只保留一种 owner,不留两套。
5. 把窗口级键盘根选项(`onKeyDown`/`onKeyUp`)接入应用的 render 入口约定(`apps/gpuix/src/main.tsx` 目前是原型入口,先在 `shared/` 或 `platform/` 提供一个注入式 `WindowKeyboard` 订阅 API,供各 section 订阅;不要在 `ui` 层 import 它)。

## Constraints

- 拥有路径:`apps/gpuix/package.json`、根 `package.json`/`pnpm-workspace.yaml`(仅依赖解析相关)、`scripts/gpuix-main/**`、`docs/research/gpuix-main-build.md`、`apps/gpuix/src/ui/panels/**`(仅去测量采样)、`apps/gpuix/src/platform/**`(WindowKeyboard)、`THIRD_PARTY_NOTICES`。
- **新增 npm 依赖/改 workspace 解析属于需批准项**——方案定了先 `orca orchestration ask` 给出具体 diff 与理由。
- 不改 `crates/**`(原生端口属别的切片)、`ui/controls/**`、`project/**`。
- 不 push,不碰 `main`,不碰其他 worktree。进程清理规则同 common.md(强制)。

## Observable acceptance

- 干净构建后:`apps/gpuix` 的 `tsc --noEmit`、`bun test`(全部已有测试)、`pnpm exec eslint apps/gpuix/src` 全部通过(贴命令与计数)。
- 四个已有 demo(`features/*/demo.tsx`)与 A4 的面板画廊在自建渲染器下真实窗口运行,`computer` AX/截图各一次,验证完立刻关闭。
- 一个小探针证明主干能力确实在用:订阅 `onKeyDown` 窗口键盘事件并收到 Space;`onLayout` 取得一个文字容器宽度。附输出。
- 报告列出:所选解析方案及备选的取舍、`pnpm install --frozen-lockfile` 的前置步骤、升级到下一个主干 SHA 的步骤清单。
