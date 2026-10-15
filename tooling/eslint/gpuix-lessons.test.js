import { describe, it } from "vitest"
import { RuleTester } from "eslint"
import * as parser from "@typescript-eslint/parser"
import { gpuixLessons } from "./index.js"

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
})
const src = "/repo/apps/gpuix/src"

tester.run("architecture/gpuix-lessons", gpuixLessons, {
  valid: [
    // Frame-driven code is the sanctioned path.
    {
      filename: `${src}/project/sections/arrangement/tracks/meter/telemetry.tsx`,
      code: 'import { useAnimationFrame } from "@/platform/frame"; useAnimationFrame(() => {})',
    },
    // Allow-listed wall-clock delays.
    {
      filename: `${src}/ui/controls/Toaster/index.tsx`,
      code: "setTimeout(() => {}, 4200)",
    },
    {
      filename: `${src}/project/adapters/backend/mock.ts`,
      code: "setInterval(() => {}, 16)",
    },
    // Tests, verification harnesses and demos may drive time.
    { filename: `${src}/ui/panels/panels.test.tsx`, code: "setTimeout(() => {}, 0)" },
    {
      filename: `${src}/project/sections/arrangement/lane/verification/render-cost.tsx`,
      code: "setTimeout(() => {}, 0)",
    },
    { filename: `${src}/project/sections/footer/demo.tsx`, code: "setTimeout(() => {}, 0)" },
    // Outside the gpuix app the rule is inert.
    { filename: "/repo/apps/web/src/x.ts", code: "setInterval(() => {}, 32)" },
    // A local function that merely shares the name is still a timer-shaped call; an unrelated property is not.
    { filename: `${src}/app/x.ts`, code: "const appearance = renderer.getWindowAppearance()" },
  ],
  invalid: [
    // The 32ms focus poll removed from useDividerDrag (fabe4fb) must not come back.
    {
      filename: `${src}/ui/panels/useDividerDrag.ts`,
      code: "const timer = setInterval(checkFocus, 32)",
      errors: [{ messageId: "jsTimer" }],
    },
    {
      filename: `${src}/project/sections/arrangement/lane/LaneOverlay/index.tsx`,
      code: "globalThis.setTimeout(tick, 16)",
      errors: [{ messageId: "jsTimer" }],
    },
    {
      filename: `${src}/app/settings/theme-mode.ts`,
      code: 'renderer.setWindowAppearance("dark")',
      errors: [{ messageId: "appearanceOverride" }],
    },
  ],
})
