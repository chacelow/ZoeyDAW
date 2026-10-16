import { describe, it, expect } from "vitest"
import { RuleTester, Linter } from "eslint"
import * as parser from "@typescript-eslint/parser"
import { gpuixConfigNumbers } from "./gpuix-config-numbers.js"
RuleTester.describe = describe
RuleTester.it = it
const filename = "/repo/apps/gpuix/src/ui/controls/Example.tsx"
const languageOptions = { parser, parserOptions: { ecmaFeatures: { jsx: true } } }
new RuleTester({ languageOptions }).run("gpuix-config-numbers", gpuixConfigNumbers, {
  valid: [
    { filename, code: "const model = {width: 640}; export {model}" },
    {
      filename,
      code: 'const x = <div style={{width:"100%", minWidth:0, borderWidth:1, flexGrow:1}} />',
    },
    { filename, code: "const x = <div style={{width:`100%`, marginLeft:+1, flexGrow:1}} />" },
    { filename, code: "const x = <div style={{marginLeft:-1, minWidth:0, borderWidth:1}} />" },
    {
      filename,
      code: "const x = <div style={{width:radius*2, height:2*radius, left:available/2}} />",
    },
    {
      filename,
      code: "const x = <div style={{height:theme.control.height, opacity:theme.design.states.disabledOpacity}} />",
    },
    {
      filename: "/repo/apps/gpuix/src/shared/theme/layout-tokens.ts",
      code: "const x = sx({height:70})",
    },
    {
      filename: "/repo/apps/gpuix/src/project/defaults/editor.ts",
      code: "const x = sx({height:70})",
    },
  ],
  invalid: [
    { filename, code: "const x = <div style={{height:24}} />", errors: [{ messageId: "literal" }] },
    {
      filename,
      code: "const style = {padding:8}; const x = <div style={style} />",
      errors: [{ messageId: "literal" }],
    },
    {
      filename,
      code: "export const buttonStyle = {padding:8}",
      errors: [{ messageId: "literal" }],
    },
    {
      filename,
      code: "const x = <div style={{height:24 as number}} />",
      errors: [{ messageId: "literal" }],
    },
    {
      filename,
      code: "const x = <div style={({height:24})!} />",
      errors: [{ messageId: "literal" }],
    },
    {
      filename: filename.replace(/\.tsx$/u, ".ts"),
      code: "const x = sx(<Style>{height:24})",
      errors: [{ messageId: "literal" }],
    },
    {
      filename,
      code: "const x = <div style={{width:`50%`}} />",
      errors: [{ messageId: "literal" }],
    },
    {
      filename,
      code: "const x = <div style={{borderTopLeftRadius:4, flexBasis:40, letterSpacing:0.5}} />",
      errors: [{ messageId: "literal" }, { messageId: "literal" }, { messageId: "literal" }],
    },
    {
      filename,
      code: "const height=24; const x = <div style={{height}} />",
      errors: [{ messageId: "literal" }],
    },
    { filename, code: "const x = sx({hover:{opacity:0.5}})", errors: [{ messageId: "literal" }] },
    { filename, code: "const x = sv({base:{fontSize:12}})", errors: [{ messageId: "literal" }] },
    {
      filename,
      code: "const x = <div transition={{duration:0.16}} />",
      errors: [{ messageId: "literal" }],
    },
    {
      filename,
      code: "const x = <div style={{height:Math.max(24, available)}} />",
      errors: [{ messageId: "literal" }],
    },
    {
      filename,
      code: 'const x = <div style={{width:"50%"}} />',
      errors: [{ messageId: "literal" }],
    },
    { filename, code: "const x = <div style={{width:2}} />", errors: [{ messageId: "literal" }] },
    {
      filename,
      code: "const x = <div style={{left:position+2, top:position-2}} />",
      errors: [{ messageId: "literal" }, { messageId: "literal" }],
    },
    {
      filename,
      code: "const x = <div style={{width:(position+2)*2}} />",
      errors: [{ messageId: "literal" }],
    },
    {
      filename,
      code: "const x = <div style={{height:trackHeight*20}} />",
      errors: [{ messageId: "literal" }],
    },
    {
      filename,
      code: "const x = <div style={{width:20}} /> // config-constant: legacy comment must not bypass policy",
      errors: [{ messageId: "literal" }],
    },
  ],
})
it("disabling the numeric rule lets the consumer-visible literal bypass the gate", () => {
  const linter = new Linter({ cwd: "/repo" })
  const config = severity => [
    {
      files: ["**/*.tsx"],
      languageOptions,
      plugins: { gate: { rules: { numbers: gpuixConfigNumbers } } },
      rules: { "gate/numbers": severity },
    },
  ]
  const code = "const x = <div style={{height:24}} />"
  expect(
    linter
      .verify(code, config("error"), { filename })
      .filter(item => item.ruleId === "gate/numbers")
  ).toHaveLength(1)
  expect(linter.verify(code, config("off"), { filename })).toHaveLength(0)
})
