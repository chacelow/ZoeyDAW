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
]
const args = [
  "test",
  `${ui}controls/DropdownButton/density.test.tsx`,
  `${ui}controls/DragPad/number-font.test.tsx`,
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
