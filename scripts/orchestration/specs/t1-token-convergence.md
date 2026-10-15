# T1：业务实例的形状与间距收敛到统一 token 入口

## Target

新 worktree，基于当前 `gpuix-migration`。目标：业务代码（`app/**`、`project/sections/**`）不再自行拼圆角、边框和间距，一律通过 `theme.design`（`@/shared/theme/design-tokens`）或共享组件取值，为将来在设置里自定义留一个清晰入口。不改产品行为，也不改 `ui/**` 与 `shared/**` 的公共接口；如果需要新增 design token，先 ask。

## 已知违规点（主干 ce3b851 实测，逐条处理）

| 位置 | 现状 | 方向 |
| --- | --- | --- |
| `app/window/UnsavedCloseDialog.tsx:31-35` | `gap*3`、`padding: gap*4`、`borderRadius: gap`、`borderWidth: 1` 手拼浮层外壳 | 改用 `theme.design.popover` 的 radius/borderWidth/inset/gap；如果 `app/dialog/ModalDialog` 已有外壳，改为复用它 |
| `app/router/RouteErrorBoundary.tsx:105-106` | `padding: gap*2`、`borderRadius: gap` | 同上，用 popover 或 card(sm) 语义 |
| `app/home/HomePage.tsx:47,53` | 根容器 `gap*3`、`padding: gap*4` | 用 `theme.design.spacing.rootInset` 与 `cardGroupGap`（Card 已是 project 尺寸，不要回退） |
| `app/settings/SettingsDialog.tsx:91,124` | section `gap*2`；ToggleGroup 轨道 `borderRadius: control-gap` | 用 `theme.design.settings.*` 与 `theme.design.shape.controlRadius` 或 `toggleRadius` |
| `app/settings/ThemePresetGrid.tsx:76-77,106` | 色板 `borderRadius: control-gap`，line 106 `borderRadius: control-track` | 用 `design.shape` 的对应语义；确认 106 是否本意是圆形指示器 |
| `app/router/NotFoundPage.tsx:18` | `track-gap*2` | `theme.design.spacing.stackGap` 或 settings 的 headerGap，按语义选 |
| `project/sections/arrangement/timeline/rulers/index.tsx:265` | `paddingLeft: track-pad*2` | 查明语义，用已有 token；没有合适的就 ask |

范围外：`clip-edit/pattern/PatternSteps.tsx`（剪辑编辑器 worker 正在重写，由它自行处理）；1px 描边与 `borderRadius: 0` 是规范允许的（ui-standards 第 14 条）。

## 必做

1. 逐条改掉，并在报告里列出「前 → 后」的值。像素可以变化，但必须是向 token 收敛的结果，并说明每处的视觉差异。
2. 用离屏 `createTestRoot`、`captureScreenshot` 截 Home、Settings 外观页、未保存关闭对话框、路由错误详情、NotFound、timeline 标尺，深浅两套主题，前后对比亲自查看；截图放仓库外。
3. 全仓 grep 复核：`app/**`、`project/sections/**` 下没有 `borderRadius` 取 ≥2 的字面量或 control metric 本身，也没有对 spacing token 做 `* N` 乘法（PatternSteps 除外）。命令和输出写进报告。
4. 至少一条行为测试或像素回归，覆盖「改 `theme.design` 的某个值，对话框外壳随之变化」（证明入口是真的），再做一个变异（改回字面量），测试应失败。
5. 交付前跑 `pnpm verify:gpuix`，先 merge_ready，复核合入后再 worker_done。
