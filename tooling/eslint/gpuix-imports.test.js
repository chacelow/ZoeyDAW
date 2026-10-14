import { describe, it } from "vitest"
import { RuleTester } from "eslint"
import * as parser from "@typescript-eslint/parser"
import { gpuixImports } from "./index.js"

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
})
const src = "/repo/apps/gpuix/src"

tester.run("architecture/gpuix-imports", gpuixImports, {
  valid: [
    // 同目录与最多两层的相对导入保持相对。
    {
      filename: `${src}/ui/controls/Button/index.tsx`,
      code: 'import { x } from "./helper"; void x',
    },
    {
      filename: `${src}/ui/controls/Button/index.tsx`,
      code: 'import { x } from "../chrome"; void x',
    },
    {
      filename: `${src}/ui/controls/Button/index.tsx`,
      code: 'import { x } from "../../shared/theme/style"; void x',
    },
    // 别名导入。
    {
      filename: `${src}/ui/controls/Button/index.tsx`,
      code: 'import { x } from "@/shared/theme/style"; void x',
    },
    // 包导入不受影响。
    {
      filename: `${src}/ui/controls/Button/index.tsx`,
      code: 'import { icons } from "lucide"; void icons',
    },
    // 普通字符串与 JSX 属性不是 SVG。
    {
      filename: `${src}/ui/controls/Button/index.tsx`,
      code: 'const label = "Play the song"; void label',
    },
    { filename: `${src}/ui/controls/Button/index.tsx`, code: "const t = `Path ${1}`; void t" },
    // 测试文件不受限(夹具里要写字符串)。
    {
      filename: `${src}/ui/controls/Icon/Icon.test.tsx`,
      code: 'import { x } from "../../../shared/theme/style"; const m = "<svg></svg>"; void [x, m]',
    },
    // 仓库其他应用不受影响。
    { filename: "/repo/apps/web/src/a.tsx", code: 'const m = "<svg></svg>"; void m' },
  ],
  invalid: [
    {
      filename: `${src}/ui/controls/Button/index.tsx`,
      code: 'import { x } from "../../../shared/theme/style"; void x',
      output: 'import { x } from "@/shared/theme/style"; void x',
      errors: [
        {
          messageId: "deepRelative",
          data: { source: "../../../shared/theme/style", hops: "3", max: "2" },
        },
      ],
    },
    {
      filename: `${src}/project/sections/footer/a/b/c/index.tsx`,
      code: 'export { y } from "../../../../../../shared/model/types"',
      output: 'export { y } from "@/shared/model/types"',
      errors: [{ messageId: "deepRelative" }],
    },
    {
      // 保留引号风格。
      filename: `${src}/ui/controls/Button/index.tsx`,
      code: "import { x } from '../../../shared/theme/style'; void x",
      output: "import { x } from '@/shared/theme/style'; void x",
      errors: [{ messageId: "deepRelative" }],
    },
    {
      // 指向 src 之外的相对路径不自动改写成别名(别名只覆盖 src)。
      filename: `${src}/ui/controls/Button/index.tsx`,
      code: 'import { x } from "../../../../../../outside/x"; void x',
      output: null,
      errors: [{ messageId: "deepRelative" }],
    },
    {
      filename: `${src}/ui/controls/Icon/index.tsx`,
      code: 'const markup = \'<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>\'; void markup',
      errors: [{ messageId: "handWrittenSvg" }],
    },
    {
      filename: `${src}/gallery/controls.tsx`,
      code: 'const markup = `<svg xmlns="http://www.w3.org/2000/svg"><circle r="3"/></svg>`; void markup',
      errors: [{ messageId: "handWrittenSvg" }],
    },
    {
      // 只写 <path ...> 的片段也算手写 SVG。
      filename: `${src}/features/x/Curve.tsx`,
      code: 'const p = `<path d="${d}"/>`; void p',
      errors: [{ messageId: "handWrittenSvg" }],
    },
  ],
})
