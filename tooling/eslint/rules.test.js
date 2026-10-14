import { describe, it } from "vitest"
import { RuleTester } from "eslint"
import * as parser from "@typescript-eslint/parser"
import { architecture, publicIndex, uiTokens } from "./index.js"

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})
const app = "/repo/apps/web/src"
const ui = "/repo/packages/ui/src"

function fixture(filename, code, errors) {
  return { filename, code, ...(errors && { errors }) }
}

tester.run("architecture/boundaries", architecture, {
  valid: [
    fixture(
      `${app}/shared/control-interactions/provider.tsx`,
      'import { DragPadNumber } from "@zoeymind/ui"'
    ),
    fixture(
      `${app}/pages/project/model/clip.ts`,
      'import type { Clip } from "./types"; const document = { tracks: [] }; void document'
    ),
    fixture(
      `${app}/pages/project/model/clip.test.ts`,
      'import { state } from "../adapters"; window.dispatchEvent(new Event("go")); void state'
    ),
    fixture(
      `${app}/pages/project/adapters/useRuntime.ts`,
      'import { state } from "../stores"; void state'
    ),
    fixture(
      `${ui}/controls/DragPad/index.tsx`,
      'import type { Info } from "../ControlEnvironment/types"; void (0 as Info)'
    ),
  ],
  invalid: [
    fixture(
      `${app}/components/layouts/TitleBar/index.tsx`,
      'import { useProjectState } from "@/pages/project/adapters"',
      [{ messageId: "projectPrivate" }]
    ),
    fixture(
      `${app}/pages/library/index.tsx`,
      'export { projectActions } from "../project/adapters"',
      [{ messageId: "projectPrivate" }]
    ),
    fixture(
      `${app}/shared/app-shared/feature.ts`,
      'const feature = import("@/pages/project/model"); void feature',
      [{ messageId: "projectPrivate" }]
    ),
    fixture(
      `${app}/pages/project/model/feature.ts`,
      'import { create } from "zustand"; void create',
      [{ messageId: "modelDependency" }]
    ),
    fixture(
      `${app}/pages/project/model/feature.ts`,
      'import type { ControlInfo } from "@zoeymind/ui"; void (0 as ControlInfo)',
      [{ messageId: "modelDependency" }]
    ),
    fixture(
      `${app}/pages/project/model/feature.ts`,
      'import { state } from "../adapters"; void state',
      [{ messageId: "modelDependency" }]
    ),
    fixture(`${app}/pages/project/model/feature.ts`, 'window.addEventListener("go", () => {})', [
      { messageId: "modelGlobal" },
    ]),
    fixture(
      `${ui}/controls/DragPad/index.tsx`,
      'export { projectActions } from "../../../../../apps/web/src/pages/project/adapters"',
      [{ messageId: "uiDependency" }]
    ),
  ],
})

tester.run("architecture/public-index", publicIndex, {
  valid: [
    fixture(
      `${app}/pages/project/adapters/runtime/index.ts`,
      'export { createRuntime } from "./project-runtime"; export type { Runtime } from "./project-runtime"'
    ),
    fixture(`${ui}/controls/metrics/index.ts`, 'export { CONTROL_METRICS } from "./config"'),
    fixture(`${app}/pages/project/model/index.ts`, "export const legacy = 1"),
  ],
  invalid: [
    fixture(`${app}/pages/project/model/midi-editing/index.ts`, "export const value = 13", [
      { messageId: "exportsOnly" },
    ]),
    fixture(
      `${app}/pages/project/adapters/backend/connection/index.ts`,
      'import { connect } from "./connection"; export { connect }',
      [{ messageId: "exportsOnly" }, { messageId: "exportsOnly" }]
    ),
    fixture(`${ui}/controls/metrics/index.ts`, "export function calculate() { return 13 }", [
      { messageId: "exportsOnly" },
    ]),
  ],
})

tester.run("architecture/ui-tokens", uiTokens, {
  valid: [
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const track = { color: "#aabbcc" }; const view = <div className="bg-primary text-foreground" style={{ backgroundColor: track.color, left: 13 }} />; void view'
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const view = <DragPadBar className="w-full min-w-0 px-0" style={{ width: 100 }} />; void view'
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const css = "#f00"; const view = <svg><path stroke="#f00" /></svg>; void css; void view'
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const view = <div className="h-[190px] text-[10px] bg-[var(--arrangement-ruler)]" />; void view'
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const view = <Button size="xs" className="text-xs" />; void view'
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const view = <PanelDivider className="before:h-px h-[var(--project-panel-gap)]" />; void view'
    ),
  ],
  invalid: [
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const view = <div className="bg-red-500" />; void view',
      [{ messageId: "palette" }]
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const view = <div className={`border-[#abc] ${ok ? "text-blue-600" : "text-foreground"}`} />; void view',
      [{ messageId: "palette" }, { messageId: "palette" }]
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const view = <div style={{ color: "#ff00aa", top: 13 }} />; void view',
      [{ messageId: "palette" }]
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const view = <DragPadNumber className="h-[20px] text-xs" />; void view',
      [{ messageId: "controlSize" }]
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      "const view = <DropdownButton style={{ fontSize: 12 }} />; void view",
      [{ messageId: "controlSize" }]
    ),
    fixture(
      `${app}/pages/project/Track.tsx`,
      'const view = <Button size="control" className="h-[20px]" />; void view',
      [{ messageId: "controlSize" }]
    ),
  ],
})
