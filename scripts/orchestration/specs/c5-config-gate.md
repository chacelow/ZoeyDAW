# C5：统一配置门禁

契约：`docs/architecture/configuration.md`「门禁」一节。C1–C4 已全部合入 `gpuix-migration`（C4 是 `b1d48530`）。

拥有路径：`scripts/gpuix-review-scan.mjs`、`tooling/eslint/**`，以及它们的测试（`scripts/verification/*.test.mjs`、eslint RuleTester）。

## 要做

1. 在 review scan 和/或 eslint 加 HARD 规则，作用于产品代码。排除：tests、`verification/`、`demo`、`gallery`、`locales/`、主题数据文件本身（`shared/theme/**` 的 JSON/数据源，以及 `project/defaults/**` 模板）。
   - 颜色字面量：`#rgb`/`#rrggbb`、`rgb()`/`rgba()`/`hsl()`/`oklch()` 等出现在样式值或 props 里。
   - 样式数值字面量：style 对象里的尺寸、间距、圆角、边框、字号、透明度、时长写成裸数字（`0`、`1`、`"100%"`、`flexGrow: 1` 这类结构值允许，规则要说清楚允许列表和理由；契约里标为 C 组的协议常量用行内注释豁免，格式要能被检查器识别）。
   - JSX 文本和 aria 英文字面量：JSX 里的英文文本、`aria-label`/`label`/`title`/`placeholder` 的英文字符串字面量。
   - 能用 eslint 做的优先用 eslint（有作用域和 AST）；review scan 只补 eslint 做不到的（跨文件或非 TS 文件）。不要两边重复实现同一条规则。
2. 每条规则配正反例回归（RuleTester 或 scan 的 CLI 测试），并做变异（关掉规则，正例就不该再报）。
3. 在全仓跑一遍。目标是 0 HARD。残留项不要自己去改业务代码：按文件归属列表 ask 给我，我来分派到对应 lane。规则本身有误报的，修规则。
4. 更新 `docs/architecture/configuration.md`「门禁」一节：写清实际落地的规则、允许列表和豁免写法。

## 验收

- 新规则的回归与变异全部通过；全仓扫描结果和残留清单附在报告里。
- 按 `common.md`：本地只跑轻量检查（相关 eslint/scan 测试 + 全仓 eslint）；报告 `tooling/eslint/C5-REPORT.md`；自审后发 merge_ready。
