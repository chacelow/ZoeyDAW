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
    // An unrelated renderer getter is not an appearance override.
    { filename: `${src}/app/x.ts`, code: "const appearance = renderer.getWindowAppearance()" },
    // Business surfaces may read design roles, 0/1 radii, and derive geometry from an inset token.
    {
      filename: `${src}/app/window/UnsavedCloseDialog.tsx`,
      code: "const s = { borderRadius: theme.design.popover.radius, padding: theme.design.popover.inset, gap }",
    },
    { filename: `${src}/project/sections/lane/x.tsx`, code: "const s = { borderRadius: 0 }" },
    {
      filename: `${src}/project/sections/footer/EffectChain/DeviceCard/index.tsx`,
      code: 'const s = { width: theme.control["--spacing-control-track"] + inset * 2 }',
    },
    // ui/** owns shape and is not a business surface.
    {
      filename: `${src}/ui/controls/Card/index.tsx`,
      code: "const s = { borderRadius: 8, gap: gap * 2 }",
    },
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
    // T1 cases that must not come back.
    {
      filename: `${src}/app/settings/ThemePresetGrid.tsx`,
      code: 'const s = { borderRadius: theme.control["--spacing-control-track"] }',
      errors: [{ messageId: "shapeLiteral" }],
    },
    {
      filename: `${src}/project/sections/clip-edit/pattern/PatternSteps.tsx`,
      code: "const s = { borderRadius: 2 }",
      errors: [{ messageId: "shapeLiteral" }],
    },
    {
      filename: `${src}/app/home/HomePage.tsx`,
      code: "const s = { padding: gap * 4, gap: gap * 3 }",
      errors: [
        { messageId: "spacingMultiple", data: { key: "padding" } },
        { messageId: "spacingMultiple", data: { key: "gap" } },
      ],
    },
  ],
})
