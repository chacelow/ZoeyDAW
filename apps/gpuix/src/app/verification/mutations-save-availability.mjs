import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const file = path.join(app, "src/project/adapters/snapshots.ts")
function run() {
  const result = spawnSync(process.execPath, ["test", "src/app/snapshot-availability.test.tsx"], {
    cwd: app,
    encoding: "utf8",
  })
  if (result.error) throw result.error
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}
const baseline = run()
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.output}`)
const original = readFileSync(file, "utf8")
const changes = [
  {
    from: "let storageId: string | null = null",
    to: "let storageId: string | null = null\nlet failedOpenKey: string | null = null",
  },
  {
    from: "return !state.session.snapshotSaveBlocked",
    to: "return failedOpenKey !== storageKey()",
  },
  {
    from: "const key = storageKey()\n  let saved",
    to: "const key = storageKey()\n  failedOpenKey = key\n  let saved",
  },
  {
    from: "session({ snapshotError: null, snapshotSaveBlocked: false })",
    to: "failedOpenKey = null\n  session({ snapshotError: null, snapshotSaveBlocked: false })",
  },
]
let mutated = original
for (const change of changes) {
  if (!mutated.includes(change.from)) throw new Error(`Stale selector mutation: ${change.from}`)
  mutated = mutated.replaceAll(change.from, () => change.to)
}
let result
try {
  writeFileSync(file, mutated)
  result = run()
} finally {
  writeFileSync(file, original)
}
const failed = result.output.match(/^\s*(\d+) fail\s*$/mu)?.[1]
if (result.status === 0 || !failed || !result.output.includes("(fail)"))
  throw new Error(`Module fence survived:\n${result.output}`)
console.log(`UPA-01 module-owned save fence restored: ${failed} failing test(s)`)
console.log("1 mutation caught; original restored")
