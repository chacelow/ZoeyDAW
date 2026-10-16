import { describe, it } from "vitest"
import { RuleTester } from "eslint"
import * as parser from "@typescript-eslint/parser"
import { gpuixLayers } from "./index.js"

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
})
const src = "/repo/apps/gpuix/src"

function fixture(filename, code, errors) {
  return { filename, code, ...(errors && { errors }) }
}

tester.run("architecture/gpuix-layers", gpuixLayers, {
  valid: [
    ...["platform/keyboard/index.ts", "ui/controls/Button/index.tsx"].map(file =>
      fixture(`${src}/${file}`, 'import { consumeKey } from "@/shared/keyboard"; void consumeKey')
    ),
    fixture(`${src}/shared/keyboard/index.ts`, 'export type Result = "handled" | "pass"'),
    fixture(
      `${src}/ui/controls/Button/index.tsx`,
      'import { sx } from "@/shared/theme/style"; void sx'
    ),
    fixture(`${src}/project/model/clip.ts`, "const tracks = get().document.tracks; void tracks"),
    fixture(
      `${src}/project/model/clip.ts`,
      "const document = { tracks: [] }; void document.tracks"
    ),
    fixture(
      `${src}/project/model/clip.ts`,
      "export function f(document: { tracks: number[] }) { return document.tracks }"
    ),
    fixture(
      `${src}/project/model/grid.ts`,
      'import type { Clip } from "./types"; void (0 as unknown as Clip)'
    ),
    fixture(
      `${src}/project/layout/track.ts`,
      'import { CONTROL_METRICS } from "@/shared/theme/metrics"; void CONTROL_METRICS'
    ),
    fixture(
      `${src}/project/layout/track.ts`,
      'import { PROJECT_METRICS } from "../../shared/theme/metrics/config"; void PROJECT_METRICS'
    ),
    fixture(
      `${src}/project/stores/useProjectState.ts`,
      'import { create } from "zustand"; void create'
    ),
    fixture(
      `${src}/project/adapters/snapshots.ts`,
      'import { useProjectState } from "../stores/useProjectState"; void useProjectState'
    ),
    fixture(
      `${src}/project/adapters/snapshots.ts`,
      'import { model } from "../model/grid"; void model'
    ),
    fixture(
      `${src}/project/sections/Arrangement/index.tsx`,
      'import { Button } from "../../../ui/controls/Button"; void Button'
    ),
    fixture(
      `${src}/ui/controls/Button/index.tsx`,
      'import { useTheme } from "../../../shared/theme/ThemeProvider"; import { x } from "@gpuix/react"; void useTheme; void x'
    ),
    fixture(
      `${src}/platform/storage/index.ts`,
      'import { settingsGet } from "@zoeydaw/native"; void settingsGet'
    ),
    fixture(
      `${src}/project/sections/arrangement/tracks/meter.tsx`,
      'import { useAnimationFrame } from "@/platform/frame"; import { tracks } from "@/project/adapters"; void useAnimationFrame; void tracks'
    ),
    fixture(
      `${src}/project/model/clip.test.ts`,
      'import { x } from "react"; window.foo = 1; void x'
    ),
  ],
  invalid: [
    ...["platform/keyboard", "project/model", "ui/controls", "app", "shared/theme"].map(target =>
      fixture(
        `${src}/shared/keyboard/index.ts`,
        `import { dependency } from "@/${target}"; void dependency`,
        [{ messageId: "forbiddenLayer" }]
      )
    ),
    fixture(
      `${src}/platform/keyboard/index.ts`,
      'import { useTheme } from "@/shared/theme"; void useTheme',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(`${src}/shared/keyboard/index.ts`, 'import { useState } from "react"; void useState', [
      { messageId: "forbiddenPackage" },
    ]),
    fixture(
      `${src}/ui/controls/Button/index.tsx`,
      'import { get } from "@/project/adapters/context"; void get',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(`${src}/project/model/grid.ts`, 'import { sx } from "@/ui/controls"; void sx', [
      { messageId: "forbiddenLayer" },
    ]),
    fixture(
      `${src}/project/layout/track.ts`,
      'import { useTheme } from "@/shared/theme"; void useTheme',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/project/layout/track.ts`,
      'export { colors } from "../../shared/theme/colors"',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/project/layout/track.ts`,
      'const theme = import("@/shared/theme/metrics/../ThemeProvider"); void theme',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/project/layout/track.ts`,
      'import { theme } from "@/shared/theme/metrics-extra"; void theme',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/project/model/track.ts`,
      'import { CONTROL_METRICS } from "@/shared/theme/metrics"; void CONTROL_METRICS',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/project/stores/track.ts`,
      'import { PROJECT_METRICS } from "@/shared/theme/metrics"; void PROJECT_METRICS',
      [{ messageId: "forbiddenLayer" }]
    ),

    fixture(`${src}/project/model/clip.ts`, 'import { useState } from "react"; void useState', [
      { messageId: "forbiddenPackage" },
    ]),
    fixture(`${src}/project/model/clip.ts`, 'import { create } from "zustand"; void create', [
      { messageId: "forbiddenPackage" },
    ]),
    fixture(`${src}/project/model/clip.ts`, 'import { x } from "@gpuix/react"; void x', [
      { messageId: "forbiddenPackage" },
    ]),
    fixture(
      `${src}/project/model/clip.ts`,
      'import { cursorHide } from "@zoeydaw/native"; void cursorHide',
      [{ messageId: "forbiddenPackage" }]
    ),
    fixture(
      `${src}/project/model/clip.ts`,
      'import { s } from "../stores/useProjectState"; void s',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/project/model/clip.ts`,
      'import { Button } from "../../ui/controls/Button"; void Button',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(`${src}/project/model/clip.ts`, "export const w = window.innerWidth", [
      { messageId: "runtimeGlobal" },
    ]),
    fixture(`${src}/project/model/clip.ts`, "export const d = document.title", [
      { messageId: "runtimeGlobal" },
    ]),
    fixture(`${src}/project/model/clip.ts`, 'export const v = localStorage.getItem("k")', [
      { messageId: "runtimeGlobal" },
    ]),
    fixture(`${src}/project/stores/useProjectState.ts`, "export const w = window.innerWidth", [
      { messageId: "runtimeGlobal" },
    ]),
    fixture(`${src}/project/adapters/snapshots.ts`, 'export const v = localStorage.getItem("k")', [
      { messageId: "runtimeGlobal" },
    ]),
    fixture(
      `${src}/project/adapters/snapshots.ts`,
      'import { Button } from "../../ui/controls/Button"; void Button',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/project/adapters/snapshots.ts`,
      'import { settingsGet } from "@zoeydaw/native"; void settingsGet',
      [{ messageId: "forbiddenPackage" }]
    ),
    fixture(
      `${src}/ui/controls/Button/index.tsx`,
      'import { p } from "../../../project/model/types"; void p',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/ui/controls/Button/index.tsx`,
      'import { cursorHide } from "@zoeydaw/native"; void cursorHide',
      [{ messageId: "forbiddenPackage" }]
    ),
    fixture(
      `${src}/ui/controls/Button/index.tsx`,
      'import { create } from "zustand"; void create',
      [{ messageId: "forbiddenPackage" }]
    ),
    fixture(
      `${src}/platform/storage/index.ts`,
      'import { Button } from "../../ui/controls/Button"; void Button',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/platform/storage/index.ts`,
      'import { m } from "../../project/model/types"; void m',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/shared/theme/style.ts`,
      'import { Button } from "../../ui/controls/Button"; void Button',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(
      `${src}/project/sections/arrangement/tracks/demo.tsx`,
      'import { cursorHide } from "@zoeydaw/native"; void cursorHide',
      [{ messageId: "forbiddenPackage" }]
    ),
    fixture(
      `${src}/project/sections/footer/index.tsx`,
      'import { App } from "@/app/App"; void App',
      [{ messageId: "forbiddenLayer" }]
    ),
    fixture(`${src}/project/sections/footer/index.tsx`, "const w = window.innerWidth; void w", [
      { messageId: "runtimeGlobal" },
    ]),
    fixture(`${src}/project/model/clip.ts`, 'const m = import("react"); void m', [
      { messageId: "forbiddenPackage" },
    ]),
  ],
})
