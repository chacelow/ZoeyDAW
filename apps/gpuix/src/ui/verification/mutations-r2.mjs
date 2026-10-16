import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const ui = fileURLToPath(new URL("../", import.meta.url))
const app = fileURLToPath(new URL("../../../", import.meta.url))
const args = ["test", `${ui}verification/r2-controls.test.tsx`]
const mutations = [
  {
    name: "UPA-04-disconnect-window-deactivation",
    file: "controls/DragPad/useDragPad.ts",
    from: "if (!active && anchorRef.current) cancelDrag()",
    to: "if (active && anchorRef.current) cancelDrag()",
    invariant: "UPA-04 window deactivation",
  },
  {
    name: "UPA-05-menu-navigation-bubbles",
    file: "controls/Menu/navigation.ts",
    from: "    event.preventDefault()\n    event.stopPropagation()\n    focusEntry",
    to: "    focusEntry",
    invariant: "UPA-05 menu consumes home",
  },
  {
    name: "UPA-06-collapse-divider-bubbles",
    file: "panels/CollapseDivider/index.tsx",
    from: "    event.preventDefault()\n    event.stopPropagation()",
    to: "",
    invariant: "UPA-06 collapse divider consumes home",
  },
  {
    name: "UPA-07-escape-cancellation-bubbles",
    file: "controls/DragPad/useDragPad.ts",
    from: 'if (event.key === "escape") {\n        event.preventDefault()\n        event.stopPropagation()',
    to: 'if (event.key === "escape") {',
    invariant: "UPA-07 DragPad Escape",
  },
  {
    name: "ARR-05-menu-trigger-overwrites-tabindex",
    file: "controls/Menu/trigger.tsx",
    from: "tabIndex: props.tabIndex ?? 0,",
    to: "tabIndex: 0,",
    invariant: "ARR-05 ContextMenuTrigger",
  },
]
const run = () => spawnSync(process.execPath, args, { cwd: app, encoding: "utf8" })
const baseline = run()
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.stdout}${baseline.stderr}`)
console.log("| Mutation | Failing tests |\n| --- | ---: |")
for (const mutation of mutations) {
  const path = `${ui}${mutation.file}`
  const source = readFileSync(path, "utf8")
  if (source.split(mutation.from).length !== 2)
    throw new Error(`Mutation anchor must be unique: ${mutation.name}`)
  let result
  try {
    writeFileSync(
      path,
      source.replace(mutation.from, () => mutation.to)
    )
    result = run()
  } finally {
    writeFileSync(path, source)
  }
  const output = `${result.stdout}${result.stderr}`
  const failures = Number(output.match(/(\d+) fail\b/u)?.[1] ?? 0)
  if (
    result.status === 0 ||
    failures === 0 ||
    /SyntaxError|ParseError/u.test(output) ||
    !output.split("\n").some(line => line.includes("(fail)") && line.includes(mutation.invariant))
  )
    throw new Error(`Mutation escaped or missed behavior: ${mutation.name}\n${output}`)
  console.log(`| ${mutation.name} | ${failures} |`)
}
