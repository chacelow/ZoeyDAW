import { describe, expect, it } from "vitest"
import { Linter, RuleTester } from "eslint"
import * as parser from "@typescript-eslint/parser"
import { gpuixConfigColors } from "./gpuix-config-colors.js"

RuleTester.describe = describe
RuleTester.it = it

const filename = "/repo/apps/gpuix/src/ui/controls/Example.tsx"
const languageOptions = { parser, parserOptions: { ecmaFeatures: { jsx: true } } }
const error = { messageId: "literalColor" }

new RuleTester({ languageOptions }).run("gpuix-config-colors", gpuixConfigColors, {
  valid: [
    {
      filename,
      code: "const x = <div style={{ color: theme.colors.foreground, hover: { backgroundColor: theme.colors.primary } }} />",
    },
    { filename, code: 'const x = <Icon color={theme.colors.foreground} fill="none" />' },
    {
      filename,
      code: 'const data = { color: "#fff", backgroundColor: "rgb(1 2 3)" }; const id = "#f00"',
    },
    {
      filename,
      code: 'const metadata = { color: "#fff" }; const data = { hover: metadata }; const x = <div data={data} />',
    },
    {
      filename,
      code: 'const filename = "art/#f00.png"; const error = "rgb(1 2 3)"; const content = "#fff"',
    },
    {
      filename,
      code: 'const x = <div id="#fff" title="hsl(10 20% 30%)" aria-label="rgb(1 2 3)" data-color="#000" content="oklab(1 0 0)" />',
    },
    {
      filename,
      code: 'const props = { id: "#fff", content: "rgb(1 2 3)", color: theme.colors.foreground }; const x = <Icon {...props} />',
    },
    {
      filename,
      code: 'const x = <div style={{ backgroundImage: "url(art/#f00.png)", cursor: "#fff" }} />',
    },
    {
      filename,
      code: 'const x = <div style={{ data: { color: "#fff" }, content: { fill: "#000" }, metadata: { stroke: "#aaa" } }} />',
    },
    {
      filename,
      code: 'const x = sv({ variants: { tone: { danger: { backgroundColor: theme.colors.destructive } } }, defaultVariants: { tone: "danger", color: "#fff" } })',
    },
    {
      filename,
      code: 'const options = { color: { "#fff": { backgroundColor: theme.colors.primary } } }; const x = sv({ variants: options, defaultVariants: { color: "#fff" } })',
    },
    { filename, code: 'let accent = "#f00"; const x = <div style={{ color: accent }} />' },
    {
      filename,
      code: 'const x = <div style={{ color: "#foo", backgroundColor: "rgb-logo.png" }} />',
    },
    {
      filename: "/repo/apps/elsewhere/src/Widget.tsx",
      code: 'const x = <div style={{ color: "#fff" }} />',
    },
    ...[
      "/repo/apps/gpuix/src/ui/controls/Example.test.tsx",
      "/repo/apps/gpuix/src/ui/controls/__tests__/Example.tsx",
      "/repo/apps/gpuix/src/ui/verification/Example.tsx",
      "/repo/apps/gpuix/src/project/sections/Example/demo.tsx",
      "/repo/apps/gpuix/src/gallery/Example.tsx",
      "/repo/apps/gpuix/src/app/locales/Example.tsx",
      "/repo/apps/gpuix/src/shared/theme/metrics/Example.tsx",
      "/repo/apps/gpuix/src/project/defaults/Example.tsx",
    ].map(excluded => ({
      filename: excluded,
      code: 'const x = <div style={{ color: "#fff" }} />',
    })),
  ],
  invalid: [
    ...["#abc", "#abcd", "#abcdef", "#abcdef12"].map(color => ({
      filename,
      code: `const x = <div style={{ backgroundColor: "${color}" }} />`,
      errors: [error],
    })),
    ...[
      "rgb(10 20 30)",
      "rgba(10, 20, 30, 0.5)",
      "hsl(10 20% 30%)",
      "hsla(10, 20%, 30%, 0.5)",
      "hwb(10 20% 30%)",
      "lab(50% 0 0)",
      "lch(50% 20 40)",
      "oklab(0.5 0 0)",
      "oklch(0.5 0.1 40)",
      "color(display-p3 1 0 0)",
    ].map(color => ({
      filename,
      code: `const x = <div style={{ color: "${color}" }} />`,
      errors: [error],
    })),
    {
      filename,
      code: 'const x = <Icon color="#fff" fill="rgb(1 2 3)" stroke={"#0008"} backgroundColor="hsl(1 2% 3%)" />',
      errors: [error, error, error, error],
    },
    {
      filename,
      code: 'const accent = "#f00"; const x = <div style={{ color: accent }} />',
      errors: [error],
    },
    { filename, code: 'const accent = "#f00"; const x = <Icon color={accent} />', errors: [error] },
    { filename, code: 'const x = <Icon {...{ color: "#fff" }} />', errors: [error] },
    {
      filename,
      code: 'const props = { color: "#fff" }; const x = <Icon {...props} />',
      errors: [error],
    },
    {
      filename,
      code: 'const props = { color: "#fff" }; const x = <Icon {...{ ...props }} />',
      errors: [error],
    },
    {
      filename,
      code: 'const base = { hover: { color: "#fff" }, active: { backgroundColor: "#000" }, focus: { borderColor: "#abc" } }; const styles = base; const x = <div style={styles} />',
      errors: [error, error, error],
    },
    {
      filename,
      code: 'const hoverPaint = { color: "#abc" }; const baseStyle = { hover: hoverPaint }; const x = <div style={baseStyle} />',
      errors: [error],
    },
    {
      filename,
      code: 'const buttonStyle = { focus: { stroke: "#abc" } }; const x = <div style={buttonStyle} />',
      errors: [error],
    },
    { filename, code: 'export const buttonStyle = { backgroundColor: "#abc" }', errors: [error] },
    {
      filename,
      code: 'const paint = { color: "#fff" }; const x = <div style={{ hover: paint, active: { ...paint } }} />',
      errors: [error],
    },
    {
      filename,
      code: 'const tones = { primary: "#fff" }; const x = <div style={{ color: tones.primary }} />',
      errors: [error],
    },
    {
      filename,
      code: 'const props = { style: { color: "#fff" } }; const x = <div {...props} />',
      errors: [error],
    },
    {
      filename,
      code: 'const styles = { hover: { active: { color: "#abc" } } }; const x = <div style={styles} />',
      errors: [error],
    },
    {
      filename,
      code: 'const x = <div style={{ color: ready ? "#fff" : "#000" }} />',
      errors: [error, error],
    },
    {
      filename,
      code: 'const x = sx({ hover: { color: "#fff" }, active: { color: "#000" }, focus: { color: "#abc" } })',
      errors: [error, error, error],
    },
    {
      filename,
      code: 'const x = sv({ variants: { tone: { danger: { backgroundColor: "#f00", hover: { color: "oklch(0.5 0.1 40)" } } } }, defaultVariants: { tone: "danger" } })',
      errors: [error, error],
    },
    {
      filename,
      code: 'const danger = { backgroundColor: "#f00" }; const options = { danger }; const variants = { tone: options }; const x = sv({ variants })',
      errors: [error],
    },
    { filename, code: "const x = <div style={{ color: `#fff` }} />", errors: [error] },
    {
      filename,
      code: 'const x = <div style={{ color: "#fff", hover: { color: "#fff" } }} />',
      errors: [error, error],
    },
  ],
})

it("stops reporting the same JSX color when the rule is switched off", () => {
  const linter = new Linter({ cwd: "/repo" })
  const code = 'const x = <Icon color="#fff" />'
  const config = severity => [
    {
      files: ["**/*.tsx"],
      languageOptions,
      plugins: { architecture: { rules: { "gpuix-config-colors": gpuixConfigColors } } },
      rules: { "architecture/gpuix-config-colors": severity },
    },
  ]
  expect(
    linter.verify(code, config("error"), { filename }).map(message => message.messageId)
  ).toEqual(["literalColor"])
  expect(linter.verify(code, config("off"), { filename })).toEqual([])
})
