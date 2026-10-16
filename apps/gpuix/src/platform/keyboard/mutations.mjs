import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const app = fileURLToPath(new URL("../../../", import.meta.url))
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url))
const cases = [
  {
    name: "keymap-conflict",
    file: "platform/keyboard/keymap.ts",
    from: "&& overlaps(a.context, b.context)",
    to: "&& false",
    test: "keymap.test.ts",
    pattern: "overlapping contexts",
  },
  {
    name: "keymap-context",
    file: "platform/keyboard/keymap.ts",
    from: "accepts(binding.context, context)",
    to: "true",
    test: "keymap.test.ts",
    pattern: "one chord resolves",
  },
  {
    name: "default-consumption",
    file: "shared/keyboard/index.ts",
    from: "event.stopPropagation()",
    to: "void event",
    test: "consumption-native.test.tsx",
    pattern: "handled local commands",
  },
  {
    name: "shortcut-display",
    file: "platform/keyboard/keymap.ts",
    from: 'if (!binding) return ""',
    to: 'if (!binding) return ""; return "F6"',
    test: "shortcut-menu.test.tsx",
    pattern: "",
  },
]
const run = mutation =>
  spawnSync(
    process.execPath,
    [
      "test",
      `src/platform/keyboard/${mutation.test}`,
      ...(mutation.pattern ? ["--test-name-pattern", mutation.pattern] : []),
    ],
    { cwd: app, encoding: "utf8" }
  )
for (const mutation of cases) {
  const baseline = run(mutation)
  if (baseline.status !== 0)
    throw new Error(`Baseline failed: ${mutation.name}\n${baseline.stdout}${baseline.stderr}`)
  const file = `${sourceRoot}${mutation.file}`
  const source = readFileSync(file, "utf8")
  if (source.split(mutation.from).length !== 2)
    throw new Error(`Nonunique mutation anchor: ${mutation.name}`)
  let result
  try {
    writeFileSync(
      file,
      source.replace(mutation.from, () => mutation.to)
    )
    result = run(mutation)
  } finally {
    writeFileSync(file, source)
  }
  const output = `${result.stdout}${result.stderr}`
  const failures = Number(output.match(/(\d+) fail\b/u)?.[1] ?? 0)
  if (result.status === 0 || failures === 0 || /SyntaxError|ParseError/u.test(output))
    throw new Error(`Mutation escaped: ${mutation.name}\n${output}`)
  console.log(`${mutation.name}: ${failures} behavioral failure(s), caught`)
}
