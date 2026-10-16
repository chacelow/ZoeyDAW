import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const mutations = [
  {
    name: "UPA-01 existing route skips hydrate",
    file: "app/project/ProjectPage.tsx",
    from: "else openProjectSnapshot(projectId)",
    to: "else setProjectStorageId(projectId)",
    pattern: "saved project reopens",
  },
  {
    name: "UPA-01 new route reads snapshots",
    file: "app/project/ProjectPage.tsx",
    from: 'if (openMode === "new") setProjectStorageId(projectId)',
    to: 'if (openMode === "new") openProjectSnapshot(projectId)',
    pattern: "new project never reads",
  },
  {
    name: "UPA-01 failed open overwrites saved bytes",
    file: "project/adapters/snapshots.ts",
    from: "if (!canSaveSnapshot()) return",
    to: "void canSaveSnapshot()",
    pattern: "corrupt saved project",
  },
  {
    name: "UPA-01 same id keeps discarded edits",
    file: "project/adapters/snapshots.ts",
    from: "if (storageId === projectId) resetProject(projectId)",
    to: "if (storageId === projectId) void projectId",
    pattern: "discard then reopening",
  },
  {
    name: "UPA-02 navigation bypasses dirty decision",
    file: "app/router/router.ts",
    from: "if (leaveGuard && !leaveGuard(route, commit)) return false",
    to: "void leaveGuard",
    pattern: "dirty Back|dirty replace|dirty navigation",
  },
  {
    name: "UPA-02 failed save still leaves",
    file: "app/window/unsaved-close.ts",
    from: '(choice === "save" && !saved)',
    to: "false",
    pattern: "dirty navigation save failure",
  },
]

function run(pattern) {
  const result = spawnSync(
    process.execPath,
    ["test", "src/app/project-lifecycle.test.tsx", "--test-name-pattern", pattern],
    {
      cwd: app,
      encoding: "utf8",
    }
  )
  if (result.error) throw result.error
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}
for (const mutation of mutations) {
  const baseline = run(mutation.pattern)
  if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.output}`)
  const file = path.join(app, "src", mutation.file)
  const original = readFileSync(file, "utf8")
  if (!original.includes(mutation.from)) throw new Error(`Stale mutation: ${mutation.name}`)
  let result
  try {
    writeFileSync(
      file,
      original.replace(mutation.from, () => mutation.to)
    )
    result = run(mutation.pattern)
  } finally {
    writeFileSync(file, original)
  }
  const failed = result.output.match(/^\s*(\d+) fail\s*$/mu)?.[1]
  if (result.status === 0 || !failed || !result.output.includes("(fail)")) {
    throw new Error(`Mutation survived: ${mutation.name}\n${result.output}`)
  }
  console.log(`${mutation.name}: ${failed} failing test(s)`)
}
console.log(`${mutations.length} mutations caught; originals restored`)
