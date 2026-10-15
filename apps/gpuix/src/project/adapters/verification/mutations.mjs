import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const app = fileURLToPath(new URL("../../../../", import.meta.url))
const adapters = fileURLToPath(new URL("../", import.meta.url))
const mutations = [
  {
    name: "serialize-uncommitted-workspace",
    file: "snapshots.ts",
    from: "stringifyProject(getCommittedDocument(), getCommittedWorkspace())",
    to: "stringifyProject(getCommittedDocument(), get().workspace)",
    test: "snapshots.test.ts",
    failure: "serializes and saves committed workspace",
  },
  {
    name: "save-uncommitted-workspace",
    file: "snapshots.ts",
    from: "const workspace = getCommittedWorkspace()",
    to: "const workspace = get().workspace",
    test: "snapshots.test.ts",
    failure: "serializes and saves committed workspace",
  },
  {
    name: "queued-control-fence-regression",
    file: "backend/connection/connection.ts",
    from: "controlSequence = Math.max(controlSequence, request.sequence)",
    to: "controlSequence = request.sequence",
    test: "backend/connection.test.ts",
    failure: "keeps the latest requested seek fence",
  },
  {
    name: "drop-recording-before-teardown",
    file: "runtime/project-runtime.ts",
    from: "    flushRecording()\n    sessionCounter++",
    to: "    sessionCounter++",
    occurrences: 2,
    test: "runtime.test.ts",
    failure: "retains recording across failed",
  },
  {
    name: "replay-recording-journal",
    file: "runtime/project-runtime.ts",
    from: "const journal = recordingJournal\n    recordingJournal = []",
    to: "const journal = recordingJournal",
    test: "runtime.test.ts",
    failure: "retains recording across failed",
  },
  {
    name: "release-before-quiescing",
    file: "runtime/project-runtime.ts",
    from: "function closeBackend(): void {\n    isRuntimeDisposed = true",
    to: "function closeBackend(): void {",
    test: "runtime/recording-lifecycle.test.ts",
    failure: "retains recording during",
  },
  {
    name: "registration-before-quiescing",
    file: "runtime/project-runtime.ts",
    from: "): () => void {\n    isRuntimeDisposed = true",
    to: "): () => void {",
    test: "runtime/recording-lifecycle.test.ts",
    failure: "retains recording during",
  },
  {
    name: "unregister-before-quiescing",
    file: "runtime/project-runtime.ts",
    from: "      isRuntimeDisposed = true\n      if (activeEdit)",
    to: "      if (activeEdit)",
    test: "runtime/recording-lifecycle.test.ts",
    failure: "retains recording during",
  },
]
const tests = [...new Set(mutations.map(mutation => `${adapters}${mutation.test}`))]
const baseline = spawnSync(process.execPath, ["test", ...tests], { cwd: app, encoding: "utf8" })
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.stdout}${baseline.stderr}`)
process.stdout.write("| Mutation | Failing tests |\n| --- | ---: |\n")
for (const mutation of mutations) {
  const path = `${adapters}${mutation.file}`
  const source = readFileSync(path, "utf8")
  if (source.split(mutation.from).length - 1 !== (mutation.occurrences ?? 1)) {
    throw new Error(`Mutation anchor count changed: ${mutation.name}`)
  }
  let result
  try {
    writeFileSync(
      path,
      source.replaceAll(mutation.from, () => mutation.to)
    )
    result = spawnSync(process.execPath, ["test", `${adapters}${mutation.test}`], {
      cwd: app,
      encoding: "utf8",
    })
  } finally {
    writeFileSync(path, source)
  }
  const output = `${result.stdout}${result.stderr}`
  const failures = Number(output.match(/(\d+) fail\b/u)?.[1] ?? 0)
  if (
    result.status === 0 ||
    failures === 0 ||
    /SyntaxError|ParseError/u.test(output) ||
    !output.split("\n").some(line => line.includes("(fail)") && line.includes(mutation.failure))
  ) {
    throw new Error(`Target regression did not fail: ${mutation.name}\n${output}`)
  }
  process.stdout.write(`| ${mutation.name} | ${failures} |\n`)
}
