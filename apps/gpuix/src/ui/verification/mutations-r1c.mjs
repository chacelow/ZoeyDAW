import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const ui = fileURLToPath(new URL("../", import.meta.url))
const density = "popup rows share Browser row geometry"
const font = "numeric font token controls measured width"
const mutations = [
  {
    name: "select-transport-density",
    file: "controls/DropdownButton/index.tsx",
    from: "...listRowChrome(theme),",
    to: '...listRowChrome(theme), minHeight: metrics["--spacing-control-track"], fontSize: metrics["--text-control-track"],',
    invariant: density,
  },
  {
    name: "menu-independent-padding",
    file: "controls/Menu/index.tsx",
    from: "...listRowChrome(theme),",
    to: "...listRowChrome(theme), paddingRight: theme.design.menu.labelInset,",
    invariant: density,
  },
  {
    name: "number-measure-font",
    file: "controls/DragPad/DragPadNumber.tsx",
    from: "fontFamily: theme.design.typography.numberFontFamily,\n  })",
    to: 'fontFamily: "Menlo",\n  })',
    invariant: font,
  },
  {
    name: "number-display-font",
    file: "controls/DragPad/DragPadNumber.tsx",
    from: "style={{\n            fontSize,\n            fontFamily: theme.design.typography.numberFontFamily,",
    to: 'style={{\n            fontSize,\n            fontFamily: "Menlo",',
    invariant: font,
  },
  {
    name: "number-editor-font",
    file: "controls/DragPad/DragPadNumber.tsx",
    from: "minWidth: 0,\n            fontSize,\n            fontFamily: theme.design.typography.numberFontFamily,",
    to: 'minWidth: 0,\n            fontSize,\n            fontFamily: "Menlo",',
    invariant: font,
  },
  {
    name: "undersized-flexible-panel-becomes-fixed",
    file: "panels/layout/sizes.ts",
    from: "      : c.fixed",
    to: "      : c.min === c.max",
    invariant: "flexible pixel minima above the viewport",
  },
  {
    name: "mixed-unit-bounds-become-fixed",
    file: "panels/layout/sizes.ts",
    from: "typeof panel.minSize === typeof panel.maxSize &&",
    to: "true &&",
    invariant: "mixed-unit panel bounds remain flexible",
  },
]
const args = [
  "test",
  `${ui}controls/DropdownButton/density.test.tsx`,
  `${ui}controls/DragPad/number-font.test.tsx`,
  `${ui}panels/layout/sizes.test.ts`,
]
const baseline = spawnSync(process.execPath, args, { encoding: "utf8" })
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.stdout}${baseline.stderr}`)
process.stdout.write("| Mutation | Failing tests |\n| --- | ---: |\n")
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
    result = spawnSync(process.execPath, args, { encoding: "utf8" })
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
  ) {
    throw new Error(`Mutation escaped or did not reach invariant: ${mutation.name}\n${output}`)
  }
  process.stdout.write(`| ${mutation.name} | ${failures} |\n`)
}

const numberPath = `${ui}controls/DragPad/DragPadNumber.tsx`
const numberSource = readFileSync(numberPath, "utf8")
const aliasAnchor = "  readonly size?: ControlSize"
if (!numberSource.includes(aliasAnchor)) throw new Error("Stale numeric size anchor")
const app = fileURLToPath(new URL("../../../", import.meta.url))
const typecheck = () =>
  spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.resolve("typescript/bin/tsc")), "--noEmit"],
    { cwd: app, encoding: "utf8" }
  )
const baselineTypes = typecheck()
if (baselineTypes.status !== 0)
  throw new Error(`Type baseline failed:\n${baselineTypes.stdout}${baselineTypes.stderr}`)
try {
  writeFileSync(
    numberPath,
    numberSource.replace(aliasAnchor, () => `${aliasAnchor}\n  readonly variant?: ControlSize`)
  )
  const result = typecheck()
  if (
    result.status === 0 ||
    !result.stdout.includes("number-font.test.tsx") ||
    !result.stdout.includes("does not satisfy the constraint 'false'")
  ) {
    throw new Error(`Removed alias escaped type regression:\n${result.stdout}${result.stderr}`)
  }
  console.log("removed-size-alias: type regression caught")
} finally {
  writeFileSync(numberPath, numberSource)
}
