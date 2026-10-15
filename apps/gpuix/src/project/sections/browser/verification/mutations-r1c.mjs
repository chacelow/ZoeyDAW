import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const app = fileURLToPath(new URL("../../../../../", import.meta.url))
const browserTests = "src/project/sections/browser/index.test.tsx"
const mutations = [
  {
    name: "item4 container owns the unselected Tab entry",
    file: "src/project/sections/browser/index.tsx",
    from: "tabIndex={browser.rows.length === 0 ? 0 : -1}",
    to: "tabIndex={selectedId ? -1 : 0}",
    tests: browserTests,
  },
  {
    name: "item4 row Tab entry follows selection instead of focus",
    file: "src/project/sections/browser/index.tsx",
    from: "tabIndex={focusedId === row.entry.id ? 0 : -1}",
    to: "tabIndex={selectedId === row.entry.id ? 0 : -1}",
    tests: browserTests,
  },
  {
    name: "item4 arrow focus implicitly selects resources",
    file: "src/project/sections/browser/index.tsx",
    from: "function focus(id: string) {",
    to: "function focus(id: string) { browser.setSelectedId(id)",
    tests: browserTests,
  },
  {
    name: "item4 Home skips focusing the current first row",
    file: "src/project/sections/browser/index.tsx",
    from: "else if (next) focus(next.entry.id)",
    to: "else if (next && (nextIndex !== index || rowId)) focus(next.entry.id)",
    tests: browserTests,
  },
  {
    name: "item5 Browser loses its translated divider name",
    file: "src/project/sections/browser/index.tsx",
    from: "aria-label={dividerLabel}",
    to: 'aria-label="Resize panels"',
    tests: browserTests,
  },
  {
    name: "item5 Button appends English toggle state",
    file: "src/ui/controls/Button/index.tsx",
    from: "aria-label={name}",
    to: `aria-label={onActiveChange && name ? \`\${name} (\${active ? "on" : "off"})\` : name}`,
    tests: "src/ui/controls/Button/Button.test.tsx",
  },
  {
    name: "item5 PianoKeys appends English audition state",
    file: "src/project/sections/clip-edit/midi/PianoKeys.tsx",
    from: `aria-label={\`\${label} \${pitchName(pitch)}\`}`,
    to: `aria-label={\`\${label} \${pitchName(pitch)}\${active ? " (on)" : ""}\`}`,
    tests: "src/project/sections/clip-edit/midi/keyboard-reachability.test.tsx",
  },
  {
    name: "item5 PatternSteps appends English step state",
    file: "src/project/sections/clip-edit/pattern/PatternSteps.tsx",
    from: `aria-label={\`\${label} \${index + 1}\`}`,
    to: `aria-label={\`\${label} \${index + 1} (\${on ? "on" : "off"})\`}`,
    tests: "src/project/sections/clip-edit/pattern/PatternSteps.test.tsx",
  },
]

function run(tests) {
  const result = spawnSync(process.execPath, ["test", tests, "--timeout", "30000"], {
    cwd: app,
    encoding: "utf8",
  })
  if (result.error) throw result.error
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const filter = process.argv[2]
const selected = filter ? mutations.filter(mutation => mutation.name.includes(filter)) : mutations
if (selected.length === 0) throw new Error(`No mutation matches ${filter}`)
for (const tests of new Set(selected.map(mutation => mutation.tests))) {
  const baseline = run(tests)
  if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.output}`)
}
for (const mutation of selected) {
  const file = path.join(app, mutation.file)
  const original = readFileSync(file, "utf8")
  if (!original.includes(mutation.from)) throw new Error(`Stale mutation: ${mutation.name}`)
  let result
  try {
    writeFileSync(
      file,
      original.replace(mutation.from, () => mutation.to)
    )
    result = run(mutation.tests)
  } finally {
    writeFileSync(file, original)
  }
  const failures = result.output.match(/^\s*(\d+) fail\s*$/mu)?.[1]
  if (result.status === 0 || !failures || !result.output.includes("(fail)")) {
    throw new Error(`Mutation escaped behavior assertions: ${mutation.name}\n${result.output}`)
  }
  console.log(`${mutation.name}: ${failures} failing test(s)`)
}
console.log(`${selected.length} mutations caught; originals restored`)
